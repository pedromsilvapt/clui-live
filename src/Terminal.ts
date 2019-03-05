import termSize from 'term-size';

export class Terminal {
    protected static dimensions : { columns: number, rows: number } = null;

    static get width () : number {
        if ( !Terminal.dimensions ) {
            this.dimensions = termSize();
        }

        return this.dimensions.columns;
    }

    static get height () : number {
        if ( !Terminal.dimensions ) {
            this.dimensions = termSize();
        }

        return this.dimensions.rows;
    }
    
    static refresh () {
        this.dimensions = null;
    }
}