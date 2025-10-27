import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Container } from '@blocksuite/affine/global/di';
import {
  customImageProxyMiddleware,
  MarkdownAdapter,
} from '@blocksuite/affine/shared/adapters';
import {
  type BlockModel,
  type DocSnapshot,
  nanoid,
  type Store,
  Text,
  Transformer,
} from '@blocksuite/affine/store';
import { Service } from '@toeverything/infra';
import { Doc as YDoc } from 'yjs';

import type { DefaultServerService, WorkspaceServerService } from '../../cloud';
import {
  getAFFiNEWorkspaceSchema,
  type WorkspaceService,
} from '../../workspace';
import { WorkspaceImpl } from '../../workspace/impls/workspace';

export class SnapshotHelper extends Service {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceServerService: WorkspaceServerService,
    private readonly defaultServerService: DefaultServerService
  ) {
    super();
  }

  private get serverService() {
    return (
      this.workspaceServerService.server || this.defaultServerService.server
    );
  }

  getTempWorkspace() {
    const collection = new WorkspaceImpl({
      rootDoc: new YDoc({ guid: 'markdownToDoc' + nanoid() }),
      blobSource: {
        name: 'cloud',
        readonly: true,
        get: async key => {
          const record =
            await this.workspaceService.workspace.engine.blob.get(key);
          return record ? new Blob([record.data], { type: record.mime }) : null;
        },
        set() {
          return Promise.resolve('');
        },
        delete() {
          return Promise.resolve();
        },
        list() {
          return Promise.resolve([]);
        },
      },
    });
    collection.meta.initialize();
    return collection;
  }

  // todo: cache the transformer?
  getTransformer() {
    const collection = this.getTempWorkspace();
    const schema = getAFFiNEWorkspaceSchema();
    const imageProxyUrl = new URL(
      BUILD_CONFIG.imageProxyUrl,
      this.serverService.baseUrl
    ).toString();

    const middlewares = [customImageProxyMiddleware(imageProxyUrl)];
    const transformer = new Transformer({
      schema,
      blobCRUD: collection.blobSync,
      docCRUD: {
        create: (id: string) => {
          const doc = collection.createDoc(id);
          return doc.getStore({ id });
        },
        get: (id: string) => collection.getDoc(id)?.getStore({ id }) ?? null,
        delete: (id: string) => collection.removeDoc(id),
      },
      middlewares,
    });
    return transformer;
  }

  getMarkdownAdapter() {
    const transformer = this.getTransformer();
    const extensions = getStoreManager().config.init().value.get('store');
    const container = new Container();
    extensions.forEach(ext => {
      ext.setup(container);
    });
    const mdAdapter = new MarkdownAdapter(transformer, container.provider());
    return mdAdapter;
  }

  getSnapshot(doc: Store): DocSnapshot | undefined {
    const transformer = this.getTransformer();
    if (!transformer) {
      throw new Error('Markdown transformer not found');
    }
    const result = transformer.docToSnapshot(doc);
    return result;
  }

  async createStore(snapshot?: DocSnapshot): Promise<Store | undefined> {
    if (snapshot) {
      const transformer = this.getTransformer();
      if (!transformer) {
        throw new Error('Markdown transformer not found');
      }
      return await transformer.snapshotToDoc(snapshot);
    } else {
      const collection = this.getTempWorkspace();
      if (!collection) {
        throw new Error('Temp workspace not found');
      }

      // Create a temporary doc with proper structure
      const doc = collection.createDoc();
      const store = doc.getStore();
      store.load(() => {
        // Add root page block with empty title
        const rootId = store.addBlock('affine:page', {
          title: new Text(''),
        });

        // Add note block
        const noteId = store.addBlock('affine:note', {}, rootId);

        // Add default paragraph block
        store.addBlock('affine:paragraph', {}, noteId);
      });

      // Reset history to prevent initial creation operations from being undone
      store.resetHistory();

      return store;
    }
  }

  async createEmptySnapshot() {
    const store = await this.createStore();
    if (store) {
      return this.getSnapshot(store);
    } else {
      return undefined;
    }
  }

  isDocEmpty(store?: Store): boolean {
    if (!store) {
      return true;
    }

    const checkBlock = (block: BlockModel) => {
      if (block.text && block.text.length > 0) {
        return false;
      }
      const children = block.children;
      for (const child of children) {
        if (!checkBlock(child)) {
          return false;
        }
      }
      return true;
    };

    const blocks = store.blocks.peek();
    for (const block of Object.values(blocks)) {
      if (!checkBlock(block.model)) {
        return false;
      }
    }
    return true;
  }
}
