import {
  DomElementRendererExtension,
  type DomRenderer,
} from '@blocksuite/affine-block-surface';
import type { HighlighterElementModel } from '@blocksuite/affine-model';
import { DefaultTheme } from '@blocksuite/affine-model';

export const HighlighterDomRendererExtension = DomElementRendererExtension(
  'highlighter',
  (
    model: HighlighterElementModel,
    domElement: HTMLElement,
    renderer: DomRenderer
  ) => {
    const { zoom } = renderer.viewport;
    const { rotate } = model;
    const [, , w, h] = model.deserializedXYWH;

    // Early return if invalid dimensions
    if (w <= 0 || h <= 0) {
      return;
    }

    // Early return if no commands
    if (!model.commands) {
      return;
    }

    const cx = w / 2;
    const cy = h / 2;

    // Clear previous content
    domElement.innerHTML = '';

    // Get color value
    const color = renderer.getColorValue(
      model.color,
      DefaultTheme.hightlighterColor,
      true
    );

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
    if (rotate !== 0) {
      const transform = `translate(${cx}, ${cy}) rotate(${rotate}deg) translate(${-cx}, ${-cy})`;
      svg.setAttribute('transform', transform);
    }

    // Create path element for the highlighter stroke
    const pathElement = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'path'
    );
    pathElement.setAttribute('d', model.commands);
    pathElement.setAttribute('fill', color);
    pathElement.setAttribute('stroke', 'none');

    svg.append(pathElement);
    domElement.append(svg);

    // Set element size and position
    domElement.style.width = `${w * zoom}px`;
    domElement.style.height = `${h * zoom}px`;
    domElement.style.overflow = 'visible';
    domElement.style.pointerEvents = 'none';

    // Set z-index for layering
    domElement.style.zIndex = renderer.layerManager.getZIndex(model).toString();
  }
);
