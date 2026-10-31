import type { IPoint } from '@blocksuite/global/gfx';

export function isFarEnough(a: IPoint, b: IPoint) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.pow(dx, 2) + Math.pow(dy, 2) > 4;
}

export function center(a: IPoint, b: IPoint) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

export const toLowerCase = <T extends string>(str: T): Lowercase<T> =>
  str.toLowerCase() as Lowercase<T>;

/**
 * Whether an event that reached `host` actually came from inside a NESTED
 * editor host (e.g. a linked note's note-ref editor inside a page editor).
 * Such events belong to the innermost host: if every host activates itself
 * for bubbling pointerdown/click/focusin, the outer host steals activation
 * back on every tap, re-creating the inner editor's widgets (its keyboard
 * toolbar) before each pointerdown -- which makes iOS withhold the click and
 * the caret (999.11 follow-up).
 */
export function isEventOwnedByNestedHost(
  host: Element,
  target: EventTarget | null
): boolean {
  if (!(target instanceof Node)) return false;
  const element = target instanceof Element ? target : target.parentElement;
  const innermost = element?.closest('editor-host');
  return !!innermost && innermost !== host && host.contains(innermost);
}
