import type { DelegatedToolName } from '@affine/realtime';
import { z } from 'zod';

import type { DelegatedEditorService } from '../delegated/service';
import type { CopilotChatOptions } from '../providers/types';
import { type CopilotToolExecuteOptions, defineTool } from './tool';

const execute =
  (
    delegated: DelegatedEditorService,
    options: CopilotChatOptions,
    tool: DelegatedToolName
  ) =>
  (args: Record<string, unknown>, execution: CopilotToolExecuteOptions) =>
    delegated.execute(options, tool, args, execution.signal, execution);

export function createFrontendEditorStateTool(
  delegated: DelegatedEditorService,
  options: CopilotChatOptions
) {
  const run = execute(delegated, options, 'frontend_get_editor_state');
  return defineTool({
    description:
      'Get lightweight state for the focused live editor: mode, readonly state, selection locator, capabilities, and editor_state_id. Use before live reads when freshness matters. It does not return document content.',
    inputSchema: z.object({}).strict(),
    execute: run,
  });
}

export function createFrontendSelectionTool(
  delegated: DelegatedEditorService,
  options: CopilotChatOptions
) {
  const run = execute(delegated, options, 'frontend_read_selection');
  return defineTool({
    description:
      'Read the current Page or Edgeless selection from the focused live editor. Use for unsynced selected content; results are bounded and include editor_state_id and truncation. Do not use for persisted documents outside the active editor.',
    inputSchema: z
      .object({
        format: z.enum(['text', 'markdown', 'structure']).optional(),
        limit: z.number().int().min(1).max(50_000).optional(),
        neighborhood: z.number().int().min(0).max(20).optional(),
      })
      .strict(),
    execute: run,
  });
}

export function createFrontendNodesTool(
  delegated: DelegatedEditorService,
  options: CopilotChatOptions
) {
  const run = execute(delegated, options, 'frontend_read_nodes');
  return defineTool({
    description:
      'Read bounded live blocks or canvas elements by ids in the focused editor. Use locators returned by editor state, selection, or snapshot tools. Each item can return its own error; ids must belong to the active document.',
    inputSchema: z
      .object({
        block_ids: z.array(z.string().min(1).max(128)).max(50).optional(),
        element_ids: z.array(z.string().min(1).max(128)).max(50).optional(),
        limit: z.number().int().min(1).max(50_000).optional(),
      })
      .strict()
      .refine(value => value.block_ids?.length || value.element_ids?.length, {
        message: 'block_ids or element_ids is required',
      }),
    execute: run,
  });
}

export function createFrontendSnapshotTool(
  delegated: DelegatedEditorService,
  options: CopilotChatOptions
) {
  const run = execute(delegated, options, 'frontend_snapshot_document');
  return defineTool({
    description:
      'Get a lightweight view from the focused editor. Page mode returns an outline or selection neighborhood; Edgeless mode returns the visible viewport. The requested view is adapted to the active editor mode. Use it to locate content before targeted reads; it is bounded and is not a full document snapshot.',
    inputSchema: z
      .object({
        view: z.enum(['outline', 'selection_neighborhood', 'viewport']),
        limit: z.number().int().min(1).max(200).optional(),
      })
      .strict(),
    execute: run,
  });
}
