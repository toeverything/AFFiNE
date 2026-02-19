import { EdgelessLegacySlotIdentifier } from '@blocksuite/affine-block-surface';
import { MouseButton } from '@blocksuite/std/gfx';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PanTool } from '../tools/pan-tool.js';

type PointerDownHandler = (event: {
  raw: {
    button: number;
    preventDefault: () => void;
  };
}) => unknown;

const mockRaf = () => {
  let callback: FrameRequestCallback | undefined;
  const requestAnimationFrameMock = vi
    .fn()
    .mockImplementation((cb: FrameRequestCallback) => {
      callback = cb;
      return 1;
    });
  const cancelAnimationFrameMock = vi.fn();

  vi.stubGlobal('requestAnimationFrame', requestAnimationFrameMock);
  vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrameMock);

  return {
    getCallback: () => callback,
    requestAnimationFrameMock,
    cancelAnimationFrameMock,
  };
};

const createToolFixture = (options?: {
  currentToolName?: string;
  currentToolOptions?: Record<string, unknown>;
}) => {
  const applyDeltaCenter = vi.fn();
  const selectionSet = vi.fn();
  const setTool = vi.fn();
  const navigatorSettingUpdated = {
    next: vi.fn(),
  };
  const currentToolName = options?.currentToolName;
  const currentToolOption = {
    toolType: currentToolName
      ? ({
          toolName: currentToolName,
        } as any)
      : undefined,
    options: options?.currentToolOptions,
  };

  const gfx = {
    viewport: {
      zoom: 2,
      applyDeltaCenter,
    },
    selection: {
      surfaceSelections: [{ elements: ['shape-1'] }],
      set: selectionSet,
    },
    tool: {
      currentTool$: {
        peek: () => null,
      },
      currentToolOption$: {
        peek: () => currentToolOption,
      },
      setTool,
    },
    std: {
      get: (identifier: unknown) => {
        if (identifier === EdgelessLegacySlotIdentifier) {
          return { navigatorSettingUpdated };
        }
        return null;
      },
    },
    doc: {},
  };

  const tool = new PanTool(gfx as any);

  return {
    applyDeltaCenter,
    navigatorSettingUpdated,
    selectionSet,
    setTool,
    tool,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanTool', () => {
  test('flushes accumulated delta on dragEnd', () => {
    mockRaf();
    const { tool, applyDeltaCenter } = createToolFixture();

    tool.dragStart({ x: 100, y: 100 } as any);
    tool.dragMove({ x: 80, y: 60 } as any);
    tool.dragMove({ x: 70, y: 40 } as any);

    expect(applyDeltaCenter).not.toHaveBeenCalled();
    tool.dragEnd({} as any);

    expect(applyDeltaCenter).toHaveBeenCalledTimes(1);
    expect(applyDeltaCenter).toHaveBeenCalledWith(15, 30);
    expect(tool.panning$.value).toBe(false);
  });

  test('cancel in unmounted drops pending deltas', () => {
    mockRaf();
    const { tool, applyDeltaCenter } = createToolFixture();

    tool.dragStart({ x: 100, y: 100 } as any);
    tool.dragMove({ x: 80, y: 60 } as any);
    tool.unmounted();
    tool.dragEnd({} as any);

    expect(applyDeltaCenter).not.toHaveBeenCalled();
  });

  test('middle click temporary pan restores frameNavigator with restoredAfterPan', () => {
    const { tool, navigatorSettingUpdated, selectionSet, setTool } =
      createToolFixture({
        currentToolName: 'frameNavigator',
        currentToolOptions: { mode: 'fit' },
      });

    const hooks: Partial<Record<'pointerDown', PointerDownHandler>> = {};
    (tool as any).eventTarget = {
      addHook: (eventName: 'pointerDown', handler: PointerDownHandler) => {
        hooks[eventName] = handler;
      },
    };

    tool.mounted();

    const preventDefault = vi.fn();
    const pointerDown = hooks.pointerDown!;
    const ret = pointerDown({
      raw: {
        button: MouseButton.MIDDLE,
        preventDefault,
      },
    });

    expect(ret).toBe(false);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(navigatorSettingUpdated.next).toHaveBeenCalledWith({
      blackBackground: false,
    });
    expect(setTool).toHaveBeenNthCalledWith(1, PanTool, {
      panning: true,
    });

    document.dispatchEvent(
      new PointerEvent('pointerup', { button: MouseButton.MIDDLE })
    );

    expect(selectionSet).toHaveBeenCalledWith([{ elements: ['shape-1'] }]);
    expect(setTool).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolName: 'frameNavigator',
      }),
      {
        mode: 'fit',
        restoredAfterPan: true,
      }
    );
  });
});
