/**
 * AFFiNE Yjs Helpers
 *
 * Handles Yjs document creation, traversal, block tree <-> markdown conversion,
 * and CRDT mutations for the BlockSuite document model.
 */

import * as Y from "yjs";
import { nanoid } from "nanoid";
import { loadDoc, pushDocUpdate } from "./websocket.js";
import { AFFINE_WORKSPACE_ID } from "../constants.js";
import type { BlockInfo, EditOperation, DocMeta, CollectionMeta, TextDelta } from "../types.js";

// ─── YDoc Loading ───────────────────────────────────────────────────────────

/**
 * Load a remote Yjs document by ID.
 */
export async function loadYDoc(docId: string): Promise<Y.Doc> {
  const result = await loadDoc(docId);
  const ydoc = new Y.Doc();

  if (result.missing) {
    const update = new Uint8Array(Buffer.from(result.missing, "base64"));
    Y.applyUpdate(ydoc, update);
  }

  return ydoc;
}

/**
 * Encode a Yjs update as base64 for pushing.
 */
function encodeUpdate(update: Uint8Array): string {
  return Buffer.from(update).toString("base64");
}

/**
 * Push the full state of a YDoc to the server.
 */
export async function pushYDoc(docId: string, ydoc: Y.Doc): Promise<void> {
  const update = Y.encodeStateAsUpdate(ydoc);
  await pushDocUpdate(docId, encodeUpdate(update));
}

// ─── Workspace Root Doc Operations ──────────────────────────────────────────

/**
 * Load the workspace root doc and read document metadata.
 */
export async function listDocsMeta(): Promise<DocMeta[]> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const meta = ydoc.getMap("meta");
  const pages = meta.get("pages") as Y.Array<Y.Map<unknown>> | undefined;

  if (!pages) return [];

  const docs: DocMeta[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);
    if (page instanceof Y.Map) {
      const id = page.get("id") as string;
      const title = page.get("title") as string;
      const createDate = page.get("createDate") as number;
      const updatedDate = page.get("updatedDate") as number | undefined;

      const tagsArray = page.get("tags") as Y.Array<string> | undefined;
      const tags = tagsArray ? tagsArray.toArray() : undefined;

      docs.push({ id, title, createDate, updatedDate, tags });
    }
  }

  return docs;
}

/**
 * Add a document entry to the workspace root doc's meta.pages.
 */
export async function addDocToMeta(docId: string, title: string): Promise<void> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const meta = ydoc.getMap("meta");

  let pages = meta.get("pages") as Y.Array<Y.Map<unknown>> | undefined;
  if (!pages) {
    pages = new Y.Array<Y.Map<unknown>>();
    meta.set("pages", pages);
  }

  const pageMap = new Y.Map<unknown>();
  pageMap.set("id", docId);
  pageMap.set("title", title);
  pageMap.set("createDate", Date.now());

  const tagsArray = new Y.Array<string>();
  pageMap.set("tags", tagsArray);

  pages.push([pageMap]);

  await pushYDoc(AFFINE_WORKSPACE_ID, ydoc);
}

/**
 * Remove a document entry from the workspace root doc's meta.pages.
 */
export async function removeDocFromMeta(docId: string): Promise<void> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const meta = ydoc.getMap("meta");
  const pages = meta.get("pages") as Y.Array<Y.Map<unknown>> | undefined;

  if (!pages) return;

  for (let i = 0; i < pages.length; i++) {
    const page = pages.get(i);
    if (page instanceof Y.Map && page.get("id") === docId) {
      pages.delete(i, 1);
      break;
    }
  }

  await pushYDoc(AFFINE_WORKSPACE_ID, ydoc);
}

// ─── Collection Operations ──────────────────────────────────────────────────

/**
 * List all collections from the workspace root doc.
 */
export async function listCollections(): Promise<CollectionMeta[]> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const setting = ydoc.getMap("setting");
  const collections = setting.get("collections") as Y.Array<Y.Map<unknown>> | undefined;

  if (!collections) return [];

  const result: CollectionMeta[] = [];
  for (let i = 0; i < collections.length; i++) {
    const col = collections.get(i);
    if (col instanceof Y.Map) {
      const id = col.get("id") as string;
      const name = col.get("name") as string;
      const allowList = col.get("allowList") as Y.Array<string> | undefined;
      const docIds = allowList ? allowList.toArray() : [];
      result.push({ id, name, docIds, docCount: docIds.length });
    }
  }

  return result;
}

