import { LiveArea, LiveAreaInterface, StaticArea } from './Area';
import { Renderer, Writer } from './Renderer';
import util from 'util';
import { Terminal } from './Terminal';

export class MultiAreaRenderer extends Renderer {
    areas : LiveAreaInterface[] = [];

    ranges : Range[] = [];

    pinnedAreasCount : number = 0;

    linesCount : number = 0;

    height : number = Infinity;

    width : number = Infinity;

    writer : Writer = process.stdout;

    pinLiveAreasToBottom : boolean = false;

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

        for ( let i = 0; i < this.areas.length; i++ ) {
            if ( this.ranges[ i ].start < newStart || this.areas[ i ].closed ) {
                toRemove += 1;

                if ( this.ranges[ i ].pinned ) this.pinnedAreasCount--;

                toRemoveLength += this.ranges[ i ].length;
            } else {
                // When we find the first "live" area, we can stop the search
                break;
            }
        }

        if ( toRemove > 0 ) {
            this.areas.splice( 0, toRemove );

            this.ranges.splice( 0, toRemove );

            this.linesCount -= toRemoveLength;

            for ( let range of this.ranges ) {
                range.start -= toRemoveLength;
            }
        }
    }

    remove ( area : LiveAreaInterface ) : void {
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
        if ( area.closed && this.areas.length === 0 ) {
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

                
                const start = firstPinnedIndex > 0
                    ? this.ranges[ firstPinnedIndex - 1 ].start + this.ranges[ firstPinnedIndex - 1 ].length
                    : 0;

                this.areas.splice( firstPinnedIndex, 0, area );
    
                // Since area is never pinned in this case, pinned can be false
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: false } );
            } else {
                this.areas.push( area );
    
                this.ranges.push( { start: this.linesCount, length: textHeight, pinned: areaIsPinned } );
                
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

                const start = firstPinnedIndex < this.ranges.length
                    ? this.ranges[ firstPinnedIndex ].start - textHeight
                    : this.ranges[ firstPinnedIndex - 1 ].start + this.ranges[ firstPinnedIndex - 1 ].length;
                
                // Now we need to reinsert the area and range in the correct position, as well as updating it's values
                this.areas.splice( firstPinnedIndex, 0, area );
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: true } );

                this.linesCount += diff;
            } else if ( pushToTop == true ) {
                // Since we are going to be moving the area to the bottom, we can remove it from it's current position
                this.areas.splice( index, 1 );
                this.ranges.splice( index, 1 );
                
                let firstPinnedIndex = this.ranges.findIndex( range => range.pinned );
                
                let firstPinnedRange = this.ranges[ firstPinnedIndex ];

                // ASSUME firstPinnedIndex <= index, If we are no longer pinned, and we need to be pushed up,
                // then we can assume that there is an area pinned above us.

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

                const start = this.ranges[ firstPinnedIndex ].start - textHeight;
                
                // Now we need to reinsert the area and range in the correct position, as well as updating it's values
                this.areas.splice( firstPinnedIndex, 0, area );
                this.ranges.splice( firstPinnedIndex, 0, { start: start, length: textHeight, pinned: true } );

                this.linesCount += diff;
            // If the old message is the same height as the new one, great
            // Just erase those lines and keep everything else intact
            } else if ( textHeight === range.length && textHeight > 0 ) {
                const moveUp = this.linesCount - ( range.start + range.length ) + 1;
                
                this.ansiMoveUp( moveUp );

                this.ansiEraseLines( range.length );

                this.writer.write( text );

                this.ansiMoveToLeft();

                this.ansiMoveDown( moveUp );
            } else if ( textHeight != range.length ) {
                // TODO What about when the length is so big that would cause the overall length to overflow??

                // The difference in lines from the old text to the new one
                const diff = textHeight - range.length;

                range.length = textHeight;

                const moveUp = this.linesCount - range.start + 1;

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

                this.linesCount += diff;

                this.flushTopAreas();
            } else {
                range.pinned = areaIsPinned;
            }
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
}
