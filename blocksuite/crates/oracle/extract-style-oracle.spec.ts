import '@toeverything/theme/style.css';
import '@toeverything/theme/fonts.css';

import { AffineSchemas } from '@blocksuite/affine/schemas';
import { REFERENCE_NODE } from '@blocksuite/affine-shared/consts';
import {
  CommunityCanvasTextFonts,
  FontConfigExtension,
} from '@blocksuite/affine/shared/services';
import type { SurfaceBlockModel } from '@blocksuite/affine/blocks/surface';
import type { DocMode } from '@blocksuite/affine/model';
import { Schema, Text } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { TestAffineEditorContainer } from '@blocksuite/integration-test';
import { effects } from '@blocksuite/integration-test/effects';
import { getTestStoreManager } from '@blocksuite/integration-test/store';
import { getTestViewManager } from '@blocksuite/integration-test/view';
import { describe, expect, test } from 'vitest';
import { commands } from 'vitest/browser';

declare module 'vitest/browser' {
  interface BrowserCommands {
    writeStyleOracle: (jsonText: string) => Promise<string>;
  }
}

const storeManager = getTestStoreManager();
const viewManager = getTestViewManager();
effects();
const storeExtensions = storeManager.get('store');

interface StyleSample {
  tag: string;
  class_name: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computed: {
    display: string;
    box_sizing: string;
    color: string;
    background_color: string;
    border_top_color: string;
    border_top_width: string;
    border_radius: string;
    box_shadow: string;
    font_family: string;
    font_size: string;
    font_weight: string;
    font_style: string;
    line_height: string;
    letter_spacing: string;
    text_decoration_line: string;
    padding_top: string;
    padding_right: string;
    padding_bottom: string;
    padding_left: string;
    margin_top: string;
    margin_right: string;
    margin_bottom: string;
    margin_left: string;
    transition_property: string;
    transition_duration: string;
    transition_timing_function: string;
  };
  baseline_offset_px: number | null;
}

interface PseudoStyleSample {
  content: string;
  position: string;
  width: string;
  height: string;
  left: string;
  top: string;
  margin_top: string;
  margin_bottom: string;
  background_color: string;
  border_radius: string;
}

interface ThemeOracle {
  theme: 'light' | 'dark';
  viewport: { width: number; height: number };
  root_css_vars: Record<string, string>;
  page_blocks: Record<string, StyleSample | null>;
  quote_accent_bar: PseudoStyleSample | null;
  inline_formats: Record<string, StyleSample | null>;
  edgeless_blocks: Record<string, StyleSample | null>;
  edgeless_surface_models: Record<string, Record<string, unknown>>;
  transitions: Record<
    string,
    { property: string; duration: string; timing_function: string }
  >;
}

const ROOT_CSS_VARS = [
  '--affine-theme-mode',
  '--affine-font-family',
  '--affine-font-code-family',
  '--affine-font-base',
  '--affine-font-sm',
  '--affine-font-xs',
  '--affine-font-h-1',
  '--affine-font-h-2',
  '--affine-font-h-3',
  '--affine-font-h-4',
  '--affine-font-h-5',
  '--affine-font-h-6',
  '--affine-line-height',
  '--affine-editor-width',
  '--affine-paragraph-space',
  '--affine-popover-radius',
  '--affine-text-primary-color',
  '--affine-text-secondary-color',
  '--affine-background-primary-color',
  '--affine-background-code-block',
  '--affine-divider-color',
  '--affine-quote-color',
  '--affine-link-color',
  '--affine-edgeless-grid-color',
];

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const STRUCTURAL_TAGS = new Set([
  'affine-note',
  'affine-edgeless-note',
  'affine-edgeless-root',
  'edgeless-note-background',
  'affine-divider',
  'hr',
  'affine-image',
  'affine-surface',
]);

