# clui-live
> Simply update text on the terminal, even after subsequent output is written

## Installation
```shell
npm install --save clui-live
```

## Usage

There are two ways to use this method. The first is to just use a single `LiveArea` and update it any time by calling the `LiveArea#write()` method. With this method, only one `LiveArea` can be active at each time.
```typescript
import { LiveArea } from 'clui-live';

const area = new LiveArea();

for ( let i = 0; i < 100; i++ ) {
    area.write( 'Progress' + i );

    await sleepRandom();
}

// Closing the `LiveArea` will keep any text that was written to it last on screen and prevent any further updates. To avoid that, call area.clear().close() instead
area.close();
```

But sometimes we want to update more than one thing at the same time, and that's the really hard part. This module makes it easy though.
Just create a `LiveContainer` and add as many `LiveArea`s to it as needed. 

> **Note** that when using a container, you can only use `LiveArea`s that belong to it. Using others will result in unexpected behavior.

```typescript
import { LiveContainer, LiveArea } from 'clui-live';

const container = new LiveContainer();

// How to add an area to a container
const area1 = new LiveArea();

container.addLiveArea( area );

// A shortcut for that is
const area2 = container.createLiveArea();

for ( let i = 0; i < 100; i++ ) {
    // Update each area in an alternated way. They will both be updated in place
    // If the first area grew (or shrinked), the vertical positions of all areas below would adjust accordingly
    if ( i % 2 == 0 ) {
        area1.write( 'Progress' + i );
    } else {
        area2.write( 'Progress' + i * 2 );
    }

    await sleepRandom();
}

// Also, since the terminal doesn't allow to update text outside the viewport (when the text is above the buffer and you would
// have to scroll to see it), and so when any LiveArea falls off view, it's state is "forgotten" and when it updates next it 
// will be appended at the bottom.
```

But what about when other people use `console.log`? Doesn't that wreck things? Yes, but there is a simple fix for that: simply call `LiveContainer#hook()` when creating it.

```typescript
const container = new LiveContainer().hook();
```

Sometimes you don't want to have to create a container and pass around references to it. In those instances you can use the global container (one that is lazily created when it is first used) by calling the `hook()` method on each live area (instead of calling it on a container) like so:
```typescript
const area1 = new LiveArea().hook();
const area2 = new LiveArea().hook();
```