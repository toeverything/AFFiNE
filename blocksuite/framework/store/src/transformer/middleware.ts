import type { Subject } from 'rxjs';

import type { BlockModel, DraftModel, Store } from '../model/index.js';
import type { AssetsManager } from './assets.js';
import type { Slice } from './slice.js';
import type {
  BlockSnapshot,
  CollectionInfoSnapshot,
  DocCRUD,
  DocSnapshot,
  SliceSnapshot,
} from './type.js';

export type BeforeImportBlockPayload = {
  snapshot: BlockSnapshot;
  type: 'block';
  parent?: string;
  index?: number;
};

export type BeforeImportPayload =
  | BeforeImportBlockPayload
  | {
      snapshot: SliceSnapshot;
      type: 'slice';
    }
  | {
      snapshot: DocSnapshot;
      type: 'page';
    }
  | {
      snapshot: CollectionInfoSnapshot;
      type: 'info';
    };

export type BeforeExportPayload =
  | {
      model: DraftModel;
      type: 'block';
    }
  | {
      page: Store;
      type: 'page';
    }
  | {
      slice: Slice;
      type: 'slice';
    }
  | {
      type: 'info';
    };

export type AfterExportPayload =
  | {
      snapshot: BlockSnapshot;
      type: 'block';
      model: DraftModel;
      parent?: string;
      index?: number;
    }
  | {
      snapshot: DocSnapshot;
      type: 'page';
      page: Store;
    }
  | {
      snapshot: SliceSnapshot;
      type: 'slice';
      slice: Slice;
    }
  | {
      snapshot: CollectionInfoSnapshot;
      type: 'info';
    };

export type AfterImportBlockPayload = {
  snapshot: BlockSnapshot;
  type: 'block';
  model: BlockModel;
  parent?: string;
  index?: number;
};

export type AfterImportPayload =
  | AfterImportBlockPayload
  | {
      snapshot: DocSnapshot;
      type: 'page';
      page: Store;
    }
  | {
      snapshot: SliceSnapshot;
      type: 'slice';
      slice: Slice;
    }
  | {
      snapshot: CollectionInfoSnapshot;
      type: 'info';
    };

export type TransformerSlots = {
  beforeImport: Subject<BeforeImportPayload>;
  afterImport: Subject<AfterImportPayload>;
  beforeExport: Subject<BeforeExportPayload>;
  afterExport: Subject<AfterExportPayload>;
};

type TransformerMiddlewareOptions = {
  assetsManager: AssetsManager;
  slots: TransformerSlots;
  docCRUD: DocCRUD;
  adapterConfigs: Map<string, unknown>;
  transformerConfigs: Map<string, unknown>;
};

type TransformerMiddlewareCleanup = () => void;

export type TransformerMiddleware = (
  options: TransformerMiddlewareOptions
) => void | TransformerMiddlewareCleanup;
