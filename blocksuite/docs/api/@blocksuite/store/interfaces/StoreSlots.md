[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / StoreSlots

# Interface: StoreSlots

Slots for receiving events from the store.
All events are rxjs Subjects, you can subscribe to them like this:

```ts
store.slots.ready.subscribe(() => {
  console.log('store is ready');
});
```

You can also use rxjs operators to handle the events.

## Properties

### blockUpdated

> **blockUpdated**: `Subject`\<`StoreBlockUpdatedPayloads`\>

This fires when a block is updated via API call or has just been updated from existing ydoc.

The payload can have three types:
- add: When a new block is added
- delete: When a block is removed
- update: When a block's properties are modified

***

### ready

> **ready**: `Subject`\<`void`\>

This fires after `doc.load` is called.
The Y.Doc is fully loaded and ready to use.

***

### rootAdded

> **rootAdded**: `Subject`\<`string`\>

This fires when the root block is added via API call or has just been initialized from existing ydoc.
useful for internal block UI components to start subscribing following up events.
Note that at this moment, the whole block tree may not be fully initialized yet.

***

### rootDeleted

> **rootDeleted**: `Subject`\<`string`\>

This fires when the root block is deleted via API call or has just been removed from existing ydoc.
In most cases, you don't need to subscribe to this event.
