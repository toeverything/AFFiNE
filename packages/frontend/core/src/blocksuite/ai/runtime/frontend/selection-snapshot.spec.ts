import type { EditorHost } from '@blocksuite/affine/std';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@blocksuite/affine/shared/services', () => ({
  DocModeProvider: 'mode',
}));
vi.mock('@blocksuite/affine/std', () => ({ TextSelection: 'text' }));
vi.mock('@blocksuite/affine/std/gfx', () => ({
  GfxControllerIdentifier: 'gfx',
  isPrimitiveModel: () => false,
}));
vi.mock('@blocksuite/global/gfx', () => ({
  Bound: { deserialize: () => ({ x: 0, y: 0, w: 1, h: 1 }) },
}));
vi.mock('../../utils/selection-utils', () => ({
  getSelectedModels: (host: ReturnType<typeof editor>) => host.models,
  getSelectedTextContent: (host: ReturnType<typeof editor>) => {
    // Stand-in for the native adapter: copy the selected slice before awaiting.
    const content = host.models
      .map(model => {
        const point = [host.range?.from, host.range?.to].find(
          point => point?.blockId === model.id
        );
        return point
          ? model.value.slice(point.index, point.index + point.length)
          : model.value;
      })
      .join('\n');
    return host.wait.then(() => content);
  },
}));

import { DelegatedEditorHost } from './delegated-editor-host';
import {
  captureSelectionView,
  getLiveSelectionSignature,
  lightEditorContext,
  readSelection,
} from './live-projection';

function editor(values = ['LEFT SELECTED RIGHT']) {
  const models = values.map((value, index) => ({
    id: `block-${index}`,
    flavour: 'affine:paragraph',
    value,
    text: { toString: () => modelValue(index) },
    children: [],
  }));
  const modelValue = (index: number) => models[index].value;
  const range = {
    from: { blockId: 'block-0', index: 5, length: 8 },
    to: null as { blockId: string; index: number; length: number } | null,
    reverse: false,
    isCollapsed() {
      return !this.to && this.from.length === 0;
    },
    toJSON() {
      return { from: this.from, to: this.to, reverse: this.reverse };
    },
  };
  const parent = { children: models };
  const host = {
    models,
    range: range as typeof range | undefined,
    wait: Promise.resolve(),
    selection: { find: () => host.range },
    store: { readonly$: { value: false } },
    std: {
      get: (key: string) =>
        key === 'mode' ? { getEditorMode: () => 'page' } : {},
    },
  };
  models.forEach(model => Object.assign(model, { parent }));
  return host;
}
const cast = (host: ReturnType<typeof editor>) => host as unknown as EditorHost;

