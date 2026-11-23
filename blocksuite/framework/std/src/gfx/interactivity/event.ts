import type { PointerEventState, UIEventState } from '../../event';

export type SupportedEvents =
  | 'click'
  | 'dblclick'
  | 'pointerdown'
  | 'pointerenter'
  | 'pointerleave'
  | 'pointermove'
  | 'pointerup'
  | 'dragstart'
  | 'dragmove'
  | 'dragend';

export type GfxInteractivityContext<
  EventState extends UIEventState = PointerEventState,
  RawEvent extends Event = EventState['event'],
> = {
  event: EventState;

  /**
   * The raw dom event.
   */
  raw: RawEvent;

  /**
   * Prevent the default gfx interaction
   */
  preventDefault: () => void;
};

export const createInteractionContext = (event: PointerEventState) => {
  let preventDefaultState = false;

  return {
    context: {
      event,
      raw: event.raw,
      preventDefault: () => {
        preventDefaultState = true;
        event.raw.preventDefault();
      },
    },
    get preventDefaultState() {
      return preventDefaultState;
    },
  };
};
