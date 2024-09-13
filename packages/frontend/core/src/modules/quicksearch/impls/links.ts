import type { DocMode } from '@blocksuite/blocks';
import { BlockLinkIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import type { DocsService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { truncate } from 'lodash-es';

import { resolveLinkToDoc } from '../../navigation';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { DocDisplayMetaService } from '../services/doc-display-meta';
import type { QuickSearchItem } from '../types/item';

type LinkPayload = {
  docId: string;
  blockIds?: string[];
  elementIds?: string[];
  mode?: DocMode;
};

export class LinksQuickSearchSession
  extends Entity
  implements QuickSearchSession<'link', LinkPayload>
{
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly docsService: DocsService,
    private readonly docDisplayMetaService: DocDisplayMetaService
  ) {
    super();
  }

  query$ = new LiveData('');

  items$ = LiveData.computed(get => {
    const query = get(this.query$);
    if (!query) return [];

    const isLink = query.startsWith('http://') || query.startsWith('https://');
    if (!isLink) return [];

    const resolvedDoc = resolveLinkToDoc(query);
    if (
      !resolvedDoc ||
      resolvedDoc.workspaceId !== this.workspaceService.workspace.id
    ) {
      return [];
    }

    const docId = resolvedDoc.docId;
    const doc = this.docsService.list.doc$(docId).value;
    if (!doc || get(doc.trash$)) return [];

    const { title, icon, updatedDate } =
      this.docDisplayMetaService.getDocDisplayMeta(doc);
    const linkToNode = resolvedDoc.blockIds || resolvedDoc.elementIds;
    const score = 100;

    return [
      {
        id: 'links:doc:' + doc.id,
        source: 'link',
        group: {
          id: 'docs',
          label: {
            key: 'com.affine.quicksearch.group.searchfor',
            options: { query: truncate(query) },
          },
          score: 5,
        },
        label: {
          title: title,
        },
        score,
        icon: linkToNode
          ? BlockLinkIcon
          : resolvedDoc.mode === 'page'
            ? PageIcon
            : resolvedDoc.mode === 'edgeless'
              ? EdgelessIcon
              : icon,
        timestamp: updatedDate,
        payload: {
          docId,
          blockIds: resolvedDoc.blockIds,
          elementIds: resolvedDoc.elementIds,
          mode: resolvedDoc.mode,
        },
      } as QuickSearchItem<'link', LinkPayload>,
    ];
  });

  query(query: string) {
    this.query$.next(query);
  }
}
