import { LinkIcon } from '@blocksuite/icons/rc';
import type { WorkspaceService } from '@toeverything/infra';
import { Entity, LiveData } from '@toeverything/infra';

import { resolveLinkToDoc } from '../../navigation';
import { isLink } from '../../navigation/utils';
import type { QuickSearchSession } from '../providers/quick-search-provider';
import type { QuickSearchItem } from '../types/item';

type ExternalLinkPayload = {
  url: string;
};

export class ExternalLinksQuickSearchSession
  extends Entity
  implements QuickSearchSession<'external-link', ExternalLinkPayload>
{
  constructor(private readonly workspaceService: WorkspaceService) {
    super();
  }

  query$ = new LiveData('');

  items$ = LiveData.computed(get => {
    const query = get(this.query$).trim();
    if (!query) return [];

    if (!isLink(query)) return [];

    const resolvedDoc = resolveLinkToDoc(query);
    if (
      resolvedDoc &&
      resolvedDoc.workspaceId === this.workspaceService.workspace.id
    ) {
      // is doc url
      return [];
    }

    return [
      {
        id: 'external-link:' + query,
        source: 'external-link',
        icon: LinkIcon,
        label: {
          i18nKey: 'com.affine.cmdk.affine.insert-link',
        },
        payload: { url: query },
      } as QuickSearchItem<'external-link', ExternalLinkPayload>,
    ];
  });

  query(query: string) {
    this.query$.next(query);
  }
}
