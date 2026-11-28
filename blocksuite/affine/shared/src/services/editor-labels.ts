import { type BlockStdScope, ConfigExtensionFactory } from '@blocksuite/std';

const identity = (label: string) => label;

export const EditorLabelsExtension = ConfigExtensionFactory<{
  translate: (label: string) => string;
}>('affine:editor-labels');

export function getEditorLabel(std: BlockStdScope) {
  return (
    std.getOptional(EditorLabelsExtension.identifier)?.translate ?? identity
  );
}