/**
 * Create a new collection in the workspace root doc.
 */
export async function createCollection(
  name: string,
  docIds: string[] = []
): Promise<string> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const setting = ydoc.getMap("setting");

  let collections = setting.get("collections") as Y.Array<Y.Map<unknown>> | undefined;
  if (!collections) {
    collections = new Y.Array<Y.Map<unknown>>();
    setting.set("collections", collections);
  }

  const id = nanoid(21);
  const colMap = new Y.Map<unknown>();
  colMap.set("id", id);
  colMap.set("name", name);

  // rules: YMap with filters YArray
  const rules = new Y.Map<unknown>();
  const filters = new Y.Array<unknown>();
  rules.set("filters", filters);
  colMap.set("rules", rules);

  // allowList: YArray of doc IDs
  const allowList = new Y.Array<string>();
  if (docIds.length > 0) {
    allowList.push(docIds);
  }
  colMap.set("allowList", allowList);

  collections.push([colMap]);

  await pushYDoc(AFFINE_WORKSPACE_ID, ydoc);
  return id;
}

/**
 * Update a collection: add/remove docs, rename.
 */
export async function updateCollection(
  collectionId: string,
  opts: { addDocIds?: string[]; removeDocIds?: string[]; name?: string }
): Promise<void> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const setting = ydoc.getMap("setting");
  const collections = setting.get("collections") as Y.Array<Y.Map<unknown>> | undefined;

  if (!collections) throw new Error(`Collection "${collectionId}" not found`);

  let found = false;
  for (let i = 0; i < collections.length; i++) {
    const col = collections.get(i);
    if (col instanceof Y.Map && col.get("id") === collectionId) {
      found = true;

      if (opts.name !== undefined) {
        col.set("name", opts.name);
      }

      const allowList = col.get("allowList") as Y.Array<string> | undefined;
      if (allowList) {
        // Remove docs
        if (opts.removeDocIds?.length) {
          const removeSet = new Set(opts.removeDocIds);
          for (let j = allowList.length - 1; j >= 0; j--) {
            if (removeSet.has(allowList.get(j))) {
              allowList.delete(j, 1);
            }
          }
        }

        // Add docs (avoid duplicates)
        if (opts.addDocIds?.length) {
          const existing = new Set(allowList.toArray());
          const toAdd = opts.addDocIds.filter((id) => !existing.has(id));
          if (toAdd.length > 0) {
            allowList.push(toAdd);
          }
        }
      }

      break;
    }
  }

  if (!found) throw new Error(`Collection "${collectionId}" not found`);

  await pushYDoc(AFFINE_WORKSPACE_ID, ydoc);
}

/**
 * Delete a collection from the workspace root doc.
 */
export async function deleteCollection(collectionId: string): Promise<void> {
  const ydoc = await loadYDoc(AFFINE_WORKSPACE_ID);
  const setting = ydoc.getMap("setting");
  const collections = setting.get("collections") as Y.Array<Y.Map<unknown>> | undefined;

  if (!collections) throw new Error(`Collection "${collectionId}" not found`);

  let found = false;
  for (let i = 0; i < collections.length; i++) {
    const col = collections.get(i);
    if (col instanceof Y.Map && col.get("id") === collectionId) {
      collections.delete(i, 1);
      found = true;
      break;
    }
  }

  if (!found) throw new Error(`Collection "${collectionId}" not found`);

  await pushYDoc(AFFINE_WORKSPACE_ID, ydoc);
}

// ─── Block Tree <-> Markdown ────────────────────────────────────────────────

/**
 * Extract all block info from a YDoc.
 */
