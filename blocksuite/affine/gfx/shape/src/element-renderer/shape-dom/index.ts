import type { DomRenderer } from '@blocksuite/affine-block-surface';
import { isRTL } from '@blocksuite/affine-gfx-text';
import type { ShapeElementModel } from '@blocksuite/affine-model';
import {
  CONTAINER_TITLE_SIZE,
  DefaultTheme,
  ShapeType,
} from '@blocksuite/affine-model';

import { DRAWIO_STENCIL_SHAPE_MAP } from '../../drawio/stencil-map.js';
import {
  buildPathFromStencil,
  getStencilShapeData,
  loadStencilShapeData,
} from '../../drawio/stencil-utils.js';
import { getTextFlipCompensation } from '../shape/index.js';
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
  'mindmapBranch',
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

const gradientDirectionMap: Record<
  NonNullable<ShapeElementModel['gradientDirection']>,
  { x1: number; y1: number; x2: number; y2: number }
> = {
  S: { x1: 0, y1: 0, x2: 0, y2: 1 },
  W: { x1: 1, y1: 0, x2: 0, y2: 0 },
  N: { x1: 0, y1: 1, x2: 0, y2: 0 },
  E: { x1: 0, y1: 0, x2: 1, y2: 0 },
  SE: { x1: 0, y1: 0, x2: 1, y2: 1 },
  SW: { x1: 1, y1: 0, x2: 0, y2: 1 },
  NE: { x1: 0, y1: 1, x2: 1, y2: 0 },
  NW: { x1: 1, y1: 1, x2: 0, y2: 0 },
};

const cssGradientDirectionMap: Record<
  NonNullable<ShapeElementModel['gradientDirection']>,
  string
