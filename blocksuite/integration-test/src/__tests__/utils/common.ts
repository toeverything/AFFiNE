import type { Point } from '@blocksuite/global/gfx';

export function wait(time: number = 0) {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      setTimeout(resolve, time);
    });
  });
}

/**
 * simulate click event
 * @param target
 * @param position position relative to the target
 */
export function click(target: HTMLElement, position: { x: number; y: number }) {
  const element = target.getBoundingClientRect();
  const clientX = element.x + position.x;
  const clientY = element.y + position.y;

  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      clientX,
      clientY,
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
    })
  );
  target.dispatchEvent(
    new PointerEvent('pointerup', {
      clientX,
      clientY,
      bubbles: true,
      pointerId: 1,
      isPrimary: true,
    })
  );
  target.dispatchEvent(
    new MouseEvent('click', {
      clientX,
      clientY,
      bubbles: true,
    })
  );
}

type PointerOptions = {
  isPrimary?: boolean;
  pointerId?: number;
  pointerType?: string;
};

const defaultPointerOptions: PointerOptions = {
  isPrimary: true,
  pointerId: 1,
  pointerType: 'mouse',
};

/**
 * simulate pointerdown event
 * @param target
 * @param position position relative to the target
 */
export function pointerdown(
  target: HTMLElement,
  position: { x: number; y: number },
  options: PointerOptions = defaultPointerOptions
) {
  const element = target.getBoundingClientRect();
  const clientX = element.x + position.x;
  const clientY = element.y + position.y;

  target.dispatchEvent(
    new PointerEvent('pointerdown', {
      clientX,
      clientY,
      bubbles: true,
      ...options,
    })
  );
}

/**
 * simulate pointerup event
 * @param target
 * @param position position relative to the target
 */
export function pointerup(
  target: HTMLElement,
  position: { x: number; y: number },
  options: PointerOptions = defaultPointerOptions
) {
  const element = target.getBoundingClientRect();
  const clientX = element.x + position.x;
  const clientY = element.y + position.y;

  target.dispatchEvent(
    new PointerEvent('pointerup', {
      clientX,
      clientY,
      bubbles: true,
      ...options,
    })
  );
}

/**
 * simulate pointermove event
 * @param target
 * @param position position relative to the target
 */
export function pointermove(
  target: HTMLElement,
  position: { x: number; y: number },
  options: PointerOptions = defaultPointerOptions
) {
  const element = target.getBoundingClientRect();
  const clientX = element.x + position.x;
  const clientY = element.y + position.y;

  target.dispatchEvent(
    new PointerEvent('pointermove', {
      clientX,
      clientY,
      bubbles: true,
      ...options,
    })
  );
}

export function drag(
  target: HTMLElement,
  start: { x: number; y: number },
  end: { x: number; y: number },
  step: number = 5
) {
  pointerdown(target, start);
  pointermove(target, start);

  if (step !== 0) {
    const xStep = (end.x - start.x) / step;
    const yStep = (end.y - start.y) / step;

    for (const [i] of Array.from({ length: step }).entries()) {
      pointermove(target, {
        x: start.x + xStep * (i + 1),
        y: start.y + yStep * (i + 1),
      });
    }
  }

  pointermove(target, end);
  pointerup(target, end);
}

export function multiTouchDown(target: Element, points: Point[]) {
  points.forEach((point, index) => {
    pointerdown(target as HTMLElement, point, {
      isPrimary: index === 0,
      pointerId: index,
      pointerType: 'touch',
    });
  });
}

export function multiTouchMove(
  target: Element,
  from: Point[],
  to: Point[],
  step = 5
) {
  if (from.length !== to.length) {
    throw new Error('from and to should have the same length');
  }

  if (step !== 0) {
    for (const [i] of Array.from({ length: step }).entries()) {
      const stepPoints = from.map((point, index) => ({
        x: point.x + ((to[index].x - point.x) / step) * (i + 1),
        y: point.y + ((to[index].y - point.y) / step) * (i + 1),
      }));
      from.forEach((_, index) => {
        pointermove(target as HTMLElement, stepPoints[index], {
          isPrimary: index === 0,
          pointerId: index,
          pointerType: 'touch',
        });
      });
    }
  }
}

export function multiTouchUp(target: Element, points: Point[]) {
  points.forEach((point, index) => {
    pointerup(target as HTMLElement, point, {
      isPrimary: index === 0,
      pointerId: index,
      pointerType: 'touch',
    });
  });
}
