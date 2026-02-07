import { describe, expect, it, vi } from 'vitest';

import type { KanbanCard } from '../view-presets/kanban/pc/card.js';
import { KanbanDragController } from '../view-presets/kanban/pc/controller/drag.js';
import type { KanbanGroup } from '../view-presets/kanban/pc/group.js';

const createController = () => {
  const logic = {
    ui$: { value: undefined },
    view: {
      readonly$: { value: false },
    },
    scrollContainer$: { value: null },
    root: { config: {} },
    handleEvent: vi.fn(),
  };

  return new KanbanDragController(logic as any);
};

describe('KanbanDragController drop indicator', () => {
  it('shows drop preview when insert position exists', () => {
    const controller = createController();
    const position = {
      group: {} as KanbanGroup,
      position: 'end' as const,
    };
    controller.getInsertPosition = vi.fn().mockReturnValue(position);

    const displaySpy = vi.spyOn(controller.dropPreview, 'display');
    const removeSpy = vi.spyOn(controller.dropPreview, 'remove');

    const result = controller.showIndicator({} as MouseEvent, undefined);

    expect(result).toBe(position);
    expect(displaySpy).toHaveBeenCalledWith(
      position.group,
      undefined,
      undefined
    );
    expect(removeSpy).not.toHaveBeenCalled();
  });

  it('removes drop preview when insert position does not exist', () => {
    const controller = createController();
    controller.getInsertPosition = vi.fn().mockReturnValue(undefined);

    const displaySpy = vi.spyOn(controller.dropPreview, 'display');
    const removeSpy = vi.spyOn(controller.dropPreview, 'remove');

    const result = controller.showIndicator({} as MouseEvent, undefined);

    expect(result).toBeUndefined();
    expect(displaySpy).not.toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('forwards hovered card to drop preview for precise insertion cursor', () => {
    const controller = createController();
    const hoveredCard = {} as KanbanCard;
    const positionCard = document.createElement('div') as unknown as KanbanCard;
    const position = {
      group: {} as KanbanGroup,
      card: positionCard,
      position: { before: true, id: 'card-id' } as const,
    };
    controller.getInsertPosition = vi.fn().mockReturnValue(position);

    const displaySpy = vi.spyOn(controller.dropPreview, 'display');

    controller.showIndicator({} as MouseEvent, hoveredCard);

    expect(displaySpy).toHaveBeenCalledWith(
      position.group,
      hoveredCard,
      position.card
    );
  });
});
