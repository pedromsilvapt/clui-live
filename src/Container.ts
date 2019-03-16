import { LiveArea, LiveAreaInterface, StaticArea } from './Area';
import { Renderer, Writer } from './Renderer';
import util from 'util';
import { Terminal } from './Terminal';

export class MultiAreaRenderer extends Renderer {
    areas : LiveAreaInterface[] = [];

    ranges : Range[] = [];

    linesCount : number = 0;

    height : number = Infinity;

    width : number = Infinity;

    writer : Writer = process.stdout;

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

    update ( area : LiveAreaInterface ) : void {
        if ( area.closed && this.areas.length === 0 ) {
            if ( area.text ) {
                process.stdout.write( area.text + '\n' );
            }

            return;
        }

        const index = this.areas.indexOf( area );

        const text = area.text;

        const textHeight = this.countLines( text, this.width );

        // If we are updating a live area we didn't have before
        if ( index < 0 ) {
            this.areas.push( area );

            this.ranges.push( { start: this.linesCount, length: textHeight } );

            this.linesCount += textHeight;

            if ( text ) {
                this.writer.write( text + '\n' );
            }

            this.flushTopAreas();
        } else {
            const range = this.ranges[ index ];

            // If the old message is the same height as the new one, great
            // Just erase those lines and keep everything else intact
            if ( textHeight === range.length && textHeight > 0 ) {
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
                this.addLiveArea( new StaticArea( ( util as any ).formatWithOptions( { colors: true }, ...args ) ) );
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
}
