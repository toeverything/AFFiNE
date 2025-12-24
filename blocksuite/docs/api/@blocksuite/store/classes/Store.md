[**BlockSuite API Documentation**](../../../README.md)

***

[BlockSuite API Documentation](../../../README.md) / [@blocksuite/store](../README.md) / Store

# Class: Store

Core store class that manages blocks and their lifecycle in BlockSuite

## Remarks

The Store class is responsible for managing the lifecycle of blocks, handling transactions,
and maintaining the block tree structure.
A store is a piece of data created from one or a part of a Y.Doc.

## Block CRUD

### blockSize

#### Get Signature

> **get** **blockSize**(): `number`

Get the number of blocks in the store

##### Returns

`number`

***

### isEmpty

#### Get Signature

> **get** **isEmpty**(): `boolean`

Check if there are no blocks in the store.

##### Returns

`boolean`

***

### isEmpty$

#### Get Signature

> **get** **isEmpty$**(): `ReadonlySignal`\<`boolean`\>

Get the signal for the empty state of the store.

##### Returns

`ReadonlySignal`\<`boolean`\>

***

### readonly

#### Get Signature

> **get** **readonly**(): `boolean`

Check if the store is readonly.

##### Returns

`boolean`

#### Set Signature

> **set** **readonly**(`value`): `void`

Set the readonly state of the store.

##### Parameters

###### value

`boolean`

##### Returns

`void`

***

### readonly$

#### Get Signature

> **get** **readonly$**(): `Signal`\<`boolean`\>

Get the signal for the readonly state of the store.

##### Returns

`Signal`\<`boolean`\>

***

### root

#### Get Signature

> **get** **root**(): `BlockModel`\<`object`\> \| `null`

Get the root block of the store.

##### Returns

`BlockModel`\<`object`\> \| `null`

***

### addBlock()

> **addBlock**\<`T`\>(`flavour`, `blockProps`, `parent?`, `parentIndex?`): `string`

Creates and adds a new block to the store

#### Type Parameters

##### T

`T` *extends* `BlockModel`\<`object`\> = `BlockModel`\<`object`\>

#### Parameters

##### flavour

`string`

The block's flavour (type)

##### blockProps

`Partial`\<`BlockProps` \| `PropsOfModel`\<`T`\> & `BlockSysProps`\> = `{}`

Optional properties for the new block

##### parent?

Optional parent block or parent block ID

`string` | `BlockModel`\<`object`\> | `null`

##### parentIndex?

`number`

Optional index position in parent's children

#### Returns

`string`

The ID of the newly created block

#### Throws

When store is in readonly mode

***

### addBlocks()

> **addBlocks**(`blocks`, `parent?`, `parentIndex?`): `string`[]

Add multiple blocks to the store

#### Parameters

##### blocks

`object`[]

Array of blocks to add

##### parent?

Optional parent block or parent block ID

`string` | `BlockModel`\<`object`\> | `null`

##### parentIndex?

`number`

Optional index position in parent's children

#### Returns

`string`[]

Array of IDs of the newly created blocks

***

### addSiblingBlocks()

> **addSiblingBlocks**(`targetModel`, `props`, `placement`): `string`[]

Add sibling blocks to the store

#### Parameters

##### targetModel

`BlockModel`

The target block model

##### props

`Partial`\<`BlockProps`\>[]

Array of block properties

##### placement

Optional position to place the new blocks ('after' or 'before')

`"after"` | `"before"`

#### Returns

`string`[]

Array of IDs of the newly created blocks

***

### deleteBlock()

> **deleteBlock**(`model`, `options`): `void`

Delete a block from the store

#### Parameters

##### model

The block model or block ID to delete

`string` | `BlockModel`\<`object`\>

##### options

Optional options for the deletion

###### bringChildrenTo?

`BlockModel`\<`object`\>

Optional block model to bring children to

###### deleteChildren?

`boolean`

Optional flag to delete children

#### Returns

`void`

***

### getAllModels()

> **getAllModels**(): `BlockModel`\<`object`\>[]

Get all models in the store

#### Returns

`BlockModel`\<`object`\>[]

Array of all models

***

### getBlock()

> **getBlock**(`id`): `Block` \| `undefined`

Gets a block by its ID

#### Parameters

##### id

`string`

The block's ID

#### Returns

`Block` \| `undefined`

The block instance if found, undefined otherwise

***

### getBlock$()

> **getBlock$**(`id`): `Block` \| `undefined`

Gets a block by its ID

#### Parameters

##### id

`string`

The block's ID

#### Returns

`Block` \| `undefined`

The block instance in signal if found, undefined otherwise

***

### getBlocksByFlavour()

> **getBlocksByFlavour**(`blockFlavour`): `Block`[]

