import { PropertyValue, toReactNode } from '@affine/component';
import type { BlockStdScope } from '@blocksuite/affine/block-std';
import { DefaultInlineManagerExtension } from '@blocksuite/affine/blocks';
import type { Doc } from '@blocksuite/affine/store';
import type { Y } from '@blocksuite/store';
import { html } from 'lit';

import type {
  DatabaseCellRendererProps,
  DatabaseValueCell,
} from '../../../types';
import { useBlockStdScope } from '../../../utils';

const renderRichText = ({
  cell,
  doc,
  std,
}: {
  std: BlockStdScope;
  cell: DatabaseValueCell;
  doc: Doc;
}) => {
  const inlineManager = std.get(DefaultInlineManagerExtension.identifier);

  if (!inlineManager) {
    return null;
  }

  return html`<rich-text
    .yText=${cell.value as Y.Text}
    .undoManager=${doc.history}
    .readonly=${doc.readonly}
    .attributesSchema=${inlineManager.getSchema() as any}
    .attributeRenderer=${inlineManager.getRenderer()}
    .markdownShortcutHandler=${inlineManager.markdownShortcutHandler}
    .embedChecker=${inlineManager.embedChecker}
  ></rich-text>`;
};

export const RichTextCell = ({
  cell,
  dataSource,
}: DatabaseCellRendererProps) => {
  const std = useBlockStdScope(dataSource.doc);
  const template = renderRichText({ cell, doc: dataSource.doc, std });
  return (
    <PropertyValue isEmpty={!template}>
      {template ? toReactNode(template) : null}
    </PropertyValue>
  );
};
