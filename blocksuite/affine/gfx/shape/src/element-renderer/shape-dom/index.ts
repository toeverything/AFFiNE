import type { DomRenderer } from '@blocksuite/affine-block-surface';
import { isRTL } from '@blocksuite/affine-gfx-text';
import type { ShapeElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';

import { DRAWIO_STENCIL_SHAPE_MAP } from '../../drawio/stencil-map.js';
import {
  buildPathFromStencil,
  getStencilShapeData,
} from '../../drawio/stencil-utils.js';
import {
  buildActorPath,
  buildCalloutPath,
  buildCloudPath,
  buildCubeInnerPaths,
  buildCubePath,
  buildCylinderPath,
  buildDataStoragePath,
  buildDocumentPath,
  buildInternalStoragePath,
  buildLogicAndPath,
  buildLogicOrPath,
  buildNotePath,
  buildTapePath,
} from '../shape/paths.js';
import { manageClassNames, setStyles } from './utils';

const SVG_SHAPE_TYPES = new Set([
  'diamond',
  'triangle',
  'triangleRight',
  'hexagon',
  'parallelogram',
  'trapezoid',
  'step',
  'cylinder',
  'cloud',
  'note',
  'callout',
  'actor',
  'dataStorage',
  'tape',
  'internalStorage',
  'logicAnd',
  'logicOr',
  'flowchartProcess',
  'flowchartDecision',
  'flowchartData',
  'flowchartDocument',
  'flowchartManualInput',
  'flowchartDelay',
  'flowchartPredefinedProcess',
  'flowchartStoredData',
  'flowchartInternalStorage',
  'flowchartDatabase',
  'flowchartSequentialData',
  'flowchartTerminator',
  'flowchartPreparation',
  'flowchartMerge',
  'flowchartPaperTape',
  'arrowUp',
  'arrowDown',
  'arrowLeft',
  'arrowRight',
  'arrowTwoWayHorizontal',
  'arrowTwoWayVertical',
]);

const buildPathFromPoints = (points: Array<[number, number]>) => {
  if (!points.length) return '';
  const [first, ...rest] = points;
  return [
    `M ${first[0]} ${first[1]}`,
    ...rest.map(point => `L ${point[0]} ${point[1]}`),
    'Z',
  ].join(' ');
};

function applyShapeSpecificStyles(
  model: ShapeElementModel,
  element: HTMLElement,
  zoom: number
) {
  // Reset properties that might be set by different shape types
  element.style.removeProperty('clip-path');
  element.style.removeProperty('border-radius');
  // Clear DOM for shapes that don't use SVG, or if type changes from SVG-based to non-SVG-based
  if (!SVG_SHAPE_TYPES.has(model.shapeType)) {
    while (element.firstChild) element.firstChild.remove();
  }

  switch (model.shapeType) {
    case 'rect': {
      const w = model.w * zoom;
      const h = model.h * zoom;
      const r = model.radius ?? 0;
      const borderRadius =
        r < 1 ? `${Math.min(w * r, h * r)}px` : `${r * zoom}px`;
      element.style.borderRadius = borderRadius;
      break;
    }
    case 'ellipse':
      element.style.borderRadius = '50%';
      break;
    case 'diamond':
    case 'triangle':
    case 'triangleRight':
    case 'hexagon':
    case 'parallelogram':
    case 'trapezoid':
    case 'step':
      break;
  }
  // No 'else' needed to clear styles, as they are reset at the beginning of the function.
}

function applyBorderStyles(
  model: ShapeElementModel,
  element: HTMLElement,
  strokeColor: string,
  zoom: number
) {
  element.style.border =
    model.strokeStyle !== 'none'
      ? `${model.strokeWidth * zoom}px ${
          model.strokeStyle === 'dash'
            ? 'dashed'
            : model.strokeStyle === 'dot'
              ? 'dotted'
              : 'solid'
        } ${strokeColor}`
      : 'none';
  if (model.strokeStyle === 'dot') {
    element.style.borderStyle = 'dotted';
    element.style.borderColor = strokeColor;
  }
}

function applyTransformStyles(model: ShapeElementModel, element: HTMLElement) {
  const rotate = model.rotate ?? 0;
  const hasFlip = model.flipX || model.flipY;

  if (rotate !== 0 || hasFlip) {
    const transforms: string[] = [];
    if (rotate !== 0) {
      transforms.push(`rotate(${rotate}deg)`);
    }
    if (hasFlip) {
      transforms.push(
        `scale(${model.flipX ? -1 : 1}, ${model.flipY ? -1 : 1})`
      );
    }

    setStyles(element, {
      transform: transforms.join(' '),
      transformOrigin: 'center',
    });
  } else {
    setStyles(element, {
      transform: '',
      transformOrigin: '',
    });
  }
}

function applyShadowStyles(
  model: ShapeElementModel,
  element: HTMLElement,
  renderer: DomRenderer
) {
  if (model.shadow) {
    const { offsetX, offsetY, blur, color } = model.shadow;
    setStyles(element, {
      boxShadow: `${offsetX}px ${offsetY}px ${blur}px ${renderer.getColorValue(color)}`,
    });
  } else {
    setStyles(element, { boxShadow: '' });
  }
}

/**
 * Renders a ShapeElementModel to a given HTMLElement using DOM properties.
 * This function is intended to be registered via the DomElementRendererExtension.
 *
 * @param model - The shape element model containing rendering properties.
 * @param element - The HTMLElement to apply the shape's styles to.
 * @param renderer - The main DOMRenderer instance, providing access to viewport and color utilities.
 */
export const shapeDomRenderer = (
  model: ShapeElementModel,
  element: HTMLElement,
  renderer: DomRenderer
): void => {
  const { zoom } = renderer.viewport;
  const unscaledWidth = model.w;
  const unscaledHeight = model.h;

  const newChildren: Element[] = [];

  const fillColor = renderer.getColorValue(
    model.fillColor,
    DefaultTheme.shapeFillColor,
    true
  );
  const strokeColor = renderer.getColorValue(
    model.strokeColor,
    DefaultTheme.shapeStrokeColor,
    true
  );

  element.style.width = `${unscaledWidth * zoom}px`;
  element.style.height = `${unscaledHeight * zoom}px`;
  element.style.boxSizing = 'border-box';

  // Apply shape-specific clipping, border-radius, and potentially clear innerHTML
  applyShapeSpecificStyles(model, element, zoom);

  if (SVG_SHAPE_TYPES.has(model.shapeType)) {
    // For polygon shapes, fill and border are handled by inline SVG
    element.style.border = 'none'; // Ensure no standard CSS border interferes
    element.style.backgroundColor = 'transparent'; // Host element is transparent

    const strokeW = model.strokeWidth;

    const useFullSize =
      model.shapeType === 'document' || model.shapeType === 'cube';
    const inset = useFullSize ? 0 : strokeW / 2;
    const width = useFullSize
      ? unscaledWidth
      : Math.max(unscaledWidth - strokeW, 0);
    const height = useFullSize
      ? unscaledHeight
      : Math.max(unscaledHeight - strokeW, 0);
    const left = inset;
    const top = inset;
    const right = inset + width;
    const bottom = inset + height;

    let svgPath = '';
    let pathTransform = '';

    const stencilName =
      model.shapeType === 'document'
        ? undefined
        : DRAWIO_STENCIL_SHAPE_MAP[model.shapeType];
    const stencil = stencilName ? getStencilShapeData(stencilName) : null;

    if (stencil) {
      const paths = [
        ...stencil.paths.map(commands =>
          buildPathFromStencil(commands, width, height)
        ),
        ...stencil.strokes.map(commands =>
          buildPathFromStencil(commands, width, height)
        ),
      ];

      const svg = element.firstChild as SVGSVGElement;
      paths.forEach((pathData, index) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', pathData);
        path.setAttribute(
          'fill',
          index < stencil.paths.length ? finalFillColor : 'none'
        );
        path.setAttribute('stroke', finalStrokeColor);
        path.setAttribute('stroke-width', String(strokeW));
        if (finalStrokeDasharray !== 'none') {
          path.setAttribute('stroke-dasharray', finalStrokeDasharray);
          path.setAttribute(
            'stroke-linecap',
            model.strokeStyle === 'dot' ? 'round' : 'butt'
          );
        }
        path.setAttribute('transform', `translate(${left} ${top})`);
        svg.append(path);
      });
      return;
    }

    switch (model.shapeType) {
      case 'diamond':
        svgPath = buildPathFromPoints([
          [left + width / 2, top],
          [right, top + height / 2],
          [left + width / 2, bottom],
          [left, top + height / 2],
        ]);
        break;
      case 'triangle':
        svgPath = buildPathFromPoints([
          [left + width / 2, top],
          [right, bottom],
          [left, bottom],
        ]);
        break;
      case 'triangleRight':
        svgPath = buildPathFromPoints([
          [left, top],
          [right, top + height / 2],
          [left, bottom],
        ]);
        break;
      case 'hexagon':
        svgPath = buildPathFromPoints([
          [left + width * 0.25, top],
          [left + width * 0.75, top],
          [right, top + height / 2],
          [left + width * 0.75, bottom],
          [left + width * 0.25, bottom],
          [left, top + height / 2],
        ]);
        break;
      case 'parallelogram': {
        const offset = Math.min(width * 0.2, width / 2);
        svgPath = buildPathFromPoints([
          [left + offset, top],
          [right, top],
          [right - offset, bottom],
          [left, bottom],
        ]);
        break;
      }
      case 'trapezoid': {
        const offset = Math.min(width * 0.2, width / 2);
        svgPath = buildPathFromPoints([
          [left + offset, top],
          [right - offset, top],
          [right, bottom],
          [left, bottom],
        ]);
        break;
      }
      case 'step': {
        const stepX = width * 0.7;
        const stepY = height * 0.4;
        svgPath = buildPathFromPoints([
          [left, top],
          [left + stepX, top],
          [left + stepX, top + stepY],
          [right, top + stepY],
          [right, bottom],
          [left, bottom],
        ]);
        break;
      }
      case 'cylinder':
        svgPath = buildCylinderPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'cloud':
        svgPath = buildCloudPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'document':
        svgPath = buildDocumentPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'note':
        svgPath = buildNotePath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'cube':
        svgPath = buildCubePath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'callout':
        svgPath = buildCalloutPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'actor':
        svgPath = buildActorPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'dataStorage':
        svgPath = buildDataStoragePath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'tape':
        svgPath = buildTapePath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'internalStorage':
        svgPath = buildInternalStoragePath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'logicAnd':
        svgPath = buildLogicAndPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
      case 'logicOr':
        svgPath = buildLogicOrPath(width, height);
        pathTransform = `translate(${left} ${top})`;
        break;
    }

    // Determine if stroke should be visible and its color
    const finalStrokeColor =
      model.strokeStyle !== 'none' && strokeW > 0 ? strokeColor : 'transparent';
    // Determine dash array, only if stroke is visible and style is 'dash'
    const finalStrokeDasharray =
      model.strokeStyle === 'dash' && finalStrokeColor !== 'transparent'
        ? '12, 12'
        : model.strokeStyle === 'dot' && finalStrokeColor !== 'transparent'
          ? `${Math.max(1, strokeW)}, ${strokeW * 2.5}`
          : 'none';
    // Determine fill color
    const finalFillColor = model.filled ? fillColor : 'transparent';

    // Build SVG safely with DOM-API
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${unscaledWidth} ${unscaledHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', svgPath);
    if (pathTransform) {
      path.setAttribute('transform', pathTransform);
    }
    path.setAttribute('fill', finalFillColor);
    path.setAttribute('stroke', finalStrokeColor);
    path.setAttribute('stroke-width', String(strokeW));
    if (finalStrokeDasharray !== 'none') {
      path.setAttribute('stroke-dasharray', finalStrokeDasharray);
      path.setAttribute(
        'stroke-linecap',
        model.strokeStyle === 'dot' ? 'round' : 'butt'
      );
    }
    svg.append(path);

    if (model.shapeType === 'cube') {
      buildCubeInnerPaths(width, height).forEach(innerPath => {
        const inner = document.createElementNS(SVG_NS, 'path');
        inner.setAttribute('d', innerPath);
        if (pathTransform) {
          inner.setAttribute('transform', pathTransform);
        }
        inner.setAttribute('fill', 'none');
        inner.setAttribute('stroke', finalStrokeColor);
        inner.setAttribute('stroke-width', String(strokeW));
        if (finalStrokeDasharray !== 'none') {
          inner.setAttribute('stroke-dasharray', finalStrokeDasharray);
          inner.setAttribute(
            'stroke-linecap',
            model.strokeStyle === 'dot' ? 'round' : 'butt'
          );
        }
        svg.append(inner);
      });
    }

    newChildren.push(svg);
  } else {
    // Standard rendering for other shapes (e.g., rect, ellipse)
    // innerHTML was already cleared by applyShapeSpecificStyles if necessary
    element.style.backgroundColor = model.filled ? fillColor : 'transparent';
    applyBorderStyles(model, element, strokeColor, zoom); // Uses standard CSS border
  }

  if (model.textDisplay && model.text) {
    const str = model.text.toString();
    const textElement = document.createElement('div');
    if (isRTL(str)) {
      textElement.dir = 'rtl';
    }
    textElement.style.position = 'absolute';
    textElement.style.inset = '0';
    textElement.style.display = 'flex';
    textElement.style.flexDirection = 'column';
    textElement.style.justifyContent =
      model.textVerticalAlign === 'center'
        ? 'center'
        : model.textVerticalAlign === 'top'
          ? 'flex-start'
          : 'flex-end';
    textElement.style.whiteSpace = 'pre-wrap';
    textElement.style.wordBreak = 'break-word';
    textElement.style.textAlign = model.textAlign;
    textElement.style.alignmentBaseline = 'alphabetic';
    textElement.style.fontFamily = model.fontFamily;
    textElement.style.fontSize = `${model.fontSize * zoom}px`;
    textElement.style.fontWeight = model.fontWeight;
    textElement.style.color = renderer.getColorValue(
      model.color,
      DefaultTheme.shapeTextColor,
      true
    );
    textElement.style.transform = `scale(${model.flipX ? -1 : 1}, ${model.flipY ? -1 : 1})`;
    textElement.textContent = str;
    newChildren.push(textElement);
  }

  // Replace existing children to avoid memory leaks
  element.replaceChildren(...newChildren);

  applyTransformStyles(model, element);

  manageClassNames(model, element);
  applyShadowStyles(model, element, renderer);
};