Gets all blocks of specified flavour(s)

#### Parameters

##### blockFlavour

Single flavour or array of flavours to filter by

`string` | `string`[]

#### Returns

`Block`[]

Array of matching blocks

***

### getModelById()

> **getModelById**\<`Model`\>(`id`): `Model` \| `null`

Get a model by its ID

#### Type Parameters

##### Model

`Model` *extends* `BlockModel`\<`object`\> = `BlockModel`\<`object`\>

#### Parameters

##### id

`string`

The model's ID

#### Returns

`Model` \| `null`

The model instance if found, null otherwise

***

### getModelsByFlavour()

> **getModelsByFlavour**(`blockFlavour`): `BlockModel`\<`object`\>[]

Get all models of specified flavour(s)

#### Parameters

##### blockFlavour

Single flavour or array of flavours to filter by

`string` | `string`[]

#### Returns

`BlockModel`\<`object`\>[]

Array of matching models

***

### getNext()

> **getNext**(`block`): `BlockModel`\<`object`\> \| `null`

Get the next sibling block of a given block

#### Parameters

##### block

Block model or block ID to find next sibling for

`string` | `BlockModel`\<`object`\>

#### Returns

`BlockModel`\<`object`\> \| `null`

The next sibling block model if found, null otherwise

***

### getNexts()

> **getNexts**(`block`): `BlockModel`\<`object`\>[]

Get all next sibling blocks of a given block

#### Parameters

##### block

Block model or block ID to find next siblings for

`string` | `BlockModel`\<`object`\>

#### Returns

`BlockModel`\<`object`\>[]

Array of next sibling blocks if found, empty array otherwise

***

### getParent()

> **getParent**(`target`): `BlockModel`\<`object`\> \| `null`

Gets the parent block of a given block

#### Parameters

##### target

Block model or block ID to find parent for

`string` | `BlockModel`\<`object`\>

#### Returns

`BlockModel`\<`object`\> \| `null`

The parent block model if found, null otherwise

***

### getPrev()

> **getPrev**(`block`): `BlockModel`\<`object`\> \| `null`

Get the previous sibling block of a given block

#### Parameters

##### block

Block model or block ID to find previous sibling for

`string` | `BlockModel`\<`object`\>

#### Returns

`BlockModel`\<`object`\> \| `null`

The previous sibling block model if found, null otherwise

***

### getPrevs()

> **getPrevs**(`block`): `BlockModel`\<`object`\>[]

Get all previous sibling blocks of a given block

#### Parameters

##### block

Block model or block ID to find previous siblings for

`string` | `BlockModel`\<`object`\>

#### Returns

`BlockModel`\<`object`\>[]

Array of previous sibling blocks if found, empty array otherwise

***

### hasBlock()

> **hasBlock**(`id`): `boolean`

Check if a block exists by its ID

#### Parameters

##### id

`string`

The block's ID

#### Returns

`boolean`

True if the block exists, false otherwise

***

### moveBlocks()

> **moveBlocks**(`blocksToMove`, `newParent`, `targetSibling`, `shouldInsertBeforeSibling`): `void`

Move blocks to a new parent block

#### Parameters

##### blocksToMove

`BlockModel`\<`object`\>[]

Array of block models to move

##### newParent

`BlockModel`

The new parent block model

##### targetSibling

Optional target sibling block model

`BlockModel`\<`object`\> | `null`

##### shouldInsertBeforeSibling

`boolean` = `true`

Optional flag to insert before sibling

#### Returns

`void`

***

### updateBlock()

> **updateBlock**\<`T`\>(`modelOrId`, `callBackOrProps`): `void`

Updates a block's properties or executes a callback in a transaction

#### Type Parameters

##### T

`T` *extends* `BlockModel`\<`object`\> = `BlockModel`\<`object`\>

#### Parameters

##### modelOrId

The block model or block ID to update

`string` | `T`

##### callBackOrProps

Either a callback function to execute or properties to update

() => `void` | `Partial`\<`BlockProps` \| `PropsOfModel`\<`T`\> & `BlockSysProps`\>

#### Returns

`void`

#### Throws

When the block is not found or schema validation fails

## Extension

### get

#### Get Signature

> **get** **get**(): \<`T`\>(`identifier`, `options?`) => `T`

Get an extension instance from the store

##### Example

```ts
const extension = store.get(SomeExtension);
```

##### Returns

The extension instance

> \<`T`\>(`identifier`, `options?`): `T`

###### Type Parameters

###### T

`T`

###### Parameters

###### identifier

`GeneralServiceIdentifier`\<`T`\>

###### options?

`ResolveOptions`

###### Returns

`T`

***

### getOptional

#### Get Signature