function measureBaselineOffset(el: Element): number | null {
  try {
    const tag = el.tagName.toLowerCase();
    if (STRUCTURAL_TAGS.has(tag)) return null;
    if (
      el.classList.contains('affine-divider-block-container') ||
      el.classList.contains('affine-bookmark-card') ||
      el.classList.contains('affine-list-block__todo-prefix')
    ) {
      return null;
    }

    // Find the element's own inline text target without descending into child blocks
    const inlineRoot =
      el.querySelector(':scope > rich-text .inline-editor, :scope > .affine-list-rich-text-wrapper rich-text .inline-editor') ??
      el;

    const walker = document.createTreeWalker(inlineRoot, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.textContent || !node.textContent.trim()) {
          return NodeFilter.FILTER_SKIP;
        }
        const parentBlock = (node.parentElement as HTMLElement | null)?.closest(
          '[data-block-id]'
        );
        const hostBlock = (el as HTMLElement).closest('[data-block-id]');
        if (parentBlock && hostBlock && parentBlock !== hostBlock) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });

    const textNode = walker.nextNode();
    if (!textNode || !textNode.parentNode) return null;

    const marker = document.createElement('span');
    marker.setAttribute('data-oracle-baseline', '1');
    marker.style.cssText =
      'display:inline-block;width:0;height:0;margin:0;border:0;padding:0;vertical-align:baseline;line-height:0;';

    textNode.parentNode.insertBefore(marker, textNode);
    try {
      const markerRect = marker.getBoundingClientRect();
      const hostRect = el.getBoundingClientRect();
      if (hostRect.height === 0) return null;
      const offset = round2(markerRect.bottom - hostRect.top);
      return offset >= 0 ? offset : null;
    } finally {
      marker.remove();
    }
  } catch {
    return null;
  }
}

function sampleElement(
  el: Element | null,
  originRect?: DOMRect
): StyleSample | null {
  if (!el) return null;
  const cs = window.getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const ox = originRect ? originRect.left : 0;
  const oy = originRect ? originRect.top : 0;

  return {
    tag: el.tagName.toLowerCase(),
    class_name: typeof (el as HTMLElement).className === 'string'
      ? (el as HTMLElement).className
      : '',
    rect: {
      x: round2(r.left - ox),
      y: round2(r.top - oy),
      width: round2(r.width),
      height: round2(r.height),
    },
    computed: {
      display: cs.display,
      box_sizing: cs.boxSizing,
      color: cs.color,
      background_color: cs.backgroundColor,
      border_top_color: cs.borderTopColor,
      border_top_width: cs.borderTopWidth,
      border_radius: cs.borderRadius,
      box_shadow: cs.boxShadow,
      font_family: cs.fontFamily,
      font_size: cs.fontSize,
      font_weight: cs.fontWeight,
      font_style: cs.fontStyle,
      line_height: cs.lineHeight,
      letter_spacing: cs.letterSpacing,
      text_decoration_line: cs.textDecorationLine,
      padding_top: cs.paddingTop,
      padding_right: cs.paddingRight,
      padding_bottom: cs.paddingBottom,
      padding_left: cs.paddingLeft,
      margin_top: cs.marginTop,
      margin_right: cs.marginRight,
      margin_bottom: cs.marginBottom,
      margin_left: cs.marginLeft,
      transition_property: cs.transitionProperty,
      transition_duration: cs.transitionDuration,
      transition_timing_function: cs.transitionTimingFunction,
    },
    baseline_offset_px: measureBaselineOffset(el),
  };
}