function getBlocks(ydoc: Y.Doc): Map<string, BlockInfo> {
  const blocksMap = ydoc.getMap("blocks");
  const result = new Map<string, BlockInfo>();

  for (const [blockId, value] of blocksMap.entries()) {
    if (!(value instanceof Y.Map)) continue;

    const flavour = (value.get("sys:flavour") as string) || "";
    const type = value.get("prop:type") as string | undefined;
    const checked = value.get("prop:checked") as boolean | undefined;
    const language = value.get("prop:language") as string | undefined;

    // Extract text from YText
    let text: string | undefined;
    const ytext = value.get("prop:text");
    if (ytext instanceof Y.Text) {
      text = ytextToMarkdown(ytext);
    }

    // Get children IDs
    const childrenArr = value.get("sys:children") as Y.Array<string> | undefined;
    const children = childrenArr ? childrenArr.toArray() : [];

    result.set(blockId, {
      id: blockId,
      flavour,
      type,
      text,
      children,
      checked,
      language,
    });
  }

  return result;
}

/**
 * Convert a YText with Quill-style deltas to markdown.
 */
function ytextToMarkdown(ytext: Y.Text): string {
  const deltas = ytext.toDelta() as TextDelta[];
  let md = "";

  for (const delta of deltas) {
    let segment = delta.insert;
    const attrs = delta.attributes;

    if (attrs) {
      if (attrs.code) segment = `\`${segment}\``;
      if (attrs.bold) segment = `**${segment}**`;
      if (attrs.italic) segment = `*${segment}*`;
      if (attrs.strike) segment = `~~${segment}~~`;
      if (attrs.underline) segment = `<u>${segment}</u>`;
      if (attrs.link) segment = `[${segment}](${attrs.link})`;
    }

    md += segment;
  }

  return md;
}

/**
 * Find the root page block in a document.
 */
function findRootPageBlock(blocks: Map<string, BlockInfo>): BlockInfo | undefined {
  for (const block of blocks.values()) {
    if (block.flavour === "affine:page") return block;
  }
  return undefined;
}

/**
 * Find the note block (content container) in a document.
 */
function findNoteBlock(
  blocks: Map<string, BlockInfo>,
  pageBlock: BlockInfo
): BlockInfo | undefined {
  for (const childId of pageBlock.children) {
    const child = blocks.get(childId);
    if (child?.flavour === "affine:note") return child;
  }
  return undefined;
}

/**
 * Convert a document's block tree to markdown.
 */
export function docToMarkdown(ydoc: Y.Doc): { title: string; markdown: string; blockCount: number } {
  const blocks = getBlocks(ydoc);
  const pageBlock = findRootPageBlock(blocks);

  if (!pageBlock) {
    return { title: "", markdown: "", blockCount: 0 };
  }

  // Get title from page block's YText
  const blocksMap = ydoc.getMap("blocks");
  const pageYMap = blocksMap.get(pageBlock.id) as Y.Map<unknown> | undefined;
  let title = "";
  if (pageYMap) {
    const titleYText = pageYMap.get("prop:title");
    if (titleYText instanceof Y.Text) {
      title = titleYText.toString();
    }
  }

  const noteBlock = findNoteBlock(blocks, pageBlock);
  if (!noteBlock) {
    return { title, markdown: "", blockCount: 0 };
  }

  const lines: string[] = [];
  let blockCount = 0;

  function renderBlock(blockId: string, indent: number = 0): void {
    const block = blocks.get(blockId);
    if (!block) return;
    blockCount++;

    const prefix = "  ".repeat(indent);
    const text = block.text ?? "";

    switch (block.flavour) {
      case "affine:paragraph":
        switch (block.type) {
          case "h1": lines.push(`${prefix}# ${text}`); break;
          case "h2": lines.push(`${prefix}## ${text}`); break;
          case "h3": lines.push(`${prefix}### ${text}`); break;
          case "h4": lines.push(`${prefix}#### ${text}`); break;
          case "h5": lines.push(`${prefix}##### ${text}`); break;
          case "h6": lines.push(`${prefix}###### ${text}`); break;
          case "quote": lines.push(`${prefix}> ${text}`); break;
          default: lines.push(`${prefix}${text}`); break;
        }
        break;

      case "affine:list":
        switch (block.type) {
          case "bulleted": lines.push(`${prefix}- ${text}`); break;
          case "numbered": lines.push(`${prefix}1. ${text}`); break;
          case "todo":
            lines.push(`${prefix}- [${block.checked ? "x" : " "}] ${text}`);
            break;
          case "toggle": lines.push(`${prefix}<details><summary>${text}</summary>`); break;
          default: lines.push(`${prefix}- ${text}`); break;
        }
        break;

      case "affine:code":
        lines.push(`${prefix}\`\`\`${block.language || ""}`);
        lines.push(text);
        lines.push(`${prefix}\`\`\``);
        break;

      case "affine:divider":
        lines.push(`${prefix}---`);
        break;

      case "affine:image":
        lines.push(`${prefix}![image](blob)`);
        break;

      case "affine:bookmark": {
        const blocksMapRef = ydoc.getMap("blocks");
        const bm = blocksMapRef.get(blockId) as Y.Map<unknown> | undefined;
        const url = bm?.get("prop:url") as string | undefined;
        const bmTitle = bm?.get("prop:title") as string | undefined;
        if (url) {
          lines.push(`${prefix}[${bmTitle || url}](${url})`);
        }
        break;
      }

      default:
        if (text) lines.push(`${prefix}${text}`);
        break;
    }

    // Render children
    for (const childId of block.children) {
      renderBlock(childId, block.flavour === "affine:list" ? indent + 1 : indent);
    }

    // Close toggle
    if (block.flavour === "affine:list" && block.type === "toggle") {
      lines.push(`${prefix}</details>`);
    }
  }

  for (const childId of noteBlock.children) {
    renderBlock(childId);
  }

  return { title, markdown: lines.join("\n"), blockCount };
}

