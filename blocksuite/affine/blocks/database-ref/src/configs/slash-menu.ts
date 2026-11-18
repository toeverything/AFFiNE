import { insertNoteRefBlockCommand } from '@blocksuite/affine-block-note-ref';
import { insertSurfaceRefBlockCommand } from '@blocksuite/affine-block-surface-ref';
import { toast } from '@blocksuite/affine-components/toast';
import type { DatabaseBlockModel } from '@blocksuite/affine-model';
import { DatabaseBlockSchema } from '@blocksuite/affine-model';
import { CrossDocReferenceProvider } from '@blocksuite/affine-shared/services';
import {
  type SlashMenuActionItem,
  type SlashMenuConfig,
  SlashMenuConfigExtension,
  type SlashMenuItem,
} from '@blocksuite/affine-widget-slash-menu';
import { DatabaseTableViewIcon, LinkIcon } from '@blocksuite/icons/lit';
import { BlockSelection, type BlockStdScope } from '@blocksuite/std';
import type { BlockModel } from '@blocksuite/store';

import { insertDatabaseRefBlockCommand } from '../commands';

/**
 * Opens the cross-doc reference picker DI seam and inserts the correct
 * block type per candidate flavour — extracted from `crossDocItem`'s own
 * action closure (see below) so the keyboard-toolbar's "Reference" item
 * (mobile) can call the exact same logic as this file's own slash-menu
 * "Reference" item (desktop), rather than duplicating it.
 */
export async function insertCrossDocReference(
  std: BlockStdScope,
  model: BlockModel
): Promise<void> {
  const crossDocReference = std.getOptional(CrossDocReferenceProvider);
  if (!crossDocReference) {
    toast(std.host, 'Cross-doc referencing is not available.');
    return;
  }

  const candidate = await crossDocReference.openCrossDocReferencePicker(
    std.store.id
  );
  // A `null` candidate means the user cancelled the picker — not a
  // failure, so no toast here.
  if (!candidate) return;

  let insertedBlockId: string | undefined;
  if (candidate.flavour === 'affine:database') {
    const [_, result] = std.command.exec(insertDatabaseRefBlockCommand, {
      refBlockId: candidate.blockId,
      refDocId: candidate.docId,
      place: 'after',
      removeEmptyLine: true,
      selectedModels: [model],
    });
    insertedBlockId = result.insertedDatabaseRefBlockId;
  } else if (candidate.flavour === 'affine:frame') {
    const [_, result] = std.command.exec(insertSurfaceRefBlockCommand, {
      reference: candidate.blockId,
      refDocId: candidate.docId,
      refFlavour: candidate.flavour,
      place: 'after',
      removeEmptyLine: true,
      selectedModels: [model],
    });
    insertedBlockId = result.insertedSurfaceRefBlockId;
  } else if (candidate.flavour === 'affine:note') {
    const [_, result] = std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: candidate.blockId,
      refDocId: candidate.docId,
      place: 'after',
      removeEmptyLine: true,
      selectedModels: [model],
    });
    insertedBlockId = result.insertedNoteRefBlockId;
  }
  if (!insertedBlockId) {
    toast(std.host, 'Could not insert that reference.');
    return;
  }

  std.selection.set([
    std.selection.create(BlockSelection, {
      blockId: insertedBlockId,
    }),
  ]);
}

/**
 * Same-doc "insert another view of this Table" items — mirrors how
 * `surface-ref`'s slash-menu enumerates current-doc frames. The very first
 * table a user creates (via the ordinary, untouched `/database` command)
 * stays exactly as it is; picking one of these items is what triggers
 * `insertDatabaseRefBlockCommand`'s promotion (see commands.ts) the first
 * time a second reference to it is created.
 */
export const databaseRefSlashMenuConfig: SlashMenuConfig = {
  items: ({ std, model }) => {
    let index = 0;

    const databaseBlocks = std.store.getBlocksByFlavour(
      DatabaseBlockSchema.model.flavour
    );

    const sameDocItems = databaseBlocks
      .filter(block => block.id !== model.id)
      .map<SlashMenuActionItem>(block => {
        const databaseModel = block.model as DatabaseBlockModel;
        const title = databaseModel.props.title.toString();
        return {
          name: 'Table: ' + (title || '(untitled)'),
          icon: DatabaseTableViewIcon(),
          group: `5_Edgeless Element@${index++}`,
          action: () => {
            const [_, result] = std.command.exec(
              insertDatabaseRefBlockCommand,
              {
                refBlockId: block.id,
                place: 'after',
                removeEmptyLine: true,
                selectedModels: [model],
              }
            );
            if (!result.insertedDatabaseRefBlockId) return;
            std.selection.set([
              std.selection.create(BlockSelection, {
                blockId: result.insertedDatabaseRefBlockId,
              }),
            ]);
          },
        };
      });

    // Single seam point for "reference a block from another doc," covering
    // every cross-doc-referenceable flavour at once (Frame, Database, and
    // — as of Story 0.5 — Note). Deliberately NOT split into a per-flavour
    // item — the picker itself already returns candidates of any supported
    // flavour, so adding a new referenceable block type only needs a new
    // branch below, not a new slash-menu item for the user to discover.
    const crossDocItem: SlashMenuItem = {
      name: 'Reference',
      description: 'Reference a frame, table, or note from a different doc',
      icon: LinkIcon(),
      group: `5_Edgeless Element@${index++}`,
      action: () => {
        insertCrossDocReference(std, model).catch(console.error);
      },
    };

    return [...sameDocItems, crossDocItem];
  },
};

export const DatabaseRefSlashMenuConfigExtension = SlashMenuConfigExtension(
  'affine:database-ref',
  databaseRefSlashMenuConfig
);