async function flushFrames() {
  await new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

function createCanonicalCollection() {
  const schema = new Schema();
  schema.register(AffineSchemas);
  const collection = new TestWorkspace({
    id: 'style-oracle-room',
    schema,
    idGenerator: createAutoIncrementIdGenerator(),
  });
  collection.storeExtensions = storeExtensions;
  collection.meta.initialize();

  const linkedDoc = collection.createDoc('doc:linked').getStore();
  linkedDoc.load(() => {
    const pId = linkedDoc.addBlock('affine:page', {
      title: new Text('Linked Target Page'),
    });
    linkedDoc.addBlock('affine:surface', {}, pId);
  });

  const doc = collection.createDoc('doc:oracle').getStore();
  const blockIds: Record<string, string> = {};

  doc.load(() => {
    const pageId = doc.addBlock('affine:page', {
      title: new Text('Canonical Style Oracle Document'),
    });
    blockIds.page = pageId;

    const surfaceId = doc.addBlock('affine:surface', {}, pageId);
    blockIds.surface = surfaceId;

    const noteId = doc.addBlock(
      'affine:note',
      {
        xywh: '[0, 0, 800, 600]',
      },
      pageId
    );
    blockIds.note = noteId;

    // Headings h1..h6
    for (const level of ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const) {
      blockIds[level] = doc.addBlock(
        'affine:paragraph',
        {
          type: level,
          text: new Text(`Heading ${level.toUpperCase()} Sample`),
        },
        noteId
      );
    }

    // Rich inline formatted paragraph
    const richText = new Text([
      { insert: 'Plain ' },
      { insert: 'Bold', attributes: { bold: true } },
      { insert: ' ' },
      { insert: 'Italic', attributes: { italic: true } },
      { insert: ' ' },
      { insert: 'Underline', attributes: { underline: true } },
      { insert: ' ' },
      { insert: 'Strike', attributes: { strike: true } },
      { insert: ' ' },
      { insert: 'inlineCode()', attributes: { code: true } },
      { insert: ' ' },
      {
        insert: 'AffineLink',
        attributes: { link: 'https://affine.pro' },
      },
      { insert: ' ' },
      {
        insert: REFERENCE_NODE,
        attributes: {
          reference: {
            type: 'LinkedPage',
            pageId: 'doc:linked',
          },
        },
      },
    ]);
    blockIds.paragraph_rich = doc.addBlock(
      'affine:paragraph',
      {
        type: 'text',
        text: richText,
      },
      noteId
    );

    // Quote
    blockIds.quote = doc.addBlock(
      'affine:paragraph',
      {
        type: 'quote',
        text: new Text('Quoted block text with vertical accent bar.'),
      },
      noteId
    );

    // Lists: bulleted (with nested child), numbered, todo unchecked/checked, toggle (with child)
    const bulletedId = doc.addBlock(
      'affine:list',
      {
        type: 'bulleted',
        text: new Text('Bulleted parent item'),
      },
      noteId
    );
    blockIds.list_bulleted = bulletedId;
    blockIds.list_bulleted_nested = doc.addBlock(
      'affine:list',
      {
        type: 'bulleted',
        text: new Text('Nested bulleted child item'),
      },
      bulletedId
    );

    blockIds.list_numbered = doc.addBlock(
      'affine:list',
      {
        type: 'numbered',
        text: new Text('Numbered list item'),
      },
      noteId
    );

    blockIds.list_todo_unchecked = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        checked: false,
        text: new Text('Todo unchecked item'),
      },
      noteId
    );

    blockIds.list_todo_checked = doc.addBlock(
      'affine:list',
      {
        type: 'todo',
        checked: true,
        text: new Text('Todo checked item'),
      },
      noteId
    );

    const toggleId = doc.addBlock(
      'affine:list',
      {
        type: 'toggle',
        collapsed: false,
        text: new Text('Toggle parent item'),
      },
      noteId
    );
    blockIds.list_toggle = toggleId;
    blockIds.list_toggle_child = doc.addBlock(
      'affine:paragraph',
      {
        type: 'text',
        text: new Text('Toggle child paragraph'),
      },
      toggleId
    );

    // Code block
    blockIds.code = doc.addBlock(
      'affine:code',
      {
        language: 'rust',
        text: new Text('fn main() {\n    println!("native-playground");\n}'),
      },
      noteId
    );

    // Divider
    blockIds.divider = doc.addBlock('affine:divider', {}, noteId);

    // Bookmark
    blockIds.bookmark = doc.addBlock(
      'affine:bookmark',
      {
        url: 'https://affine.pro',
        title: 'AFFiNE Workspace',
        description: 'Canonical bookmark card for style oracle measurement.',
      },
      noteId
    );

    // Edgeless surface elements: shape + connector
    const surface = doc.getBlock(surfaceId)?.model as SurfaceBlockModel;
    const shapeAId = surface.addElement({
      type: 'shape',
      shapeType: 'rect',
      xywh: '[900, 80, 180, 100]',
      radius: 0.1,
    });
    const shapeBId = surface.addElement({
      type: 'shape',
      shapeType: 'ellipse',
      xywh: '[1160, 80, 160, 100]',
    });
    const connectorId = surface.addElement({
      type: 'connector',
      mode: 1,
      source: { id: shapeAId },
      target: { id: shapeBId },
    });
    blockIds.surface_shape_rect = shapeAId;
    blockIds.surface_shape_ellipse = shapeBId;
    blockIds.surface_connector = connectorId;
  });

  doc.resetHistory();
  return { collection, doc, blockIds };
}