// ─── Document Creation ──────────────────────────────────────────────────────

/**
 * Parse simple markdown into block operations.
 */
function parseMarkdownToBlockOps(
  markdown: string
): Array<{ flavour: string; type: string; text: string; language?: string }> {
  const lines = markdown.split("\n");
  const ops: Array<{ flavour: string; type: string; text: string; language?: string }> = [];
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        ops.push({ flavour: "affine:code", type: "", text: codeContent.trimEnd(), language: codeLang });
        inCodeBlock = false;
        codeContent = "";
        codeLang = "";
      } else {
        inCodeBlock = true;
        codeLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? "\n" : "") + line;
      continue;
    }

    if (line.trim() === "---" || line.trim() === "***") {
      ops.push({ flavour: "affine:divider", type: "", text: "" });
    } else if (line.startsWith("######")) {
      ops.push({ flavour: "affine:paragraph", type: "h6", text: line.slice(7).trim() });
    } else if (line.startsWith("#####")) {
      ops.push({ flavour: "affine:paragraph", type: "h5", text: line.slice(6).trim() });
    } else if (line.startsWith("####")) {
      ops.push({ flavour: "affine:paragraph", type: "h4", text: line.slice(5).trim() });
    } else if (line.startsWith("###")) {
      ops.push({ flavour: "affine:paragraph", type: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("##")) {
      ops.push({ flavour: "affine:paragraph", type: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      ops.push({ flavour: "affine:paragraph", type: "h1", text: line.slice(2).trim() });
    } else if (line.startsWith("> ")) {
      ops.push({ flavour: "affine:paragraph", type: "quote", text: line.slice(2).trim() });
    } else if (/^\s*- \[[ x]\]/.test(line)) {
      const checked = line.includes("[x]");
      const text = line.replace(/^\s*- \[[ x]\]\s*/, "");
      ops.push({ flavour: "affine:list", type: "todo", text });
      // Store checked state — will handle in block creation
    } else if (/^\s*[-*]\s/.test(line)) {
      ops.push({ flavour: "affine:list", type: "bulleted", text: line.replace(/^\s*[-*]\s+/, "") });
    } else if (/^\s*\d+\.\s/.test(line)) {
      ops.push({ flavour: "affine:list", type: "numbered", text: line.replace(/^\s*\d+\.\s+/, "") });
    } else if (line.trim() === "") {
      // Skip empty lines
    } else {
      ops.push({ flavour: "affine:paragraph", type: "text", text: line });
    }
  }

  // Close unclosed code block
  if (inCodeBlock) {
    ops.push({ flavour: "affine:code", type: "", text: codeContent.trimEnd(), language: codeLang });
  }

  return ops;
}

/**
 * Insert markdown-formatted text into a YText with proper deltas.
 */
function insertMarkdownText(ytext: Y.Text, markdownText: string): void {
  // Simple inline formatting parser
  const segments = parseInlineMarkdown(markdownText);

  let offset = 0;
  for (const seg of segments) {
    const attrs: Record<string, boolean | string> = {};
    if (seg.bold) attrs.bold = true;
    if (seg.italic) attrs.italic = true;
    if (seg.code) attrs.code = true;
    if (seg.strike) attrs.strike = true;
    if (seg.link) attrs.link = seg.link;

    if (Object.keys(attrs).length > 0) {
      ytext.insert(offset, seg.text, attrs);
    } else {
      ytext.insert(offset, seg.text);
    }
    offset += seg.text.length;
  }
}

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  strike?: boolean;
  link?: string;
}

/**
 * Parse inline markdown formatting into segments.
 */
function parseInlineMarkdown(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];

  // Simple regex-based parsing for common inline formatting
  // Order matters: handle code first (no nesting), then bold, italic, links, strike
  let remaining = text;

  while (remaining.length > 0) {
    // Inline code
    const codeMatch = remaining.match(/^`([^`]+)`/);
    if (codeMatch) {
      segments.push({ text: codeMatch[1], code: true });
      remaining = remaining.slice(codeMatch[0].length);
      continue;
    }

    // Bold
    const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (boldMatch) {
      segments.push({ text: boldMatch[1], bold: true });
      remaining = remaining.slice(boldMatch[0].length);
      continue;
    }

    // Italic
    const italicMatch = remaining.match(/^\*([^*]+)\*/);
    if (italicMatch) {
      segments.push({ text: italicMatch[1], italic: true });
      remaining = remaining.slice(italicMatch[0].length);
      continue;
    }

    // Strikethrough
    const strikeMatch = remaining.match(/^~~([^~]+)~~/);
    if (strikeMatch) {
      segments.push({ text: strikeMatch[1], strike: true });
      remaining = remaining.slice(strikeMatch[0].length);
      continue;
    }

    // Link
    const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      segments.push({ text: linkMatch[1], link: linkMatch[2] });
      remaining = remaining.slice(linkMatch[0].length);
      continue;
    }

    // Plain text: consume up to the next special character
    const nextSpecial = remaining.search(/[`*~[]/);
    if (nextSpecial === -1) {
      segments.push({ text: remaining });
      break;
    } else if (nextSpecial === 0) {
      // Special char that didn't match a pattern — treat as plain text
      segments.push({ text: remaining[0] });
      remaining = remaining.slice(1);
    } else {
      segments.push({ text: remaining.slice(0, nextSpecial) });
      remaining = remaining.slice(nextSpecial);
    }
  }

  return segments;
}

