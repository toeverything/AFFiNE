import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from 'lit';

export const frameTitleStyleVars = {
  nestedFrameOffset: 4,
  height: 22,
  fontSize: 14,
};

export const frameTitleStyle = css`
  :host {
    position: absolute;
    display: flex;
    align-items: center;
    z-index: 1;
    border: 1px solid ${unsafeCSSVarV2('edgeless/frame/border/default')};
    border-radius: 4px;
    width: fit-content;
    height: ${frameTitleStyleVars.height}px;
    padding: 0px 4px;
    transform-origin: left bottom;
    background-color: var(--bg-color);

    font-family: var(--affine-font-family);
    font-size: ${frameTitleStyleVars.fontSize}px;
    cursor: default;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  :hover {
    background-color: color-mix(in srgb, var(--bg-color), #000000 7%);
  }
`;
