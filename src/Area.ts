import { RendererInterface, SingletonRenderer, VirtualRenderer } from './Renderer';
import { LiveContainer } from './Container';

export interface LiveAreaInterface {
    renderer : RendererInterface;

    readonly text : string;

    readonly closed : boolean;

    hook () : this;

    clear () : this;

    append ( text : string ) : this;

    write ( text : string ) : this;

    close () : this;
}

export class LiveArea implements LiveAreaInterface {
    protected _renderer : RendererInterface = new SingletonRenderer();

    protected _text : string;
    
    protected _closed : boolean = false;

    set renderer ( renderer : RendererInterface ) {
        if ( this._renderer != renderer ) {
            this._renderer = renderer;
            
            if ( renderer != null )  {
                renderer.update( this );
            }
        }
    }

    get renderer () : RendererInterface {
        return this._renderer;
    }

    get closed () : boolean {
        return this._closed;
    }

    get text () : string {
        return this._text;
    }

    hook () : this {
        LiveContainer.global.hook().addLiveArea( this )

        return this;
    }

    clear () : this {
        return this.write( null );
    }

    append ( text : string ) : this {
        if ( !this.text ) {
            this.write( text );
        } else {
            this.write( this.text + '\n' + text );
        }

        return this;
    }

    write ( text : string ) : this {
        if ( this.closed ) {
            throw new Error( `Cannot write to a closed area.` )
        }

        this._text = text;

        if ( this.renderer ) {
            this.renderer.update( this );
        }

        return this;
    }

    close () : this {
        if ( !this.closed ) {
            this._closed = true;

            if ( this.renderer ) {
                this.renderer.close( this );
            }
        }

        return this;
    }
}

export class StaticArea implements LiveAreaInterface {
    protected _renderer : RendererInterface = new SingletonRenderer();

    set renderer ( renderer : RendererInterface ) {
        if ( this._renderer != renderer ) {
            this._renderer = renderer;
            
            if ( renderer != null )  {
                renderer.update( this );
            }
        }
    }

    get renderer () : RendererInterface {
        return this._renderer;
    }
    
    readonly text : string;
    
    readonly closed : boolean;

    constructor ( text : string ) {
        this.text = text;
        this.closed = true;
    }
    
    hook () : this {
        LiveContainer.global.hook().addLiveArea( this );
        
        return this;
    }

    clear () : this {
        return this.write( null );
    }

    append ( text : string ): this {
        return this.write( null );
    }

    write ( text : string ) : this {
        throw new Error( `Cannot write to a static area.` )
    }

    close () : this {
        return this;
    }
}


export class PipeVirtualRenderer extends VirtualRenderer {
    target : LiveAreaInterface;
    
    source ?: LiveAreaInterface;

    constructor ( target : LiveAreaInterface, source ?: LiveAreaInterface ) {
        super();

        this.target = target;

        if ( source ) {
            source.renderer = this;

            this.source = source;
        }
    }

    protected updateText () {
        super.updateText();

        this.target.write( this.text );
    }

    close ( area : LiveAreaInterface ) {
        if ( this.source && area == this.source ) {
            this.source.close();
        }
    }
}