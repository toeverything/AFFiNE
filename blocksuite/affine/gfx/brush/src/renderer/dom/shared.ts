import type { DomRenderer } from '@blocksuite/affine-block-surface';
import type {
  BrushElementModel,
  HighlighterElementModel,
} from '@blocksuite/affine-model';

const SVG_NS = 'http://www.w3.org/2000/svg';

type BrushLikeModel = BrushElementModel | HighlighterElementModel;

type RetainedBrushDom = {
  path: SVGPathElement;
  svg: SVGSVGElement;
};

const retainedBrushDom = new WeakMap<HTMLElement, RetainedBrushDom>();

function clearBrushLikeDom(domElement: HTMLElement) {
  retainedBrushDom.delete(domElement);
  domElement.replaceChildren();
}

function getRetainedBrushDom(domElement: HTMLElement) {
  const existing = retainedBrushDom.get(domElement);

  if (existing) {
    return existing;
  }

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.style.position = 'absolute';
  svg.style.left = '0';
  svg.style.top = '0';
  svg.style.overflow = 'visible';
  svg.style.pointerEvents = 'none';

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('stroke', 'none');
  svg.append(path);

  const retained = { svg, path };
  retainedBrushDom.set(domElement, retained);
  domElement.replaceChildren(svg);

  return retained;
}

export function renderBrushLikeDom({
  color,
  domElement,
  model,
  renderer,
}: {
  color: string;
  domElement: HTMLElement;
  model: BrushLikeModel;
  renderer: DomRenderer;
}) {
  const { zoom } = renderer.viewport;
  const [, , w, h] = model.deserializedXYWH;

  if (w <= 0 || h <= 0 || !model.commands) {
    clearBrushLikeDom(domElement);
    return;
  }

  const { path, svg } = getRetainedBrushDom(domElement);

  svg.style.width = `${w * zoom}px`;
  svg.style.height = `${h * zoom}px`;
  svg.style.transform = model.rotate === 0 ? '' : `rotate(${model.rotate}deg)`;
  svg.style.transformOrigin = model.rotate === 0 ? '' : 'center';
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  path.setAttribute('d', model.commands);
  path.setAttribute('fill', color);

  domElement.style.width = `${w * zoom}px`;
  domElement.style.height = `${h * zoom}px`;
  domElement.style.overflow = 'visible';
  domElement.style.pointerEvents = 'none';
}
