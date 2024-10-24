import { PropertyValue } from '@affine/component';
import type { BlockStdScope } from '@blocksuite/affine/block-std';
import {
  DefaultInlineManagerExtension,
  RichText,
} from '@blocksuite/affine/blocks';
import type { Doc } from '@blocksuite/affine/store';
import { type LiveData, useLiveData } from '@toeverything/infra';
import { useEffect, useRef } from 'react';
import type * as Y from 'yjs';

import type { DatabaseCellRendererProps } from '../../../types';
import { useBlockStdScope } from '../../../utils';

// todo(@pengx17): handle markdown/keyboard shortcuts
const renderRichText = ({
  doc,
  std,
  text,
}: {
  std: BlockStdScope;
  text: Y.Text;
  doc: Doc;
}) => {
  const inlineManager = std.get(DefaultInlineManagerExtension.identifier);

  if (!inlineManager) {
    return null;
  }

  const richText = new RichText();
  richText.yText = text;
  richText.undoManager = doc.history;
  richText.readonly = doc.readonly;
  richText.attributesSchema = inlineManager.getSchema() as any;
  richText.attributeRenderer = inlineManager.getRenderer();
  return richText;
};

export const RichTextCell = ({
  cell,
  dataSource,
}: DatabaseCellRendererProps) => {
  const std = useBlockStdScope(dataSource.doc);
  const text = useLiveData(cell.value$ as LiveData<Y.Text>);
  const ref = useRef<HTMLDivElement>(null);
  // todo(@pengx17): following is a workaround to y.Text that it is got renewed when the cell is updated externally. however it breaks the cursor position.
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = '';
      const richText = renderRichText({ doc: dataSource.doc, std, text });
      if (richText) {
        ref.current.append(richText);
        return () => {
          richText.remove();
        };
      }
    }
    return () => {};
  }, [dataSource.doc, std, text]);
  return <PropertyValue ref={ref}></PropertyValue>;
};
