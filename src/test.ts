import { LiveArea } from './Area';
import { LiveContainer } from './Container';

const delay = ( n : number ) => new Promise<void>( resolve => setTimeout( resolve, n ) );

(async function () {
    // const area = new LiveArea();

    // area.write( 'A'.repeat( 177 ) + '\nA' );
    // await delay( 1000 );

    // area.append( 'Adeus' );
    // await delay( 1000 );

    // area.write( 'Como está?' );
    // await delay( 1000 );

    // area.clear();
    // await delay( 1000 );

    // area.write( 'Acabou' ).close();
    // await delay( 1000 );
    const container = new LiveContainer().hook();

    const area1 = container.createLiveArea();

    const area2 = container.createLiveArea();

    area1.write( 'Area 1' );
    await delay( 1000 );

    area2.write( 'Area 2' );
    await delay( 1000 );

    area1.write( 'Area 1 1' );
    await delay( 1000 );

    area1.append( 'Area 1 2' );
    await delay( 1000 );
    
    area2.append( 'Area 2 2' );
    await delay( 1000 );

    area1.write( 'Area 1' );
    await delay( 1000 );
    
    container.renderer.remove( area1 );
    console.log( container.renderer.ranges );
    console.log( container.renderer.ranges );
    await delay( 1000 );
    
    area2.write( 'Area 2' ).close();
    await delay( 1000 );
    console.log( container.renderer.ranges );
})().catch( err => console.error( err ) );
