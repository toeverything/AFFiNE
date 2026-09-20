# Adapter

Adapter works as a bridge between different formats of data and the BlockSuite [`Snapshot`](./data-synchronization#snapshot-api) (i.e., the JSON-serialized block tree). It enables you to import and export data from and to BlockSuite documents.

## Base Adapter

[`BaseAdapter`](/api/@blocksuite/store/classes/BaseAdapter) provides you with a skeleton to build your own adapter. It is an abstract class that you can extend and implement the following methods:

```ts
export abstract class BaseAdapter<AdapterTarget = unknown> {
  job: Job;

  constructor(job: Job) {
    this.job = job;
  }

  get configs() {
    return this.job.adapterConfigs;
  }

  abstract fromDocSnapshot(
    payload: FromDocSnapshotPayload
  ): Promise<FromDocSnapshotResult<AdapterTarget>>;
  abstract fromBlockSnapshot(
    payload: FromBlockSnapshotPayload
  ): Promise<FromBlockSnapshotResult<AdapterTarget>>;
  abstract fromSliceSnapshot(
    payload: FromSliceSnapshotPayload
  ): Promise<FromSliceSnapshotResult<AdapterTarget>>;
  abstract toDocSnapshot(
    payload: ToDocSnapshotPayload<AdapterTarget>
  ): Promise<DocSnapshot>;
  abstract toBlockSnapshot(
    payload: ToBlockSnapshotPayload<AdapterTarget>
  ): Promise<BlockSnapshot>;
  abstract toSliceSnapshot(
    payload: ToSliceSnapshotPayload<AdapterTarget>
  ): Promise<SliceSnapshot | null>;
}
```

Methods `fromDocSnapshot`, `fromBlockSnapshot`, `fromSliceSnapshot` are used to convert the data from the BlockSuite Snapshot to the target format. Methods `toDocSnapshot`, `toBlockSnapshot`, `toSliceSnapshot` are used to convert the data from the target format to the BlockSuite Snapshot.

Method `toSliceSnapshot` can return `null` if the target format cannot be converted to a slice using this adapter. It enables some components like clipboard to determine whether the adapter can handle the data. If not, it will try other adapters according to the priority.

These six core methods are expected to be purely functional. They should not have any side effects. If you need to change the behaviour of the adapter according to the job context, you can add it to `job.adapterConfigs` using job middlewares.

## Use Adapter

Sample usage:

```ts
const middleware: JobMiddleware = ({ adapterConfigs }) => {
  // You can set the adapter configs here.
  adapterConfigs.set('title:deadbeef', 'test');
};

const job = new Job({ collection: doc.collection, middlewares: [middleware] });
const snapshot = await job.docToSnapshot(doc);

const adapter = new MarkdownAdapter(job);

const markdownResult = await adapter.fromDocSnapshot({
  snapshot,
  assets: job.assetsManager,
});
```

## AST Walker

[ASTWalker](/api/@blocksuite/store/classes/ASTWalker) is a helper class that helps you to transform from and to different ASTs (Abstract Syntax Trees). For example, you can use it to transform from BlockSuite Snapshot (which can be treated as AST) to Markdown AST and then export to Markdown. Unlike other AST walkers, it does not only traverse the AST, but also gives you the ability to build a new AST with the data from the original AST.

It is recommended to use ASTWalker to build text-based adapters.

### Sample AST Walker

```ts
import { ASTWalker } from '@blocksuite/store';

//                           ONode          TNode
const walker = new ASTWalker<BlockSnapshot, MarkdownAST>();

// Make sure the leaves we are going to traverse are a type of BlockSnapshot.
// So it won't waste time on other properties.
walker.setONodeTypeGuard(
  (node): node is BlockSnapshot =>
  BlockSnapshotSchema.safeParse(node).success
);

walker.setEnter(async (o, context) => {
  switch (o.node.flavour) {
    case 'affine:list': {
      context
        .openNode(
          {
            type: 'list',
            value: convertToValue(o.node.props.text)
            children: [],
          },
          // Mount point for leaves
          'children'
        )
      break;
    }
  }
});

walker.setLeave(async (o, context) => {
  switch (o.node.flavour) {
    case 'affine:list': {
      context.closeNode();
      break;
    }
  }
});

const ast = await walker.walk(snapshot, markdown);
```

There are two handlers which will be called when the walker enters and leaves a node. Compared to a single handler, it gives you an elegant way to process nested nodes.

For example, consider a markdown document like this:

```md
- List 1 // context.openNode 1
  - List 1.1 // context.openNode 2 && context.closeNode 2
  - List 1.2 // context.openNode 3 && context.closeNode 3
    // context.closeNode 1
- List 2 // context.openNode 4 && context.closeNode 4
```

The context works like a stack. In fact, it is a stack. When the walker enters a node, it will push the node to the stack. When the walker leaves a node, it will pop the node from the stack. Whenever the node pops from the stack, the walker will mount the node to its parent node.

In this case, the walker will push nodes when entering and pop nodes when leaving, producing a nested structure i.e. a tree.

In general, except for special cases, for the same `o.node.flavour`, `o.node.type` or something like this which can be used to identify a node's type, the number of `context.openNode` and `context.closeNode` should be the same. Otherwise, you likely have a bug in your code.
