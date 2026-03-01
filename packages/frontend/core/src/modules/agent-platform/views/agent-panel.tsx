/**
 * Agent Platform Panel — sidebar tab with chat + structured analysis tabs.
 */
import { Scrollable } from '@affine/component';
import { extractMarkdownFromDoc } from '@affine/core/blocksuite/ai/utils/extract';
import { useLiveData, useService } from '@toeverything/infra';
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { DocService } from '../../doc';
import { WorkspaceService } from '../../workspace';
import { AgentPlatformService } from '../services/agent';
import * as styles from './styles.css';
import type {
  AgentStep,
  ChatMessage,
  Ambiguity,
  Plan,
  Proposal,
  RunStatus,
  AuditEvent,
  ValidateBriefResponse,
  DetectAmbiguityResponse,
  TechnicalPlanResponse,
  BriefEpicsResponse,
  GenerateTasksResponse,
  GenerateCheckpointsResponse,
  CodeGenerationResponse,
  CheckAlignmentResponse,
} from '@aion/agent-contracts';
import { AGENT_STEPS_ORDERED, AGENT_STEP_LABELS } from '@aion/agent-contracts';

// ─── Tab type ────────────────────────────────────────────────────────────
type Tab = 'chat' | 'analysis' | 'audit' | 'changes';

const TAB_LABELS: Record<Tab, string> = {
  chat: 'Chat',
  analysis: 'Analysis',
  audit: 'Audit',
  changes: 'Changes',
};

export const AgentPanel = memo(function AgentPanel() {
  const [activeTab, setActiveTab] = useState<Tab>('chat');

  return (
    <div className={styles.agentPanel}>
      {/* Tab bar */}
      <div className={styles.buttonRow}>
        {(['chat', 'analysis', 'changes', 'audit'] as Tab[]).map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? styles.actionButton : styles.secondaryButton}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {activeTab === 'chat' && <ChatTab />}
      {activeTab === 'analysis' && <AnalysisTab />}
      {activeTab === 'changes' && <ChangesTab />}
      {activeTab === 'audit' && <AuditTab />}
    </div>
  );
});

// ─── Chat Tab ────────────────────────────────────────────────────────────
function ChatTab() {
  const agentService = useService(AgentPlatformService);
  const docService = useService(DocService);
  const workspaceService = useService(WorkspaceService);
  const docId = docService.doc.id;
  const workspaceId = workspaceService.workspace.id;
  const messages = useLiveData(agentService.chatMessages$);
  const streaming = useLiveData(agentService.chatStreaming$);
  const error = useLiveData(agentService.error$);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Set workspace context and load persisted chat when document changes
  useEffect(() => {
    agentService.setChatWorkspaceId(workspaceId);
    agentService.switchChatDoc(docId);
  }, [agentService, workspaceId, docId]);

  const getDocContent = useCallback(async (): Promise<string> => {
    try {
      const store = docService.doc.blockSuiteDoc;
      if (store) {
        return await extractMarkdownFromDoc(store);
      }
    } catch {
      // fallback: try raw text extraction
      try {
        const blocks = docService.doc.blockSuiteDoc?.getBlocksByFlavour('affine:paragraph') ?? [];
        const parts: string[] = [];
        for (const block of blocks) {
          const text = (block.model as any)?.text;
          if (text) parts.push(text.toString());
        }
        if (parts.length) return parts.join('\n');
      } catch { /* ignore */ }
    }
    return '';
  }, [docService]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    try {
      const docContent = await getDocContent();
      await agentService.sendChat(docId, msg, undefined, docContent);
    } catch {
      // error is shown in the messages
    }
  }, [input, streaming, agentService, docId, getDocContent]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {messages.length === 0 && (
          <div className={styles.configInfo} style={{ textAlign: 'center', padding: '40px 16px' }}>
            Chat with the AION Agent about this document.
            <br />
            Ask it to analyze, plan, or propose changes.
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}
        {streaming && (
          <div className={styles.loadingSpinner}>Thinking...</div>
        )}
      </div>

      {/* Error */}
      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Input */}
      <div style={{ display: 'flex', gap: '8px', padding: '8px 0', borderTop: '1px solid var(--affine-border-color, #e5e5e5)' }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask the agent..."
          disabled={streaming}
          rows={2}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid var(--affine-border-color, #e5e5e5)',
            borderRadius: '6px',
            padding: '8px',
            fontSize: '13px',
            fontFamily: 'inherit',
            background: 'transparent',
            color: 'inherit',
          }}
        />
        <button
          className={styles.actionButton}
          onClick={handleSend}
          disabled={streaming || !input.trim()}
          style={{ alignSelf: 'flex-end' }}
        >
          Send
        </button>
      </div>

      {/* Quick actions */}
      <div className={styles.buttonRow} style={{ paddingBottom: '4px' }}>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setInput('Analyze this document for ambiguities and missing information');
          }}
        >
          Analyze
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setInput('Generate a technical implementation plan for this brief');
          }}
        >
          Plan
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => {
            setInput('Propose concrete code changes based on this brief');
          }}
        >
          Propose
        </button>
        <button
          className={styles.secondaryButton}
          onClick={() => agentService.clearChat(docId)}
        >
          Clear
        </button>
      </div>
    </div>
  );
}

// ─── Lightweight Markdown renderer ────────────────────────────────────────

/**
 * Lightweight markdown→HTML. Processes blocks first (code fences, headings,
 * lists) then inline spans (bold, italic, code) so regexes don't collide.
 */
