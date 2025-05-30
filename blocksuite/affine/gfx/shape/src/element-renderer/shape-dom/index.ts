import type { DomRenderer } from '@blocksuite/affine-block-surface';
import type { ShapeElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';
import { SVG } from '@svgdotjs/svg.js';

import { manageClassNames, setStyles } from './utils';

function createDiamondPoints(
  width: number,
  height: number,
  strokeWidth: number = 0
): string {
  const halfStroke = strokeWidth / 2;
  return [
    `${width / 2},${halfStroke}`,
    `${width - halfStroke},${height / 2}`,
    `${width / 2},${height - halfStroke}`,
    `${halfStroke},${height / 2}`,
  ].join(' ');
}

function createTrianglePoints(
  width: number,
  height: number,
  strokeWidth: number = 0
): string {
  const halfStroke = strokeWidth / 2;
  return [
    `${width / 2},${halfStroke}`,
    `${width - halfStroke},${height - halfStroke}`,
    `${halfStroke},${height - halfStroke}`,
  ].join(' ');
}

function applyShapeSpecificStyles(
  model: ShapeElementModel,
  element: HTMLElement,
  zoom: number
) {
  // Reset properties that might be set by different shape types
  element.style.removeProperty('clip-path');
  element.style.removeProperty('border-radius');
  // Clear DOM for shapes that don't use SVG, or if type changes from SVG-based to non-SVG-based
  if (model.shapeType !== 'diamond' && model.shapeType !== 'triangle') {
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
      element.style.clipPath = 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)';
      break;
    case 'triangle':
      element.style.clipPath = 'polygon(50% 0%, 100% 100%, 0% 100%)';
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
      ? `${model.strokeWidth * zoom}px ${model.strokeStyle === 'dash' ? 'dashed' : 'solid'} ${strokeColor}`
      : 'none';
}

function applyTransformStyles(model: ShapeElementModel, element: HTMLElement) {
  if (model.rotate && model.rotate !== 0) {
    setStyles(element, {
      transform: `rotate(${model.rotate}deg)`,
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

  if (model.shapeType === 'diamond' || model.shapeType === 'triangle') {
    // For diamond and triangle, fill and border are handled by inline SVG
    element.style.border = 'none'; // Ensure no standard CSS border interferes
    element.style.backgroundColor = 'transparent'; // Host element is transparent

    const strokeW = model.strokeWidth;

    let svgPoints = '';
    if (model.shapeType === 'diamond') {
      // Generate diamond points directly
      svgPoints = createDiamondPoints(unscaledWidth, unscaledHeight, strokeW);
    } else {
      // Generate triangle points directly
      svgPoints = createTrianglePoints(unscaledWidth, unscaledHeight, strokeW);
    }

    // Determine if stroke should be visible and its color
    const finalStrokeColor =
      model.strokeStyle !== 'none' && strokeW > 0 ? strokeColor : 'transparent';
    // Determine dash array, only if stroke is visible and style is 'dash'
    const finalStrokeDasharray =
      model.strokeStyle === 'dash' && finalStrokeColor !== 'transparent'
        ? '12, 12'
        : 'none';
    // Determine fill color
    const finalFillColor = model.filled ? fillColor : 'transparent';

    // Build SVG using svg.js
    const svg = SVG().addTo(element).size('100%', '100%');
    svg.attr({
      viewBox: `0 0 ${unscaledWidth} ${unscaledHeight}`,
      preserveAspectRatio: 'none',
    });

    const polygon = svg.polygon(svgPoints);
    polygon.attr({
      fill: finalFillColor,
      stroke: finalStrokeColor,
      'stroke-width': strokeW,
    });

    if (finalStrokeDasharray !== 'none') {
      polygon.attr('stroke-dasharray', finalStrokeDasharray);
    }

    // Replace existing children to avoid memory leaks
    element.replaceChildren(svg.node);
  } else {
    // Standard rendering for other shapes (e.g., rect, ellipse)
    // innerHTML was already cleared by applyShapeSpecificStyles if necessary
    element.style.backgroundColor = model.filled ? fillColor : 'transparent';
    applyBorderStyles(model, element, strokeColor, zoom); // Uses standard CSS border
  }

  applyTransformStyles(model, element);

  element.style.zIndex = renderer.layerManager.getZIndex(model).toString();

  manageClassNames(model, element);
  applyShadowStyles(model, element, renderer);
};
