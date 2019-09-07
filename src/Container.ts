import { LiveArea, LiveAreaInterface, StaticArea } from './Area';
import { Renderer, Writer } from './Renderer';
import util from 'util';
import { Terminal } from './Terminal';
import { runInThisContext } from 'vm';

export interface RendererQueuedArea {
    area : LiveAreaInterface;
}

export class MultiAreaRenderer extends Renderer {
    areas : LiveAreaInterface[] = [];

    ranges : Range[] = [];

    pinnedAreasCount : number = 0;

    linesCount : number = 0;

    height : number = Infinity;

    width : number = Infinity;

    writer : Writer = process.stdout;

    pinLiveAreasToBottom : boolean = false;

    queueBurstUpdates : boolean = true;

    /**
     * How many times to flush the update queue each second (similar to 
     * frames per second)
     */
    queueFlushRate : number = 30;

    /**
     * Sometimes when calling update in long-running synchronous code
     * the timer that flushes the queue based on the flush rate
     * is only able to run when it all ends, so we ever only see the 
     * first and last update. To counter this, we can set a maximum number of
     * concurrent updates before a queue flush is forced
     */
    queueMaxCount : number = 1000;

    /**
     * The queue contains a list of areas that were updated. To prevent
     * the queue from growing too much and affecting performance (might happen
     * if a lot of different areas are updated in a small span of time) we can
     * set a maximum queue size. Trying to queue anymore than that flushes the
     * queue immediately
     */
    queueMaxSize : number = 10;

    protected queuedFlushTimeout : any = null;

    protected queuedOnlyPinned : boolean = true;

    protected queued : LiveAreaInterface[] = null;

    protected queueLocked : boolean = false;

    protected queueCount : number = 0;



    constructor ( width : number = null, height : number = null ) {
        super();

        if ( typeof width !== 'number' ) {
            this.width = Terminal.width;
        }

        if ( typeof height !== 'number' ) {
            this.height = Terminal.height;
        }
    }

    /**
     * The this.areas and this.ranges arrays keep tabs on what live areas this renderer has going.
     * However there might be some static/closed areas in those arrays as well.
     * Those areas might be there because they still have a live area above them, and since
     * that live area can change it's contents (and the number of lines it contains), all areas 
     * below it (whether they are live or not) need to be kept around when it is needed to update the layout.
     * 
     * This functions checks if there is anything in this list that can be flushed out (static areas on the top
     * segments of these arrays without live areas above them) and if so, removes them.
     */
    protected flushTopAreas () {
        // Can be smaller than 0
        let newStart = this.linesCount - this.height;

        // Keeps track of how many areas stacked on top are to be removed
        let toRemove = 0;

        // Keeps track of the summed length of the areas stacked on top that are to be removed
        let toRemoveLength = 0;

        // let flushQueue : boolean = false;

        for ( let i = 0; i < this.areas.length; i++ ) {
            if ( this.ranges[ i ].start < newStart || ( this.areas[ i ].closed && !this.ranges[ i ].queued ) ) {
                toRemove += 1;

                if ( this.ranges[ i ].pinned ) this.pinnedAreasCount--;

                toRemoveLength += this.ranges[ i ].length;
            } else {
                // When we find the first "live" area, we can stop the search
                break;
            }
        }

        // if ( flushQueue && this.queueLocked == false && this.queued != null ) {
        //     this.flushQueue();
        // }

        if ( toRemove > 0 ) {
            this.areas.splice( 0, toRemove );

            this.ranges.splice( 0, toRemove );

            this.linesCount -= toRemoveLength;

            for ( let range of this.ranges ) {
                range.start -= toRemoveLength;
            }
        }
    }

    protected flushQueue () : void {
        if ( this.queuedFlushTimeout != null ) {
            clearTimeout( this.queuedFlushTimeout );

            this.queuedFlushTimeout = null;
        }

        if ( this.queued != null ) {
            this.queueLocked = true;

            for ( let area of this.queued ) {
                this.update( area );
            }

            this.queued = null;
            this.queueCount = 0;
            this.queuedOnlyPinned = true;

            this.queueLocked = false;
        }
    }

