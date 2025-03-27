import {
  type ExternalGetDataFeedbackArgs,
  type fromExternalData,
  monitorForElements,
  type MonitorGetFeedback,
  type toExternalData,
} from '@affine/component';
import type { AffineDNDData } from '@affine/core/types/dnd';
import { BlockStdScope } from '@blocksuite/affine/block-std';
import {
  DNDAPIExtension,
  DndApiExtensionIdentifier,
} from '@blocksuite/affine/shared/services';
import type { SliceSnapshot } from '@blocksuite/affine/store';
import type { DragBlockPayload } from '@blocksuite/affine/widgets/drag-handle';
import { Service } from '@toeverything/infra';

import type { DocsService } from '../../doc';
import { resolveLinkToDoc } from '../../navigation';
import type { WorkspaceService } from '../../workspace';

type Entity = AffineDNDData['draggable']['entity'];
type EntityResolver = (data: string) => Entity | null;

type ExternalDragPayload = ExternalGetDataFeedbackArgs['source'];

type MixedDNDData = AffineDNDData & {
  draggable: DragBlockPayload;
};

export class DndService extends Service {
  constructor(
    private readonly docsService: DocsService,
    private readonly workspaceService: WorkspaceService
  ) {
    super();

    // order matters
    this.resolvers.push(this.resolveBlocksuiteExternalData);

    const mimeResolvers: [string, EntityResolver][] = [
      ['text/html', this.resolveHTML],
      ['text/uri-list', this.resolveUriList],
    ];

    mimeResolvers.forEach(([type, resolver]) => {
      this.resolvers.push((source: ExternalDragPayload) => {
        if (source.types.includes(type)) {
          const stringData = source.getStringData(type);
          if (stringData) {
            const entity = resolver(stringData);
            if (entity) {
              return {
                entity,
                from: {
                  at: 'external',
                },
              };
            }
          }
        }
        return null;
      });
    });

    this.setupBlocksuiteAdapter();
  }

  private setupBlocksuiteAdapter() {
    /**
     * Migrate from affine to blocksuite
     * For now, we only support doc
     */
    const affineToBlocksuite = (args: MonitorGetFeedback<MixedDNDData>) => {
      const data = args.source.data;
      if (data.entity && !data.bsEntity) {
        if (data.entity.type !== 'doc') {
          return;
        }
        const dndAPI = this.getBlocksuiteDndAPI();
        if (!dndAPI) {
          return;
        }
        const snapshotSlice = dndAPI.fromEntity({
          docId: data.entity.id,
          flavour: 'affine:embed-linked-doc',
        });
        if (!snapshotSlice) {
          return;
        }
        data.bsEntity = {
          type: 'blocks',
          modelIds: [],
          snapshot: snapshotSlice,
        };
      }
    };

    /**
     * Migrate from blocksuite to affine
     */
    const blocksuiteToAffine = (args: MonitorGetFeedback<MixedDNDData>) => {
      const data = args.source.data;
      if (!data.entity && data.bsEntity) {
        if (data.bsEntity.type !== 'blocks' || !data.bsEntity.snapshot) {
          return;
        }
        const dndAPI = this.getBlocksuiteDndAPI();
        if (!dndAPI) {
          return;
        }
        const entity = this.resolveBlockSnapshot(data.bsEntity.snapshot);
        if (!entity) {
          return;
        }
        data.entity = entity;
      }
    };

    function adaptDragEvent(args: MonitorGetFeedback<MixedDNDData>) {
      affineToBlocksuite(args);
      blocksuiteToAffine(args);
    }

    function canMonitor(args: MonitorGetFeedback<MixedDNDData>) {
      return (
        args.source.data.entity?.type === 'doc' ||
        (args.source.data.bsEntity?.type === 'blocks' &&
          !!args.source.data.bsEntity.snapshot)
      );
    }

    this.disposables.push(
      monitorForElements({
        canMonitor: (args: MonitorGetFeedback<MixedDNDData>) => {
          if (canMonitor(args)) {
            // HACK ahead:
            // canMonitor shall be used a pure function, which means
            // we may need to adapt the drag event to make sure the data is applied onDragStart.
            // However, canMonitor in blocksuite is also called BEFORE onDragStart,
            // so we need to adapt it here in onMonitor
            adaptDragEvent(args);
            return true;
          }
          return false;
        },
      })
    );
  }

