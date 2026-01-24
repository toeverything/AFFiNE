import {
  DomElementRendererExtension,
  type DomRenderer,
} from '@blocksuite/affine-block-surface';
import {
  type ConnectorElementModel,
  ConnectorMode,
  DefaultTheme,
  type JumpStyle,
  type LocalConnectorElementModel,
  type PointStyle,
} from '@blocksuite/affine-model';
import { PointLocation, SVGPathBuilder } from '@blocksuite/global/gfx';

import { isConnectorWithLabel } from '../connector-manager';
import { type RoutedPoint, updateConnectorJumps } from '../jump-calculator';
import { DEFAULT_ARROW_SIZE } from './utils';

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

/**
 * Create a connector path with jump rendering at intersection points.
 * Based on draw.io's jump rendering (Graph.js:9161-9292).
 */
function createConnectorPathWithJumps(
  routedPoints: RoutedPoint[],
  jumpStyle: JumpStyle,
  jumpSize: number,
  strokeWidth: number
): string {
  if (routedPoints.length < 2) return '';

  const pathBuilder = new SVGPathBuilder();
  const size = (jumpSize - 2) / 2 + strokeWidth;
  let moveTo = true;

  for (let i = 0; i < routedPoints.length - 1; i++) {
    const current = routedPoints[i];
    const next = routedPoints[i + 1];

    if (i === 0 || moveTo) {
      pathBuilder.moveTo(current.x, current.y);
      moveTo = false;
    }

    // Type 1 means jump point (intersection)
    if (next.type === 1) {
      // Calculate direction vector and perpendicular offset
      const dx = next.x - current.x;
      const dy = next.y - current.y;
      const len = Math.hypot(dx, dy);

      if (len > 0) {
        const nx = (dx / len) * size;
        const ny = (dy / len) * size;

        const p0x = next.x - nx;
        const p0y = next.y - ny;
        const p1x = next.x + nx;
        const p1y = next.y + ny;

        // Determine flip factor for jump direction
        const f =
          Math.round(nx) < 0 || (Math.round(nx) === 0 && Math.round(ny) <= 0)
            ? 1
            : -1;

        // Render based on jump style
        switch (jumpStyle) {
          case 'sharp':
            // Sharp angle perpendicular to line
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
            pathBuilder.lineTo(p1x - ny * f, p1y + nx * f);
            pathBuilder.lineTo(p1x, p1y);
            break;

          case 'arc': {
            // Curved arc over intersection
            const arcF = f * 1.3;
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.curveTo(
              p0x - ny * arcF,
              p0y + nx * arcF,
              p1x - ny * arcF,
              p1y + nx * arcF,
              p1x,
              p1y
            );
            break;
          }

          case 'line':
            // Crossing lines (X shape)
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.moveTo(p0x + ny * f, p0y - nx * f);
            pathBuilder.lineTo(p0x - ny * f, p0y + nx * f);
            pathBuilder.moveTo(p1x - ny * f, p1y + nx * f);
            pathBuilder.lineTo(p1x + ny * f, p1y - nx * f);
            pathBuilder.moveTo(p1x, p1y);
            moveTo = true;
            break;

          case 'gap':
            // Gap - just move without drawing
            pathBuilder.lineTo(p0x, p0y);
            pathBuilder.moveTo(p1x, p1y);
            moveTo = true;
            break;

          default:
            // 'none' - straight through
            pathBuilder.lineTo(next.x, next.y);
            break;
        }
      }
    } else {
      // Normal waypoint - just draw line
      pathBuilder.lineTo(next.x, next.y);
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
  const marker = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'marker'
  );
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
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
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
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
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
      const circle = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'circle'
      );
      circle.setAttribute('cx', '10');
      circle.setAttribute('cy', '10');
      circle.setAttribute('r', '4');
      circle.setAttribute('fill', color);
      circle.setAttribute('stroke', color);
      marker.append(circle);
      break;
    }
    case 'Diamond': {
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path'
      );
      path.setAttribute('d', 'M 10 6 L 14 10 L 10 14 L 6 10 Z');
      path.setAttribute('fill', color);
      path.setAttribute('stroke', color);
      marker.append(path);
      break;
    }
  }

  return marker;
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
    jumpStyle = 'none',
    jumpSize = 10,
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

  // Create SVG element
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.style.position = 'absolute';
  svg.style.left = `${offsetX * zoom}px`;
  svg.style.top = `${offsetY * zoom}px`;
  svg.style.width = `${svgWidth}px`;
  svg.style.height = `${svgHeight}px`;
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';
  svg.setAttribute('viewBox', `0 0 ${svgWidth / zoom} ${svgHeight / zoom}`);

  // Create defs for markers
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  svg.append(defs);

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
    const startMarker = createArrowMarker(
      startMarkerId,
      frontEndpointStyle,
      strokeColor,
      strokeWidth,
      true
    );
    defs.append(startMarker);
  }

  if (rearEndpointStyle !== 'None') {
    endMarkerId = `end-marker-${model.id}`;
    const endMarker = createArrowMarker(
      endMarkerId,
      rearEndpointStyle,
      strokeColor,
      strokeWidth,
      false
    );
    defs.append(endMarker);
  }

  // Create path element
  const pathElement = document.createElementNS(
    'http://www.w3.org/2000/svg',
    'path'
  );

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

  // TODO: Wire up jump rendering when view layer integration is complete
  // To enable jumps:
  // 1. Get all connectors from the view/store layer
  // 2. Call: const routedPoints = updateConnectorJumps(model, allConnectors)
  // 3. If routedPoints.length > 0 && jumpStyle !== 'none':
  //    pathData = createConnectorPathWithJumps(routedPoints, jumpStyle, jumpSize, strokeWidth)
  // 4. Else: pathData = createConnectorPath(adjustedPoints, mode)
  //
  // For now, using standard rendering until intersection detection is wired up

  const pathData = createConnectorPath(adjustedPoints, mode);
  pathElement.setAttribute('d', pathData);
  pathElement.setAttribute('stroke', strokeColor);
  pathElement.setAttribute('stroke-width', String(strokeWidth));
  pathElement.setAttribute('fill', 'none');
  pathElement.setAttribute('stroke-linecap', 'round');
  pathElement.setAttribute('stroke-linejoin', 'round');

  // Apply stroke style
  if (strokeStyle === 'dash') {
    pathElement.setAttribute('stroke-dasharray', '12,12');
  }

  // Apply markers
  if (startMarkerId) {
    pathElement.setAttribute('marker-start', `url(#${startMarkerId})`);
  }
  if (endMarkerId) {
    pathElement.setAttribute('marker-end', `url(#${endMarkerId})`);
  }

  svg.append(pathElement);
  element.append(svg);

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
  renderConnectorLabel(model, element, renderer, renderer.viewport.zoom);
};

/**
 * Extension to register the DOM-based renderer for 'connector' elements.
 */
export const ConnectorDomRendererExtension = DomElementRendererExtension(
  'connector',
  connectorDomRenderer
);
