# Event

This document introduces the handling of UI events, event flows within the block tree, and the implementation of hotkeys in BlockSuite.

## Handling UI Events

For UI events such as `click` in editor, there is an underlying event dispatcher in `@blocksuite/block-std` to dispatch events. With the dispatcher, you can handle events in your [block view](./block-view) implementation in this manner:

```ts
@customElements('my-block')
class MyBlockView extends BlockComponent<MyBlockModel> {
  private _handleClick = () => {
    //...
  };

  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick);
  }
}
```

### Event Bubbling

All events on dispatcher are bound to the root element of the block view to make it possible to bubble events to the parent block view.

```ts
class ChildView extends BlockComponent<MyBlockModel> {
  private _handleClick = () => {
    console.log('click1');
  };

  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick);
  }
}

class ParentView extends BlockComponent<MyBlockModel> {
  private _handleClick = () => {
    console.log('click2');
  };

  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick);
  }
}
```

When you click on the `ChildView`, the console will print:

```
click1
click2
```

You may want to stop the event from bubbling to the parent block view. You can simply return `true` in the event handler:

```ts
class ChildView extends BlockComponent<MyBlockModel> {
  private _handleClick = () => {
    console.log('click1');
    return true;
  };

  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick);
  }
}
```

Then the console will only print:

```
click1
```

The event bubbling is implemented by event target. For the events that won't support bubbling, the event dispatcher will use [block path](#) to dispatch events to the parent block views.

### Event Scope

By default, `handleEvents` will only subscribe events triggered by the block view and its children.
We also provide two more scopes to subscribe to make it possible to handle events triggered by other blocks.

#### Flavour Scope

The flavour scope will subscribe to events triggered by the block view and other blocks with the same flavour.

```ts
class MyBlock extends BlockComponent<MyBlockModel> {
  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick, { flavour: true });
  }
}
```

#### Global Scope

The global scope will subscribe to events triggered by the block view and all other blocks.

```ts
class MyBlock extends BlockComponent<MyBlockModel> {
  override connectedCallback() {
    super.connectedCallback();
    this.handleEvent('click', this._handleClick, { global: true });
  }
}
```

## Handling Hotkeys

The hotkey is a special event that can be triggered by the keyboard.

Key names may be strings like `"Shift-Ctrl-Enter"`—a key identifier prefixed with zero or more modifiers. Key identifiers
are based on the strings that can appear in [`KeyEvent.key`](https:///developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/key).

Use lowercase letters to refer to letter keys (or uppercase letters if you want shift to be held). You may use `"Space"` as an alias for the `" "` name.

Modifiers can be given in any order. `Shift-` (or `s-`), `Alt-` (or `a-`), `Ctrl-` (or `c-` or `Control-`) and `Cmd-` (or `m-` or
`Meta-`) are recognized.
For characters that are created by holding shift, the `Shift-` prefix is implied, and should not be added explicitly.

You can use `Mod-` as a shorthand for `Cmd-` on Mac and `Ctrl-` on other platforms.

```ts
class MyBlock extends BlockComponent<MyBlockModel> {
  override connectedCallback() {
    super.connectedCallback();
    this.bindHotkey({
      'Mod-b': () => {},
      'Alt-Space': () => {},
    });
  }
}
```

Same as `handleEvent`, you can return `true` in the hotkey handler to stop the event from bubbling to the parent block view.
