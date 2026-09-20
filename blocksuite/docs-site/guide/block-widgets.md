# Block Widgets

In BlockSuite, widgets are components that can be used to display helper UI elements of a block. Sometimes, you want to display a menu to provide some extra information or actions for a block. As another example, it's a common practice to display a toolbar when you select a block.

The widget is designed to provide this kind of functionalities. Similar to blocks, widgets also depends on UI frameworks. By default, we provide a [lit](https://lit.dev/) renderer called `@blocksuite/lit` for building widgets as web components. But it's still possible to use other UI frameworks. We'll introduce later about implementing custom block renderers.

## Widget Component

The `WidgetComponent` class can be used for building a widget view based on web component:

```ts
import { WidgetComponent } from '@blocksuite/lit';
import { html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElements('my-widget')
class MyWidgetView extends WidgetComponent<MyBlockView> {
  override render() {
    return html`
      <div>
        <h3>My Widget</h3>
      </div>
    `;
  }
}
```

## Get Host Block

Widget is always related to a block called host block.
And we can get the host block by using `BlockComponent` property.

For example, if you have a `code block` for displaying code examples, and you want to display a `language picker` widget to let users change the language of the code block. The widget could be defined in this manner:

```ts
import { WidgetComponent } from '@blocksuite/lit';
import { html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElements('my-widget')
class CodeLanguagePicker extends WidgetComponent<CodeBlockComponent> {
  private _onChange = e => {
    this.doc.updateBlock(this.blockComponent.model, {
      language: e.target.value,
    });
  };

  override render() {
    return html`
      <select @change=${this._onChange}>
        <option value="javascript">JavaScript</option>
        <option value="python">Python</option>
      </select>
    `;
  }
}
```

You can get the `std` instance from `this.std` to use the full power of [`block-std`](/api/@blocksuite/block-std/).
