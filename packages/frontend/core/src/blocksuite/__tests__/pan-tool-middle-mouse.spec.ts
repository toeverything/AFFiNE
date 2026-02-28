// eslint-disable-next-line import-x/no-extraneous-dependencies
import { PanTool } from '@blocksuite/affine-gfx-pointer';
import { on } from '@blocksuite/affine-shared/utils';
import type { PointerEventState } from '@blocksuite/std';
import {
  BaseTool,
  MouseButton,
  type ToolOptionWithType,
  type ToolType,
} from '@blocksuite/std/gfx';
import { beforeEach, describe, expect, test, vi } from 'vitest';

type SelectionEntry = {
  blockId: string;
  elements: string[];
  editing: boolean;
  inoperable?: boolean;
};

const pointerUpHandlers: unknown[] = [];
const pointerUpDisposers: Array<ReturnType<typeof vi.fn>> = [];

vi.mock('@blocksuite/affine-shared/utils', async () => {
  const actual = await vi.importActual<
    typeof import('@blocksuite/affine-shared/utils')
  >('@blocksuite/affine-shared/utils');

  return {
    ...actual,
    on: vi.fn(
      (
        _target: Document,
        eventName: string,
        handler: (event: Pick<PointerEvent, 'button'>) => void
      ) => {
        if (eventName === 'pointerup') {
          pointerUpHandlers.push(handler);
          const dispose = vi.fn(() => {
            const index = pointerUpHandlers.indexOf(handler);
            if (index >= 0) {
              pointerUpHandlers.splice(index, 1);
            }
          });
          pointerUpDisposers.push(dispose);
          return dispose;
        }
        return vi.fn();
      }
    ),
  };
});

const createPointerEventState = (
  button = MouseButton.MIDDLE
): PointerEventState =>
  ({
    raw: {
      button,
      preventDefault: vi.fn(),
    },
  }) as unknown as PointerEventState;

const createPanToolHarness = (
  toolName = 'default',
  options?: Record<string, unknown>
) => {
  const selectionEntry: SelectionEntry = {
    blockId: 'edgeless',
    elements: ['shape-1'],
    editing: false,
  };
  const surfaceSelections = [selectionEntry];
  const selection = {
    surfaceSelections,
    set: vi.fn(),
  };

  const originalToolType = { toolName } as unknown as ToolType<BaseTool>;
  const currentToolOption = {
    toolType: originalToolType,
    options: options as ToolOptionWithType['options'],
  };

  const setTool = vi.fn();
  const navigatorSettingUpdated = { next: vi.fn() };
  const gfx = {
    selection,
    std: {
      get: vi.fn().mockReturnValue({
        navigatorSettingUpdated,
      }),
    },
    tool: {
      ['currentToolOption$']: {
        peek: () => currentToolOption,
        get value() {
          return currentToolOption;
        },
      },
      setTool,
    },
  };

  // Ensure a global document exists for PanTool's middle mouse handler in Node test env
  (globalThis as any).document ??= {};

  const panTool = new PanTool(gfx as unknown as any);
  let pointerDownHandler: ((evt: PointerEventState) => void | boolean) | null =
    null;

  (panTool as any).eventTarget = {
    addHook: (_eventName: string, handler: typeof pointerDownHandler) => {
      if (_eventName === 'pointerDown') {
        pointerDownHandler = handler;
      }
    },
  };

  panTool.mounted();

  if (!pointerDownHandler) {
    throw new Error('pointerDown handler was not registered');
  }

  return {
    pointerDownHandler: pointerDownHandler as (
      evt: PointerEventState
    ) => void | boolean,
    selection,
    selectionEntry,
    originalToolType,
    originalToolOptions: options,
    setTool,
    navigatorSettingUpdated,
  };
};

describe('PanTool middle mouse behavior', () => {
  beforeEach(() => {
    pointerUpHandlers.length = 0;
    pointerUpDisposers.length = 0;
    vi.clearAllMocks();
  });

  test('temporarily switches to pan tool and restores original selection snapshot', () => {
    const originalOptions = { foo: 'bar' };
    const {
      pointerDownHandler,
      selection,
      selectionEntry,
      originalToolType,
      originalToolOptions,
      setTool,
    } = createPanToolHarness('default', originalOptions);

    const pointerState = createPointerEventState();
    const result = pointerDownHandler(pointerState);

    expect(result).toBe(false);
    expect(pointerState.raw.preventDefault).toHaveBeenCalledTimes(1);
    expect(setTool).toHaveBeenNthCalledWith(1, PanTool, { panning: true });
    expect(pointerUpHandlers).toHaveLength(1);

    selection.surfaceSelections[0] = {
      blockId: 'edgeless',
      elements: ['mutated'],
      editing: false,
    };

    const middlePointerUpHandler = pointerUpHandlers[0]! as (
      event: Pick<PointerEvent, 'button'>
    ) => void;
    middlePointerUpHandler({ button: MouseButton.MIDDLE });

    expect(selection.set).toHaveBeenCalledWith([selectionEntry]);
    expect(setTool).toHaveBeenNthCalledWith(
      2,
      originalToolType,
      originalToolOptions
    );
    expect(pointerUpDisposers[0]).toHaveBeenCalledTimes(1);
  });

  test('restores frame navigator with restoredAfterPan flag', () => {
    const frameOptions = { mode: 'fit' };
    const {
      pointerDownHandler,
      navigatorSettingUpdated,
      setTool,
      originalToolType,
    } = createPanToolHarness('frameNavigator', frameOptions);

    pointerDownHandler(createPointerEventState());
    expect(navigatorSettingUpdated.next).toHaveBeenCalledWith({
      blackBackground: false,
    });

    const frameNavigatorPointerUpHandler = pointerUpHandlers[0]! as (
      event: Pick<PointerEvent, 'button'>
    ) => void;
    frameNavigatorPointerUpHandler({ button: MouseButton.MIDDLE });

    expect(setTool).toHaveBeenNthCalledWith(2, originalToolType, {
      ...frameOptions,
      restoredAfterPan: true,
    });
  });

  test('ignores middle button when PanTool is already active', () => {
    const { pointerDownHandler, setTool } = createPanToolHarness(
      PanTool.toolName
    );
    const pointerState = createPointerEventState();

    const result = pointerDownHandler(pointerState);

    expect(result).toBeUndefined();
    expect(pointerState.raw.preventDefault).not.toHaveBeenCalled();
    expect(setTool).not.toHaveBeenCalled();
    expect(on).not.toHaveBeenCalled();
    expect(pointerUpHandlers).toHaveLength(0);
  });
});
