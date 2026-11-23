import {
  DomElementRendererExtension,
  type DomRenderer,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorMode,
  DefaultTheme,
  type LocalConnectorElementModel,
  type PointStyle,
} from '@blocksuite/affine-model';
import { PointLocation, SVGPathBuilder } from '@blocksuite/global/gfx';

import { isConnectorWithLabel } from '../connector-manager';
import { DEFAULT_ARROW_SIZE } from './utils';

const SVG_NS = 'http://www.w3.org/2000/svg';

interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

type RetainedConnectorDom = {
  defs: SVGDefsElement;
  label: HTMLDivElement | null;
  path: SVGPathElement;
  svg: SVGSVGElement;
};

const retainedConnectorDom = new WeakMap<HTMLElement, RetainedConnectorDom>();

function calculatePathBounds(path: PointLocation[]): PathBounds {
  if (path.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = path[0][0];
  let minY = path[0][1];
  let maxX = path[0][0];
  let maxY = path[0][1];

  for (const point of path) {
    minX = Math.min(minX, point[0]);
    minY = Math.min(minY, point[1]);
    maxX = Math.max(maxX, point[0]);
    maxY = Math.max(maxY, point[1]);
  }

  return { minX, minY, maxX, maxY };
}

function createConnectorPath(
  points: PointLocation[],
  mode: ConnectorMode
): string {
  if (points.length < 2) return '';

  const pathBuilder = new SVGPathBuilder();
  pathBuilder.moveTo(points[0][0], points[0][1]);

  if (mode === ConnectorMode.Curve) {
    // Use bezier curves
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      pathBuilder.curveTo(
        prev.absOut[0],
        prev.absOut[1],
        curr.absIn[0],
        curr.absIn[1],
        curr[0],
        curr[1]
      );
    }
  } else {
    // Use straight lines
    for (let i = 1; i < points.length; i++) {
      pathBuilder.lineTo(points[i][0], points[i][1]);
    }
  }

  return pathBuilder.build();
}

function createArrowMarker(
  id: string,
  style: PointStyle,
  color: string,
  strokeWidth: number,
  isStart: boolean = false
): SVGMarkerElement {
  const marker = document.createElementNS(SVG_NS, 'marker');
  const size = DEFAULT_ARROW_SIZE * (strokeWidth / 2);

  marker.id = id;
  marker.setAttribute('viewBox', '0 0 20 20');
  marker.setAttribute('refX', isStart ? '20' : '0');
  marker.setAttribute('refY', '10');
  marker.setAttribute('markerWidth', String(size));
  marker.setAttribute('markerHeight', String(size));
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');

  switch (style) {
    case 'Arrow': {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute(
        'd',
        isStart ? 'M 20 5 L 10 10 L 20 15 Z' : 'M 0 5 L 10 10 L 0 15 Z'
      );
      path.setAttribute('fill', color);
      path.setAttribute('stroke', color);
      marker.append(path);
      break;
    }
    case 'Triangle': {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute(
        'd',
        isStart ? 'M 20 7 L 12 10 L 20 13 Z' : 'M 0 7 L 8 10 L 0 13 Z'
      );
      path.setAttribute('fill', color);
      path.setAttribute('stroke', color);
      marker.append(path);
      break;
    }
    case 'Circle': {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', '10');
      circle.setAttribute('cy', '10');
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', color);
      marker.append(circle);
      break;
    }
    case 'Diamond': {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', 'M 10 6 L 14 10 L 10 14 L 6 10 Z');
      path.setAttribute('fill', color);
      path.setAttribute('stroke', color);
      marker.append(path);
      break;
    }
  }

  return marker;
}

function clearRetainedConnectorDom(element: HTMLElement) {
  retainedConnectorDom.delete(element);
  element.replaceChildren();
}