async function mountEditor(
  doc: ReturnType<TestWorkspace['createDoc']>['getStore'] extends () => infer R
    ? R
    : never,
  mode: DocMode,
  theme: 'light' | 'dark'
) {
  document.documentElement.setAttribute('data-theme', theme);
  document.body.style.margin = '0';
  document.body.style.width = '1280px';
  document.body.style.height = '800px';

  const container = document.createElement('div');
  container.style.width = '1280px';
  container.style.height = '800px';
  container.style.overflow = 'auto';

  const editor = new TestAffineEditorContainer();
  editor.doc = doc;
  editor.mode = mode;
  editor.pageSpecs = [
    ...viewManager.get('page'),
    FontConfigExtension(CommunityCanvasTextFonts),
  ];
  editor.edgelessSpecs = [
    ...viewManager.get('edgeless'),
    FontConfigExtension(CommunityCanvasTextFonts),
  ];

  container.append(editor);
  document.body.append(container);
  await editor.updateComplete;
  await flushFrames();

  return {
    editor,
    cleanup: async () => {
      editor.remove();
      container.remove();
      await flushFrames();
    },
  };
}

function queryBlockElement(
  editor: TestAffineEditorContainer,
  blockId: string
): HTMLElement | null {
  return (
    (editor.host?.view.getBlock(blockId) as HTMLElement | null) ??
    document.querySelector(`[data-block-id="${blockId}"]`)
  );
}

