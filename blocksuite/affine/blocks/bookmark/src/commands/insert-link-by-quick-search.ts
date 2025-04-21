import {
  type InsertedLinkType,
  insertEmbedIframeWithUrlCommand,
  insertEmbedLinkedDocCommand,
  type LinkableFlavour,
} from '@blocksuite/affine-block-embed';
import { QuickSearchProvider } from '@blocksuite/affine-shared/services';
import type { Command } from '@blocksuite/std';

import { insertBookmarkCommand } from './insert-bookmark';

export const insertLinkByQuickSearchCommand: Command<
  {},
  { insertedLinkType: Promise<InsertedLinkType> }
> = (ctx, next) => {
  const { std } = ctx;
  const quickSearchService = std.getOptional(QuickSearchProvider);
  if (!quickSearchService) {
    return;
  }

  const insertedLinkType: Promise<InsertedLinkType> = quickSearchService
    .openQuickSearch()
    .then(result => {
      if (!result) return null;

      // add linked doc
      if ('docId' in result) {
        std.command.exec(insertEmbedLinkedDocCommand, {
          docId: result.docId,
          params: result.params,
        });
        return {
          flavour: 'affine:embed-linked-doc',
        };
      }

      // add normal link;
      if ('externalUrl' in result) {
        // try to insert embed iframe block first
        const [success, { flavour }] = std.command
          .chain()
          .try(chain => [
            chain.pipe(insertEmbedIframeWithUrlCommand, {
              url: result.externalUrl,
            }),
            chain.pipe(insertBookmarkCommand, { url: result.externalUrl }),
          ])
          .run();
        if (!success || !flavour) return null;
        return {
          flavour: flavour as LinkableFlavour,
        };
      }

      return null;
    });

  next({ insertedLinkType });
};
