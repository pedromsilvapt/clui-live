import { LiveContainer } from 'clui-live';

const delay = ( n : number ) => new Promise<void>( resolve => setTimeout( resolve, n ) );

const cyan = ( text : string ) => `\u001B[46;37m` + text + `\u001B[49;39m`;

const green = ( text : string ) => `\u001B[42;37m` + text + `\u001B[49;39m`;

(async function () {
    // Create a container that intercepts any console.logs (this behavior can be disabled calling the `unhook()` method)
    const container = new LiveContainer().hook();

    // Create a live (updatable) area
    const area1 = container.createLiveArea();

    area1.write( cyan( ' live: ' ) + ' Hello, I\'m a pice of text that can be updated!' ); await delay( 1000 );

    console.log( "Regular console.log..." ); await delay( 1000 );

    area1.write( cyan( ' live: ' ) + ' See? I can change myself.' ); await delay( 1000 );

    console.log( "Regular console.log 2..." ); await delay( 1000 );
    console.log( "Regular console.log 3..." ); await delay( 500 );

    area1.write( cyan( ' live: ' ) + ' Wait, what\'s hapening?' );

    for ( let i = 4; i <= 30; i++ ) {
        console.log( "Regular console.log " + i + "..." );

        await delay( Math.max( 250 - ( i - 4 ) * 30, 50 ) );
    }

    await delay( 500 );

    area1.write( cyan( ' live: ' ) + ' Sorry about that. It\'s me again. I scrolled too far away, so I repositioned myself back down.' ); await delay( 2000 );

    console.log( "Regular console.log 31..." ); await delay( 2000 );
    
    area1.append( cyan( ' live: ' ) + ' Also, have I told you I can span multiple lines? I automatically adjust the text that\'s beneath me when my line count changes. Pretty neat uh?' ); await delay( 4000 );

    const area2 = container.createLiveArea().pin();

    area2.append( green( ' pinned: ' ) + " I can also force myself to always stay pinned to the bottom." ); await delay( 1000 );

    for ( let i = 30; i <= 50; i++ ) {
        console.log( "Regular console.log " + i + "..." );

        area2.write( green( ` pinned: ${i}/50 ` ) + ' I can also force myself to always stay pinned to the bottom. Cooooooool.' );

        await delay( 200 );
    }

    await delay( 1000 );

    area1.write( cyan( ' live: ' ) + ' When I\'m done I can call `area.close()` to free resources, keeping the last text I wrote on screen.' ); await delay( 2000 );
    area1.append( cyan( ' live: ' ) + ' Or I could call `area.clear()` before closing so no one would know I was ever even here. Sneaky.' ); await delay( 2000 );

    area1.close();
    area2.clear().close();
})();
