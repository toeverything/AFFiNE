import { readEditorSelectionSnapshot } from '@affine/realtime';
import { describe, expect, test, vi } from 'vitest';

vi.mock('../../../base', () => ({ OnEvent: () => () => {} }));
vi.mock('../../../core/permission', () => ({ PermissionAccess: class {} }));
vi.mock('../../../core/realtime', () => ({
  RealtimePublisher: class {},
  realtimeUserRoom: () => 'room',
}));
vi.mock('../access', () => ({ CopilotAccessService: class {} }));

import { parseEditorSelectionSnapshot } from './selection-snapshot';
import { DelegatedEditorService } from './service';

function snapshot(content = 'SELECTION A') {
  const view = {
    editor_state_id: `snapshot-${content}`,
    mode: 'page' as const,
    content,
    truncated: false,
    block_ids: ['block-1'],
    block_ids_truncated: false,
    neighborhood: [],
  };
  const structure = {
    editor_state_id: view.editor_state_id,
    mode: view.mode,
    blocks: [
      {
        id: 'block-1',
        flavour: 'affine:paragraph',
        text: { content, truncated: false },
        child_ids: [],
        child_ids_truncated: false,
      },
    ],
    truncated: false,
    neighborhood: [],
  };
  return {
    version: 1 as const,
    workspaceId: 'workspace',
    docId: 'doc',
    readonly: false,
    views: { text: { ...view }, markdown: { ...view }, structure },
  };
}

function service() {
  const assert = vi.fn().mockResolvedValue(undefined);
  const access = { sessionResource: vi.fn().mockResolvedValue('canonical') };
  const publisher = { publish: vi.fn() };
  const instance = new DelegatedEditorService(
    publisher as never,
    access as never,
    { user: () => ({ workspace: () => ({ assert }) }) } as never
  );
  return { instance, access, assert, publisher };
}

describe('turn-bound selection snapshot', () => {
  test('serves snapshot A with its identity without any live editor or lease', async () => {
    const { instance, publisher, access, assert } = service();
    const captured = snapshot();
    const result = await instance.executeSelectionSnapshot(
      {
        user: 'user',
        session: 'session',
        workspace: 'workspace',
        editorSelectionSnapshot: captured,
      },
      'frontend_read_selection',
      { format: 'text' }
    );
    expect(result).toMatchObject({
      content: 'SELECTION A',
      editor_state_id: 'snapshot-SELECTION A',
      source: { doc_id: 'doc', revision: 'snapshot-SELECTION A' },
    });
    expect(publisher.publish).not.toHaveBeenCalled();
    expect(access.sessionResource).toHaveBeenCalledWith(
      {
        userId: 'user',
        workspaceId: 'workspace',
        docId: 'doc',
        action: 'Doc.Read',
      },
      ['session']
    );
    expect(assert).toHaveBeenCalledWith('Workspace.Copilot');
  });

  test('different in-flight turns cannot replace each other and callers cannot mutate the stored view', async () => {
    const { instance } = service();
    const a = {
      user: 'user',
      session: 'session',
      workspace: 'workspace',
      editorSelectionSnapshot: snapshot('A'),
    };
    const b = { ...a, editorSelectionSnapshot: snapshot('B') };
    const [ra, rb] = await Promise.all([
      instance.executeSelectionSnapshot(a, 'frontend_read_selection', {}),
      instance.executeSelectionSnapshot(b, 'frontend_read_selection', {}),
    ]);
    expect(ra).toMatchObject({ content: 'A' });
    expect(rb).toMatchObject({ content: 'B' });
    Object.assign(ra, { content: 'changed' });
    expect(
      await instance.executeSelectionSnapshot(a, 'frontend_read_selection', {})
    ).toMatchObject({ content: 'A' });
  });

  test('state tool identifies the same frozen selection', async () => {
    const { instance } = service();
    expect(
      await instance.executeSelectionSnapshot(
        {
          user: 'user',
          session: 'session',
          workspace: 'workspace',
          editorSelectionSnapshot: snapshot(),
        },
        'frontend_get_editor_state',
        {}
      )
    ).toMatchObject({
      editor_state_id: 'snapshot-SELECTION A',
      selection: { ids: ['block-1'] },
    });
  });

  test('invalid or cross-workspace captures fail closed without a live request', async () => {
    const { instance, access, publisher } = service();
    for (const value of [null, {}, { ...snapshot(), workspaceId: 'other' }]) {
      expect(
        await instance.executeSelectionSnapshot(
          {
            user: 'user',
            session: 'session',
            workspace: 'workspace',
            editorSelectionSnapshot: value,
          },
          'frontend_read_selection',
          {}
        )
      ).toMatchObject({ error: { code: 'INVALID_SELECTION_SNAPSHOT' } });
    }
    expect(access.sessionResource).not.toHaveBeenCalled();
    expect(publisher.publish).not.toHaveBeenCalled();
  });

  test('revoked permission and cancellation cannot expose captured text', async () => {
    const { instance, access } = service();
    const options = {
      user: 'user',
      session: 'session',
      workspace: 'workspace',
      editorSelectionSnapshot: snapshot(),
    };
    access.sessionResource.mockRejectedValueOnce(
      new Error('permission denied')
    );
    await expect(
      instance.executeSelectionSnapshot(options, 'frontend_read_selection', {})
    ).rejects.toThrow('permission denied');
    const controller = new AbortController();
    controller.abort();
    expect(
      await instance.executeSelectionSnapshot(
        options,
        'frontend_read_selection',
        {},
        controller.signal
      )
    ).toMatchObject({ error: { code: 'ABORTED' } });
    expect(access.sessionResource).toHaveBeenCalledTimes(1);
  });

  test('snapshot bounds and existing selection budgets remain unchanged', () => {
    const captured = snapshot('x'.repeat(50_000));
    // Use a bounded identity separately from content in this large fixture.
    for (const view of Object.values(captured.views))
      view.editor_state_id = 'state';
    const parsed = parseEditorSelectionSnapshot(captured);
    expect(parsed).toBeDefined();
    if (!parsed) throw new Error('Expected a valid bounded snapshot');
    for (const args of [{}, { limit: 100 }, { limit: 999_999 }]) {
      expect(() => readEditorSelectionSnapshot(parsed, args)).toThrow(
        'No shortened selection was returned'
      );
    }
    const shortCapture = snapshot('x'.repeat(1000));
    for (const view of Object.values(shortCapture.views))
      view.editor_state_id = 'short-state';
    const small = parseEditorSelectionSnapshot(shortCapture);
    expect(small).toBeDefined();
    if (!small) throw new Error('Expected a valid short snapshot');
    for (const args of [
      { limit: 100 },
      { neighborhood: 100 },
      { limit: 1, neighborhood: 100, block_ids: ['other'], offset: 100 },
    ]) {
      const result = readEditorSelectionSnapshot(small, args);
      expect(result.content).toHaveLength(1000);
      expect(result.neighborhood).toEqual([]);
    }
    captured.views.text.content += 'x';
    expect(parseEditorSelectionSnapshot(captured)).toBeUndefined();
  });

  test('different view identities and more than50 blocks are rejected', () => {
    const captured = snapshot();
    captured.views.markdown.editor_state_id = 'other';
    expect(parseEditorSelectionSnapshot(captured)).toBeUndefined();
    const many = snapshot();
    many.views.structure.blocks = Array.from(
      { length: 51 },
      () => many.views.structure.blocks[0]
    );
    expect(parseEditorSelectionSnapshot(many)).toBeUndefined();
  });
});
