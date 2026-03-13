import { I18n } from '@affine/i18n';
import {
  ActionPlacement,
  type ToolbarActions,
  ToolbarModuleExtension,
} from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';

/**
 * Translated labels for the Edgeless "More" context menu actions.
 *
 * The blocksuite toolbar system supports custom:* module overrides. Any module
 * registered under 'custom:<flavour>' is deep-merged with the base module.
 * Last-write-wins for scalar values like `label`, so we override the
 * hardcoded English strings in blocksuite without modifying blocksuite itself.
 *
 * Source: blocksuite/affine/blocks/root/src/edgeless/configs/toolbar/more.ts
 */
const edgelessMoreActionsI18n = (): ToolbarActions => [
  // Selection Group
  {
    id: 'Z.a.selection',
    actions: [
      {
        id: 'a.create-frame',
        label: I18n['com.affine.editor.toolbar.frame-section'](),
      },
      {
        id: 'b.create-group',
        label: I18n['com.affine.editor.toolbar.group-section'](),
      },
    ],
  },
  // Reordering Group
  {
    id: 'Z.b.reordering',
    actions: [
      {
        id: 'a.bring-to-front',
        label: I18n['com.affine.editor.toolbar.bring-to-front'](),
      },
      {
        id: 'b.bring-forward',
        label: I18n['com.affine.editor.toolbar.bring-forward'](),
      },
      {
        id: 'c.send-backward',
        label: I18n['com.affine.editor.toolbar.send-backward'](),
      },
      {
        id: 'c.send-to-back',
        label: I18n['com.affine.editor.toolbar.send-to-back'](),
      },
    ],
  },
  // Clipboard Group
  {
    id: 'a.clipboard',
    actions: [
      {
        id: 'copy',
        label: I18n['com.affine.editor.toolbar.copy'](),
      },
      {
        id: 'duplicate',
        label: I18n['com.affine.editor.toolbar.duplicate'](),
      },
      {
        id: 'reload',
        label: I18n['com.affine.editor.toolbar.reload'](),
      },
    ],
  },
  // Conversions Group
  {
    id: 'd.conversions',
    actions: [
      {
        id: 'a.turn-into-linked-doc',
        label: I18n['com.affine.editor.toolbar.turn-into-linked-doc'](),
      },
      {
        id: 'b.create-linked-doc',
        label: I18n['com.affine.editor.toolbar.create-linked-doc'](),
      },
    ],
  },
  // Delete
  {
    id: 'e.delete',
    label: I18n['com.affine.editor.toolbar.delete'](),
    placement: ActionPlacement.More,
  },
];

/**
 * View extension that overrides hardcoded English labels in the Edgeless
 * toolbar "More" menu with translated strings from AFFiNE's i18n system.
 *
 * Registered as 'custom:affine:surface:*' so the blocksuite toolbar
 * deep-merges it over the base 'affine:surface:*' module automatically.
 */
export const ToolbarI18nExtension: ExtensionType = ToolbarModuleExtension({
  id: BlockFlavourIdentifier('custom:affine:surface:*'),
  config: {
    actions: edgelessMoreActionsI18n(),
  },
});
