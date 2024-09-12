import type { ReferenceParams } from '@blocksuite/blocks';
import { BlockLinkIcon, LinkIcon } from '@blocksuite/icons/rc';
import type { DocsService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';
import { isEmpty, pick, truncate } from 'lodash-es';

import { resolveLinkToDoc } from '../../navigation';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { DocDisplayMetaService } from '../services/doc-display-meta';
import type { QuickSearchItem } from '../types/item';

type LinkPayload = {
  internal?: {
    docId: string;
    title?: string;
    blockId?: string;
    blockContent?: string;
    params?: ReferenceParams;
  };
  external?: {
    url: string;
  };
};

export class LinksQuickSearchSession
  extends Entity
  implements QuickSearchSession<'link', LinkPayload>
{
  constructor(
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
    if (!resolvedDoc) {
      return [
        {
          id: 'link',
          source: 'link',
          icon: LinkIcon,
          label: {
            key: 'com.affine.cmdk.affine.insert-link',
          },
          payload: { external: { url: query } },
        } as QuickSearchItem<'link', LinkPayload>,
      ];
    }

    const docId = resolvedDoc.docId;
    const doc = this.docsService.list.doc$(docId).value;
    if (!doc || get(doc.trash$)) return [];

    const params = pick(resolvedDoc, ['mode', 'blockIds', 'elementIds']);
    const { title, icon, updatedDate } =
      this.docDisplayMetaService.getDocDisplayMeta(doc);
    const blockId = params?.blockIds?.[0];
    const linkToNode = Boolean(blockId);
    const score = 100;
    const internal = {
      docId,
      score,
      blockId,
      blockContent: '',
    };

    if (linkToNode && !isEmpty(params)) {
      Object.assign(internal, { params });
    }

    return [
      {
        id: ['doc', doc.id, linkToNode ? blockId : ''].join(':'),
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
        icon: linkToNode ? BlockLinkIcon : icon,
        timestamp: updatedDate,
        payload: { internal },
      } as QuickSearchItem<'link', LinkPayload>,
    ];
  });

  query(query: string) {
    this.query$.next(query);
  }
}
