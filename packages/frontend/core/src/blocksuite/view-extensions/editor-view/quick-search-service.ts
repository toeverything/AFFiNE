import { DocsService } from '@affine/core/modules/doc';
import {
  CreationQuickSearchSession,
  DocsQuickSearchSession,
  LinksQuickSearchSession,
  QuickSearchService,
  RecentDocsQuickSearchSession,
} from '@affine/core/modules/quicksearch';
import { ExternalLinksQuickSearchSession } from '@affine/core/modules/quicksearch/impls/external-links';
import { JournalsQuickSearchSession } from '@affine/core/modules/quicksearch/impls/journals';
import { track } from '@affine/track';
import {
  BookmarkSlashMenuConfigIdentifier,
  insertLinkByQuickSearchCommand,
} from '@blocksuite/affine/blocks/bookmark';
import { LinkedDocSlashMenuConfigIdentifier } from '@blocksuite/affine/blocks/embed-doc';
import type { ServiceIdentifier } from '@blocksuite/affine/global/di';
import {
  QuickSearchExtension,
  type QuickSearchResult,
} from '@blocksuite/affine/shared/services';
import { type ExtensionType } from '@blocksuite/affine/store';
import type {
  SlashMenuConfig,
  SlashMenuItem,
} from '@blocksuite/affine/widgets/slash-menu';
import type { FrameworkProvider } from '@toeverything/infra';
import { pick } from 'lodash-es';

export function patchQuickSearchService(framework: FrameworkProvider) {
  const QuickSearch = QuickSearchExtension({
    async openQuickSearch() {
      let searchResult: QuickSearchResult = null;
      searchResult = await new Promise((resolve, reject) =>
        framework.get(QuickSearchService).quickSearch.show(
          [
            framework.createEntity(RecentDocsQuickSearchSession),
            framework.createEntity(CreationQuickSearchSession),
            framework.createEntity(DocsQuickSearchSession),
            framework.createEntity(LinksQuickSearchSession),
            framework.createEntity(ExternalLinksQuickSearchSession),
            framework.createEntity(JournalsQuickSearchSession),
          ],
          result => {
            if (result === null) {
              resolve(null);
              return;
            }

            if (result.source === 'docs') {
              resolve({
                docId: result.payload.docId,
              });
              return;
            }

            if (result.source === 'recent-doc') {
              resolve({
                docId: result.payload.docId,
              });
              return;
            }

            if (result.source === 'link') {
              resolve({
                docId: result.payload.docId,
                params: pick(result.payload, [
                  'mode',
                  'blockIds',
                  'elementIds',
                ]),
              });
              return;
            }

            if (result.source === 'date-picker') {
              result.payload
                .getDocId()
                .then(docId => {
                  if (docId) {
                    resolve({ docId });
                  }
                })
                .catch(reject);
              return;
            }

            if (result.source === 'external-link') {
              const externalUrl = result.payload.url;
              resolve({ externalUrl });
              return;
            }

            if (result.source === 'creation') {
              const docsService = framework.get(DocsService);
              const mode =
                result.id === 'creation:create-edgeless' ? 'edgeless' : 'page';
              const newDoc = docsService.createDoc({
                primaryMode: mode,
                title: result.payload.title,
              });

              resolve({ docId: newDoc.id });
              return;
            }
          },
          {
            label: {
              i18nKey: 'com.affine.cmdk.insert-links',
            },
            placeholder: {
              i18nKey: 'com.affine.cmdk.docs.placeholder',
            },
          }
        )
      );

      return searchResult;
    },
  });

  const SlashMenuQuickSearchExtension: ExtensionType = {
    setup: di => {
      const overrideFn = (identifier: ServiceIdentifier<SlashMenuConfig>) => {
        const prev = di.getFactory(identifier);
        if (!prev) return;

        di.override(identifier, provider => {
          const prevConfig: SlashMenuConfig = prev(provider);

          if (typeof prevConfig.items === 'function') {
            const prevConfigItemGenerator = prevConfig.items;
            prevConfig.items = ctx =>
              prevConfigItemGenerator(ctx).map(modifyFn);
          } else {
            prevConfig.items = prevConfig.items.map(modifyFn);
          }

          return prevConfig;
        });
      };

      overrideFn(LinkedDocSlashMenuConfigIdentifier);
      overrideFn(BookmarkSlashMenuConfigIdentifier);

      const modifyFn = (item: SlashMenuItem): SlashMenuItem => {
        if ('action' in item && item.name === 'Link') {
          item.action = ({ std }) => {
            const [success, { insertedLinkType }] = std.command.exec(
              insertLinkByQuickSearchCommand
            );

            if (!success) return;

            insertedLinkType
              ?.then(type => {
                const flavour = type?.flavour;
                if (!flavour) return;

                if (flavour === 'affine:bookmark') {
                  track.doc.editor.slashMenu.bookmark();
                  return;
                }

                if (flavour === 'affine:embed-linked-doc') {
                  track.doc.editor.slashMenu.linkDoc({
                    control: 'linkDoc',
                  });
                  return;
                }
              })
              .catch(console.error);
          };
        }
        return item;
      };
    },
  };

  return [QuickSearch, SlashMenuQuickSearchExtension];
}
