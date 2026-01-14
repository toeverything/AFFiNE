import './page-detail-editor.css';

import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useEffect } from 'react';

import type { AffineEditorContainer } from '../blocksuite/block-suite-editor';
import { BlockSuiteEditor } from '../blocksuite/block-suite-editor';
import { DocService } from '../modules/doc';
import { EditorService } from '../modules/editor';
import { EditorSettingService } from '../modules/editor-setting';
import * as styles from './page-detail-editor.css';

declare global {
  // oxlint-disable-next-line no-var
  var currentEditor: AffineEditorContainer | undefined;
}

export type OnLoadEditor = (
  editor: AffineEditorContainer
) => (() => void) | void;

export interface PageDetailEditorProps {
  onLoad?: OnLoadEditor;
  readonly?: boolean;
}

export const PageDetailEditor = ({
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);

  useEffect(() => {
    const text = document.body.innerText || "";
    const words = text.trim().split(/\s+/).filter(Boolean);

    setCharCount(text.length);
    setWordCount(words.length);
  });
  

  onLoad,
  readonly,
}: PageDetailEditorProps) => {
  const editor = useService(EditorService).editor;
  const mode = useLiveData(editor.mode$);
  const defaultOpenProperty = useLiveData(editor.defaultOpenProperty$);

  const doc = useService(DocService).doc;
  const pageWidth = useLiveData(doc.properties$.selector(p => p.pageWidth));

  const isSharedMode = editor.isSharedMode;
  const editorSetting = useService(EditorSettingService).editorSetting;
  const settings = useLiveData(
    editorSetting.settings$.selector(s => ({
      fontFamily: s.fontFamily,
      customFontFamily: s.customFontFamily,
      fullWidthLayout: s.fullWidthLayout,
    }))
  );
  const fullWidthLayout = pageWidth
    ? pageWidth === 'fullWidth'
    : settings.fullWidthLayout;

  useEffect(() => {
    editor.doc.blockSuiteDoc.readonly = readonly ?? false;
  }, [editor, readonly]);
return (
  <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
    <BlockSuiteEditor
      className={clsx(styles.editor, {
        'full-screen': isSharedMode && fullWidthLayout,
        'is-public': isSharedMode,
      })}
      mode={mode}
      defaultOpenProperty={defaultOpenProperty}
      page={editor.doc.blockSuiteDoc}
      shared={isSharedMode}
      readonly={readonly}
      onEditorReady={onLoad}
    />

    <div
      style={{
        padding: "8px",
        borderTop: "1px solid #ccc",
        fontSize: "12px",
        opacity: 0.8
      }}
    >
      Words: {wordCount} | Characters: {charCount}
    </div>
  </div>
);

};