  private readonly resolvers: ((
    source: ExternalDragPayload
  ) => AffineDNDData['draggable'] | null)[] = [];

  getBlocksuiteDndAPI(sourceDocId?: string) {
    const collection = this.workspaceService.workspace.docCollection;
    sourceDocId ??= collection.docs.keys().next().value;
    const doc = sourceDocId ? collection.getDoc(sourceDocId)?.getStore() : null;

    if (!doc) {
      return null;
    }

    const std = new BlockStdScope({
      store: doc,
      extensions: [DNDAPIExtension],
    });
    const dndAPI = std.get(DndApiExtensionIdentifier);
    return dndAPI;
  }

  fromExternalData: fromExternalData<AffineDNDData> = (
    args: ExternalGetDataFeedbackArgs,
    isDropEvent?: boolean
  ) => {
    if (!isDropEvent) {
      return {};
    }

    let resolved: AffineDNDData['draggable'] | null = null;

    // in the order of the resolvers instead of the order of the types
    for (const resolver of this.resolvers) {
      const candidate = resolver(args.source);
      if (candidate) {
        resolved = candidate;
        break;
      }
    }

    if (!resolved) {
      return {}; // no resolver can handle this data
    }

    return resolved;
  };

  toExternalData: toExternalData<AffineDNDData> = (args, data) => {
    const normalData = typeof data === 'function' ? data(args) : data;

    if (
      !normalData ||
      !normalData.entity ||
      normalData.entity.type !== 'doc' ||
      !normalData.entity.id
    ) {
      return {};
    }

    const dndAPI = this.getBlocksuiteDndAPI(normalData.entity.id);

    if (!dndAPI) {
      return {};
    }

    const snapshotSlice = dndAPI.fromEntity({
      docId: normalData.entity.id,
      flavour: 'affine:embed-linked-doc',
    });

    if (!snapshotSlice) {
      return {};
    }

    const encoded = dndAPI.encodeSnapshot(snapshotSlice);

    return {
      [dndAPI.mimeType]: encoded,
    };
  };

  private readonly resolveUriList: EntityResolver = urls => {
    // only deal with the first url
    const url = urls
      ?.split('\n')
      .filter(u => u.trim() && !u.trim().startsWith('#'))[0];

    if (url) {
      const maybeDocLink = resolveLinkToDoc(url);

      // check if the doc is in the current workspace
      if (
        maybeDocLink?.workspaceId === this.workspaceService.workspace.id &&
        this.docsService.list.doc$(maybeDocLink.docId).value &&
        // skip for block references for now
        !maybeDocLink.blockIds?.length
      ) {
        return {
          type: 'doc',
          id: maybeDocLink.docId,
        };
      }
    }
    return null;
  };

  /**
   * @deprecated Blocksuite DND is now using pragmatic-dnd as well
   */
  private readonly resolveBlocksuiteExternalData = (
    source: ExternalDragPayload
  ): AffineDNDData['draggable'] | null => {
    const dndAPI = this.getBlocksuiteDndAPI();
    if (!dndAPI) {
      return null;
    }
    const encoded = source.getStringData(dndAPI.mimeType);
    if (!encoded) {
      return null;
    }
    const snapshot = dndAPI.decodeSnapshot(encoded);
    if (!snapshot) {
      return null;
    }
    const entity = this.resolveBlockSnapshot(snapshot);
    if (!entity) {
      return null;
    }
    return {
      entity,
      from: {
        at: 'blocksuite-editor',
      },
    };
  };

  private readonly resolveHTML: EntityResolver = html => {
    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      // If drag from another secure context, the url-list
      // will be "about:blank#blocked"
      // We can still infer the url-list from the anchor tags
      const urls = Array.from(doc.querySelectorAll('a'))
        .map(a => a.href)
        .join('\n');
      return this.resolveUriList(urls);
    } catch {
      // ignore the error
      return null;
    }
  };

  private readonly resolveBlockSnapshot = (
    snapshot: SliceSnapshot
  ): Entity | null => {
    for (const block of snapshot.content) {
      if (
        ['affine:embed-linked-doc', 'affine:embed-synced-doc'].includes(
          block.flavour
        )
      ) {
        return {
          type: 'doc',
          id: block.props.pageId as string,
        };
      }
    }
    return null;
  };
}