/**
 * Create a new document YDoc with the required BlockSuite structure.
 */
export function createDocYDoc(
  title: string,
  markdown?: string
): { ydoc: Y.Doc; docId: string } {
  const docId = nanoid(21);
  const ydoc = new Y.Doc();
  const blocks = ydoc.getMap("blocks");

  // IDs
  const pageId = nanoid(21);
  const surfaceId = nanoid(21);
  const noteId = nanoid(21);

  // Page block (root)
  const pageBlock = new Y.Map<unknown>();
  pageBlock.set("sys:id", pageId);
  pageBlock.set("sys:flavour", "affine:page");
  const pageChildren = new Y.Array<string>();
  pageChildren.push([surfaceId, noteId]);
  pageBlock.set("sys:children", pageChildren);
  const titleText = new Y.Text();
  titleText.insert(0, title);
  pageBlock.set("prop:title", titleText);
  blocks.set(pageId, pageBlock);

  // Surface block
  const surfaceBlock = new Y.Map<unknown>();
  surfaceBlock.set("sys:id", surfaceId);
  surfaceBlock.set("sys:flavour", "affine:surface");
  surfaceBlock.set("sys:children", new Y.Array<string>());
  blocks.set(surfaceId, surfaceBlock);

  // Note block (content container)
  const noteBlock = new Y.Map<unknown>();
  noteBlock.set("sys:id", noteId);
  noteBlock.set("sys:flavour", "affine:note");
  const noteChildren = new Y.Array<string>();
  noteBlock.set("sys:children", noteChildren);
  blocks.set(noteId, noteBlock);

  // Add content blocks from markdown
  if (markdown) {
    const ops = parseMarkdownToBlockOps(markdown);
    for (const op of ops) {
      const blockId = nanoid(21);
      const block = new Y.Map<unknown>();
      block.set("sys:id", blockId);
      block.set("sys:flavour", op.flavour);
      block.set("sys:children", new Y.Array<string>());

      if (op.type) {
        block.set("prop:type", op.type);
      }

      if (op.flavour === "affine:code") {
        const codeText = new Y.Text();
        codeText.insert(0, op.text);
        block.set("prop:text", codeText);
        if (op.language) {
          block.set("prop:language", op.language);
        }
      } else if (op.flavour === "affine:divider") {
        // Dividers have no text
      } else {
        const ytext = new Y.Text();
        insertMarkdownText(ytext, op.text);
        block.set("prop:text", ytext);
      }

      // Handle todo checked state
      if (op.flavour === "affine:list" && op.type === "todo") {
        block.set("prop:checked", false);
      }

      blocks.set(blockId, block);
      noteChildren.push([blockId]);
    }
  }

  return { ydoc, docId };
}