async function captureThemeOracle(
  theme: 'light' | 'dark'
): Promise<{ oracle: ThemeOracle; pageMs: number; edgelessMs: number }> {
  const { doc, blockIds } = createCanonicalCollection();

  // 1. Page Mode measurement
  const tPageStart = performance.now();
  const pageMount = await mountEditor(doc, 'page', theme);

  const rootStyle = window.getComputedStyle(document.documentElement);
  const rootCssVars: Record<string, string> = {};
  for (const name of ROOT_CSS_VARS) {
    rootCssVars[name] = rootStyle.getPropertyValue(name).trim();
  }

  const noteEl = queryBlockElement(pageMount.editor, blockIds.note);
  const originRect = noteEl?.getBoundingClientRect();

  const pageBlocks: Record<string, StyleSample | null> = {};
  pageBlocks.page_title = sampleElement(
    document.querySelector('doc-title .inline-editor') ??
      document.querySelector('doc-title'),
    originRect
  );
  pageBlocks.note = sampleElement(noteEl, originRect);

  for (const key of [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'paragraph_rich',
    'quote',
    'list_bulleted',
    'list_bulleted_nested',
    'list_numbered',
    'list_todo_unchecked',
    'list_todo_checked',
    'list_toggle',
    'list_toggle_child',
    'code',
    'divider',
    'bookmark',
  ]) {
    const blockEl = queryBlockElement(pageMount.editor, blockIds[key]);
    const inner =
      blockEl?.querySelector(
        '.affine-paragraph-rich-text-wrapper, .affine-list-block-container, .affine-code-block-container, .affine-divider-block-container, .affine-bookmark-card'
      ) ?? blockEl;
    pageBlocks[key] = sampleElement(inner, originRect);
  }

  // Sub-element details for quote bar (::after), divider hr, list prefix, code inline-editor
  const quoteEl = queryBlockElement(pageMount.editor, blockIds.quote);
  const quoteInner =
    quoteEl?.querySelector('.affine-paragraph-rich-text-wrapper.quote') ??
    quoteEl?.querySelector('.quote') ??
    null;
  let quoteAccentBar: PseudoStyleSample | null = null;
  if (quoteInner) {
    const afterCs = window.getComputedStyle(quoteInner, '::after');
    quoteAccentBar = {
      content: afterCs.content,
      position: afterCs.position,
      width: afterCs.width,
      height: afterCs.height,
      left: afterCs.left,
      top: afterCs.top,
      margin_top: afterCs.marginTop,
      margin_bottom: afterCs.marginBottom,
      background_color: afterCs.backgroundColor,
      border_radius: afterCs.borderRadius,
    };
  }
  const dividerEl = queryBlockElement(pageMount.editor, blockIds.divider);
  pageBlocks.divider_hr = sampleElement(
    dividerEl?.querySelector('hr') ?? null,
    originRect
  );
  const todoEl = queryBlockElement(pageMount.editor, blockIds.list_todo_unchecked);
  pageBlocks.list_todo_prefix = sampleElement(
    todoEl?.querySelector('.affine-list-block__todo-prefix') ?? null,
    originRect
  );
  const codeEl = queryBlockElement(pageMount.editor, blockIds.code);
  pageBlocks.code_inline_editor = sampleElement(
    codeEl?.querySelector('.inline-editor') ?? null,
    originRect
  );

  // Inline formatting samples inside rich paragraph (BlockSuite uses <affine-text><span>)
  const richEl = queryBlockElement(pageMount.editor, blockIds.paragraph_rich);
  const findInlineByText = (needle: string): Element | null => {
    if (!richEl) return null;
    for (const candidate of richEl.querySelectorAll('affine-text > span')) {
      if (candidate.textContent?.trim() === needle) {
        return candidate;
      }
    }
    return null;
  };
  const inlineFormats: Record<string, StyleSample | null> = {
    bold: sampleElement(
      richEl?.querySelector('strong') ?? findInlineByText('Bold'),
      originRect
    ),
    italic: sampleElement(
      richEl?.querySelector('em') ?? findInlineByText('Italic'),
      originRect
    ),
    underline: sampleElement(
      richEl?.querySelector('u') ?? findInlineByText('Underline'),
      originRect
    ),
    strike: sampleElement(
      richEl?.querySelector('s') ?? findInlineByText('Strike'),
      originRect
    ),
    inline_code: sampleElement(
      richEl?.querySelector('code') ?? findInlineByText('inlineCode()'),
      originRect
    ),
    link: sampleElement(
      richEl?.querySelector('affine-link a, a') ?? findInlineByText('AffineLink'),
      originRect
    ),
    reference: sampleElement(
      richEl?.querySelector('affine-reference') ?? null,
      originRect
    ),
  };

  // Capture representative CSS transitions
  const transitions: ThemeOracle['transitions'] = {};
  const collectTransition = (name: string, el: Element | null) => {
    if (!el) return;
    const cs = window.getComputedStyle(el);
    transitions[name] = {
      property: cs.transitionProperty,
      duration: cs.transitionDuration,
      timing_function: cs.transitionTimingFunction,
    };
  };
  collectTransition('paragraph_container', pageBlocks.paragraph_rich ? richEl?.querySelector('.affine-paragraph-block-container') ?? null : null);
  collectTransition('bookmark_card', queryBlockElement(pageMount.editor, blockIds.bookmark)?.querySelector('.affine-bookmark-card') ?? null);

  await pageMount.cleanup();
  const pageMs = round2(performance.now() - tPageStart);

  // 2. Edgeless Mode measurement (same reusable iframe!)
  const tEdgelessStart = performance.now();
  const edgelessMount = await mountEditor(doc, 'edgeless', theme);

  const edgelessRoot = document.querySelector('affine-edgeless-root');
  const edgelessOrigin = edgelessRoot?.getBoundingClientRect();
  const edgelessNoteEl = queryBlockElement(edgelessMount.editor, blockIds.note);
  const edgelessBlocks: Record<string, StyleSample | null> = {
    edgeless_root: sampleElement(edgelessRoot, edgelessOrigin),
    edgeless_note: sampleElement(edgelessNoteEl, edgelessOrigin),
    edgeless_note_background: sampleElement(
      edgelessNoteEl?.querySelector('edgeless-note-background') ?? null,
      edgelessOrigin
    ),
  };

  // Capture active editing transition on edgeless note background
  const edgelessNoteContainer = edgelessNoteEl?.querySelector(
    '.edgeless-note-container, [data-editing]'
  ) as HTMLElement | null;
  const noteBgInner =
    edgelessNoteEl?.querySelector('edgeless-note-background > div') ??
    edgelessNoteEl?.querySelector('edgeless-note-background') ??
    null;
  if (edgelessNoteContainer) {
    const prevEditing = edgelessNoteContainer.getAttribute('data-editing');
    edgelessNoteContainer.setAttribute('data-editing', 'true');
    collectTransition('edgeless_note_background_editing', noteBgInner);
    if (prevEditing === null) {
      edgelessNoteContainer.removeAttribute('data-editing');
    } else {
      edgelessNoteContainer.setAttribute('data-editing', prevEditing);
    }
  }
  collectTransition('edgeless_note_background', noteBgInner);

  const surface = doc.getBlock(blockIds.surface)?.model as SurfaceBlockModel;
  const shapeRect = surface.getElementById(blockIds.surface_shape_rect) as any;
  const shapeEllipse = surface.getElementById(
    blockIds.surface_shape_ellipse
  ) as any;
  const connector = surface.getElementById(blockIds.surface_connector) as any;

  const serializePoints = (pts: unknown): number[][] => {
    if (!Array.isArray(pts)) return [];
    return pts.map(p => {
      if (Array.isArray(p) && p.length >= 2) {
        return [round2(Number(p[0])), round2(Number(p[1]))];
      }
      if (p && typeof p === 'object' && '0' in p && '1' in p) {
        return [
          round2(Number((p as Record<number, unknown>)[0])),
          round2(Number((p as Record<number, unknown>)[1])),
        ];
      }
      return [];
    });
  };

  const edgelessSurfaceModels: ThemeOracle['edgeless_surface_models'] = {
    shape_rect: shapeRect
      ? {
          type: shapeRect.type,
          shapeType: shapeRect.shapeType,
          xywh: shapeRect.xywh,
          fillColor: shapeRect.fillColor,
          strokeColor: shapeRect.strokeColor,
          strokeWidth: shapeRect.strokeWidth,
          radius: shapeRect.radius,
        }
      : {},
    shape_ellipse: shapeEllipse
      ? {
          type: shapeEllipse.type,
          shapeType: shapeEllipse.shapeType,
          xywh: shapeEllipse.xywh,
          fillColor: shapeEllipse.fillColor,
          strokeColor: shapeEllipse.strokeColor,
          strokeWidth: shapeEllipse.strokeWidth,
        }
      : {},
    connector: connector
      ? {
          type: connector.type,
          mode: connector.mode,
          stroke: connector.stroke,
          strokeWidth: connector.strokeWidth,
          strokeStyle: connector.strokeStyle,
          frontEndpointStyle: connector.frontEndpointStyle,
          rearEndpointStyle: connector.rearEndpointStyle,
          path: serializePoints(connector.path),
          absolutePath: serializePoints(connector.absolutePath),
          labelXYWH: connector.labelXYWH ?? null,
        }
      : {},
  };

  await edgelessMount.cleanup();
  const edgelessMs = round2(performance.now() - tEdgelessStart);

  return {
    oracle: {
      theme,
      viewport: { width: 1280, height: 800 },
      root_css_vars: rootCssVars,
      page_blocks: pageBlocks,
      quote_accent_bar: quoteAccentBar,
      inline_formats: inlineFormats,
      edgeless_blocks: edgelessBlocks,
      edgeless_surface_models: edgelessSurfaceModels,
      transitions,
    },
    pageMs,
    edgelessMs,
  };
}

