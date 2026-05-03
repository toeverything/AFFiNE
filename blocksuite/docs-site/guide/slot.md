# Slot

BlockSuite extensively uses `Slot` to manage events that are not DOM-native. You can think of it as a type-safe event emitter or a simplified RxJS [Observable](https://rxjs.dev/guide/observable):

```ts
import { Slot } from '@blocksuite/store';

// Create a new slot
const slot = new Slot<{ name: string }>();

// Subscribe events
slot.on(({ name }) => console.log(name));

// Or alternatively only listen event once
slot.once(({ name }) => console.log(name));

// Emit the event
slot.emit({ name: 'foo' });
```

To unsubscribe from the slot, simply use the return value of `slot.on()`:

```ts
const slot = new Slot();
const disposable = slot.on(myHandler);

// Dispose the subscription
disposable.dispose();
```

Moreover, for any node in the block tree, events can be triggered when the node is updated:

```ts
const model = doc.root[0];

// Triggered when the `props` of the block model is updated
model.propsUpdated.on(() => updateMyComponent());
// Triggered when the `children` of the block model is updated
model.childrenUpdated.on(() => updateMyComponent());
```

In the prebuilt AFFiNE editor, which is based on the [lit](https://lit.dev/) framework, the UI component of each block subscribes to its model updates using this pattern.