function markdownToHtml(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 1. Extract fenced code blocks before anything else
  const codeBlocks: string[] = [];
  const withPlaceholders = md.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(
      `<pre class="agent-md-codeblock"><code>${escape(code.trimEnd())}</code></pre>`
    );
    return `\x00CB${idx}\x00`;
  });

  // 2. Process line by line
  const lines = withPlaceholders.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block placeholder — emit as-is
    const cbMatch = line.match(/^\x00CB(\d+)\x00$/);
    if (cbMatch) {
      out.push(codeBlocks[Number(cbMatch[1])]);
      i++;
      continue;
    }

    // Empty line → spacer
    if (line.trim() === '') {
      out.push('<div style="height:6px"></div>');
      i++;
      continue;
    }

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      out.push('<hr style="border:none;border-top:1px solid currentColor;opacity:0.2;margin:8px 0"/>');
      i++;
      continue;
    }

    // Table: detect a line starting with | and look ahead for separator row
    if (/^\s*\|/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const tableLines: string[] = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(renderTable(tableLines, escape));
      continue;
    }

    // Escape the line for HTML
    const escaped = escape(line);

    // Headings
    const hMatch = escaped.match(/^(#{1,3})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizes = ['16px', '15px', '14px'];
      out.push(`<div style="font-weight:600;font-size:${sizes[level - 1]};margin:8px 0 4px">${inlineFormat(hMatch[2])}</div>`);
      i++;
      continue;
    }

    // Unordered list
    const ulMatch = escaped.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      out.push(`<div style="padding-left:${12 + (ulMatch[1].length * 4)}px">• ${inlineFormat(ulMatch[2])}</div>`);
      i++;
      continue;
    }

    // Ordered list
    const olMatch = escaped.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      out.push(`<div style="padding-left:${12 + (olMatch[1].length * 4)}px">${olMatch[2]}. ${inlineFormat(olMatch[3])}</div>`);
      i++;
      continue;
    }

    // Normal paragraph line
    out.push(`<div>${inlineFormat(escaped)}</div>`);
    i++;
  }

  return out.join('');
}

