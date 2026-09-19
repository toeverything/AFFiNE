import { DesktopApiService } from '@affine/core/modules/desktop-api';
import { useService } from '@toeverything/infra';
import clsx from 'clsx';
import type { KeyboardEvent } from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ListRange, Virtuoso } from 'react-virtuoso';

import {
  type MarkdownFileBinding,
  MarkdownFileSyncService,
} from '../services/markdown-file-sync';
import * as styles from './markdown-file-viewer.css';

const windowLineCount = 240;
const overscanLineCount = 80;
const emptyLines: string[] = [];

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

function useCodeLineState(lines: string[]) {
  return useMemo(() => {
    let inCode = false;
    return lines.map(line => {
      const wasInCode = inCode;
      if (line.trimStart().startsWith('```')) {
        inCode = !inCode;
      }
      return wasInCode;
    });
  }, [lines]);
}

export const MarkdownFileViewer = memo(function MarkdownFileViewer({
  binding,
}: {
  binding: MarkdownFileBinding;
}) {
  const desktopApi = useService(DesktopApiService);
  const markdownFileSyncService = useService(MarkdownFileSyncService);
  const lineRequestGeneration = useRef(0);
  const [lineInfo, setLineInfo] = useState<MarkdownFileLineInfo | null>(null);
  const [lineWindow, setLineWindow] =
    useState<MarkdownFileLineReadResult | null>(null);
  const [windowStartLine, setWindowStartLine] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editorContent, setEditorContent] = useState('');
  const [loadingEditor, setLoadingEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictContent, setConflictContent] = useState<{
    content: string;
    mtimeMs: number;
  } | null>(null);
  const [editorMtimeMs, setEditorMtimeMs] = useState<number | null>(null);

  const loadLineInfo = useCallback(async () => {
    return desktopApi.handler.markdownFile.getLineInfo(binding.filePath);
  }, [binding.filePath, desktopApi]);

  const loadLineWindow = useCallback(
    async (nextStartLine: number) => {
      return desktopApi.handler.markdownFile.readLines(
        binding.filePath,
        nextStartLine,
        windowLineCount
      );
    },
    [binding.filePath, desktopApi]
  );

  useEffect(() => {
    let cancelled = false;
    const generation = ++lineRequestGeneration.current;

    setError(null);
    Promise.all([loadLineInfo(), loadLineWindow(windowStartLine)])
      .then(([nextLineInfo, nextLineWindow]) => {
        if (!cancelled && generation === lineRequestGeneration.current) {
          setLineInfo(nextLineInfo);
          setLineWindow(nextLineWindow);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled && generation === lineRequestGeneration.current) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadLineInfo, loadLineWindow, windowStartLine]);

  useEffect(() => {
    return desktopApi.events.markdownFile.onContentChanged(payload => {
      if (payload.filePath !== binding.filePath) {
        return;
      }
      if (editMode) {
        desktopApi.handler.markdownFile
          .read(binding.filePath)
          .then(result => {
            setConflictContent({
              content: result.content,
              mtimeMs: result.mtimeMs,
            });
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : String(err));
          });
        return;
      }
      const generation = ++lineRequestGeneration.current;
      Promise.all([loadLineInfo(), loadLineWindow(windowStartLine)])
        .then(([nextLineInfo, nextLineWindow]) => {
          if (generation === lineRequestGeneration.current) {
            setLineInfo(nextLineInfo);
            setLineWindow(nextLineWindow);
          }
        })
        .catch((err: unknown) => {
          if (generation === lineRequestGeneration.current) {
            setError(err instanceof Error ? err.message : String(err));
          }
        });
    });
  }, [
    binding.filePath,
    desktopApi,
    editMode,
    loadLineInfo,
    loadLineWindow,
    windowStartLine,
  ]);

  const openEditor = useCallback(async () => {
    setLoadingEditor(true);
    setError(null);
    try {
      const info = await loadLineInfo();
      setLineInfo(info);
      if (!info.writable) {
        setError('Source file is read-only');
        return;
      }
      const result = await desktopApi.handler.markdownFile.read(
        binding.filePath
      );
      setEditorContent(result.content);
      setEditorMtimeMs(result.mtimeMs);
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
    setEditorMtimeMs(null);
    setConflictContent(null);
  }, []);

  const saveEditor = useCallback(async () => {
    const info =
      lineInfo && editorMtimeMs !== null ? lineInfo : await loadLineInfo();
    if (!info.writable) {
      setError('Source file is read-only');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await markdownFileSyncService.writeMarkdownBindingContent(
        binding,
        editorContent,
        editorMtimeMs ?? info.mtimeMs
      );
      const [nextLineInfo, nextLineWindow] = await Promise.all([
        loadLineInfo(),
        loadLineWindow(windowStartLine),
      ]);
      setLineInfo(nextLineInfo);
      setLineWindow(nextLineWindow);
      setEditMode(false);
      setEditorContent('');
      setEditorMtimeMs(null);
      setConflictContent(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (message.includes('changed on disk')) {
        desktopApi.handler.markdownFile
          .read(binding.filePath)
          .then(result => {
            setConflictContent({
              content: result.content,
              mtimeMs: result.mtimeMs,
            });
          })
          .catch((readError: unknown) => {
            setError(
              readError instanceof Error ? readError.message : String(readError)
            );
          });
      }
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
    windowStartLine,
    editorMtimeMs,
    desktopApi,
  ]);

  const reloadConflict = useCallback(() => {
    if (conflictContent === null) {
      return;
    }
    setEditorContent(conflictContent.content);
    setEditorMtimeMs(conflictContent.mtimeMs);
    setConflictContent(null);
  }, [conflictContent]);

  const keepMine = useCallback(() => {
    if (conflictContent !== null) {
      setEditorMtimeMs(conflictContent.mtimeMs);
    }
    setConflictContent(null);
  }, [conflictContent]);

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
${conflictContent.content}
${diskMarker}
`
    );
    setEditorMtimeMs(conflictContent.mtimeMs);
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

  const handleRangeChanged = useCallback(
    (range: ListRange) => {
      const nextStartLine = Math.max(0, range.startIndex - overscanLineCount);
      if (
        lineWindow &&
        nextStartLine >= lineWindow.startLine &&
        range.endIndex < lineWindow.startLine + lineWindow.lines.length
      ) {
        return;
      }
      setWindowStartLine(nextStartLine);
    },
    [lineWindow]
  );

  const totalLines = lineInfo?.lineCount ?? lineWindow?.totalLines ?? 0;
  const loadedLines = lineWindow?.lines ?? emptyLines;
  const loadedCodeLineState = useCodeLineState(loadedLines);
  const loadedStartLine = lineWindow?.startLine ?? windowStartLine;
  const getLoadedLine = useCallback(
    (index: number) => {
      const loadedIndex = index - loadedStartLine;
      if (loadedIndex < 0 || loadedIndex >= loadedLines.length) {
        return null;
      }
      return {
        line: loadedLines[loadedIndex],
        inCode: loadedCodeLineState[loadedIndex] ?? false,
      };
    },
    [loadedCodeLineState, loadedLines, loadedStartLine]
  );

  return (
    <div className={styles.root}>
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
          <Virtuoso
            className={styles.virtualList}
            itemContent={index => {
              const loadedLine = getLoadedLine(index);
              if (!loadedLine) {
                return <div className={styles.blank} />;
              }
              return (
                <MarkdownLine
                  inCode={loadedLine.inCode}
                  line={loadedLine.line}
                />
              );
            }}
            rangeChanged={handleRangeChanged}
            totalCount={totalLines}
          />
        </div>
      ) : null}
    </div>
  );
});