    protected queueUpdate ( area : LiveAreaInterface ) : boolean {
        if ( this.queued == null ) {
            this.queued = [];
            this.queuedFlushTimeout = setTimeout( () => {
                this.queuedFlushTimeout = null;

                this.flushQueue();
            }, 1000 / this.queueFlushRate );
        }

        if ( this.queued.length <= this.queueMaxSize && this.queueCount <= this.queueMaxCount ) {
            this.queueCount++;

            for ( let queuedArea of this.queued ) {
                if ( queuedArea == area ) {
                    // Early exit if the qrea is already on the queue
                    // Will prevent the queued.push beneath from adding duplicates
                    return true;
                }
            }

            // If so far we only have queued for updates pinned areas, then whether we continue to have
            // only pinned areas queued depends on whether this area in particular is pinned as well
            if ( this.queuedOnlyPinned ) this.queuedOnlyPinned = area.pinned;

            this.queued.push( area );

            return true;
        }

        return false;
    }

    remove ( area : LiveAreaInterface ) : void {
        // When removing something always make sure to flush the queue to prevent the console history from
        // not having the most recent data
        if ( this.queueLocked == false && this.queued != null ) {
            this.flushQueue();
        }

        const index = this.areas.indexOf( area );

        if ( index >= 0 ) {
            const range = this.ranges[ index ];

            const moveUp = this.linesCount - range.start + 1;

            this.ansiEraseLines( moveUp );

            for ( let i = index + 1; i < this.areas.length; i++ ) {
                this.ranges[ i ].start -= range.length;

                if ( this.areas[ i ].text ) {
                    this.writer.write( this.areas[ i ].text + '\n' );
                }
            }

            this.areas.splice( index, 1 );
            
            this.ranges.splice( index, 1 );

            this.linesCount -= range.length;

            if ( range.pinned ) this.pinnedAreasCount--;

            this.flushTopAreas();
        }
    }

    /**
     * Updates the screen, replacing the contents previously printed for this area with new ones. If the area is no longer
     * within the screen buffer, of has never been written to the screen, it is appended to the bottom.
     * 
     * Special care is also taken to update any text that might have been written afterwards (any lines below that could be overwritten)
     * as well as handling the optional (slightly complex but super duper cool) use case of some (or all) live areas beeing 
     * pinned to the bottom of the screen whenever an update happens.
     * 
     * @param area 
     */
    update ( area : LiveAreaInterface ) : void {
        // Performance shortcut when printing static text and when there is no live areas registered
        // We can "skip the formalities" and just print the text to the writer
        if ( area.closed && this.areas.length === 0 && this.queued == null ) {
            if ( area.text ) {
                this.writer.write( area.text + '\n' );
            }

            return;
        }

        // Search to see if we have written this area to the screen already
        const index = this.areas.indexOf( area );

        // Another special performance shortcut, when printing new empty closed/static areas, just ignore them
        if ( area.closed && !area.text && index < 0 ) {
            return;
        }

        // If we are adding a new area, and we have updates in queue
        if ( this.queueLocked == false && index < 0 && this.queued != null && ( this.queuedOnlyPinned == false || area.pinned == true ) ) {
            this.flushQueue();

            // We don't need to change the index because we only debaunce updates
            // when they don't need a relayout, which means, they don't affect
            // the indexes
        }

        const text = area.text;

        const textHeight = this.countLines( text, this.width );

        // Whether this area should be pinned to the bottom. For obvious reasons, static (closed) areas
        // can never be pinned
        const areaIsPinned = ( area.pinned || this.pinLiveAreasToBottom ) && !area.closed;

        // If we are updating a live area we didn't have before
        if ( index < 0 ) {
            // When this area is and not pinned, but there are pinned areas above. We cannot simply push this new one,
            // We have to remove the upper "pinned" areas, push this one, and then re-insert the pinned ones on the bottom
            const firstPinnedIndex = this.pinnedAreasCount > 0 && !areaIsPinned
                ? this.ranges.findIndex( range => range.pinned )
                : -1;

            if ( firstPinnedIndex >= 0 ) {
                const moveUp = this.linesCount - this.ranges[ firstPinnedIndex ].start + 1;

                this.ansiHideCursor();

                this.ansiEraseLines( moveUp );
               
                if ( text ) {
                    this.writer.write( text + '\n' );
                }

                // Reprint all the pinned areas and update their start index, pushing it down
                for ( let i = firstPinnedIndex; i < this.areas.length; i++ ) {
                    this.ranges[ i ].start += textHeight;

                    if ( this.areas[ i ].text ) {
                        this.writer.write( this.areas[ i ].text + '\n' );
                    }
                }

                this.ansiShowCursor();
                
                const start = firstPinnedIndex > 0
                    ? this.ranges[ firstPinnedIndex - 1 ].start + this.ranges[ firstPinnedIndex - 1 ].length
                    : 0;

                this.areas.splice( firstPinnedIndex, 0, area );
    
                // Since area is never pinned in this case, pinned can be false
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: false, queued: false } );
            } else {
                this.areas.push( area );
    
                this.ranges.push( { start: this.linesCount, length: textHeight, pinned: areaIsPinned, queued: false } );
                
                if ( text ) {
                    this.writer.write( text + '\n' );
                }
            }

