# Block Schema

In BlockSuite, all blocks should have a schema. The schema of the block describes the data structure of the block.

You can use the `defineBlockSchema` function to define the schema of the block.

```ts
import { defineBlockSchema } from '@blocksuite/store';

export const MyBlockSchema = defineBlockSchema({
  flavour: 'my-block',
  props: internal => ({
    text: internal.Text(),
    level: 0,
  }),
  metadata: {
    version: 1,
    role: 'content',
  },
});
```

## Flavour and Props

Key takeaways for this part:

- The `flavour` of the block is a string that uniquely identifies the block. You can think of it as the name of the block.
- The `props` of the block are some attributes that the block has. They can be updated by some user actions. And they can be used to render the block. Some typical props are `text`, `level`, `url`, `src`, etc.
- You can use most of the primitive types in the props. But you should not use `undefined` or `null` in the props.
- We also support some special types in the props, called `internal` types. The internal types are used to describe some internal data structures of the block.
- `internal.Text` is a special type that represents the text of the block. It represents [Y.Text](https://docs.yjs.dev/api/shared-types/y.text) in the Yjs.
- You can also use arrays and objects in props.

## Schema Relations

You can also declare some relations between blocks in the schema.

### Role

You should declare a `role` for every block you create. The role of the block can be 3 values:

- `root`: The block is the root of the document. A document can only have one root block.
- `hub`: The block is a hub. A hub can have multiple children. The children of it can be either `hub` or `content`.
- `content`: The leaf block of the document. A content block can only have one parent. Also, it can only have `content` as its children.

For example:

```
root
| hub1
| | content1
| | | content2
| hub2
| | hub3
| | | content3
| | content4
```

### Parent and Children

By default, a block will validate its children and parent by its `role`. You can also pass a `parent` or `children` option to the schema to override the default behaviour.

Some examples:

---

This means the block's children must match the flavour `my-leaf`.

```ts
import { defineBlockSchema } from '@blocksuite/store';

export const MyBlockSchema = defineBlockSchema({
  // ...
  metadata: {
    children: ['my-leaf'],
  },
});
```

---

When passing `*`, it means all blocks that match the rule of `role` can be used.

```ts
export const MyBlockSchema = defineBlockSchema({
  // ...
  metadata: {
    children: ['*'],
  },
});
```

---

You can also pass glob patterns:

```ts
export const MyBlockSchema = defineBlockSchema({
  // ...
  metadata: {
    children: ['my-data-*'],
  },
});
```

The glob match feature is powered by [minimatch](https://github.com/isaacs/minimatch).

---

This means the block won't accept any children.

```ts
export const MyBlockSchema = defineBlockSchema({
  // ...
  metadata: {
    children: [],
  },
});
```

## Schema to Model

The schema of the block is used to generate the model of the block. By default, the model will holds the flavour, props and id of the block.

```
MyBlockSchema
  -> MyBlockModel-1
  -> MyBlockModel-2
  -> MyBlockModel-3
```

For example, if we have a schema like this:

```ts
import { defineBlockSchema, type Text } from '@blocksuite/store';

export type MyBlockProps = {
  text: Text;
  level: number;
};

export const MyBlockSchema = defineBlockSchema({
  flavour: 'my-block',
  props: (internal): MyBlockProps => ({
    text: internal.Text(),
    level: 0,
  }),
  metadata: {
    version: 1,
    role: 'content',
  },
});
```

And when the model is created, you can use it like this:

```ts
import { type SchemaToModel } from '@blocksuite/store';

function doSomething(model: SchemaToModel<typeof MyBlockSchema>) {
  const id = model.id;
  const flavour = model.flavour;
  const text = model.text;
  const level = model.level;
}
```

You can also customize the model by extending the `BlockModel` to provide more methods:

```ts
export class MyBlockModel extends BlockModel<MyBlockProps> {
  levelUp() {
    this.level += 1;
  }
}

function doSomething(model: MyBlockModel) {
  model.levelUp();
  const level = model.level;
}
```
