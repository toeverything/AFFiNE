import { scrollbarStyle } from '@blocksuite/affine-shared/styles';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from 'lit';

export const keyboardToolbarStyles = css`
  affine-keyboard-toolbar {
    position: fixed;
    display: block;
    width: 100vw;
    bottom: 0;
  }

  .keyboard-toolbar {
    width: 100%;
    height: 46px;
    display: inline-flex;
    align-items: center;
    padding: 0px 8px;
    box-sizing: border-box;
    gap: 8px;
    z-index: var(--affine-z-index-popover);

    background-color: ${unsafeCSSVarV2('layer/background/primary')};
    border-top: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
    box-shadow: 0px -4px 10px 0px rgba(0, 0, 0, 0.05);

    > div {
      padding-top: 4px;
    }
    > div:not(.item-container) {
      padding-bottom: 4px;
    }

    icon-button svg {
      width: 24px;
      height: 24px;
    }
  }

  .item-container {
    flex: 1;
    display: flex;
    overflow-x: auto;
    gap: 8px;
    padding-bottom: 0px;

    icon-button {
      flex: 0 0 auto;
    }
  }

  .item-container::-webkit-scrollbar {
    display: none;
  }

  .divider {
    height: 24px;
    border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
  }
`;

export const keyboardToolPanelStyles = css`
  affine-keyboard-tool-panel {
    display: block;
    overflow-y: auto;
    box-sizing: border-box;
    background-color: ${unsafeCSSVarV2('layer/background/primary')};
  }

  .affine-keyboard-tool-panel-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
    width: 100%;
    padding: 16px 4px 8px 8px;
  }

  ${scrollbarStyle('affine-keyboard-tool-panel')}

  .keyboard-tool-panel-group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    align-self: stretch;
  }

  .keyboard-tool-panel-group-header {
    color: ${unsafeCSSVarV2('text/secondary')};

    /* Footnote/Emphasized */
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    font-style: normal;
    font-weight: 590;
    line-height: 18px; /* 138.462% */
  }

  .keyboard-tool-panel-group-item-container {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: 12px;
    row-gap: 12px;
  }

  .keyboard-tool-panel-item {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 4px;

    button {
      display: flex;
      padding: 16px;
      justify-content: center;
      align-items: center;
      gap: 10px;
      align-self: stretch;

      border: none;
      border-radius: 4px;
      color: ${unsafeCSSVarV2('icon/primary')};
      background: ${unsafeCSSVarV2('layer/background/secondary')};
    }

    button:active {
      background: #00000012;
    }

    button svg {
      width: 32px;
      height: 32px;
    }

    span {
      width: 100%;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 13px;
      font-weight: 400;
      line-height: 18px;
      text-align: center;
      text-overflow: ellipsis;
      white-space: nowrap;
      overflow-x: hidden;
      color: ${unsafeCSSVarV2('text/secondary')};
    }
  }
`;
