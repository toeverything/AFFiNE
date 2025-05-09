import type { ShapeToolOption } from '@blocksuite/affine-gfx-shape';
import { render, type TemplateResult } from 'lit';

type TransformState = {
  /** horizental offset base on center */
  x?: number | string;
  /** vertical offset base on center */
  y?: number | string;
  /** scale */
  s?: number;
  /** z-index */
  z?: number;
};

export type DraggableShape = {
  name: ShapeToolOption['shapeName'];
  svg: TemplateResult;
  style: {
    default?: TransformState;
    hover?: TransformState;
    /**
     * The next shape when previous shape is dragged outside toolbar
     */
    next?: TransformState;
  };
};

/**
 * Helper function to build the CSS variables object for the shape
 * @returns
 */
export const buildVariablesObject = (style: DraggableShape['style']) => {
  const states: Array<keyof DraggableShape['style']> = [
    'default',
    'hover',
    'next',
  ];
  const variables: Array<keyof TransformState> = ['x', 'y', 's', 'z'];

  const resolveValue = (
    variable: keyof TransformState,
    value: string | number
  ) => {
    if (['x', 'y'].includes(variable)) {
      return typeof value === 'number' ? `${value}px` : value;
    }
    return value;
  };

  return states.reduce((acc, state) => {
    return {
      ...acc,
      ...variables.reduce((acc, variable) => {
        const defaultValue = style.default?.[variable];
        const value = style[state]?.[variable] ?? defaultValue;
        if (value === undefined) return acc;
        return {
          ...acc,
          [`--${state}-${variable}`]: resolveValue(variable, value),
        };
      }, {}),
    };
  }, {});
};

// drag helper
export type ShapeDragEvent = {
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
  }) satisfies ShapeDragEvent;

export const mouseResolver = (event: MouseEvent) =>
  ({
    inputType: 'mouse',
    x: event.clientX,
    y: event.clientY,
    el: event.currentTarget as HTMLElement,
    originalEvent: event,
  }) satisfies ShapeDragEvent;

// overlay helper
export const defaultDraggingInfo = {
  startPos: { x: 0, y: 0 },
  toolbarRect: {} as DOMRect,
  edgelessRect: {} as DOMRect,
  shapeRectOriginal: {} as DOMRect,
  shapeEl: null as unknown as HTMLElement,
  parentToMount: null as unknown as HTMLElement,
  moved: false,
  shape: null as unknown as DraggableShape,
  style: {} as CSSStyleDeclaration,
};
export type DraggingInfo = typeof defaultDraggingInfo;

export const createShapeDraggingOverlay = (info: DraggingInfo) => {
  const { edgelessRect, parentToMount } = info;
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: edgelessRect.width + 'px',
    // always clip
    // height: toolbarRect.bottom - edgelessRect.top + 'px',
    height: edgelessRect.height + 'px',
    overflow: 'hidden',
    zIndex: '9999',

    // for debug purpose
    // background: 'rgba(255, 0, 0, 0.1)',
  });

  const shape = document.createElement('div');
  const shapeScaleWrapper = document.createElement('div');
  Object.assign(shapeScaleWrapper.style, {
    transform: 'scale(var(--s, 1))',
    transition: 'transform 0.1s',
    transformOrigin: 'var(--o, center)',
  });
  render(info.shape.svg, shapeScaleWrapper);
  Object.assign(shape.style, {
    position: 'absolute',
    color: info.style.color,
    stroke: info.style.stroke,
    filter: `var(--shape-filter, ${info.style.filter})`,
    transform: 'translate(var(--x, 0), var(--y, 0))',
    left: 'var(--left, 0)',
    top: 'var(--top, 0)',
    cursor: 'grabbing',
    transition: 'inherit',
  });

  shape.append(shapeScaleWrapper);
  overlay.append(shape);
  parentToMount.append(overlay);

  return overlay;
};
