import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import type { KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type MarkdownFileBinding,
  MarkdownFileSyncService,
} from '../services/markdown-file-sync';
import * as styles from './markdown-file-viewer.css';

const averageLineHeight = 26;
const windowLineCount = 240;
const overscanLineCount = 80;

type MarkdownFileLineInfo = {
  filePath: string;
  lineCount: number;
  size: number;
  mtimeMs: number;
  writable: boolean;
};

type MarkdownFileLineReadResult = {
  filePath: string;
  startLine: number;
  lineCount: number;
  totalLines: number;
  lines: string[];
  mtimeMs: number;
};

function formatBytes(size: number) {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getHeadingLevel(line: string) {
  const match = /^(#{1,6})\s+(.+)$/.exec(line);
  if (!match) {
    return null;
  }
  return {
    level: match[1].length,
    text: match[2],
  };
}

function MarkdownLine({ line, inCode }: { line: string; inCode: boolean }) {
  const trimmed = line.trim();
  const heading = getHeadingLevel(line);

  if (!trimmed) {
    return <div className={styles.blank} />;
  }

  if (trimmed.startsWith('```') || inCode) {
    return <pre className={styles.code}>{line}</pre>;
  }

  if (heading) {
    return (
      <div
        className={clsx(styles.heading, {
          [styles.heading1]: heading.level === 1,
          [styles.heading2]: heading.level === 2,
          [styles.heading3]: heading.level >= 3,
        })}
      >
        {heading.text}
      </div>
    );
  }

  if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
    return <div className={styles.listItem}>{line}</div>;
  }

  if (trimmed.startsWith('>')) {
    return <blockquote className={styles.quote}>{line}</blockquote>;
  }

  if (trimmed.startsWith('|')) {
    return <pre className={styles.table}>{line}</pre>;
  }

  return <div className={styles.paragraph}>{line}</div>;
}

function MarkdownLineWindow({ lines }: { lines: string[] }) {
  const rendered = useMemo(() => {
    let inCode = false;
    return lines.map((line, index) => {
      const wasInCode = inCode;
      if (line.trimStart().startsWith('```')) {
        inCode = !inCode;
      }
      return (
        <MarkdownLine
          key={`${index}:${line.slice(0, 16)}`}
          line={line}
          inCode={wasInCode}
        />
      );
    });
  }, [lines]);

  return <div className={styles.window}>{rendered}</div>;
}

export const MarkdownFileViewer = memo(function MarkdownFileViewer({
  binding,
}: {
  binding: MarkdownFileBinding;
}) {
  const desktopApi = useService(DesktopApiService);
  const markdownFileSyncService = useService(MarkdownFileSyncService);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [lineInfo, setLineInfo] = useState<MarkdownFileLineInfo | null>(null);
  const [lineWindow, setLineWindow] =
    useState<MarkdownFileLineReadResult | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictContent, setConflictContent] = useState<string | null>(null);

  const startLine = Math.max(
    0,
    Math.floor(scrollTop / averageLineHeight) - overscanLineCount
  );

  const loadLineInfo = useCallback(async () => {
    const info = await desktopApi.handler.markdownFile.getLineInfo(
      binding.filePath
    );
    setLineInfo(info);
    return info;
  }, [binding.filePath, desktopApi]);

  const loadLineWindow = useCallback(
    async (nextStartLine: number) => {
      const result = await desktopApi.handler.markdownFile.readLines(
        binding.filePath,
        nextStartLine,
        windowLineCount
      );
      setLineWindow(result);
      return result;
    },
    [binding.filePath, desktopApi]
  );

  useEffect(() => {
    let cancelled = false;

    setError(null);
    Promise.all([loadLineInfo(), loadLineWindow(startLine)])
      .then(() => {
        if (!cancelled) {
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadLineInfo, loadLineWindow, startLine]);

  useEffect(() => {
    return desktopApi.events.markdownFile.onContentChanged(payload => {
      if (payload.filePath !== binding.filePath) {
        return;
      }
      if (editMode) {
        desktopApi.handler.markdownFile
          .read(binding.filePath)
          .then(result => {
            setConflictContent(result.content);
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        return;
      }
      Promise.all([loadLineInfo(), loadLineWindow(startLine)]).catch(
        (err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        }
      );
    });
  }, [
    binding.filePath,
    desktopApi,
    editMode,
    loadLineInfo,
    loadLineWindow,
    startLine,
  ]);

  const handleScroll = useCallback(() => {
    setScrollTop(rootRef.current?.scrollTop ?? 0);
  }, []);

  const openEditor = useCallback(async () => {
    setLoadingEditor(true);
    setError(null);
    try {
      const info = await loadLineInfo();
      if (!info.writable) {
        setError('Source file is read-only');
        return;
      }
      const result = await desktopApi.handler.markdownFile.read(
        binding.filePath
      );
      setEditorContent(result.content);
      setConflictContent(null);
      setEditMode(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingEditor(false);
    }
  }, [binding.filePath, desktopApi, loadLineInfo]);

  const closeEditor = useCallback(() => {
    setEditMode(false);
    setEditorContent('');
    setConflictContent(null);
  }, []);

  const saveEditor = useCallback(async () => {
    const info = lineInfo ?? (await loadLineInfo());
    if (!info.writable) {
      setError('Source file is read-only');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await markdownFileSyncService.writeMarkdownBindingContent(
        binding,
        editorContent
      );
      await Promise.all([loadLineInfo(), loadLineWindow(startLine)]);
      setEditMode(false);
      setEditorContent('');
      setConflictContent(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }, [
    binding,
    editorContent,
    lineInfo,
    loadLineInfo,
    loadLineWindow,
    markdownFileSyncService,
    startLine,
  ]);

  const reloadConflict = useCallback(() => {
    if (conflictContent === null) {
      return;
    }
    setEditorContent(conflictContent);
    setConflictContent(null);
  }, [conflictContent]);

  const keepMine = useCallback(() => {
    setConflictContent(null);
  }, []);

  const mergeConflict = useCallback(() => {
    if (conflictContent === null) {
      return;
    }
    const mineMarker = `${'<'.repeat(7)} AFFiNE EDIT`;
    const diskMarker = `${'>'.repeat(7)} DISK VERSION`;
    setEditorContent(
      current => `${mineMarker}
${current}
${'='.repeat(7)}
${conflictContent}
${diskMarker}
`
    );
    setConflictContent(null);
  }, [conflictContent]);

  const handleEditorKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) {
          saveEditor().catch(console.error);
        }
      }
    },
    [saveEditor, saving]
  );

  const totalLines = lineInfo?.lineCount ?? lineWindow?.totalLines ?? 0;
  const topSpacerHeight =
    (lineWindow?.startLine ?? startLine) * averageLineHeight;
  const loadedLines = lineWindow?.lines ?? [];
  const renderedEndLine =
    (lineWindow?.startLine ?? startLine) + loadedLines.length;
  const bottomSpacerHeight = Math.max(
    0,
    (totalLines - renderedEndLine) * averageLineHeight
  );

  return (
    <div className={styles.root} onScroll={handleScroll} ref={rootRef}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>{binding.title}</h1>
          <div className={styles.actions}>
            {editMode ? (
              <>
                <button
                  className={styles.button}
                  disabled={saving}
                  onClick={closeEditor}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={styles.primaryButton}
                  disabled={saving || lineInfo?.writable === false}
                  onClick={() => {
                    saveEditor().catch(console.error);
                  }}
                  type="button"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
              </>
            ) : (
              <button
                className={styles.button}
                disabled={loadingEditor || lineInfo?.writable === false}
                onClick={() => {
                  openEditor().catch(console.error);
                }}
                type="button"
                title={
                  lineInfo?.writable === false
                    ? 'Source file is read-only'
                    : undefined
                }
              >
                {lineInfo?.writable === false
                  ? 'Read-only'
                  : loadingEditor
                    ? 'Loading...'
                    : 'Edit source'}
              </button>
            )}
          </div>
        </div>
        <div className={styles.meta} title={binding.filePath}>
          {binding.filePath}
        </div>
        <div className={styles.meta}>
          Compatibility view ·{' '}
          {editMode ? 'source editing' : 'virtualized preview'} ·{' '}
          {lineInfo ? `${lineInfo.lineCount} lines` : 'Loading'} ·{' '}
          {lineInfo ? formatBytes(lineInfo.size) : '...'}
        </div>
      </header>

      {error ? <div className={styles.error}>{error}</div> : null}
      {conflictContent !== null ? (
        <div className={styles.conflict}>
          <div>
            The source file changed on disk while you have unsaved edits.
          </div>
          <div className={styles.conflictActions}>
            <button
              className={styles.button}
              onClick={reloadConflict}
              type="button"
            >
              Reload
            </button>
            <button className={styles.button} onClick={keepMine} type="button">
              Keep mine
            </button>
            <button
              className={styles.primaryButton}
              onClick={mergeConflict}
              type="button"
            >
              Merge
            </button>
          </div>
        </div>
      ) : null}
      {lineInfo?.writable === false ? (
        <div className={styles.readonlyNotice}>
          Source file is read-only. Editing is disabled until the file is
          writable.
        </div>
      ) : null}
      {editMode ? (
        <textarea
          className={styles.editor}
          onChange={event => setEditorContent(event.currentTarget.value)}
          onKeyDown={handleEditorKeyDown}
          spellCheck={false}
          value={editorContent}
        />
      ) : !lineWindow && !error ? (
        <div className={styles.loading}>Loading Markdown preview...</div>
      ) : null}

      {!editMode && lineWindow ? (
        <div className={styles.viewport}>
          <div className={styles.spacer} style={{ height: topSpacerHeight }} />
          <MarkdownLineWindow lines={loadedLines} />
          <div
            className={styles.spacer}
            style={{ height: bottomSpacerHeight }}
          />
        </div>
      ) : null}
    </div>
  );
});
