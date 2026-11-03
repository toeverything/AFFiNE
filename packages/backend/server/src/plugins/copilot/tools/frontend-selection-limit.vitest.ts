import { readEditorSelectionSnapshot } from '@affine/realtime';
import { describe, expect, test, vi } from 'vitest';
import { z } from 'zod';

vi.mock('./tool', () => ({ defineTool: (tool: unknown) => tool }));

import { executeToolCall } from '../runtime/tool/bridge';
import {
  createFrontendNodesTool,
  createFrontendSelectionTool,
} from './frontend-read';

describe('selection tool has no model-controlled content boundaries', () => {
  test('selection schema exposes only representation while node reads remain unchanged', () => {
    const delegated = { execute: vi.fn() } as never;
    const selection = createFrontendSelectionTool(delegated, {});
    const nodes = createFrontendNodesTool(delegated, {});
    expect(
      Object.keys((selection.inputSchema as z.AnyZodObject).shape)
    ).toEqual(['format']);
    for (const args of [
      {},
      { format: 'text' },
      { format: 'markdown' },
      { format: 'structure' },
    ]) {
      expect(
        (selection.inputSchema as z.AnyZodObject).safeParse(args).success
      ).toBe(true);
    }
    expect(
      (nodes.inputSchema as z.ZodTypeAny).safeParse({
        block_ids: ['block'],
        limit: 100,
      }).success
    ).toBe(true);
  });

  test.each([
    { limit: 100 },
    { neighborhood: 0 },
    { neighborhood: 1 },
    { neighborhood: 100 },
    { limit: 100, neighborhood: 100 },
    { block_ids: ['unselected-block'] },
    { element_ids: ['unselected-element'] },
    { offset: 100 },
    { range: { start: 0, end: 100 } },
  ])('scope arguments are rejected before execution: %j', async args => {
    const execute = vi.fn();
    const tool = createFrontendSelectionTool({ execute } as never, {});
    const result = await executeToolCall(
      { frontend_read_selection: tool },
      {
        callId: 'call',
        name: 'frontend_read_selection',
        args: { format: 'text', ...args },
      },
      {}
    );
    expect(result.isError).toBe(true);
    expect(execute).not.toHaveBeenCalled();
  });

  test('a valid read delegates the complete captured selection without scope arguments', async () => {
    const executeSelectionSnapshot = vi.fn().mockResolvedValue({
      content: 'SELECTED '.repeat(100),
      truncated: false,
      neighborhood: [],
    });
    const captured = {};
    const options = { editorSelectionSnapshot: captured };
    const tool = createFrontendSelectionTool(
      { executeSelectionSnapshot } as never,
      options
    );
    const result = await executeToolCall(
      { frontend_read_selection: tool },
      {
        callId: 'call',
        name: 'frontend_read_selection',
        args: { format: 'text' },
      },
      {}
    );
    expect(result.isError).not.toBe(true);
    expect(result.output).toMatchObject({
      content: 'SELECTED '.repeat(100),
      truncated: false,
      neighborhood: [],
    });
    expect(executeSelectionSnapshot).toHaveBeenCalledWith(
      options,
      'frontend_read_selection',
      { format: 'text' },
      undefined
    );
  });

  test('budget failure becomes an explicit tool error with no partial text', async () => {
    const view = {
      editor_state_id: 'state',
      mode: 'page' as const,
      content: 'x'.repeat(10_001),
      truncated: false,
    };
    const snapshot = {
      version: 1 as const,
      workspaceId: 'workspace',
      docId: 'doc',
      readonly: false,
      views: { text: view, markdown: view, structure: view },
    };
    const executeSelectionSnapshot = vi.fn(() =>
      readEditorSelectionSnapshot(snapshot, {})
    );
    const tool = createFrontendSelectionTool(
      { executeSelectionSnapshot } as never,
      { editorSelectionSnapshot: snapshot }
    );
    const result = await executeToolCall(
      { frontend_read_selection: tool },
      {
        callId: 'call',
        name: 'frontend_read_selection',
        args: { format: 'text' },
      },
      {}
    );
    expect(result.isError).toBe(true);
    expect(result.output).toMatchObject({
      message: expect.stringContaining('No shortened selection was returned'),
    });
    expect(result.output).not.toHaveProperty('content');
  });
});