/** Render a markdown table (array of raw lines including header + separator + body) */
function renderTable(tableLines: string[], escape: (s: string) => string): string {
  const parseRow = (line: string) =>
    line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => c.trim());

  const headerCells = parseRow(tableLines[0]);
  // tableLines[1] is the separator row (|---|---|)
  const bodyRows = tableLines.slice(2).filter(l => !/^\s*\|[\s:|-]+\|\s*$/.test(l));

  let html = '<table class="agent-md-table"><thead><tr>';
  for (const cell of headerCells) {
    html += `<th>${inlineFormat(escape(cell))}</th>`;
  }
  html += '</tr></thead><tbody>';
  for (const row of bodyRows) {
    html += '<tr>';
    const cells = parseRow(row);
    for (let c = 0; c < headerCells.length; c++) {
      html += `<td>${inlineFormat(escape(cells[c] ?? ''))}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  return html;
}

/** Apply inline formatting (bold, italic, code) to an already-escaped string */
function inlineFormat(s: string): string {
  return s
    .replace(/`([^`]+)`/g, '<code class="agent-md-inline-code">$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
}

function MarkdownContent({ content }: { content: string }) {
  const html = useMemo(() => markdownToHtml(content), [content]);
  return (
    <div
      className={styles.markdownBody}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

// ─── Edit block parser ────────────────────────────────────────────────────

interface EditBlock {
  original: string;
  replacement: string;
}

interface ContentSegment {
  type: 'text' | 'edit';
  text?: string;
  edit?: EditBlock;
}

function parseEditBlocks(content: string): ContentSegment[] {
  const segments: ContentSegment[] = [];
  const regex = /:::edit\s*\nORIGINAL:\s*\n([\s\S]*?)\n---\s*\nREPLACEMENT:\s*\n([\s\S]*?)\n:::/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    // Text before this edit block
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) segments.push({ type: 'text', text });
    }
    segments.push({
      type: 'edit',
      edit: {
        original: match[1].trim(),
        replacement: match[2].trim(),
      },
    });
    lastIndex = regex.lastIndex;
  }

  // Remaining text after last edit block
  if (lastIndex < content.length) {
    const text = content.slice(lastIndex).trim();
    if (text) segments.push({ type: 'text', text });
  }

  return segments;
}

// ─── Client-side block text edit ──────────────────────────────────────────

/**
 * Try to apply an edit directly in BlockSuite by searching paragraph blocks
 * for the original text and replacing it.  Returns true on success.
 */
/** Normalize smart/curly quotes to straight ASCII (1:1 char mapping, safe for index-based ops) */
function normalizeQuotesClient(s: string): string {
  return s
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'")
    .replace(/[\u00AB\u00BB]/g, '"');
}

function tryApplyEditClientSide(
  docService: InstanceType<typeof DocService>,
  original: string,
  replacement: string
): boolean {
  const bsDoc = docService.doc.blockSuiteDoc;
  if (!bsDoc) {
    console.warn('[AION] tryApplyEditClientSide: no blockSuiteDoc');
    return false;
  }

  /** Strip markdown to plain text for matching (mirrors backend stripMd) */
  const stripMd = (s: string) =>
    normalizeQuotesClient(s)
      .replace(/\\([_*[\]()~`>#+=|{}.!-])/g, '$1')   // unescape md
      .replace(/^>\s?/gm, '')                          // blockquotes
      .replace(/^#{1,6}\s+/gm, '')                     // headings
      .replace(/\*\*(.+?)\*\*/g, '$1')                  // bold
      .replace(/\*(.+?)\*/g, '$1')                      // italic
      .replace(/_(.+?)_/g, '$1')                        // italic alt
      .replace(/~~(.+?)~~/g, '$1')                      // strikethrough
      .replace(/`(.+?)`/g, '$1')                        // inline code
      .replace(/^\s*[-*+]\s+/gm, '')                    // unordered list
      .replace(/^\s*\d+\.\s+/gm, '')                    // ordered list
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')          // links
      .replace(/<[^>]+>/g, '')                           // HTML tags
      .replace(/\|/g, ' ');                              // table pipes

  const normalize = (s: string) =>
    stripMd(s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
  const normOrig = normalize(original);

  // Collect ALL blocks that have a text property (paragraph, list, callout, code, etc.)
  const flavours = ['affine:paragraph', 'affine:list', 'affine:callout', 'affine:code'];
  const allBlocks: Array<{ model: any; text: string; flavour: string }> = [];
  for (const flavour of flavours) {
    for (const block of bsDoc.getBlocksByFlavour(flavour)) {
      const t = (block.model as any)?.text;
      if (t) {
        allBlocks.push({ model: block.model, text: t.toString(), flavour });
      }
    }
  }

  console.log(`[AION] tryApplyEditClientSide: ${allBlocks.length} text blocks found, searching for original (${original.length} chars)`);
  console.log(`[AION] original (first 120): ${JSON.stringify(original.substring(0, 120))}`);
  console.log(`[AION] normOrig (first 120): ${JSON.stringify(normOrig.substring(0, 120))}`);
  // Log first few blocks for debugging
  for (let i = 0; i < Math.min(5, allBlocks.length); i++) {
    console.log(`[AION] block[${i}] (${allBlocks[i].flavour}): ${JSON.stringify(allBlocks[i].text.substring(0, 120))}`);
  }

  // Check if the replacement is multi-line (needs multi-block handling)
  const replacementIsMultiLine = replacement.includes('\n') &&
    replacement.split('\n').filter(l => l.trim()).length > 1;

  // Strategy A: single block match — only for single-line replacements
  // Multi-line replacements must go to Strategy B to distribute across blocks
  if (!replacementIsMultiLine) {
    for (const b of allBlocks) {
      const normBlockText = normalize(b.text);
      const exactMatch = b.text.includes(original);
      const normMatch = normBlockText.includes(normOrig);
      if (exactMatch || normMatch) {
        console.log(`[AION] Strategy A match! exact=${exactMatch} norm=${normMatch} flavour=${b.flavour} text=${JSON.stringify(b.text.substring(0, 80))}`);
        const yText = (b.model as any).text;
        if (yText && typeof yText.delete === 'function' && typeof yText.insert === 'function') {
          const plain = b.text;
          // Try exact position first
          const idx = plain.indexOf(original);
          if (idx >= 0) {
            yText.delete(idx, original.length);
            yText.insert(idx, replacement);
            return true;
          }
          // Try finding position in quote-normalized text
          const normPlain = normalizeQuotesClient(plain);
          const normOriginal = normalizeQuotesClient(original);
          const normIdx = normPlain.indexOf(normOriginal);
          if (normIdx >= 0) {
            yText.delete(normIdx, normOriginal.length);
            yText.insert(normIdx, replacement);
            return true;
          }
          // Last resort: full normalized match — replace block content
          const normText = normalize(plain);
          const matchIdx = normText.indexOf(normOrig);
          if (matchIdx >= 0) {
            const strippedReplacement = stripMd(replacement).trim();
            console.log(`[AION] Strategy A last-resort: replacing block with: ${JSON.stringify(strippedReplacement.substring(0, 80))}`);
            yText.delete(0, plain.length);
            if (strippedReplacement) yText.insert(0, strippedReplacement);
            return true;
          }
        }
      }
    }
  } else {
    console.log(`[AION] Strategy A skipped — replacement is multi-line, delegating to Strategy B`);
  }

  // Strategy B: multi-block / heading+placeholder pattern
  // Filter meaningful lines (skip empty md markers like bare `>`)
  const origLines = original.split('\n').map(l => l.trim()).filter(l => {
    if (!l) return false;
    const stripped = normalize(l);
    return stripped.length > 0;
  });

  if (origLines.length >= 1) {
    const normFirstLine = normalize(origLines[0]);
    if (!normFirstLine) {
      console.log('[AION] Strategy B: normalized first line is empty, skipping');
    } else {
      const startIdx = allBlocks.findIndex(
        b => b.text.includes(origLines[0]) || normalize(b.text).includes(normFirstLine)
      );

      if (startIdx >= 0) {
        console.log(`[AION] Strategy B: found anchor block[${startIdx}]: ${JSON.stringify(allBlocks[startIdx].text.substring(0, 80))}`);

        // Strip markdown from replacement lines for BlockSuite insertion
        const replLines = replacement.split('\n')
          .map(l => l.trim())
          .filter(l => l.length > 0)
          .map(l => stripMd(l).trim())
          .filter(l => l.length > 0);

        if (origLines.length === 1) {
          // Single meaningful line in original — heading/label pattern
          // The replacement usually has heading + content; put content in the NEXT block
          // E.g. original: "**Objetivo:**\n>" → replacement: "**Objetivo:**\n> actual content"
          const anchorBlock = allBlocks[startIdx];
          const anchorNorm = normalize(anchorBlock.text);

          // Check if first replacement line is same as the anchor (heading preserved)
          if (replLines.length > 1 && normalize(replLines[0]) === anchorNorm) {
            // Heading stays, content goes into next block(s)
            const contentLines = replLines.slice(1);
            const nextBlock = allBlocks[startIdx + 1];
            if (nextBlock) {
              const yText = (nextBlock.model as any).text;
              if (yText && typeof yText.delete === 'function') {
                const content = contentLines.join('\n');
                console.log(`[AION] Strategy B: inserting content into block[${startIdx + 1}]: ${JSON.stringify(content.substring(0, 80))}`);
                yText.delete(0, nextBlock.text.length);
                if (content) yText.insert(0, content);
                return true;
              }
            }
          }

          // Fallback: replace anchor block with all replacement content
          const yText = (anchorBlock.model as any).text;
          if (yText && typeof yText.delete === 'function') {
            const content = replLines.join('\n');
            yText.delete(0, anchorBlock.text.length);
            if (content) yText.insert(0, content);
            return true;
          }
        } else {
          // Multi-line original — find last line too
          const lastLine = origLines[origLines.length - 1];
          const normLastLine = normalize(lastLine);
          let endIdx = startIdx;
          for (let i = startIdx; i < Math.min(startIdx + origLines.length + 5, allBlocks.length); i++) {
            if (normalize(allBlocks[i].text).includes(normLastLine)) {
              endIdx = i;
            }
          }

          // Replace matched blocks with replacement lines
          for (let i = startIdx; i <= endIdx; i++) {
            const yText = (allBlocks[i].model as any).text;
            if (yText && typeof yText.delete === 'function') {
              const len = allBlocks[i].text.length;
              yText.delete(0, len);
              const newContent = replLines[i - startIdx] ?? '';
              if (newContent) yText.insert(0, newContent);
            }
          }
          return true;
        }
      } else {
        console.log(`[AION] Strategy B: first line not found in any block`);
        console.log(`[AION] Strategy B firstLine: ${JSON.stringify(origLines[0].substring(0, 80))}`);
        console.log(`[AION] Strategy B normFirstLine: ${JSON.stringify(normFirstLine.substring(0, 80))}`);
      }
    }
  }

  console.warn(`[AION] tryApplyEditClientSide: no match found for original text`);
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Edit block component ────────────────────────────────────────────────

function EditBlockView({
  edit,
}: {
  edit: EditBlock;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    // Strip markdown for clean paste into the editor
    const clean = edit.replacement
      .replace(/^>\s?/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/_(.+?)_/g, '$1')
      .replace(/\\([_*[\]()~`>#+=|{}.!-])/g, '$1')
      .trim();
    navigator.clipboard.writeText(clean).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [edit.replacement]);

  return (
    <div className={styles.editBlock}>
      <div className={styles.editBlockHeader}>
        <span>Edición sugerida</span>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <button
            className={styles.editApplyButton}
            onClick={handleCopy}
            style={{ background: copied ? '#16a34a' : undefined }}
          >
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>
      <div className={styles.editBlockOriginal}>{edit.original}</div>
      <div className={styles.editBlockReplacement}>{edit.replacement}</div>
    </div>
  );
}

// ─── Chat bubble ─────────────────────────────────────────────────────────

function ChatBubble({
  message,
}: {
  message: ChatMessage;
}) {
  const isUser = message.role === 'user';

  // Parse edit blocks only for assistant messages
  const segments = !isUser ? parseEditBlocks(message.content) : null;
  const hasEdits = segments && segments.some(s => s.type === 'edit');

  if (!isUser && hasEdits) {
    return (
      <div
        style={{
          padding: '8px 12px',
          margin: '4px 0',
          borderRadius: '8px',
          background: 'var(--affine-hover-color, #f5f5f5)',
          marginRight: '32px',
          fontSize: '13px',
          wordBreak: 'break-word',
        }}
      >
        {segments!.map((seg, i) =>
          seg.type === 'text' ? (
            <MarkdownContent key={i} content={seg.text!} />
          ) : (
            <EditBlockView
              key={i}
              edit={seg.edit!}
            />
          )
        )}
      </div>
    );
  }

  return (
    <div
      style={{
        padding: '8px 12px',
        margin: '4px 0',
        borderRadius: '8px',
        background: isUser ? 'var(--affine-primary-color, #1e96eb)' : 'var(--affine-hover-color, #f5f5f5)',
        color: isUser ? '#fff' : 'inherit',
        marginLeft: isUser ? '32px' : '0',
        marginRight: isUser ? '0' : '32px',
        fontSize: '13px',
        wordBreak: 'break-word',
      }}
    >
      {isUser ? (
        <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>
      ) : (
        <MarkdownContent content={message.content} />
      )}
    </div>
  );
}

// ─── Analysis Tab (sequential stepper) ───────────────────────────────────
function AnalysisTab() {
  const agentService = useService(AgentPlatformService);
  const docService = useService(DocService);
  const workspaceService = useService(WorkspaceService);

  const run = useLiveData(agentService.currentRun$);
  const loading = useLiveData(agentService.loading$);
  const error = useLiveData(agentService.error$);
  const currentStep = useLiveData(agentService.currentStep$);

  // Step results
  const validateBrief = useLiveData(agentService.validateBrief$);
  const detectAmbiguity = useLiveData(agentService.detectAmbiguity$);
  const technicalPlan = useLiveData(agentService.technicalPlan$);
  const briefEpics = useLiveData(agentService.briefEpics$);
  const generateTasks = useLiveData(agentService.generateTasks$);
  const generateCheckpoints = useLiveData(agentService.generateCheckpoints$);
  const codeGeneration = useLiveData(agentService.codeGeneration$);
  const checkAlignment = useLiveData(agentService.checkAlignment$);

  const docId = docService.doc.id;
  const workspaceId = workspaceService.workspace.id;

  const workspaceRepos = useLiveData(agentService.workspaceRepos$);
  const [expandedSteps, setExpandedSteps] = useState<Set<AgentStep>>(new Set());
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');

  // Load workspace repos on mount
  useEffect(() => {
    agentService.loadWorkspaceRepos(workspaceId);
  }, [agentService, workspaceId]);

  const stepResultsMap: Record<string, unknown> = {
    validate_brief: validateBrief,
    detect_ambiguity: detectAmbiguity,
    technical_plan: technicalPlan,
    brief_epics: briefEpics,
    generate_tasks: generateTasks,
    generate_checkpoints: generateCheckpoints,
    code_generation: codeGeneration,
    check_alignment: checkAlignment,
  };

  const getBriefContent = useCallback(async (): Promise<string> => {
    try {
      const store = docService.doc.blockSuiteDoc;
      if (store) {
        return await extractMarkdownFromDoc(store);
      }
    } catch { /* fallback */ }
    return `[Brief document: ${docId}]`;
  }, [docService, docId]);

  const docTitle = useLiveData(docService.doc.title$);

  const handleCreateRun = useCallback(async () => {
    const content = await getBriefContent();
    agentService.resetStepState();
    // repoTarget is auto-resolved by the backend from workspace config
    await agentService.createRun(workspaceId, docId, content, undefined, docTitle);
  }, [agentService, workspaceId, docId, getBriefContent, docTitle]);

  const handleRunStep = useCallback(async (step: AgentStep) => {
    if (!run) return;
    const content = await getBriefContent();
    const context: Record<string, unknown> = {};

    // For code_generation, include selected task
    if (step === 'code_generation' && selectedTaskId && generateTasks) {
      const task = generateTasks.tasks.find(t => t.taskId === selectedTaskId);
      if (task) context.selectedTask = task;
    }

    try {
      await agentService.executeStep(run.runId, step, content, context);
      setExpandedSteps(prev => new Set([...prev, step]));
    } catch {
      // error shown via error$
    }
  }, [run, agentService, getBriefContent, selectedTaskId, generateTasks]);

  const toggleExpanded = useCallback((step: AgentStep) => {
    setExpandedSteps(prev => {
      const next = new Set(prev);
      if (next.has(step)) next.delete(step);
      else next.add(step);
      return next;
    });
  }, []);

  // Determine which steps are enabled (sequential gating)
  const getStepEnabled = useCallback((step: AgentStep, idx: number): boolean => {
    if (!run) return false;
    if (idx === 0) return true; // First step always enabled
    // Previous step must have a result
    const prevStep = AGENT_STEPS_ORDERED[idx - 1];
    return stepResultsMap[prevStep] != null;
  }, [run, stepResultsMap]);

  const getStepStatus = useCallback((step: AgentStep): 'done' | 'running' | 'pending' => {
    if (currentStep === step) return 'running';
    if (stepResultsMap[step] != null) return 'done';
    return 'pending';
  }, [currentStep, stepResultsMap]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {error && <div className={styles.errorBox}>{error}</div>}

      {/* Repo connection + Start Run */}
      {!run && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Repository</div>
          {(() => {
            const defaultRepo = workspaceRepos.find(r => r.isDefault);
            if (defaultRepo) {
              return (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 8px',
                  fontSize: '12px',
                  border: '1px solid var(--affine-border-color, #e5e5e5)',
                  borderRadius: '4px',
                  fontFamily: 'monospace',
                  background: 'var(--affine-hover-color, #f5f5f5)',
                }}>
                  <span style={{ flex: 1 }}>
                    {defaultRepo.fullName} ({defaultRepo.defaultBranch})
                  </span>
                  <span style={{
                    fontSize: '10px',
                    padding: '1px 6px',
                    borderRadius: '3px',
                    background: '#16a34a20',
                    color: '#16a34a',
                    fontWeight: 600,
                  }}>
                    connected
                  </span>
                </div>
              );
            }
            return (
              <div style={{ fontSize: '12px', opacity: 0.6, padding: '4px 0' }}>
                No repo connected. Go to Settings {'>'} Integrations {'>'} GitHub to connect a repository.
              </div>
            );
          })()}
          <button className={styles.actionButton} onClick={handleCreateRun} disabled={loading} style={{ marginTop: '8px' }}>
            Start Run
          </button>
        </div>
      )}

      {/* Run info */}
      {run && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Run: {run.status}</div>
          {run.repoTarget && (
            <div style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.7 }}>
              Repo: {run.repoTarget.localPath}
            </div>
          )}
          {run.branchName && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              marginTop: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontFamily: 'monospace',
              border: '1px solid var(--affine-border-color, #e5e5e5)',
              borderRadius: '4px',
              background: 'var(--affine-hover-color, #f5f5f5)',
            }}>
              <span style={{ fontSize: '13px' }}>&#x1F33F;</span>
              <span style={{ flex: 1, wordBreak: 'break-all' }}>{run.branchName}</span>
            </div>
          )}
        </div>
      )}

      {/* Step Stepper */}
      {run && (
        <div className={styles.stepperContainer}>
          {AGENT_STEPS_ORDERED.map((step, idx) => {
            const enabled = getStepEnabled(step, idx);
            const status = getStepStatus(step);
            const isExpanded = expandedSteps.has(step);
            const result = stepResultsMap[step];

            return (
              <div
                key={step}
                className={styles.stepItem}
                style={{
                  opacity: enabled ? 1 : 0.5,
                  background: status === 'running' ? 'var(--affine-hover-color, #f5f5f5)' : 'transparent',
                }}
              >
                <div className={styles.stepHeader} onClick={() => result && toggleExpanded(step)}>
                  <div
                    className={styles.stepNumber}
                    style={{
                      background:
                        status === 'done' ? '#16a34a' :
                        status === 'running' ? '#3b82f6' : '#d1d5db',
                      color: status === 'pending' ? '#6b7280' : '#fff',
                    }}
                  >
                    {status === 'done' ? '\u2713' : idx + 1}
                  </div>
                  <span className={styles.stepLabel}>
                    {AGENT_STEP_LABELS[step]}
                  </span>

                  {/* Task dropdown for code_generation */}
                  {step === 'code_generation' && generateTasks && generateTasks.tasks.length > 0 && (
                    <select
                      className={styles.taskDropdown}
                      value={selectedTaskId}
                      onChange={(e) => { e.stopPropagation(); setSelectedTaskId(e.target.value); }}
                      onClick={(e) => e.stopPropagation()}
                      style={{ flex: 'none', width: 'auto', maxWidth: '120px' }}
                    >
                      <option value="">All tasks</option>
                      {generateTasks.tasks.map(t => (
                        <option key={t.taskId} value={t.taskId}>{t.title}</option>
                      ))}
                    </select>
                  )}

                  {status === 'running' ? (
                    <span style={{ fontSize: '11px', color: '#3b82f6' }}>Running...</span>
                  ) : (
                    <button
                      className={styles.secondaryButton}
                      onClick={(e) => { e.stopPropagation(); handleRunStep(step); }}
                      disabled={!enabled || loading || currentStep !== null}
                      style={{ padding: '3px 10px', fontSize: '11px' }}
                    >
                      Run
                    </button>
                  )}
                </div>

                {/* Expanded result */}
                {isExpanded && result && (
                  <div className={styles.stepResultContent}>
                    <StepResultView step={step} result={result} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Step Result Views ───────────────────────────────────────────────────

/** Safely coerce a possibly-undefined value to an array */
function safeArr<T>(val: T[] | undefined | null): T[] {
  return Array.isArray(val) ? val : [];
}

function StepResultView({ step, result }: { step: AgentStep; result: unknown }) {
  const [showRaw, setShowRaw] = useState(false);

  // Guard: if result is not an object, render raw JSON
  if (!result || typeof result !== 'object') {
    return <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>;
  }

  // If result has _rawText, Claude returned plain text instead of structured JSON
  const rawText = (result as any)?._rawText;
  if (rawText) {
    return (
      <div>
        <div style={{ color: '#dc2626', fontSize: '11px', marginBottom: '4px' }}>
          Claude returned plain text instead of structured JSON.
        </div>
        <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto' }}>{rawText}</pre>
      </div>
    );
  }

  // Check if result looks empty (no meaningful keys)
  const keys = Object.keys(result as object);
  const isEmpty = keys.length === 0;

  // Render debug toggle + raw JSON viewer
  const debugToggle = (
    <div style={{ marginTop: '6px', borderTop: '1px solid var(--affine-border-color, #e5e5e5)', paddingTop: '4px' }}>
      <button
        onClick={() => setShowRaw(!showRaw)}
        style={{ fontSize: '10px', opacity: 0.6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
      >
        {showRaw ? 'Hide' : 'Show'} raw JSON
      </button>
      {showRaw && (
        <pre style={{ fontSize: '10px', whiteSpace: 'pre-wrap', maxHeight: '200px', overflow: 'auto', marginTop: '4px' }}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );

  if (isEmpty) {
    return (
      <div>
        <div style={{ color: '#dc2626', fontSize: '11px' }}>
          Empty result — Claude did not return structured data for this step.
        </div>
        {debugToggle}
      </div>
    );
  }

  switch (step) {
    case 'validate_brief': {
      const r = result as Partial<ValidateBriefResponse>;
      const missing = safeArr(r.missingElements);
      const questions = safeArr(r.clarificationQuestions);
      return (
        <div>
          <div><strong>Executable:</strong> {r.isExecutable === true ? 'Yes' : r.isExecutable === false ? 'No' : 'N/A'} | <strong>Ambiguity:</strong> {r.ambiguityLevel ?? 'N/A'}</div>
          {missing.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Missing:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                {missing.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {questions.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Questions:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                {questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </div>
          )}
          {debugToggle}
        </div>
      );
    }
    case 'detect_ambiguity': {
      const r = result as Partial<DetectAmbiguityResponse>;
      const conceptual = safeArr(r.conceptualAmbiguities);
      const technical = safeArr(r.technicalAmbiguities);
      const operational = safeArr(r.operationalAmbiguities);
      return (
        <div>
          <div style={{ marginBottom: '4px' }}>
            Conceptual: {conceptual.length} |
            Technical: {technical.length} |
            Operational: {operational.length}
          </div>
          {conceptual.map((a, i) => <div key={`c${i}`} className={styles.ambiguityItem} style={{ marginBottom: '2px' }}>{a}</div>)}
          {technical.map((a, i) => <div key={`t${i}`} className={styles.ambiguityItem} style={{ marginBottom: '2px' }}>{a}</div>)}
          {operational.map((a, i) => <div key={`o${i}`} className={styles.ambiguityItem} style={{ marginBottom: '2px' }}>{a}</div>)}
          {r.riskIfExecutedAsIs && <div style={{ marginTop: '4px', fontStyle: 'italic' }}>{r.riskIfExecutedAsIs}</div>}
          {debugToggle}
        </div>
      );
    }
    case 'technical_plan': {
      const r = result as Partial<TechnicalPlanResponse>;
      const risks = safeArr(r.risks);
      return (
        <div>
          <div><strong>Architecture:</strong> {r.architectureImpact ?? 'N/A'}</div>
          <div><strong>Rollback Cost:</strong> {r.rollbackCost ?? 'N/A'}</div>
          {risks.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Risks:</strong>
              <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                {risks.map((risk, i) => <li key={i}>{risk}</li>)}
              </ul>
            </div>
          )}
          {debugToggle}
        </div>
      );
    }
    case 'brief_epics': {
      const r = result as Partial<BriefEpicsResponse>;
      const epics = safeArr(r.epics);
      return (
        <div>
          {epics.map((e, i) => (
            <div key={e.epicId ?? i} className={styles.planEpic} style={{ marginBottom: '4px' }}>
              <strong>{e.title}</strong> <span style={{ opacity: 0.7 }}>({e.area})</span>
              <div style={{ fontSize: '11px' }}>{e.description}</div>
            </div>
          ))}
          {debugToggle}
        </div>
      );
    }
    case 'generate_tasks': {
      const r = result as Partial<GenerateTasksResponse>;
      const tasks = safeArr(r.tasks);
      return (
        <div>
          {tasks.map((t, i) => (
            <div key={t.taskId ?? i} style={{ padding: '4px 0', borderBottom: '1px solid var(--affine-border-color, #e5e5e5)' }}>
              <div><strong>{t.title}</strong> <span className={styles.severityBadge} style={{ background: '#3b82f620', color: '#3b82f6' }}>{t.type}</span></div>
              <div style={{ fontSize: '11px' }}>{t.description}</div>
            </div>
          ))}
          {debugToggle}
        </div>
      );
    }
    case 'generate_checkpoints': {
      const r = result as Partial<GenerateCheckpointsResponse>;
      const checkpoints = safeArr(r.checkpoints);
      return (
        <div>
          {checkpoints.map((cp, i) => (
            <div key={i} style={{ padding: '4px 0' }}>
              <div><strong>{cp.checkpoint}</strong></div>
              <div style={{ fontSize: '11px' }}>Outcome: {cp.visibleOutcome}</div>
              <div style={{ fontSize: '11px', opacity: 0.7 }}>Validate: {cp.howToValidate}</div>
            </div>
          ))}
          {debugToggle}
        </div>
      );
    }
    case 'code_generation': {
      const r = result as Partial<CodeGenerationResponse>;
      const assumptions = safeArr(r.assumptions);
      const files = safeArr(r.files);
      return (
        <div>
          {assumptions.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Assumptions:</strong>
              <ul style={{ margin: '2px 0', paddingLeft: '16px' }}>
                {assumptions.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}
          <div><strong>Files ({files.length}):</strong></div>
          {files.map((f, i) => (
            <div key={i} style={{ fontFamily: 'monospace', fontSize: '11px', padding: '2px 0' }}>
              {f.path}
            </div>
          ))}
          {debugToggle}
        </div>
      );
    }
    case 'check_alignment': {
      const r = result as Partial<CheckAlignmentResponse>;
      const deviations = safeArr(r.deviations);
      return (
        <div>
          <div><strong>Aligned:</strong> {r.aligned === true ? 'Yes' : r.aligned === false ? 'No' : 'N/A'}</div>
          {r.overallAssessment && <div style={{ marginTop: '4px' }}>{r.overallAssessment}</div>}
          {deviations.length > 0 && (
            <div style={{ marginTop: '4px' }}>
              <strong>Deviations:</strong>
              <ul style={{ margin: '2px 0', paddingLeft: '16px' }}>
                {deviations.map((d, i) => <li key={i}>{d}</li>)}
              </ul>
            </div>
          )}
          {debugToggle}
        </div>
      );
    }
    default:
      return (
        <div>
          <pre style={{ fontSize: '11px', whiteSpace: 'pre-wrap' }}>{JSON.stringify(result, null, 2)}</pre>
          {debugToggle}
        </div>
      );
  }
}

// ─── Changes Tab ────────────────────────────────────────────────────────

interface RepoChanges {
  diff: string;
  status: string;
  log: string;
  branch: string;
}

function ChangesTab() {
  const agentService = useService(AgentPlatformService);
  const workspaceService = useService(WorkspaceService);
  const docService = useService(DocService);
  const workspaceId = workspaceService.workspace.id;
  const docId = docService.doc.id;
  const changes = useLiveData(agentService.repoChanges$) as RepoChanges | null;
  const loading = useLiveData(agentService.repoChangesLoading$);
  const [commitMsg, setCommitMsg] = useState('');
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<string | null>(null);

  useEffect(() => {
    agentService.loadRepoChanges(workspaceId, docId);
  }, [agentService, workspaceId, docId]);

  const handleRefresh = useCallback(() => {
    agentService.loadRepoChanges(workspaceId, docId);
    setCommitResult(null);
  }, [agentService, workspaceId, docId]);

  const handleCommit = useCallback(async () => {
    if (!commitMsg.trim() || committing) return;
    setCommitting(true);
    setCommitResult(null);
    try {
      const res = await agentService.commitChanges(workspaceId, commitMsg.trim(), docId);
      setCommitResult(`Committed: ${res.hash}`);
      setCommitMsg('');
    } catch (err) {
      setCommitResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCommitting(false);
    }
  }, [agentService, workspaceId, docId, commitMsg, committing]);

  if (loading && !changes) {
    return <div className={styles.loadingSpinner}>Loading changes...</div>;
  }

  if (!changes) {
    return (
      <div className={styles.configInfo} style={{ textAlign: 'center', padding: '40px 16px' }}>
        No repo connected or unable to load changes.
        <br />
        <button className={styles.secondaryButton} onClick={handleRefresh} style={{ marginTop: '8px' }}>
          Retry
        </button>
      </div>
    );
  }

  const statusFiles = changes.status
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const code = line.substring(0, 2).trim();
      const path = line.substring(3);
      return { code, path };
    });

  const logEntries = changes.log
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const spaceIdx = line.indexOf(' ');
      return {
        hash: spaceIdx > 0 ? line.substring(0, spaceIdx) : line,
        message: spaceIdx > 0 ? line.substring(spaceIdx + 1) : '',
      };
    });

  const hasDiff = changes.diff.length > 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Branch header */}
      <div className={styles.section}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className={styles.sectionTitle} style={{ flex: 1 }}>
            Branch: <span style={{ fontFamily: 'monospace', textTransform: 'none' }}>{changes.branch || '(detached)'}</span>
          </span>
          <button className={styles.secondaryButton} onClick={handleRefresh} disabled={loading} style={{ padding: '3px 10px', fontSize: '11px' }}>
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Modified files */}
      {statusFiles.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Modified Files ({statusFiles.length})</div>
          <div className={styles.fileStatusList}>
            {statusFiles.map((f, i) => (
              <div key={i} className={styles.fileStatusItem}>
                <FileStatusBadge code={f.code} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.path}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {statusFiles.length === 0 && (
        <div className={styles.section}>
          <div className={styles.configInfo} style={{ textAlign: 'center' }}>
            No uncommitted changes.
          </div>
        </div>
      )}

      {/* Diff viewer */}
      {hasDiff && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Diff</div>
          <DiffViewer diff={changes.diff} />
        </div>
      )}

      {/* Commit */}
      {statusFiles.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Commit All</div>
          <div className={styles.commitSection}>
            <input
              type="text"
              className={styles.commitInput}
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCommit(); }}
              disabled={committing}
            />
            <button
              className={styles.actionButton}
              onClick={handleCommit}
              disabled={!commitMsg.trim() || committing}
              style={{ flexShrink: 0 }}
            >
              {committing ? '...' : 'Commit'}
            </button>
          </div>
          {commitResult && (
            <div style={{ fontSize: '11px', fontFamily: 'monospace', color: commitResult.startsWith('Error') ? '#dc2626' : '#16a34a' }}>
              {commitResult}
            </div>
          )}
        </div>
      )}

      {/* Recent commits */}
      {logEntries.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Recent Commits</div>
          <div className={styles.logList}>
            {logEntries.map((entry, i) => (
              <div key={i} className={styles.logItem}>
                <span className={styles.logHash}>{entry.hash}</span>
                <span className={styles.logMessage}>{entry.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FileStatusBadge({ code }: { code: string }) {
  const badgeConfig: Record<string, { label: string; bg: string; color: string }> = {
    M: { label: 'M', bg: '#f59e0b20', color: '#f59e0b' },
    A: { label: 'A', bg: '#16a34a20', color: '#16a34a' },
    D: { label: 'D', bg: '#dc262620', color: '#dc2626' },
    '??': { label: '?', bg: '#8b5cf620', color: '#8b5cf6' },
    R: { label: 'R', bg: '#3b82f620', color: '#3b82f6' },
  };
  const cfg = badgeConfig[code] ?? { label: code, bg: '#6b728020', color: '#6b7280' };
  return (
    <span className={styles.fileStatusBadge} style={{ background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function DiffViewer({ diff }: { diff: string }) {
  const lines = diff.split('\n');
  return (
    <div className={styles.diffViewer}>
      {lines.map((line, i) => {
        let className = styles.diffLineContext;
        if (line.startsWith('diff --git')) {
          className = styles.diffFileHeader;
        } else if (line.startsWith('@@')) {
          className = styles.diffLineHunk;
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          className = styles.diffLineAdded;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          className = styles.diffLineRemoved;
        }
        return (
          <span key={i} className={className}>
            {line}
            {'\n'}
          </span>
        );
      })}
    </div>
  );
}

// ─── Audit Tab ──────────────────────────────────────────────────────────
function AuditTab() {
  const agentService = useService(AgentPlatformService);
  const auditLog = useLiveData(agentService.auditLog$);
  const config = useLiveData(agentService.config$);

  useEffect(() => { agentService.loadConfig(); }, [agentService]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {/* Config */}
      {config && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}>Config</div>
          <div className={styles.configInfo}>
            Claude Code: {config.claudeCodeAvailable ? `v${config.claudeCodeVersion}` : 'Not available'}
          </div>
          <div className={styles.configInfo}>API version: {config.version}</div>
        </div>
      )}

      {/* Audit log */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Audit Log ({auditLog.length})</div>
        {auditLog.length === 0 && (
          <div className={styles.configInfo}>No events yet. Start a run to see audit events.</div>
        )}
        {auditLog.map((event) => (
          <div key={event.id} className={styles.timelineItem}>
            <span style={{ fontFamily: 'monospace', fontSize: '10px', minWidth: '70px' }}>
              {new Date(event.at).toLocaleTimeString()}
            </span>
            <span>{event.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Timeline helper ────────────────────────────────────────────────────
const STATUS_FLOW: RunStatus[] = [
  'created',
  'validating_brief', 'validated_brief',
  'detecting_ambiguity', 'detected_ambiguity',
  'generating_technical_plan', 'generated_technical_plan',
  'generating_epics', 'generated_epics',
  'generating_tasks', 'generated_tasks',
  'generating_checkpoints', 'generated_checkpoints',
  'generating_code', 'generated_code',
  'checking_alignment', 'checked_alignment',
];

function RunTimeline({ currentStatus }: { currentStatus: RunStatus }) {
  const currentIdx = STATUS_FLOW.indexOf(currentStatus);
  return (
    <div className={styles.timeline}>
      {STATUS_FLOW.map((status, idx) => (
        <div key={status} className={styles.timelineItem}>
          <div
            className={styles.timelineDot}
            style={{
              background:
                status === 'failed' ? '#dc2626' :
                idx < currentIdx ? '#16a34a' :
                idx === currentIdx ? '#3b82f6' : '#d1d5db',
            }}
          />
          <span style={{ opacity: idx <= currentIdx ? 1 : 0.4 }}>{status}</span>
        </div>
      ))}
    </div>
  );
}
