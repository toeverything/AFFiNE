/**
 * Source Mode Editor — T068-T074
 *
 * Markdown textarea overlay for live editing of the document source.
 * Per contracts/inline-extensions.md §6.
 *
 * Enter: Serialise doc → markdown string → display in <textarea>.
 * Exit:  Parse markdown → import into note block → switch back.
 * Error: role="alert" inline error; blocks exit until fixed.
 */
import {
  docLinkBaseURLMiddleware,
  MarkdownAdapter,
  titleMiddleware,
} from '@blocksuite/affine/shared/adapters';
import { getLastNoteBlock } from '@blocksuite/affine/shared/utils';
import type { Store } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import * as styles from './source-mode-editor.css';

interface SourceModeEditorProps {
  /** The active BlockSuite Store (doc). */
  doc: Store;
  /** Called when the editor exits source mode (apply or cancel). */
  onExit: () => void;
}

/** Serialise the doc to a markdown string using the shared MarkdownAdapter. */
async function serializeToMarkdown(doc: Store): Promise<string> {
  const job = doc.getTransformer([
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
  ]);
  const snapshot = job.docToSnapshot(doc);
  if (!snapshot) return '';
  const adapter = new MarkdownAdapter(job, doc.provider);
  const result = await adapter.fromDocSnapshot({
    snapshot,
    assets: job.assetsManager,
  });
  return result.file;
}

/** Replace the note block content by importing the given markdown string. */
async function applyMarkdownToDoc(markdown: string, doc: Store): Promise<void> {
  const noteBlock = getLastNoteBlock(doc);
  if (!noteBlock) {
    throw new Error('No note block found in document.');
  }

  // Clear existing children of the note block.
  doc.transact(() => {
    for (const child of noteBlock.children) {
      doc.deleteBlock(child);
    }
  });

  // Import markdown content into the note block.
  await MarkdownTransformer.importMarkdownToBlock({
    doc,
    markdown,
    blockId: noteBlock.id,
  });
}

export function SourceModeEditor({ doc, onExit }: SourceModeEditorProps) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Serialise on mount.
  useEffect(() => {
    let cancelled = false;
    serializeToMarkdown(doc)
      .then(md => {
        if (cancelled) return;
        setValue(md);
        setLoading(false);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            el.focus();
            el.setSelectionRange(0, 0);
          }
        });
      })
      .catch(err => {
        if (cancelled) return;
        setError(
          `Serialisation failed: ${err instanceof Error ? err.message : String(err)}`
        );
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [doc]);

  const handleApplyAndExit = useCallback(async () => {
    if (applying) return;
    setError(null);
    setApplying(true);
    try {
      await applyMarkdownToDoc(value, doc);
      onExit();
    } catch (err) {
      setError(
        `Parse error: ${err instanceof Error ? err.message : String(err)}. ` +
          'Fix the markdown above and try again.'
      );
      setApplying(false);
    }
  }, [applying, doc, onExit, value]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl+Enter / Cmd+Enter → apply and exit.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handleApplyAndExit().catch(() => {
          // error is displayed in the inline error state
        });
        return;
      }
      // Tab inserts two spaces (no focus loss).
      if (e.key === 'Tab') {
        e.preventDefault();
        const el = e.currentTarget;
        const start = el.selectionStart;
        const end = el.selectionEnd;
        setValue(prev => `${prev.slice(0, start)}  ${prev.slice(end)}`);
        requestAnimationFrame(() => {
          el.selectionStart = start + 2;
          el.selectionEnd = start + 2;
        });
      }
    },
    [handleApplyAndExit]
  );

  return (
    <div
      className={styles.sourceModeContainer}
      data-testid="source-mode-editor"
    >
      <div className={styles.sourceModeToolbar}>
        <span className={styles.sourceModeLabel}>Source</span>
        <span className={styles.sourceModeHint}>
          {loading
            ? 'Loading…'
            : applying
              ? 'Applying…'
              : 'Edit raw markdown. Ctrl+Enter (⌘+Enter) to apply.'}
        </span>
        <button
          className={styles.sourceModeExitButton}
          onClick={() => void handleApplyAndExit()}
          disabled={loading || applying}
          aria-label="Apply changes and exit source mode"
          data-testid="source-mode-apply-button"
        >
          Apply
        </button>
        <button
          className={styles.sourceModeCancelButton}
          onClick={onExit}
          disabled={applying}
          aria-label="Discard changes and exit source mode"
          data-testid="source-mode-cancel-button"
        >
          Cancel
        </button>
      </div>

      {error ? (
        <div
          role="alert"
          id="source-mode-error"
          className={styles.sourceModeError}
          data-testid="source-mode-error"
        >
          {error}
        </div>
      ) : null}

      <textarea
        ref={textareaRef}
        className={styles.sourceModeTextarea}
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={loading || applying}
        aria-label="Document markdown source"
        aria-describedby={error ? 'source-mode-error' : undefined}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        data-testid="source-mode-textarea"
      />
    </div>
  );
}
