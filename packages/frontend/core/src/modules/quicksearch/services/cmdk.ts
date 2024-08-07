import { track } from '@affine/core/mixpanel';
import type { DocsService } from '@toeverything/infra';
import { Service } from '@toeverything/infra';

import type { WorkbenchService } from '../../workbench';
import { CollectionsQuickSearchSession } from '../impls/collections';
import { CommandsQuickSearchSession } from '../impls/commands';
import { CreationQuickSearchSession } from '../impls/creation';
import { DocsQuickSearchSession } from '../impls/docs';
import { RecentDocsQuickSearchSession } from '../impls/recent-docs';
import type { QuickSearchService } from './quick-search';

export class CMDKQuickSearchService extends Service {
  constructor(
    private readonly quickSearchService: QuickSearchService,
    private readonly workbenchService: WorkbenchService,
    private readonly docsService: DocsService
  ) {
    super();
  }

  toggle() {
    if (this.quickSearchService.quickSearch.show$.value) {
      this.quickSearchService.quickSearch.hide();
    } else {
      this.quickSearchService.quickSearch.show(
        [
          this.framework.createEntity(RecentDocsQuickSearchSession),
          this.framework.createEntity(CollectionsQuickSearchSession),
          this.framework.createEntity(CommandsQuickSearchSession),
          this.framework.createEntity(CreationQuickSearchSession),
          this.framework.createEntity(DocsQuickSearchSession),
        ],
        result => {
          if (!result) {
            return;
          }
          if (result.source === 'commands') {
            result.payload.run()?.catch(err => {
              console.error(err);
            });
          } else if (
            result.source === 'recent-doc' ||
            result.source === 'docs'
          ) {
            const doc: {
              docId: string;
              blockId?: string;
            } = result.payload;

            result.source === 'recent-doc' && track.$.cmdk.recent.recentDocs();
            result.source === 'docs' &&
              track.$.cmdk.results.searchResultsDocs();

            this.workbenchService.workbench.openDoc({
              docId: doc.docId,
              blockId: doc.blockId,
            });
          } else if (result.source === 'collections') {
            this.workbenchService.workbench.openCollection(
              result.payload.collectionId
            );
          } else if (result.source === 'creation') {
            if (result.id === 'creation:create-page') {
              const newDoc = this.docsService.createDoc({
                mode: 'page',
                title: result.payload.title,
              });
              this.workbenchService.workbench.openDoc(newDoc.id);
            } else if (result.id === 'creation:create-edgeless') {
              const newDoc = this.docsService.createDoc({
                mode: 'edgeless',
                title: result.payload.title,
              });
              this.workbenchService.workbench.openDoc(newDoc.id);
            }
          }
        },
        {
          placeholder: {
            key: 'com.affine.cmdk.docs.placeholder',
          },
        }
      );
    }
  }
}
