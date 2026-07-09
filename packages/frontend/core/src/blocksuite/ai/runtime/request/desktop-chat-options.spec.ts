/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test, vi } from 'vitest';

import {
  enrichDesktopChatActionOptions,
  shouldShowDesktopAction,
} from './desktop-chat-options';

const electronApis = vi.hoisted(() => ({
  modelService: {
    modelId: { value: undefined as string | undefined },
    getActiveModelId: vi.fn(
      (modelId?: string) => (modelId ?? 'gemma-3-4b-it') as string | undefined
    ),
    getExecutionPreference: vi.fn(() => 'local' as 'local' | 'cloud'),
  },
  localAI: {},
}));

vi.mock('@affine/electron-api', () => ({
  apis: electronApis,
}));

const aiModelProviderState = vi.hoisted(() => ({
  hasService: true,
}));

vi.mock('./ai-model-provider', () => ({
  hasAIModelService: () => aiModelProviderState.hasService,
  getAIModelService: () => electronApis.modelService,
}));

describe('enrichDesktopChatActionOptions', () => {
  test('adds default local Gemma options for desktop chat requests', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = undefined;
    electronApis.modelService.getExecutionPreference.mockReturnValue('local');

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'hello',
          stream: true,
        },
        'chat'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'hello',
      stream: true,
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
    });
  });

  test('maps cloud preference to server lane', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = 'gemma-3-4b-it';
    electronApis.modelService.getExecutionPreference.mockReturnValue('cloud');

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'hello',
          stream: true,
        },
        'chat'
      )
    ).toMatchObject({
      modelId: 'gemma-3-4b-it',
      executionLane: 'server',
    });
  });

  test('adds default local Gemma options for desktop text actions', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = undefined;
    electronApis.modelService.getExecutionPreference.mockReturnValue('local');

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'make a map',
          stream: true,
        },
        'brainstormMindmap'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'make a map',
      stream: true,
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
    });
  });

  test('falls back to bundled local Gemma when AIModelService is unavailable', () => {
    aiModelProviderState.hasService = false;

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'make a map',
          stream: true,
        },
        'brainstormMindmap'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'make a map',
      stream: true,
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
    });
  });

  test('falls back to bundled Gemma while AI model catalog is still loading', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = undefined;
    electronApis.modelService.getActiveModelId.mockReturnValueOnce(undefined);
    electronApis.modelService.getExecutionPreference.mockReturnValue('local');

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'make a map',
          stream: true,
        },
        'brainstormMindmap'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'make a map',
      stream: true,
      modelId: 'gemma-3-4b-it',
      executionLane: 'local',
    });
  });

  test('preserves cloud preference while AI model catalog is still loading', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = undefined;
    electronApis.modelService.getActiveModelId.mockReturnValueOnce(undefined);
    electronApis.modelService.getExecutionPreference.mockReturnValue('cloud');

    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'hello',
          stream: true,
        },
        'chat'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'hello',
      stream: true,
      modelId: 'gemma-3-4b-it',
      executionLane: 'server',
    });
  });

  test('does not modify image actions', () => {
    aiModelProviderState.hasService = true;
    expect(
      enrichDesktopChatActionOptions(
        {
          workspaceId: 'workspace-1',
          input: 'draw',
        },
        'createImage'
      )
    ).toEqual({
      workspaceId: 'workspace-1',
      input: 'draw',
    });
  });

  test('keeps image actions visible when local Gemma is selected on desktop', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = 'gemma-3-4b-it';
    electronApis.modelService.getActiveModelId.mockReturnValue('gemma-3-4b-it');
    electronApis.modelService.getExecutionPreference.mockReturnValue('local');

    expect(shouldShowDesktopAction('createImage')).toBe(true);
    expect(shouldShowDesktopAction('filterImage')).toBe(true);
    expect(shouldShowDesktopAction('processImage')).toBe(true);
    expect(shouldShowDesktopAction('brainstormMindmap')).toBe(true);
    expect(shouldShowDesktopAction('createSlides')).toBe(true);
  });

  test('keeps image actions visible when cloud preference is selected on desktop', () => {
    aiModelProviderState.hasService = true;
    electronApis.modelService.modelId.value = 'gemma-3-4b-it';
    electronApis.modelService.getActiveModelId.mockReturnValue('gemma-3-4b-it');
    electronApis.modelService.getExecutionPreference.mockReturnValue('cloud');

    expect(shouldShowDesktopAction('createImage')).toBe(true);
    expect(shouldShowDesktopAction('filterImage')).toBe(true);
    expect(shouldShowDesktopAction('processImage')).toBe(true);
  });

  test('keeps desktop actions visible while model service is unavailable', () => {
    aiModelProviderState.hasService = false;

    expect(shouldShowDesktopAction('createImage')).toBe(true);
    expect(shouldShowDesktopAction('brainstormMindmap')).toBe(true);
  });
});
