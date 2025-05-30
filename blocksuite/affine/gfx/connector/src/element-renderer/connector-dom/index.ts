import type { DomRenderer } from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorMode,
  DefaultTheme,
  type PointStyle,
} from '@blocksuite/affine-model';
import { PointLocation } from '@blocksuite/global/gfx';
import { SVG } from '@svgdotjs/svg.js';

import { isConnectorWithLabel } from '../../connector-manager.js';
import { DEFAULT_ARROW_SIZE } from '../utils.js';

interface PathBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

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

  let pathData = `M ${points[0][0]} ${points[0][1]}`;

  if (mode === ConnectorMode.Curve) {
    // Use bezier curves
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      pathData += ` C ${prev.absOut[0]} ${prev.absOut[1]} ${curr.absIn[0]} ${curr.absIn[1]} ${curr[0]} ${curr[1]}`;
    }
  } else {
    // Use straight lines
    for (let i = 1; i < points.length; i++) {
      pathData += ` L ${points[i][0]} ${points[i][1]}`;
    }
  }

  return pathData;
}

function createArrowMarker(
  svg: any,
  id: string,
  style: PointStyle,
  color: string,
  strokeWidth: number,
  isStart: boolean = false
): void {
  const size = DEFAULT_ARROW_SIZE * (strokeWidth / 2);
  const defs = svg.defs();

  const marker = defs.marker(size, size, function (add: any) {
    switch (style) {
      case 'Arrow': {
        add
          .path(isStart ? 'M 20 5 L 10 10 L 20 15 Z' : 'M 0 5 L 10 10 L 0 15 Z')
          .fill(color)
          .stroke(color);
        break;
      }
      case 'Triangle': {
        add
          .path(isStart ? 'M 20 7 L 12 10 L 20 13 Z' : 'M 0 7 L 8 10 L 0 13 Z')
          .fill(color)
          .stroke(color);
        break;
      }
      case 'Circle': {
        add.circle(8).center(10, 10).fill(color).stroke(color);
        break;
      }
      case 'Diamond': {
        add.path('M 10 6 L 14 10 L 10 14 L 6 10 Z').fill(color).stroke(color);
        break;
      }
    }
  });

  marker.id(id);
  marker.attr({
    viewBox: '0 0 20 20',
    refX: isStart ? '20' : '0',
    refY: '10',
    orient: 'auto',
    markerUnits: 'strokeWidth',
  });
}

function renderConnectorLabel(
  model: ConnectorElementModel,
  container: HTMLElement,
  renderer: DomRenderer,
  zoom: number
) {
  if (!isConnectorWithLabel(model) || !model.labelXYWH) {
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

  // Create label element
  const labelElement = document.createElement('div');
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
  if (model.text) {
    labelElement.textContent = model.text.toString();
  }

  container.append(labelElement);
}

/**
 * Renders a ConnectorElementModel to a given HTMLElement using DOM/SVG.
 * This function is intended to be registered via the DomElementRendererExtension.
 *
 * @param model - The connector element model containing rendering properties.
 * @param element - The HTMLElement to apply the connector's styles to.
 * @param renderer - The main DOMRenderer instance, providing access to viewport and color utilities.
 */
export const connectorDomRenderer = (
  model: ConnectorElementModel,
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

  // Clear previous content
  element.innerHTML = '';

  // Early return if no path points
  if (!points || points.length < 2) {
    return;
  }

  // Calculate bounds for the SVG viewBox
  const pathBounds = calculatePathBounds(points);
  const padding = Math.max(strokeWidth * 2, 20); // Add padding for arrows
  const svgWidth = (pathBounds.maxX - pathBounds.minX + padding * 2) * zoom;
  const svgHeight = (pathBounds.maxY - pathBounds.minY + padding * 2) * zoom;
  const offsetX = pathBounds.minX - padding;
  const offsetY = pathBounds.minY - padding;

  // Create SVG using svg.js
  const svg = SVG().addTo(element).size(svgWidth, svgHeight);
  svg.attr({
    style: `position: absolute; left: ${offsetX * zoom}px; top: ${offsetY * zoom}px; overflow: visible; pointer-events: none;`,
    viewBox: `0 0 ${svgWidth / zoom} ${svgHeight / zoom}`,
  });

  const strokeColor = renderer.getColorValue(
    stroke,
    DefaultTheme.connectorColor,
    true
  );

  // Create markers for endpoints
  let startMarkerId = '';
  let endMarkerId = '';

  if (frontEndpointStyle !== 'None') {
    startMarkerId = `start-marker-${model.id}`;
    createArrowMarker(
      svg,
      startMarkerId,
      frontEndpointStyle,
      strokeColor,
      strokeWidth,
      true
    );
  }

  if (rearEndpointStyle !== 'None') {
    endMarkerId = `end-marker-${model.id}`;
    createArrowMarker(
      svg,
      endMarkerId,
      rearEndpointStyle,
      strokeColor,
      strokeWidth,
      false
    );
  }

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

  // Create path element using svg.js
  const pathData = createConnectorPath(adjustedPoints, mode);
  const pathElement = svg.path(pathData);

  pathElement.attr({
    stroke: strokeColor,
    'stroke-width': strokeWidth,
    fill: 'none',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
  });

  // Apply stroke style
  if (strokeStyle === 'dash') {
    pathElement.attr('stroke-dasharray', '12,12');
  }

  // Apply markers
  if (startMarkerId) {
    pathElement.attr('marker-start', `url(#${startMarkerId})`);
  }
  if (endMarkerId) {
    pathElement.attr('marker-end', `url(#${endMarkerId})`);
  }

  // Set element size and position
  element.style.width = `${model.w * zoom}px`;
  element.style.height = `${model.h * zoom}px`;
  element.style.overflow = 'visible';
  element.style.pointerEvents = 'none';

  // Set z-index for layering
  element.style.zIndex = renderer.layerManager.getZIndex(model).toString();

  // Render label if present
  renderConnectorLabel(model, element, renderer, zoom);
};