> **get** **getOptional**(): \<`T`\>(`identifier`, `options?`) => `T` \| `null`

Optional get an extension instance from the store.
The major difference between `get` and `getOptional` is that `getOptional` will not throw an error if the extension is not found.

##### Example

```ts
const extension = store.getOptional(SomeExtension);
```

##### Returns

The extension instance

> \<`T`\>(`identifier`, `options?`): `T` \| `null`

###### Type Parameters

###### T

`T`

###### Parameters

###### identifier

`GeneralServiceIdentifier`\<`T`\>

###### options?

`ResolveOptions`

###### Returns

`T` \| `null`

***

### provider

#### Get Signature

> **get** **provider**(): `ServiceProvider`

Get the di provider for current store.

##### Returns

`ServiceProvider`

## History

### canRedo

#### Get Signature

> **get** **canRedo**(): `boolean`

Check if the store can redo

##### Returns

`boolean`

***

### canUndo

#### Get Signature

> **get** **canUndo**(): `boolean`

Check if the store can undo

##### Returns

`boolean`

***

### history

#### Get Signature

> **get** **history**(): `HistoryExtension`

Get the Y.UndoManager instance for current store.

##### Returns

`HistoryExtension`

***

### captureSync()

> **captureSync**(): `void`

Force the following history to be captured into a new stack.

#### Returns

`void`

#### Example

```ts
op1();
op2();
store.captureSync();
op3();

store.undo(); // undo op3
store.undo(); // undo op1, op2
```

***

### redo()

> **redo**(): `void`

Redo the last undone transaction.

#### Returns

`void`

***

### resetHistory()

> **resetHistory**(): `void`

Reset the history of the store.

#### Returns

`void`

***

### transact()

> **transact**(`fn`, `shouldTransact`): `void`

Execute a transaction.

#### Parameters

##### fn

() => `void`

##### shouldTransact

`boolean` = `...`

#### Returns

`void`

#### Example

```ts
store.transact(() => {
  op1();
  op2();
});
```

***

### undo()

> **undo**(): `void`

Undo the last transaction.

#### Returns

`void`

***

### withoutTransact()

> **withoutTransact**(`fn`): `void`

Execute a transaction without capturing the history.

#### Parameters

##### fn

() => `void`

#### Returns

`void`

#### Example

```ts
store.withoutTransact(() => {
  op1();
  op2();
});
```

## Store Lifecycle

### disposableGroup

> **disposableGroup**: `DisposableGroup`

Group of disposable resources managed by the store

***

### slots

> `readonly` **slots**: [`StoreSlots`](../interfaces/StoreSlots.md)

Slots for receiving events from the store.
All events are rxjs Subjects, you can subscribe to them like this:

```ts
store.slots.ready.subscribe(() => {
  console.log('store is ready');
});
```

You can also use rxjs operators to handle the events.

***

### id

#### Get Signature

> **get** **id**(): `string`

Get the id of the store.

##### Returns

`string`

***

### loaded

#### Get Signature

> **get** **loaded**(): `boolean`

Check if the store is loaded.

##### Returns

`boolean`

***

### ready

#### Get Signature

> **get** **ready**(): `boolean`

Check if the store is ready.
Which means the Y.Doc is loaded and the root block is added.

##### Returns

`boolean`

***

### dispose()

> **dispose**(): `void`

Disposes the store and releases all resources

#### Returns

`void`

***

### load()

> **load**(`initFn?`): `Store`

Initializes and loads the store

#### Parameters

##### initFn?

() => `void`

Optional initialization function

#### Returns

`Store`

The store instance

## Transformer

### getTransformer()

> **getTransformer**(`middlewares`): `Transformer`

Creates a new transformer instance for the store

#### Parameters

##### middlewares

`TransformerMiddleware`[] = `[]`

Optional array of transformer middlewares

#### Returns

`Transformer`

A new Transformer instance

## Other

### awarenessStore

#### Get Signature

> **get** **awarenessStore**(): `AwarenessStore`

Get the AwarenessStore instance for current store

##### Returns

`AwarenessStore`

***

### blobSync

#### Get Signature

> **get** **blobSync**(): `BlobEngine`

Get the BlobEngine instance for current store.

##### Returns

`BlobEngine`

***

### doc

#### Get Signature

> **get** **doc**(): `Doc`

Get the Doc instance for current store.

##### Returns

`Doc`

***

### schema

#### Get Signature

> **get** **schema**(): [`Schema`](Schema.md)

Get the [Schema](Schema.md) instance of the store.

##### Returns

[`Schema`](Schema.md)

***

### workspace

#### Get Signature

> **get** **workspace**(): `Workspace`

Get the Workspace instance for current store.

##### Returns

`Workspace`
