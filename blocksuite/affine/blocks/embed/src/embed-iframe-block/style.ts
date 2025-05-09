import { css } from 'lit';

export const embedIframeBlockStyles = css`
  .affine-embed-iframe-block-container {
    display: flex;
    width: 100%;
    border-radius: 8px;
    user-select: none;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .affine-embed-iframe-block-container.in-surface {
    height: 100%;
  }

  .affine-embed-iframe-block-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    display: none;
  }
  .affine-embed-iframe-block-overlay.show {
    display: block;
  }
`;
