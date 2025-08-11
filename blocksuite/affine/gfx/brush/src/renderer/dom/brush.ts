import {
  DomElementRendererExtension,
  type DomRenderer,
} from '@blocksuite/affine-block-surface';
import type { BrushElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';

export const BrushDomRendererExtension = DomElementRendererExtension(
  'brush',
  (
    model: BrushElementModel,
    domElement: HTMLElement,
    renderer: DomRenderer
  ) => {
    const { zoom } = renderer.viewport;
    const [, , w, h] = model.deserializedXYWH;

    // Early return if invalid dimensions
    if (w <= 0 || h <= 0) {
      return;
    }

    // Early return if no commands
    if (!model.commands) {
      return;
    }

    // Clear previous content
    domElement.innerHTML = '';

    // Get color value
    const color = renderer.getColorValue(model.color, DefaultTheme.black, true);

    // Create SVG element
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.style.position = 'absolute';
    svg.style.left = '0';
    svg.style.top = '0';
    svg.style.width = `${w * zoom}px`;
    svg.style.height = `${h * zoom}px`;
    svg.style.overflow = 'visible';
    svg.style.pointerEvents = 'none';
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // Apply rotation transform
    if (model.rotate !== 0) {
      svg.style.transform = `rotate(${model.rotate}deg)`;
      svg.style.transformOrigin = 'center';
    }

    // Create path element for the brush stroke
    const pathElement = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );
    pathElement.setAttribute('d', model.commands);
    pathElement.setAttribute('fill', color);
    pathElement.setAttribute('stroke', 'none');

    svg.append(pathElement);
    domElement.replaceChildren(svg);

    // Set element size and position
    domElement.style.width = `${w * zoom}px`;
    domElement.style.height = `${h * zoom}px`;
    domElement.style.overflow = 'visible';
    domElement.style.pointerEvents = 'none';
  }
);