function getRetainedConnectorDom(element: HTMLElement): RetainedConnectorDom {
  const existing = retainedConnectorDom.get(element);

  if (existing) {
    return existing;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.style.position = 'absolute';
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';

  const defs = document.createElementNS(SVG_NS, 'defs');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');

  svg.append(defs, path);
  element.replaceChildren(svg);

  const retained = {
    svg,
    defs,
    path,
    label: null,
  };
  retainedConnectorDom.set(element, retained);

  return retained;
}

function getOrCreateLabelElement(retained: RetainedConnectorDom) {
  if (retained.label) {
    return retained.label;
  }

  const label = document.createElement('div');
  retained.svg.insertAdjacentElement('afterend', label);
  retained.label = label;

  return label;
}

function renderConnectorLabel(
  model: ConnectorElementModel,
  retained: RetainedConnectorDom,
  renderer: DomRenderer,
  zoom: number
) {
  if (!isConnectorWithLabel(model) || !model.labelXYWH) {
    retained.label?.remove();
    retained.label = null;
    return;
  }

  const [lx, ly, lw, lh] = model.labelXYWH;
  const {
    labelStyle: {
      color,
      fontSize,
      fontWeight,
      fontStyle,
      fontFamily,
      textAlign,
    },
  } = model;

  const labelElement = getOrCreateLabelElement(retained);
  labelElement.style.position = 'absolute';
  labelElement.style.left = `${lx * zoom}px`;
  labelElement.style.top = `${ly * zoom}px`;
  labelElement.style.width = `${lw * zoom}px`;
  labelElement.style.height = `${lh * zoom}px`;
  labelElement.style.pointerEvents = 'none';
  labelElement.style.overflow = 'hidden';
  labelElement.style.display = 'flex';
  labelElement.style.alignItems = 'center';
  labelElement.style.justifyContent =
    textAlign === 'center'
      ? 'center'
      : textAlign === 'right'
        ? 'flex-end'
        : 'flex-start';

  // Style the text
  labelElement.style.color = renderer.getColorValue(
    color,
    DefaultTheme.black,
    true
  );
  labelElement.style.fontSize = `${fontSize * zoom}px`;
  labelElement.style.fontWeight = fontWeight;
  labelElement.style.fontStyle = fontStyle;
  labelElement.style.fontFamily = fontFamily;
  labelElement.style.textAlign = textAlign;
  labelElement.style.lineHeight = '1.2';
  labelElement.style.whiteSpace = 'pre-wrap';
  labelElement.style.wordWrap = 'break-word';

  // Add text content
  labelElement.textContent = model.text ? model.text.toString() : '';
}

/**
 * Renders a ConnectorElementModel to a given HTMLElement using DOM/SVG.
 * This function is intended to be registered via the DomElementRendererExtension.
 *
 * @param model - The connector element model containing rendering properties.
 * @param element - The HTMLElement to apply the connector's styles to.
 * @param renderer - The main DOMRenderer instance, providing access to viewport and color utilities.
 */
export const connectorBaseDomRenderer = (
  model: ConnectorElementModel | LocalConnectorElementModel,
  element: HTMLElement,
  renderer: DomRenderer
): void => {
  const { zoom } = renderer.viewport;
  const {
    mode,
    path: points,
    strokeStyle,
    frontEndpointStyle,
    rearEndpointStyle,
    strokeWidth,
    stroke,
  } = model;

  if (!points || points.length < 2) {
    clearRetainedConnectorDom(element);
    return;
  }

  const retained = getRetainedConnectorDom(element);

  // Calculate bounds for the SVG viewBox
  const pathBounds = calculatePathBounds(points);
  const padding = Math.max(strokeWidth * 2, 20); // Add padding for arrows
  const svgWidth = (pathBounds.maxX - pathBounds.minX + padding * 2) * zoom;
  const svgHeight = (pathBounds.maxY - pathBounds.minY + padding * 2) * zoom;
  const offsetX = pathBounds.minX - padding;
  const offsetY = pathBounds.minY - padding;

  const { defs, path, svg } = retained;
  svg.style.position = 'absolute';
  svg.style.left = `${offsetX * zoom}px`;
  svg.style.top = `${offsetY * zoom}px`;
  svg.style.width = `${svgWidth}px`;
  svg.style.height = `${svgHeight}px`;
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';
  svg.setAttribute('viewBox', `0 0 ${svgWidth / zoom} ${svgHeight / zoom}`);

  const strokeColor = renderer.getColorValue(
    stroke,
    DefaultTheme.connectorColor,
    true
  );

  const markers: SVGMarkerElement[] = [];
  let startMarkerId = '';
  let endMarkerId = '';

  if (frontEndpointStyle !== 'None') {
    startMarkerId = `start-marker-${model.id}`;
    markers.push(
      createArrowMarker(
        startMarkerId,
        frontEndpointStyle,
        strokeColor,
        strokeWidth,
        true
      )
    );
  }

  if (rearEndpointStyle !== 'None') {
    endMarkerId = `end-marker-${model.id}`;
    markers.push(
      createArrowMarker(
        endMarkerId,
        rearEndpointStyle,
        strokeColor,
        strokeWidth,
        false
      )
    );
  }

  defs.replaceChildren(...markers);

  // Adjust points relative to the SVG coordinate system
  const adjustedPoints = points.map(point => {
    const adjustedPoint = new PointLocation([
      point[0] - offsetX,
      point[1] - offsetY,
    ]);
    if (point.absIn) {
      adjustedPoint.in = [
        point.absIn[0] - offsetX - adjustedPoint[0],
        point.absIn[1] - offsetY - adjustedPoint[1],
      ];
    }
    if (point.absOut) {
      adjustedPoint.out = [
        point.absOut[0] - offsetX - adjustedPoint[0],
        point.absOut[1] - offsetY - adjustedPoint[1],
      ];
    }
    return adjustedPoint;
  });

  const pathData = createConnectorPath(adjustedPoints, mode);
  path.setAttribute('d', pathData);
  path.setAttribute('stroke', strokeColor);
  path.setAttribute('stroke-width', String(strokeWidth));
  if (strokeStyle === 'dash') {
    path.setAttribute('stroke-dasharray', '12,12');
  } else {
    path.removeAttribute('stroke-dasharray');
  }
  if (startMarkerId) {
    path.setAttribute('marker-start', `url(#${startMarkerId})`);
  } else {
    path.removeAttribute('marker-start');
  }
  if (endMarkerId) {
    path.setAttribute('marker-end', `url(#${endMarkerId})`);
  } else {
    path.removeAttribute('marker-end');
  }

  // Set element size and position
  element.style.width = `${model.w * zoom}px`;
  element.style.height = `${model.h * zoom}px`;
  element.style.overflow = 'visible';
  element.style.pointerEvents = 'none';
};

export const connectorDomRenderer = (
  model: ConnectorElementModel,
  element: HTMLElement,
  renderer: DomRenderer
): void => {
  connectorBaseDomRenderer(model, element, renderer);

  const retained = retainedConnectorDom.get(element);
  if (!retained) return;

  renderConnectorLabel(model, retained, renderer, renderer.viewport.zoom);
};

/**
 * Extension to register the DOM-based renderer for 'connector' elements.
 */
export const ConnectorDomRendererExtension = DomElementRendererExtension(
  'connector',
  connectorDomRenderer
);
