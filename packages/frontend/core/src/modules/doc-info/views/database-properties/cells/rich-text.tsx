import { PropertyValue } from '@affine/component';
import { ConfigModal } from '@affine/core/components/mobile';
import { DefaultInlineManagerExtension } from '@blocksuite/affine/inlines/preset';
import { RichText } from '@blocksuite/affine/rich-text';
import type { BlockStdScope } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { TextIcon } from '@blocksuite/icons/rc';
import { type LiveData, useLiveData } from '@toeverything/infra';
import { type CSSProperties, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';

import type { DatabaseCellRendererProps } from '../../../types';
import { useBlockStdScope } from '../../../use-std';
import * as styles from './rich-text.css';

// todo(@pengx17): handle markdown/keyboard shortcuts
const renderRichText = ({
  doc,
  std,
  text,
}: {
  std: BlockStdScope;
  text: Y.Text;
  doc: Store;
}) => {
  const inlineManager = std.get(DefaultInlineManagerExtension.identifier);

  if (!inlineManager) {
    return null;
  }

  const richText = new RichText();
  richText.yText = text;
  richText.undoManager = doc.history.undoManager;
  richText.readonly = doc.readonly;
  richText.attributesSchema = inlineManager.getSchema() as any;
  richText.attributeRenderer = inlineManager.getRenderer();
  return richText;
};

const RichTextInput = ({
  cell,
  dataSource,
  onChange,
  style,
}: DatabaseCellRendererProps & { style?: CSSProperties }) => {
  const std = useBlockStdScope(dataSource.doc);
  const text = useLiveData(cell.value$ as LiveData<Y.Text>);
  const ref = useRef<HTMLDivElement>(null);
  // todo(@pengx17): following is a workaround to y.Text that it is got renewed when the cell is updated externally. however it breaks the cursor position.
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = '';
      const richText = renderRichText({ doc: dataSource.doc, std, text });
      const listener = () => {
        onChange(text);
      };
      if (richText) {
        richText.addEventListener('change', listener);
        ref.current.append(richText);
        return () => {
          richText.removeEventListener('change', listener);
          richText.remove();
        };
      }
    }
    return () => {};
  }, [dataSource.doc, onChange, std, text]);
  return <div className={styles.richTextInput} ref={ref} style={style} />;
};

const DesktopRichTextCell = ({
  cell,
  dataSource,
  onChange,
  rowId,
}: DatabaseCellRendererProps) => {
  return (
    <PropertyValue>
      <RichTextInput
        cell={cell}
        dataSource={dataSource}
        onChange={onChange}
        rowId={rowId}
      />
    </PropertyValue>
  );
};

const MobileRichTextCell = ({
  cell,
  dataSource,
  onChange,
  rowId,
}: DatabaseCellRendererProps) => {
  const [open, setOpen] = useState(false);
  const name = useLiveData(cell.property.name$);
  return (
    <>
      <PropertyValue onClick={() => setOpen(true)}></PropertyValue>
      <ConfigModal
        onBack={() => setOpen(false)}
        open={open}
        onOpenChange={setOpen}
        title={
          <>
            <TextIcon />
            {name}
          </>
        }
      >
        <ConfigModal.RowGroup>
          <RichTextInput
            cell={cell}
            dataSource={dataSource}
            onChange={onChange}
            rowId={rowId}
            style={{ padding: 12 }}
          />
        </ConfigModal.RowGroup>
      </ConfigModal>
      <RichTextInput
        cell={cell}
        dataSource={dataSource}
        onChange={onChange}
        rowId={rowId}
      />
    </>
  );
};

export const RichTextCell = BUILD_CONFIG.isMobileEdition
  ? MobileRichTextCell
  : DesktopRichTextCell;
