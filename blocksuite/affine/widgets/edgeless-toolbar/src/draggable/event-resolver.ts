export type ElementDragEvent = {
  inputType: 'mouse' | 'touch';
  x: number;
  y: number;
  el: HTMLElement;
  originalEvent: MouseEvent | TouchEvent;
};

export const touchResolver = (event: TouchEvent) =>
  ({
    inputType: 'touch',
    x: event.touches[0].clientX,
    y: event.touches[0].clientY,
    el: event.currentTarget as HTMLElement,
    originalEvent: event,
  }) satisfies ElementDragEvent;

export const mouseResolver = (event: MouseEvent) =>
  ({
    inputType: 'mouse',
    x: event.clientX,
    y: event.clientY,
    el: event.currentTarget as HTMLElement,
    originalEvent: event,
  }) satisfies ElementDragEvent;
