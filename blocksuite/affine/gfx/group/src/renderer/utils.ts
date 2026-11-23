import {
  getFontString,
  getLineHeight,
  getLineWidth,
  truncateTextByWidth,
} from '@blocksuite/affine-gfx-text';
import type { GroupElementModel } from '@blocksuite/affine-model';
import { FontWeight } from '@blocksuite/affine-model';
import { Bound } from '@blocksuite/global/gfx';

import {
  GROUP_TITLE_FONT,
  GROUP_TITLE_FONT_SIZE,
  GROUP_TITLE_OFFSET,
  GROUP_TITLE_PADDING,
} from './consts';

export function titleRenderParams(group: GroupElementModel, zoom: number) {
  let text = group.title.toString().trim();
  const font = getGroupTitleFont(zoom);
  const lineWidth = getLineWidth(text, font);
  const lineHeight = getLineHeight(
    GROUP_TITLE_FONT,
    GROUP_TITLE_FONT_SIZE / zoom,
    'normal'
  );
  const bound = group.elementBound;
  const padding = [
    GROUP_TITLE_PADDING[0] / zoom,
    GROUP_TITLE_PADDING[1] / zoom,
  ];
  const offset = GROUP_TITLE_OFFSET / zoom;

  let titleWidth = lineWidth + padding[0] * 2;
  const titleHeight = lineHeight + padding[1] * 2;

  if (titleWidth > bound.w) {
    text = truncateTextByWidth(text, font, bound.w - 10);
    text = text.slice(0, text.length - 1) + '..';
    titleWidth = bound.w;
  }

  return {
    font,
    bound,
    text,
    titleWidth,
    titleHeight,
    offset,
    lineHeight,
    padding,
    titleBound: new Bound(
      bound.x,
      bound.y - titleHeight - offset,
      titleWidth,
      titleHeight
    ),
  };
}

export function titleBound(group: GroupElementModel, zoom: number) {
  const { titleWidth, titleHeight, bound } = titleRenderParams(group, zoom);

  return new Bound(bound.x, bound.y - titleHeight, titleWidth, titleHeight);
}

function getGroupTitleFont(zoom: number) {
  const fontSize = GROUP_TITLE_FONT_SIZE / zoom;
  const font = getFontString({
    fontSize,
    fontFamily: GROUP_TITLE_FONT,
    fontWeight: FontWeight.Regular,
    fontStyle: 'normal',
  });

  return font;
}
