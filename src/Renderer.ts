import { LiveAreaInterface } from './Area';
import stripAnsi from 'strip-ansi';
import ansiEscapes from 'ansi-escapes';
import { Terminal } from './Terminal';

export interface Writer {
    write ( text : string ) : void;
}

export interface RendererInterface {
    remove ( area : LiveAreaInterface ) : void;

    update ( area : LiveAreaInterface ) : void;

    close ( area : LiveAreaInterface ) : void;
}

export abstract class Renderer implements RendererInterface {
    protected ansiStrip ( text : string ) : string {
        return stripAnsi( text );
    }

    protected ansiEraseLines ( lines : number ) {
        process.stdout.write( ansiEscapes.eraseLines( lines ) );
    }

    protected ansiMoveUp ( lines : number ) {
        process.stdout.write( ansiEscapes.cursorUp( lines ) );
    }

    protected ansiMoveDown ( lines : number ) {
        process.stdout.write( ansiEscapes.cursorDown( lines ) );
    }

    protected ansiMoveToLeft () {
        process.stdout.write( ansiEscapes.cursorLeft );
    }

    protected countLines ( text : string, width : number = Infinity ) : number {
        if ( !text ) return 0;

        text = this.ansiStrip( text );

        let lines = 1;
        let lineLength = 0;

        for ( let i = 0; i < text.length; i++ ) {
            if ( text[ i ] === '\n' || lineLength + 1 > width ) {
                lines += 1;
                lineLength = text[ i ] === '\n' ? 0 : 1;
            } else {
                lineLength += 1;
            }
        }

        return lines;
    }

    abstract remove ( area : LiveAreaInterface ) : void;

    abstract update ( area : LiveAreaInterface ) : void;

    abstract close ( area : LiveAreaInterface ) : void;
}

export class SingletonRenderer extends Renderer {
    lastArea : LiveAreaInterface = null;

    writtenLines : number = 0;

    width : number = Infinity;

    writer : Writer = process.stdout;

    constructor ( width : number = null ) {
        super();

        if ( typeof width !== 'number' ) {
            this.width = Terminal.width;
        }
    }

    remove ( area : LiveAreaInterface ) : void {
        if ( this.lastArea == area ) {
            if ( this.writtenLines > 0 ) {
                this.ansiEraseLines( this.writtenLines + 1 );
            }

            this.lastArea = null;
        }
    }

    update ( area : LiveAreaInterface ) : void {
        if ( this.writtenLines > 0 ) {
            this.ansiEraseLines( this.writtenLines + 1 );
        }

        const lines = this.countLines( area.text, this.width );

        this.writtenLines = lines;

        if ( area.text ) {
            this.writer.write( area.text + '\n' );
        }

        this.lastArea = area;
    }

    close ( area : LiveAreaInterface ) : void { /* NOP */ }
}
