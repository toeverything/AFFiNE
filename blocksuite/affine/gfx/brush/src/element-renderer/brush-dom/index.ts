import type { DomRenderer } from '@blocksuite/affine-block-surface';
import type { BrushElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';

/**
 * Renders a BrushElementModel to a given HTMLElement using DOM properties.
 * This function is intended to be registered via the DomElementRendererExtension.
 *
 * @param model - The brush element model containing rendering properties.
 * @param element - The HTMLElement to apply the brush's styles to.
 * @param renderer - The main DOMRenderer instance, providing access to viewport and color utilities.
 */
export const brushDomRenderer = (
  model: BrushElementModel,
  element: HTMLElement,
  renderer: DomRenderer
): void => {
  const { zoom } = renderer.viewport;
  const unscaledWidth = model.w;
  const unscaledHeight = model.h;

  const color = renderer.getColorValue(model.color, DefaultTheme.black, true);

  element.style.width = `${unscaledWidth * zoom}px`;
  element.style.height = `${unscaledHeight * zoom}px`;
  element.style.boxSizing = 'border-box';
  element.style.overflow = 'hidden';

  // Clear any existing content
  element.replaceChildren();

  // Create SVG element to render the brush stroke
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '100%');
  svg.setAttribute('height', '100%');
  svg.setAttribute('viewBox', `0 0 ${unscaledWidth} ${unscaledHeight}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // Create path element for the brush stroke
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', model.commands);
  path.setAttribute('fill', color);
  path.setAttribute('stroke', 'none');

  svg.append(path);
  element.append(svg);

  // Apply rotation if needed
  if (model.rotate) {
    element.style.transform = `rotate(${model.rotate}deg)`;
    element.style.transformOrigin = 'center';
  }

  // Apply opacity
  element.style.opacity = `${model.opacity ?? 1}`;

  // Set z-index
  element.style.zIndex = renderer.layerManager.getZIndex(model).toString();

  // Add brush-specific class for styling
  element.classList.add('brush-element');
};
