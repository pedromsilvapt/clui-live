import { LiveArea } from './Area';

export abstract class LiveComponent<T> extends LiveArea {
    state : T;

    constructor ( initialState : T = null ) {
        super();

        this.state = initialState;
    }

    setState ( state : T, reset : boolean = false ) : this {
        if ( reset ) {
            this.state = state;
        } else {
            // TODO Deep merge
            this.state = { ...this.state, ...state };
        }
        
        this.rerender();

        return this;
    }

    abstract render () : string;

    protected rerender () {
        const output = this.render();

        if ( output ) {
            this.write( output );
        } else {
            this.clear();
        }
    }
}