// ─── Block Editing Operations ───────────────────────────────────────────────

/**
 * Apply edit operations to an existing document.
 */
export async function applyEditOperations(
  docId: string,
  operations: EditOperation[]
): Promise<string[]> {
  const ydoc = await loadYDoc(docId);
  const blocks = ydoc.getMap("blocks");
  const blockIds: string[] = [];

  // Find the note block
  const allBlocks = getBlocks(ydoc);
  const pageBlock = findRootPageBlock(allBlocks);
  if (!pageBlock) throw new Error("Document has no page block");
  const noteBlock = findNoteBlock(allBlocks, pageBlock);
  if (!noteBlock) throw new Error("Document has no note block");

  const noteYMap = blocks.get(noteBlock.id) as Y.Map<unknown>;
  const noteChildren = noteYMap.get("sys:children") as Y.Array<string>;

  for (const op of operations) {
    switch (op.action) {
      case "append": {
        const blockId = nanoid(21);
        const block = new Y.Map<unknown>();
        block.set("sys:id", blockId);

        const flavour = op.blockType?.includes(":") ? op.blockType : `affine:${op.blockType || "paragraph"}`;
        block.set("sys:flavour", flavour);
        block.set("sys:children", new Y.Array<string>());

        if (op.propType) {
          block.set("prop:type", op.propType);
        } else if (flavour === "affine:paragraph") {
          block.set("prop:type", "text");
        }

        if (flavour !== "affine:divider") {
          const ytext = new Y.Text();
          if (op.content) {
            insertMarkdownText(ytext, op.content);
          }
          block.set("prop:text", ytext);
        }

        blocks.set(blockId, block);
        noteChildren.push([blockId]);
        blockIds.push(blockId);
        break;
      }

      case "update": {
        if (!op.blockId) throw new Error("update operation requires blockId");
        const block = blocks.get(op.blockId) as Y.Map<unknown> | undefined;
        if (!block) throw new Error(`Block "${op.blockId}" not found`);

        if (op.content !== undefined) {
          const existingText = block.get("prop:text");
          if (existingText instanceof Y.Text) {
            existingText.delete(0, existingText.length);
            insertMarkdownText(existingText, op.content);
          }
        }

        if (op.propType) {
          block.set("prop:type", op.propType);
        }

        blockIds.push(op.blockId);
        break;
      }

      case "delete": {
        if (!op.blockId) throw new Error("delete operation requires blockId");

        // Remove from note children
        for (let i = 0; i < noteChildren.length; i++) {
          if (noteChildren.get(i) === op.blockId) {
            noteChildren.delete(i, 1);
            break;
          }
        }

        // Delete the block itself
        blocks.delete(op.blockId);
        blockIds.push(op.blockId);
        break;
      }
    }
  }

  await pushYDoc(docId, ydoc);
  return blockIds;
}