            // Since this area is pinned, and it's a new one, we should increase the pinned count
            if ( areaIsPinned ) this.pinnedAreasCount++;

            this.linesCount += textHeight;

            this.flushTopAreas();
        } else {
            const range = this.ranges[ index ];

            const canBeQueued = this.queueBurstUpdates && this.queueLocked == false 
                             && range.pinned == areaIsPinned && textHeight == range.length && area.closed == false;

            // QUEUE
            // Obviously are good boys and we never mess with the queue when 
            // it is locked. We also do not add to the queue if 
            if ( canBeQueued ) {
                // If the area was successfully queued, we can early-exit the function
                // Sometimes the area might not be queued, in which case the function will
                // return false. This can happen when the update queue is too big, which
                // will force an early queue flush 
                if ( this.queueUpdate( area ) ) {
                    range.queued = true;

                    return;
                }
            }
            
            const queueNeedsFlush = 
                // Obviously an empty queue (or a locked one) doesn't need to be flushed
                this.queueLocked == false && this.queued != null &&
                // And neither does a queue with only pinned areas when updating a non-pinned one
                ( this.queuedOnlyPinned == false || areaIsPinned == true );

            if ( queueNeedsFlush ) {
                this.flushQueue();
            }

            range.queued = false;

            if ( areaIsPinned && !range.pinned ) this.pinnedAreasCount++;
            else if ( !areaIsPinned && range.pinned ) this.pinnedAreasCount--;

            // Whether the area is already in the bottom (somewhere along all the other pinned areas)
            const areaIsBottom = index >= this.areas.length - this.pinnedAreasCount;

            // NOTE: 
            // both variables above can be true, if the element is on the first position of the pinned area
            const areaIsNotBottom = index <= this.areas.length - this.pinnedAreasCount;

            // Whether this area needs to be moved to the bottom (true) or can stay where it is (false)
            // It has to be moved only when it is pinned and not already near the bottom
            const pushToBottom = !areaIsBottom && areaIsPinned;

            const pushToTop = !areaIsNotBottom && !areaIsPinned && this.pinnedAreasCount > 0;

            // When we need to push this area to the bottom (most likely because it wasn't pinned and became so)
            // It doesn't matter the height of the text (whether it's the same or not as previously)
            // So we take care of it right here at the top
            if ( pushToBottom == true ) {
                // Since we are going to be moving the area to the bottom, we can remove it from it's current position
                this.areas.splice( index, 1 );
                this.ranges.splice( index, 1 );

                let firstPinnedIndex = this.ranges.findIndex( range => range.pinned );

                // If there is no pinned area (other than this) we just append it to the end
                if ( firstPinnedIndex < 0 ) firstPinnedIndex = this.ranges.length;

                this.ansiHideCursor();

                // Erase everything beneath the area
                this.ansiEraseLines( this.linesCount - range.start + 1 );

                // First we move up all the areas there were inbetween first pinned and our own
                for ( let i = index; i < firstPinnedIndex; i++ ) {
                    this.ranges[ i ].start -= range.length;

                    if ( this.areas[ i ].text ) {
                        this.writer.write( this.areas[ i ].text + '\n' );
                    }
                }

                // Now print our new area in the place it is supposed to be
                if ( text ) {
                    this.writer.write( text + '\n' );
                }

                const diff = textHeight - range.length;

                for ( let i = firstPinnedIndex; i < this.areas.length; i++ ) {
                    this.ranges[ i ].start += diff;

                    if ( this.areas[ i ].text ) {
                        this.writer.write( this.areas[ i ].text + '\n' );
                    }
                }

                this.ansiShowCursor();

                const start = firstPinnedIndex < this.ranges.length
                    ? this.ranges[ firstPinnedIndex ].start - textHeight
                    : this.ranges[ firstPinnedIndex - 1 ].start + this.ranges[ firstPinnedIndex - 1 ].length;
                
                // Now we need to reinsert the area and range in the correct position, as well as updating it's values
                this.areas.splice( firstPinnedIndex, 0, area );
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: true, queued: false } );

                this.linesCount += diff;
            } else if ( pushToTop == true ) {
                // Since we are going to be moving the area to the bottom, we can remove it from it's current position
                this.areas.splice( index, 1 );
                this.ranges.splice( index, 1 );
                
                let firstPinnedIndex = this.ranges.findIndex( range => range.pinned );
                
                let firstPinnedRange = this.ranges[ firstPinnedIndex ];

                // ASSUME firstPinnedIndex <= index, If we are no longer pinned, and we need to be pushed up,
                // then we can assume that there is an area pinned above us.

                this.ansiHideCursor();

                // Erase everything beneath the area
                this.ansiEraseLines( this.linesCount - firstPinnedRange.start );

                // Print our new area in the place it is supposed to be
                if ( text ) {
                    this.writer.write( text + '\n' );
                }

                // First we move up all the areas there were inbetween first pinned and our own
                for ( let i = firstPinnedIndex; i <= index; i++ ) {
                    this.ranges[ i ].start += textHeight;

                    if ( this.areas[ i ].text ) {
                        this.writer.write( this.areas[ i ].text + '\n' );
                    }
                }

                const diff = textHeight - range.length;

                if ( diff != 0 ) {
                    for ( let i = index; i < this.areas.length; i++ ) {
                        this.ranges[ i ].start += diff;
    
                        if ( this.areas[ i ].text ) {
                            this.writer.write( this.areas[ i ].text + '\n' );
                        }
                    }
                }

                this.ansiShowCursor();

                const start = this.ranges[ firstPinnedIndex ].start - textHeight;
                
                // Now we need to reinsert the area and range in the correct position, as well as updating it's values
                this.areas.splice( firstPinnedIndex, 0, area );
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: true, queued: false } );

                this.linesCount += diff;
            // If the old message is the same height as the new one, great
            // Just erase those lines and keep everything else intact
            } else if ( textHeight === range.length && textHeight > 0 ) {
                const moveUp = this.linesCount - ( range.start + range.length ) + 1;

                this.ansiHideCursor();

                this.ansiMoveUp( moveUp );

                this.ansiEraseLines( range.length );

                this.writer.write( text );

                this.ansiMoveToLeft();

                this.ansiMoveDown( moveUp );

                this.ansiShowCursor();
            } else if ( textHeight != range.length ) {
                // TODO What about when the length is so big that would cause the overall length to overflow??

                // The difference in lines from the old text to the new one
                const diff = textHeight - range.length;

                range.length = textHeight;

                const moveUp = this.linesCount - range.start + 1;

                this.ansiHideCursor();

                this.ansiEraseLines( moveUp );

                if ( text ) {
                    this.writer.write( text + '\n' );
                }

                for ( let i = index + 1; i < this.areas.length; i++ ) {
                    this.ranges[ i ].start += diff;

                    if ( this.areas[ i ].text ) {
                        this.writer.write( this.areas[ i ].text + '\n' );
                    }
                }

                this.ansiShowCursor();

                this.linesCount += diff;

                this.flushTopAreas();
            }

            range.pinned = areaIsPinned;
        }
    }
    
    close ( area : LiveAreaInterface ) : void {
        this.flushTopAreas();
    }
}

