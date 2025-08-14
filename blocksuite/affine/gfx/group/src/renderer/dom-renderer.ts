import { DomElementRendererExtension } from '@blocksuite/affine-block-surface';
import { FontWeight, type GroupElementModel } from '@blocksuite/affine-model';

import {
  GROUP_TITLE_FONT,
  GROUP_TITLE_FONT_SIZE,
  GROUP_TITLE_PADDING,
} from './consts';
import { titleRenderParams } from './utils';

export const GroupDomRendererExtension = DomElementRendererExtension(
  'group',
  (model: GroupElementModel, domElement, renderer) => {
    const { zoom } = renderer.viewport;
    const [, , w, h] = model.deserializedXYWH;

    const renderParams = titleRenderParams(model, zoom);
    model.externalXYWH = renderParams.titleBound.serialize();

    domElement.innerHTML = '';
    domElement.style.outlineColor = '';
    domElement.style.outlineWidth = '';
    domElement.style.outlineStyle = '';

    const elements = renderer.provider.selectedElements?.() || [];

    const renderTitle = () => {
      const { text } = renderParams;
      const titleElement = document.createElement('div');
      titleElement.style.transform = `translate(0, -100%)`;
      titleElement.style.fontFamily = GROUP_TITLE_FONT;
      titleElement.style.fontWeight = `${FontWeight.Regular}`;
      titleElement.style.fontStyle = 'normal';
      titleElement.style.fontSize = `${GROUP_TITLE_FONT_SIZE}px`;
      titleElement.style.color = renderer.getPropertyValue('--affine-blue');
      titleElement.style.textAlign = 'left';
      titleElement.style.padding = `${GROUP_TITLE_PADDING[0]}px ${GROUP_TITLE_PADDING[1]}px`;
      titleElement.textContent = text;
      domElement.replaceChildren(titleElement);
    };

    if (elements.includes(model.id)) {
      if (model.showTitle) {
        renderTitle();
      } else {
        domElement.style.outlineColor =
          renderer.getPropertyValue('--affine-blue');
        domElement.style.outlineWidth = '2px';
        domElement.style.outlineStyle = 'solid';
      }
    } else if (model.childElements.some(child => elements.includes(child.id))) {
      domElement.style.outlineColor = '#8FD1FF';
      domElement.style.outlineWidth = '2px';
      domElement.style.outlineStyle = 'solid';
    }

    domElement.style.width = `${w * zoom}px`;
    domElement.style.height = `${h * zoom}px`;
    domElement.style.overflow = 'visible';
    domElement.style.pointerEvents = 'none';
  }
);
