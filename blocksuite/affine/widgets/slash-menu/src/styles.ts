import { scrollbarStyle } from '@blocksuite/affine-shared/styles';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { baseTheme } from '@toeverything/theme';
import { css, unsafeCSS } from 'lit';

export const styles = css`
  .overlay-mask {
    pointer-events: auto;
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: var(--affine-z-index-popover);
  }

  .slash-menu {
    position: fixed;
    left: 0;
    top: 0;
    box-sizing: border-box;
    padding: 8px 4px 8px 8px;
    width: 280px;
    overflow-y: auto;
    font-family: ${unsafeCSS(baseTheme.fontSansFamily)};

    background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
    box-shadow: ${unsafeCSSVar('overlayPanelShadow')};
    border-radius: 8px;
    z-index: var(--affine-z-index-popover);
    user-select: none;
    /* transition: max-height 0.2s ease-in-out; */
  }

  ${scrollbarStyle('.slash-menu')}

  .slash-menu-group-name {
    box-sizing: border-box;
    padding: 2px 8px;

    font-size: var(--affine-font-xs);
    font-weight: 500;
    line-height: var(--affine-line-height);
    text-align: left;
    color: var(
      --light-textColor-textSecondaryColor,
      var(--textColor-textSecondaryColor, #8e8d91)
    );
  }

  .slash-menu-item {
    padding: 2px 8px 2px 8px;
    justify-content: flex-start;
    gap: 10px;
  }

  .slash-menu-item-icon {
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    padding: 4px;
    border: 1px solid var(--affine-border-color, #e3e2e4);
    border-radius: 4px;
    color: var(--affine-icon-color);
    background: ${unsafeCSSVarV2('layer/background/overlayPanel')};

    display: flex;
    justify-content: center;
    align-items: center;
  }

  .slash-menu-item-icon svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .slash-menu-item.ask-ai {
    color: var(--affine-brand-color);
  }
  .slash-menu-item.github .github-icon {
    color: var(--affine-black);
  }
`;

export const slashItemToolTipStyle = css`
  .affine-tooltip {
    display: flex;
    padding: 4px 4px 2px 4px;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .tooltip-figure svg {
    display: block;
  }

  .tooltip-caption {
    padding-left: 4px;
    color: var(
      --light-textColor-textSecondaryColor,
      var(--textColor-textSecondaryColor, #8e8d91)
    );
    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    line-height: var(--affine-line-height);
  }
`;