export interface Class<T, A extends any[]> {
    new ( ...args : A ) : T;
}

export interface LiveContainerInterface {
    renderer : MultiAreaRenderer;

    // Hook this container to the console.log method
    hook () : this;

    unhook () : this;

    addLiveArea ( area : LiveAreaInterface ) : void;

    createLiveArea<T extends LiveAreaInterface, A extends any[] = []> ( factory ?: Class<T, A>, ...args : A ) : T;
}

export class LiveContainer implements LiveContainerInterface {
    public static global : LiveContainer = new LiveContainer();

    protected method : any = null;

    renderer: MultiAreaRenderer = new MultiAreaRenderer;

    hook () : this {
        if ( this.method == null ) {
            this.method = console.log;

            console.log = ( ...args : any[] ) => {
                this.createStaticArea( ( util as any ).formatWithOptions( { colors: true }, ...args ) );
            };
        }

        return this;
    }
    
    unhook () : this {
        if ( this.method != null ) {
            console.log = this.method;
            
            this.method = null;
        }

        return this;
    }

    addLiveArea ( area : LiveAreaInterface ) : void {
        area.renderer = this.renderer;
    }

    createLiveArea <T extends LiveAreaInterface = LiveArea, A extends any[] = []> ( factory : Class<T, A> = LiveArea as any, ...args : A ) : T {
        const area = new factory( ...args );

        this.addLiveArea( area );
        
        return area;
    }

    createStaticArea ( text : string ) : StaticArea {
        const area = new StaticArea( text );

        this.addLiveArea( area );
        
        return area;
    }
}

export interface Range {
    start : number;
    length : number;
    pinned : boolean;
    queued : boolean;
}
