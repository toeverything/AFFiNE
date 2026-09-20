# `@blocksuite/inline`

This package is a minimal rich text component for inline editing. It uses an external [`Y.Text`](https://docs.yjs.dev/api/shared-types/y.text) as it source of truth. Every `inlineEditor` instance attaches to an independant `Y.Text`, so rich text content in different block nodes can be splitted into different inline editors, making complex content conveniently composable. This significantly reduces the complexity required to implement traditional rich text editing features.

![flat-inlines](../images/flat-inlines.png)

You can use `InlineEditor` without other BlockSuite dependencies:

```ts
import * as Y from 'yjs';
import { InlineEditor } from '@blocksuite/inline';

const doc = new Y.Doc();
const yText = doc.getText('text');
const inlineEditor = new InlineEditor(yText);

const myEditor = document.getElementById('my-editor');
inlineEditor.mount(myEditor);
```

The [inline editor playground](https://try-blocksuite.vercel.app/examples/inline/)
is used for online testing and you can also check out the [source code](https://github.com/toeverything/blocksuite/tree/master/packages/playground/examples/inline) in its repository.

## Attributes

Attributes is the property of [delta](https://quilljs.com/docs/delta/) structure, which is used to store formatting information.

A delta expressing a bold text node in this manner:

```json
{
  "insert": "Hello World",
  "attributes": {
    "bold": true
  }
}
```

The inline editor use [zod](https://zod.dev/) to validate attributes, you can use the `inlineEditor.setAttributesSchema` to set the schema:

```ts
// Generally you don't have to extend `baseTextAttributes`
const customSchema = baseTextAttributes.extend({
  reference: z
    .object({
      type: type: z.enum([
        'LinkedPage',
      ]),
      pageId: z.string(),
    })
    .optional()
    .nullable()
    .catch(undefined),
  background: z.string().optional().nullable().catch(undefined),
  color: z.string().optional().nullable().catch(undefined),
});

const doc = new Y.Doc();
const yText = doc.getText('text');
const inlineEditor = new InlineEditor(yText);
inlineEditor.setAttributesSchema(customSchema);

const editorContainer = document.getElementById('editor');
inlineEditor.mount(editorContainer);
```

`InlineEditor` has default attributes schema, so you can skip this step if you think it is enough.

```ts
// Default attributes schema
const baseTextAttributes = z.object({
  bold: z.literal(true).optional().nullable().catch(undefined),
  italic: z.literal(true).optional().nullable().catch(undefined),
  underline: z.literal(true).optional().nullable().catch(undefined),
  strike: z.literal(true).optional().nullable().catch(undefined),
  code: z.literal(true).optional().nullable().catch(undefined),
  link: z.string().optional().nullable().catch(undefined),
});
```

## Attributes Renderer

Attributes Renderer is a function that takes a delta and returns `TemplateResult<1>`, which is a valid [lit-html](https://github.com/lit/lit/tree/main/packages/lit-html) template result.

`InlineEditor` use this function to render text with custom format and it is also the way to customize the text render.

```ts
type AffineTextAttributes = {
  // Your custom attributes
};

const attributeRenderer: AttributeRenderer<AffineTextAttributes> = (
  delta,
  // You can use `selected` to check if the text node is selected
  selected
) => {
  // Generate style from delta
  return html`<span style=${style}
    ><v-text .str=${delta.insert}></v-text
  ></span>`;
};

const doc = new Y.Doc();
const yText = doc.getText('text');
const inlineEditor = new InlineEditor(yText);
inlineEditor.setAttributeRenderer(attributeRenderer);

const editorContainer = document.getElementById('editor');
inlineEditor.mount(editorContainer);
```

You will see there is a `v-text` in the template, it is a custom element that render text node. `InlineEditor` use them to calculate range so you have to use them to render text content from delta.

## Rich Text Component

If you find the `InlineEditor` features may be limited or a bit verbose to use, you can refer to or directly use the [rich-text](https://github.com/toeverything/blocksuite/blob/f71df00ce18e3f300caad914aaedf63267158885/packages/blocks/src/components/rich-text/rich-text.ts) encapsulated in the `@blocksuite/blocks` package. It contains basic editing features like copy/cut/paste, undo/redo (including range restore).