describe('exact selection reads and submit-time capture', () => {
  test('a legacy limit100 cannot shorten a1000-character selection', async () => {
    const host = editor(['x'.repeat(1000)]);
    host.range = undefined;
    expect(
      await readSelection(cast(host), 'state', { format: 'text', limit: 100 })
    ).toMatchObject({ content: 'x'.repeat(1000), truncated: false });
  });

  test('legacy live reads report the unchanged budget explicitly instead of returning cropped text', async () => {
    const host = editor(['x'.repeat(10_001)]);
    host.range = undefined;
    const request = vi.fn().mockResolvedValue({ ok: true });
    const delegated = new DelegatedEditorHost({
      host: cast(host),
      realtime: { request } as never,
      workspaceId: 'workspace',
      docId: 'doc',
      sessionId: 'session',
    });
    const internal = delegated as unknown as {
      editorStateId: string;
      respond(request: unknown): Promise<void>;
    };
    await internal.respond({
      requestId: 'request',
      runId: 'run',
      toolCallId: 'call',
      sessionId: 'session',
      workspaceId: 'workspace',
      docId: 'doc',
      clientId: delegated.clientId,
      editorStateId: internal.editorStateId,
      deadlineAt: Date.now() + 10_000,
      tool: 'frontend_read_selection',
      args: { format: 'text' },
    });
    expect(request).toHaveBeenCalledWith(
      'copilot.delegated.tool.respond',
      expect.objectContaining({
        error: expect.objectContaining({
          code: 'SELECTION_READ_BUDGET_EXCEEDED',
          retryable: false,
          message: expect.stringContaining(
            'No shortened selection was returned'
          ),
        }),
      })
    );
  });

  test('structure contains exactly the selected character range', async () => {
    const host = editor();
    const result = await readSelection(cast(host), 'state', {
      format: 'structure',
    });
    expect(result).toMatchObject({
      blocks: [{ text: { content: 'SELECTED', truncated: false } }],
      neighborhood: [],
    });
    expect(JSON.stringify(result)).not.toContain('LEFT');
    expect(JSON.stringify(result)).not.toContain('RIGHT');
  });

  test('lightweight context and neighborhood0 contain no paragraph previews', async () => {
    const host = editor();
    expect(lightEditorContext(cast(host), 'state')).not.toHaveProperty(
      'preview'
    );
    for (const neighborhood of [0, 1, 20, 100]) {
      const result = await readSelection(cast(host), 'state', {
        format: 'text',
        neighborhood,
        limit: 1,
        block_ids: ['unselected-block'],
        offset: 100,
      });
      expect(result).toMatchObject({ content: 'SELECTED', neighborhood: [] });
      expect(JSON.stringify(result)).not.toContain('LEFT');
    }
  });

  test('Unicode, reversed range, and multiple endpoints remain exact', async () => {
    const host = editor(['LEFT ä🙂中', 'middle', 'last RIGHT']);
    host.range!.from = { blockId: 'block-0', index: 5, length: 4 };
    host.range!.to = { blockId: 'block-2', index: 0, length: 4 };
    host.range!.reverse = true;
    const result = await readSelection(cast(host), 'state', {
      format: 'structure',
    });
    expect(result).toMatchObject({
      blocks: [
        { text: { content: 'ä🙂中' } },
        { text: { content: 'middle' } },
        { text: { content: 'last' } },
      ],
    });
  });

  test('collapsed selection is empty instead of the containing paragraph', async () => {
    const host = editor();
    host.range!.from.length = 0;
    expect(
      await readSelection(cast(host), 'state', { format: 'text' })
    ).toMatchObject({ content: '' });
    expect(
      await readSelection(cast(host), 'state', { format: 'structure' })
    ).toMatchObject({ blocks: [] });
  });

  test('changing characters within the same block changes the live identity', () => {
    const host = editor();
    const before = getLiveSelectionSignature(cast(host));
    host.range!.from.index = 0;
    expect(getLiveSelectionSignature(cast(host))).not.toBe(before);
  });

  test('capture freezes selection and text before asynchronous export finishes', async () => {
    const host = editor();
    let release!: () => void;
    host.wait = new Promise(resolve => {
      release = resolve;
    });
    const delegated = new DelegatedEditorHost({
      host: cast(host),
      realtime: {} as never,
      workspaceId: 'workspace',
      docId: 'doc',
      sessionId: '',
    });
    const pending = delegated.captureSelection();
    host.range!.from = { blockId: 'block-0', index: 0, length: 4 };
    host.models[0].value = 'DOCUMENT CHANGED';
    release();
    const capture = await pending;
    expect(capture.views.text.content).toBe('SELECTED');
    expect(capture.views.markdown.content).toBe('SELECTED');
    expect(capture.views.structure.blocks?.[0].text.content).toBe('SELECTED');
    expect(capture.views.text.editor_state_id).toBe(
      capture.views.structure.editor_state_id
    );
    const next = await delegated.captureSelection();
    expect(next.views.text.content).toBe('DOCU');
    expect(next.views.text.editor_state_id).not.toBe(
      capture.views.text.editor_state_id
    );
  });

  test('capture export failure rejects; it never substitutes another live selection', async () => {
    const host = editor();
    host.wait = Promise.reject(new Error('adapter failed'));
    const delegated = new DelegatedEditorHost({
      host: cast(host),
      realtime: {} as never,
      workspaceId: 'workspace',
      docId: 'doc',
      sessionId: '',
    });
    await expect(delegated.captureSelection()).rejects.toThrow(
      'adapter failed'
    );
  });

  test('existing character and block budgets are unchanged', async () => {
    const host = editor(['x'.repeat(60_000)]);
    host.range = undefined;
    expect(
      await captureSelectionView(cast(host), 's', { format: 'text' })
    ).toMatchObject({ content: 'x'.repeat(10_000), truncated: true });
    expect(
      await captureSelectionView(cast(host), 's', {
        format: 'text',
        limit: 100,
      })
    ).toMatchObject({ content: 'x'.repeat(100), truncated: true });
    expect(
      await captureSelectionView(cast(host), 's', {
        format: 'text',
        limit: 999_999,
      })
    ).toMatchObject({ content: 'x'.repeat(50_000), truncated: true });
    const many = editor(Array.from({ length: 64 }, () => 'text'));
    many.range = undefined;
    const result = await captureSelectionView(cast(many), 's', {
      format: 'structure',
    });
    expect('blocks' in result && result.blocks).toHaveLength(50);
    expect(result.truncated).toBe(true);
    expect(lightEditorContext(cast(many), 's').selection.ids).toHaveLength(50);
  });
});
