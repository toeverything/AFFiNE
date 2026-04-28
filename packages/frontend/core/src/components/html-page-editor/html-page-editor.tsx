import { useConfirmModal } from '@affine/component';
import { useLiveData, useService } from '@toeverything/infra';
import clsx from 'clsx';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DocService } from '../../modules/doc';
import * as styles from './html-page-editor.css';

export interface HtmlPageEditorProps {
  readonly?: boolean;
}

type ViewMode = 'edit' | 'preview' | 'split';
type SandboxMode = 'restricted' | 'unrestricted';

/**
 * HtmlPageEditor — renders an HTML doc with source editing + live preview.
 *
 * - **Edit** mode: monospace textarea for raw HTML editing.
 * - **Preview** mode: sandboxed iframe rendering the HTML.
 * - **Split** mode: side-by-side editor + preview.
 *
 * The sandbox toggle controls whether scripts can run inside the preview:
 *   • restricted  → `sandbox=""` (no scripts)
 *   • unrestricted → `sandbox="allow-scripts"` (scripts enabled)
 */
export const HtmlPageEditor = ({ readonly }: HtmlPageEditorProps) => {
  const doc = useService(DocService).doc;
  const properties = useLiveData(doc.properties$);

  const htmlContent = (properties.htmlContent as string) ?? '';
  const sandboxMode: SandboxMode = ((properties.htmlSandboxMode as string) ??
    'restricted') as SandboxMode;

  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const { openConfirmModal } = useConfirmModal();
  const [localContent, setLocalContent] = useState(htmlContent);
  const [charCount, setCharCount] = useState(htmlContent.length);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync from external changes (e.g. sync engine updates)
  useEffect(() => {
    setLocalContent(htmlContent);
    setCharCount(htmlContent.length);
  }, [htmlContent]);

  // Debounced save to doc property
  const saveContent = useCallback(
    (content: string) => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = setTimeout(() => {
        doc.record.setProperty('htmlContent', content);
      }, 500);
    },
    [doc]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setLocalContent(newContent);
      setCharCount(newContent.length);
      saveContent(newContent);
    },
    [saveContent]
  );

  const toggleSandboxMode = useCallback(() => {
    if (sandboxMode === 'restricted') {
      openConfirmModal({
        title: 'Security Warning',
        description:
          'Enabling unrestricted mode will allow JavaScript execution within this HTML page. This can be dangerous if the HTML content is from an untrusted source. Are you sure you want to proceed?',
        cancelText: 'Cancel',
        confirmText: 'Enable Unrestricted Mode',
        confirmButtonOptions: {
          variant: 'error',
        },
        onConfirm: () => {
          doc.record.setProperty('htmlSandboxMode', 'unrestricted');
        },
      });
    } else {
      doc.record.setProperty('htmlSandboxMode', 'restricted');
    }
  }, [doc, sandboxMode, openConfirmModal]);

  // Build the sandbox attribute for the iframe
  const sandboxAttr = useMemo(() => {
    return sandboxMode === 'unrestricted' ? 'allow-scripts' : '';
  }, [sandboxMode]);

  // Build the srcDoc, wrapping in a basic HTML shell if needed
  const previewSrcDoc = useMemo(() => {
    return localContent || '<!DOCTYPE html><html><body></body></html>';
  }, [localContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Tab key inserts two spaces instead of moving focus
      if (e.key === 'Tab') {
        e.preventDefault();
        const target = e.currentTarget;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const value = target.value;
        const newValue =
          value.substring(0, start) + '  ' + value.substring(end);
        setLocalContent(newValue);
        setCharCount(newValue.length);
        saveContent(newValue);
        // Restore cursor position after React re-render
        requestAnimationFrame(() => {
          target.selectionStart = start + 2;
          target.selectionEnd = start + 2;
        });
      }
    },
    [saveContent]
  );

  const lineCount = useMemo(() => {
    return localContent.split('\n').length;
  }, [localContent]);

  return (
    <div className={styles.htmlPageEditorRoot}>
      {/* ─── Toolbar ─── */}
      <div className={styles.toolbar}>
        {/* View mode toggle */}
        <div className={styles.modeToggle}>
          <button
            className={styles.modeButton}
            data-active={viewMode === 'edit'}
            onClick={() => setViewMode('edit')}
          >
            Edit
          </button>
          <button
            className={styles.modeButton}
            data-active={viewMode === 'split'}
            onClick={() => setViewMode('split')}
          >
            Split
          </button>
          <button
            className={styles.modeButton}
            data-active={viewMode === 'preview'}
            onClick={() => setViewMode('preview')}
          >
            Preview
          </button>
        </div>

        <div className={styles.toolbarSeparator} />

        {/* Sandbox mode toggle */}
        <button
          className={styles.sandboxToggle}
          onClick={toggleSandboxMode}
          title={
            sandboxMode === 'restricted'
              ? 'Restricted mode: Scripts are disabled'
              : 'Unrestricted mode: Scripts are enabled'
          }
        >
          <span
            className={clsx(
              styles.sandboxDot,
              sandboxMode === 'restricted'
                ? styles.sandboxRestricted
                : styles.sandboxUnrestricted
            )}
          />
          {sandboxMode === 'restricted' ? 'Restricted' : 'Unrestricted'}
        </button>
      </div>

      {/* ─── Editor / Preview area ─── */}
      <div
        className={styles.editorArea}
        style={{
          flexDirection: viewMode === 'split' ? 'row' : 'column',
          display: 'flex',
        }}
      >
        {/* Code editor */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <textarea
            className={styles.codeEditor}
            style={{
              width: viewMode === 'split' ? '50%' : '100%',
              borderRight:
                viewMode === 'split'
                  ? '1px solid var(--affine-border-color, #e3e2e4)'
                  : 'none',
            }}
            value={localContent}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            readOnly={readonly}
            spellCheck={false}
            placeholder="Write your HTML here..."
          />
        )}

        {/* Live preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <iframe
            ref={iframeRef}
            className={styles.previewFrame}
            style={{
              width: viewMode === 'split' ? '50%' : '100%',
            }}
            sandbox={sandboxAttr}
            srcDoc={previewSrcDoc}
            title="HTML Page Preview"
          />
        )}
      </div>

      {/* ─── Status bar ─── */}
      <div className={styles.statusBar}>
        <span>
          {lineCount} line{lineCount !== 1 ? 's' : ''} · {charCount} char
          {charCount !== 1 ? 's' : ''}
        </span>
        <span>
          HTML Page ·{' '}
          {sandboxMode === 'restricted' ? '🔒 Restricted' : '⚠️ Unrestricted'}
        </span>
      </div>
    </div>
  );
};