> = {
  S: 'to bottom',
  W: 'to left',
  N: 'to top',
  E: 'to right',
  SE: 'to bottom right',
  SW: 'to bottom left',
  NE: 'to top right',
  NW: 'to top left',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

const getFlipTransform = (
  model: ShapeElementModel,
  width: number,
  height: number
) => {
  if (!model.flipX && !model.flipY) return '';
  const sx = model.flipX ? -1 : 1;
  const sy = model.flipY ? -1 : 1;
  const cx = width / 2;
  const cy = height / 2;
  return `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
};

const appendGradientDefs = (
  svg: SVGSVGElement,
  gradientId: string,
  fillColor: string,
  gradientFinal: string,
  gradientDirection: NonNullable<ShapeElementModel['gradientDirection']>,
  width: number,
  height: number
) => {
  const defs = document.createElementNS(SVG_NS, 'defs');
  const gradient = document.createElementNS(SVG_NS, 'linearGradient');
  const coords = gradientDirectionMap[gradientDirection];
  gradient.setAttribute('id', gradientId);
  gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
  gradient.setAttribute('x1', String(coords.x1 * width));
  gradient.setAttribute('y1', String(coords.y1 * height));
  gradient.setAttribute('x2', String(coords.x2 * width));
  gradient.setAttribute('y2', String(coords.y2 * height));
  const start = document.createElementNS(SVG_NS, 'stop');
  start.setAttribute('offset', '0%');
  start.setAttribute('stop-color', fillColor);
  const end = document.createElementNS(SVG_NS, 'stop');
  end.setAttribute('offset', '100%');
  end.setAttribute('stop-color', gradientFinal);
  gradient.append(start, end);
  defs.append(gradient);
  svg.append(defs);
};

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
    case 'rect':
    case 'container':
    case 'verticalContainer':
    case 'horizontalContainer':
    case 'list':
    case 'mindmapBranch':
    case 'mindmapSubTopic':
    case 'mindmapSquare':
    case 'mindmapOrganization':
    case 'mindmapDivision': {
      const w = model.w * zoom;
      const h = model.h * zoom;
      const r = model.radius ?? 0;
      const borderRadius =
        r < 1 ? `${Math.min(w * r, h * r)}px` : `${r * zoom}px`;
      element.style.borderRadius = borderRadius;
      break;
    }
    case 'ellipse':
    case 'mindmapCentralIdea':
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
  const canFlipWithCss = !SVG_SHAPE_TYPES.has(model.shapeType);
  if (rotate !== 0 || (hasFlip && canFlipWithCss)) {
    const transforms: string[] = [];
    if (rotate !== 0) transforms.push(`rotate(${rotate}deg)`);
    if (hasFlip && canFlipWithCss) {
      const flipX = model.flipX ? -1 : 1;
      const flipY = model.flipY ? -1 : 1;
      transforms.push(`scale(${flipX}, ${flipY})`);
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
  const gradientFinal = model.gradientFinal
    ? renderer.getColorValue(model.gradientFinal, fillColor, true)
    : undefined;
  const gradientDirection = model.gradientDirection ?? 'S';
  const isFilled = model.filled || model.shapeType === 'drawioStencil';
  const hasGradient =
    Boolean(gradientFinal) && isFilled && gradientFinal !== fillColor;

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

    const finalStrokeColor =
      model.strokeStyle !== 'none' && strokeW > 0 ? strokeColor : 'transparent';
    const finalStrokeDasharray =
      model.strokeStyle === 'dash' && finalStrokeColor !== 'transparent'
        ? '12, 12'
        : model.strokeStyle === 'dot' && finalStrokeColor !== 'transparent'
          ? `${Math.max(1, strokeW)}, ${strokeW * 2.5}`
          : 'none';
    const finalFillColor = isFilled ? fillColor : 'transparent';
    const gradientId = hasGradient ? `shape-gradient-${model.id}` : '';
    const flipTransform = getFlipTransform(
      model,
      unscaledWidth,
      unscaledHeight
    );
    const fillPaint = hasGradient ? `url(#${gradientId})` : finalFillColor;

    let svgPath = '';
    let pathTransform = '';

    const stencilName =
      model.shapeType === 'document'
        ? undefined
        : model.shapeType === 'drawioStencil'
          ? model.stencilName
          : DRAWIO_STENCIL_SHAPE_MAP[model.shapeType];
    // Fast path: embedded geometry, no drawio library dependency at all.
    const stencil =
      model.shapeType === 'drawioStencil' && model.stencilData
        ? model.stencilData
        : stencilName
          ? getStencilShapeData(stencilName)
          : null;
    if (!stencil && stencilName && model.shapeType === 'drawioStencil') {
      // Legacy shape with nothing resolved yet: this frame renders without
      // a path (see the `if (stencil)` guard below), and the resolve
      // callback backfills stencilData, which triggers a repaint via the
      // existing elementUpdated -> refresh pipeline (DomRenderer._watchSurface).
      loadStencilShapeData(stencilName)
        .then(data => {
          if (data && !model.stencilData) {
            model.stencilData = data;
          }
        })
        .catch(() => {
          // best-effort — shape keeps rendering without a path this frame
        });
    }

    if (stencil) {
      const isLibraryStencil = model.shapeType === 'drawioStencil';
      const primaryCommands =
        stencil.paths.length > 0 ? stencil.paths : stencil.strokes;
      const fillCommands = isLibraryStencil
        ? primaryCommands.filter(commands =>
            commands.some(command => command.cmd === 'Z')
          )
        : stencil.paths;
      const strokeCommands = isLibraryStencil
        ? stencil.strokes.length > 0
          ? stencil.strokes
          : primaryCommands
        : stencil.strokes;
      const fillPaths = fillCommands.map(commands =>
        buildPathFromStencil(commands, width, height)
      );
      const strokePaths = strokeCommands.map(commands =>
        buildPathFromStencil(commands, width, height)
      );
      const paths = [...fillPaths, ...strokePaths];

      const svg = element.firstChild as SVGSVGElement;
      while (svg.firstChild) svg.firstChild.remove();
      if (hasGradient && gradientFinal) {
        appendGradientDefs(
          svg,
          gradientId,
          fillColor,
          gradientFinal,
          gradientDirection,
          unscaledWidth,
          unscaledHeight
        );
      }
      const pathGroup = document.createElementNS(SVG_NS, 'g');
      if (flipTransform) {
        pathGroup.setAttribute('transform', flipTransform);
      }
      paths.forEach((pathData, index) => {
        const path = document.createElementNS(SVG_NS, 'path');
        path.setAttribute('d', pathData);
        const isBackground = index < fillPaths.length;
        const fillColor = isLibraryStencil
          ? finalFillColor === 'transparent'
            ? finalStrokeColor
            : fillPaint
          : isBackground
            ? fillPaint
            : 'none';
        const strokeColor = isLibraryStencil
          ? isBackground
            ? 'none'
            : finalStrokeColor
          : finalStrokeColor;
        path.setAttribute('fill', String(fillColor));
        path.setAttribute('stroke', String(strokeColor));
        path.setAttribute('stroke-width', String(strokeW));
        if (finalStrokeDasharray !== 'none') {
          path.setAttribute('stroke-dasharray', finalStrokeDasharray);
          path.setAttribute(
            'stroke-linecap',
            model.strokeStyle === 'dot' ? 'round' : 'butt'
          );
        }
        path.setAttribute('transform', `translate(${left} ${top})`);
        pathGroup.append(path);
      });
      svg.append(pathGroup);
      return;
    }

    switch (model.shapeType) {
      case 'mindmapBranch':
        svgPath = buildPathFromPoints([
          [left, top + height / 2],
          [right, top + height / 2],
        ]);
        break;
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

    // Build SVG safely with DOM-API
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${unscaledWidth} ${unscaledHeight}`);
    svg.setAttribute('preserveAspectRatio', 'none');

    if (hasGradient && gradientFinal) {
      appendGradientDefs(
        svg,
        gradientId,
        fillColor,
        gradientFinal,
        gradientDirection,
        unscaledWidth,
        unscaledHeight
      );
    }

    const pathGroup = document.createElementNS(SVG_NS, 'g');
    if (flipTransform) {
      pathGroup.setAttribute('transform', flipTransform);
    }

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', svgPath);
    if (pathTransform) {
      path.setAttribute('transform', pathTransform);
    }
    const finalFill = model.shapeType === 'mindmapBranch' ? 'none' : fillPaint;
    path.setAttribute('fill', finalFill);
    path.setAttribute('stroke', finalStrokeColor);
    path.setAttribute('stroke-width', String(strokeW));
    if (finalStrokeDasharray !== 'none') {
      path.setAttribute('stroke-dasharray', finalStrokeDasharray);
      path.setAttribute(
        'stroke-linecap',
        model.strokeStyle === 'dot' ? 'round' : 'butt'
      );
    }
    pathGroup.append(path);

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
        pathGroup.append(inner);
      });
    }

    svg.append(pathGroup);

    newChildren.push(svg);
  } else {
    // Standard rendering for other shapes (e.g., rect, ellipse)
    // innerHTML was already cleared by applyShapeSpecificStyles if necessary
    if (hasGradient && gradientFinal && isFilled) {
      const direction = cssGradientDirectionMap[gradientDirection];
      element.style.backgroundImage = `linear-gradient(${direction}, ${fillColor}, ${gradientFinal})`;
      element.style.backgroundColor = fillColor;
    } else {
      element.style.backgroundImage = '';
      element.style.backgroundColor = isFilled ? fillColor : 'transparent';
    }
    applyBorderStyles(model, element, strokeColor, zoom); // Uses standard CSS border
  }

  if (
    model.shapeType === ShapeType.VerticalContainer ||
    model.shapeType === ShapeType.HorizontalContainer
  ) {
    const line = document.createElement('div');
    const strokeWidth = Math.max(1, model.strokeWidth * zoom);
    line.style.position = 'absolute';
    line.style.backgroundColor =
      model.strokeStyle === 'none' ? 'transparent' : strokeColor;
    line.style.pointerEvents = 'none';

    if (model.shapeType === ShapeType.VerticalContainer) {
      const titleHeight = Math.min(CONTAINER_TITLE_SIZE, model.h) * zoom;
      if (model.h * zoom > titleHeight + 1) {
        line.style.left = '0';
        line.style.right = '0';
        line.style.height = `${strokeWidth}px`;
        line.style.top = `${titleHeight}px`;
        line.style.transform = `translateY(${-strokeWidth / 2}px)`;
        newChildren.push(line);
      }
    }

    if (model.shapeType === ShapeType.HorizontalContainer) {
      const titleWidth = Math.min(CONTAINER_TITLE_SIZE, model.w) * zoom;
      if (model.w * zoom > titleWidth + 1) {
        line.style.top = '0';
        line.style.bottom = '0';
        line.style.width = `${strokeWidth}px`;
        line.style.left = `${titleWidth}px`;
        line.style.transform = `translateX(${-strokeWidth / 2}px)`;
        newChildren.push(line);
      }
    }
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
    textElement.dataset.role = 'shape-text';
    const textContent = document.createElement('span');
    textContent.textContent = str;
    textContent.style.display = 'inline-block';
    if (model.shapeType === ShapeType.Container) {
      textElement.style.justifyContent = 'flex-start';
    }
    if (model.shapeType === ShapeType.VerticalContainer) {
      const titleHeight = Math.min(CONTAINER_TITLE_SIZE, model.h) * zoom;
      textElement.style.inset = '0 0 auto 0';
      textElement.style.height = `${titleHeight}px`;
      textElement.style.justifyContent = 'center';
      textElement.style.alignItems = 'center';
    }
    if (model.shapeType === ShapeType.MindmapBranch) {
      textElement.style.justifyContent = 'flex-start';
      textElement.style.alignItems = 'center';
    }
    if (model.shapeType === ShapeType.HorizontalContainer) {
      const titleWidth = Math.min(CONTAINER_TITLE_SIZE, model.w) * zoom;
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.left = '0';
      wrapper.style.top = '0';
      wrapper.style.width = `${titleWidth}px`;
      wrapper.style.height = '100%';
      wrapper.style.overflow = 'hidden';
      wrapper.style.display = 'flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.justifyContent = 'center';

      textElement.style.position = 'relative';
      textElement.style.inset = 'auto';
      textElement.style.width = `${model.h * zoom}px`;
      textElement.style.height = 'auto';
      textElement.style.transformOrigin = 'center';
      textElement.style.transform = 'rotate(-90deg)';
      textElement.style.justifyContent = 'center';
      textElement.style.alignItems = 'center';
      textElement.dataset.role = 'shape-text';

      wrapper.append(textElement);
      newChildren.push(wrapper);
      element.replaceChildren(...newChildren);
      applyTransformStyles(model, element);
      manageClassNames(model, element);
      applyShadowStyles(model, element, renderer);
      return;
    }
    const inherited = getTextFlipCompensation(
      model.shapeType,
      !SVG_SHAPE_TYPES.has(model.shapeType) && model.flipX,
      !SVG_SHAPE_TYPES.has(model.shapeType) && model.flipY
    );
    const textScaleX = inherited.x * (model.textFlipX ? -1 : 1);
    const textScaleY = inherited.y * (model.textFlipY ? -1 : 1);
    const textRotate = (model.textRotate ?? 0) + inherited.rotate;
    if (textScaleX !== 1 || textScaleY !== 1 || textRotate !== 0) {
      textContent.style.transformOrigin = 'center';
      textContent.style.transform = `scale(${textScaleX}, ${textScaleY}) rotate(${textRotate}deg)`;
    }
    textElement.append(textContent);
    newChildren.push(textElement);
  }

  // Replace existing children to avoid memory leaks
  element.replaceChildren(...newChildren);

  applyTransformStyles(model, element);

  manageClassNames(model, element);
  applyShadowStyles(model, element, renderer);
};