describe('style-oracle extractor', () => {
  test('extracts light and dark computed styles in reusable iframe', async () => {
    const light = await captureThemeOracle('light');
    const dark = await captureThemeOracle('dark');
    const warmLight = await captureThemeOracle('light');

    // Measure steady-state in-place scenario swap inside the reusable iframe
    const { doc: benchDoc, blockIds: benchIds } = createCanonicalCollection();
    const benchMount = await mountEditor(benchDoc, 'page', 'light');
    const tInPlaceStart = performance.now();
    document.documentElement.setAttribute('data-theme', 'dark');
    const h1El = queryBlockElement(benchMount.editor, benchIds.h1)?.querySelector(
      '.affine-paragraph-rich-text-wrapper'
    );
    const h1Sample = sampleElement(h1El ?? null);
    const inPlaceScenarioMs = round2(performance.now() - tInPlaceStart);
    await benchMount.cleanup();
    expect(h1Sample?.computed.font_size).toBe('28px');

    expect(light.oracle.root_css_vars['--affine-font-base']).toBe('15px');
    expect(light.oracle.root_css_vars['--affine-font-h-1']).toBe('28px');
    expect(light.oracle.page_blocks.h1?.computed.font_size).toBe('28px');
    expect(light.oracle.inline_formats.bold).not.toBeNull();
    expect(light.oracle.inline_formats.italic).not.toBeNull();
    expect(light.oracle.inline_formats.underline).not.toBeNull();
    expect(light.oracle.inline_formats.strike).not.toBeNull();
    expect(light.oracle.inline_formats.inline_code).not.toBeNull();
    expect(light.oracle.inline_formats.link).not.toBeNull();
    expect(light.oracle.inline_formats.reference).not.toBeNull();
    expect(light.oracle.page_blocks.quote).not.toBeNull();
    expect(light.oracle.quote_accent_bar).not.toBeNull();
    expect(light.oracle.quote_accent_bar?.width).toBe('2px');
    expect(light.oracle.page_blocks.code).not.toBeNull();
    expect(light.oracle.page_blocks.divider).not.toBeNull();
    expect(light.oracle.page_blocks.bookmark).not.toBeNull();
    expect(
      (light.oracle.edgeless_surface_models.connector?.absolutePath as unknown[])
        ?.length
    ).toBeGreaterThan(0);
    expect(dark.oracle.root_css_vars['--affine-theme-mode']).toBe('dark');
    expect(dark.oracle.page_blocks.h1?.computed.font_size).toBe('28px');
    expect(dark.oracle.quote_accent_bar?.width).toBe('2px');

    const timingsMs = {
      cold_light_page_ms: light.pageMs,
      cold_light_edgeless_ms: light.edgelessMs,
      warm_dark_page_ms: dark.pageMs,
      warm_dark_edgeless_ms: dark.edgelessMs,
      warm_light_page_ms: warmLight.pageMs,
      warm_light_edgeless_ms: warmLight.edgelessMs,
      in_place_reusable_iframe_scenario_ms: inPlaceScenarioMs,
    };

    const payload = {
      schema_version: 1,
      viewport: { width: 1280, height: 800 },
      themes: {
        light: light.oracle,
        dark: dark.oracle,
      },
    };

    const outPath = await commands.writeStyleOracle(
      `${JSON.stringify(payload, null, 2)}\n`
    );
    console.log(
      `STYLE_ORACLE_WRITTEN path=${outPath} timings=${JSON.stringify(timingsMs)}`
    );
  });
});
