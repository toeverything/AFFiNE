import type { ReferenceParams } from '@blocksuite/blocks';
import { BlockLinkIcon, EdgelessIcon, PageIcon } from '@blocksuite/icons/rc';
import type { DocsService, WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { omit, truncate } from 'lodash-es';

import { resolveLinkToDoc } from '../../navigation';
import { isLink } from '../../navigation/utils';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { DocDisplayMetaService } from '../services/doc-display-meta';
import type { QuickSearchItem } from '../types/item';

type LinkPayload = { docId: string } & ReferenceParams;

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
    const query = get(this.query$).trim();
    if (!query) return [];

    if (!isLink(query)) return [];

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
    const payload = omit(resolvedDoc, ['workspaceId']);
    const icons = {
      page: PageIcon,
      edgeless: EdgelessIcon,
      node: BlockLinkIcon,
      other: icon,
    };

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
          title,
        },
        score,
        icon: icons[linkToNode ? 'node' : (resolvedDoc.mode ?? 'other')],
        timestamp: updatedDate,
        payload,
      } as QuickSearchItem<'link', LinkPayload>,
    ];
  });

  query(query: string) {
    this.query$.next(query);
  }
}
