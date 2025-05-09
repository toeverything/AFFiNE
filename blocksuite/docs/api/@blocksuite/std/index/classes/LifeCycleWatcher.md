[**BlockSuite API Documentation**](../../../../README.md)

***

[BlockSuite API Documentation](../../../../README.md) / [@blocksuite/std](../../README.md) / [index](../README.md) / LifeCycleWatcher

# Class: `abstract` LifeCycleWatcher

A life cycle watcher is an extension that watches the life cycle of the editor.
It is used to perform actions when the editor is created, mounted, rendered, or unmounted.

When creating a life cycle watcher, you must define a key that is unique to the watcher.
The key is used to identify the watcher in the dependency injection container.
```ts
class MyLifeCycleWatcher extends LifeCycleWatcher {
 static override readonly key = 'my-life-cycle-watcher';
```

In the life cycle watcher, the methods will be called in the following order:
1. `created`: Called when the std is created.
2. `rendered`: Called when `std.render` is called.
3. `mounted`: Called when the editor host is mounted.
4. `unmounted`: Called when the editor host is unmounted.

## Extends

- [`Extension`](../../../store/classes/Extension.md)

## Extended by

- [`CommandManager`](CommandManager.md)

## Methods

### created()

> **created**(): `void`

Called when std is created.

#### Returns

`void`

***

### mounted()

> **mounted**(): `void`

Called when editor host is mounted.
Which means the editor host emit the `connectedCallback` lifecycle event.

#### Returns

`void`

***

### rendered()

> **rendered**(): `void`

Called when `std.render` is called.

#### Returns

`void`

***

### unmounted()

> **unmounted**(): `void`

Called when editor host is unmounted.
Which means the editor host emit the `disconnectedCallback` lifecycle event.

#### Returns

`void`
