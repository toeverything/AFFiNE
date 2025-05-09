import { fontXSStyle, panelBaseStyle } from '@blocksuite/affine-shared/styles';
import { css } from 'lit';

export const renameStyles = css`
  ${panelBaseStyle('.affine-attachment-rename-container')}
  .affine-attachment-rename-container {
    position: relative;
    display: flex;
    align-items: center;
    width: 320px;
    gap: 12px;
    padding: 12px;
    z-index: var(--affine-z-index-popover);
  }

  .affine-attachment-rename-input-wrapper {
    display: flex;
    min-width: 280px;
    height: 30px;
    box-sizing: border-box;
    padding: 4px 10px;
    background: var(--affine-white-10);
    border-radius: 4px;
    border: 1px solid var(--affine-border-color);
  }

  .affine-attachment-rename-input-wrapper:focus-within {
    border-color: var(--affine-blue-700);
    box-shadow: var(--affine-active-shadow);
  }

  .affine-attachment-rename-input-wrapper input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    color: var(--affine-text-primary-color);
  }
  ${fontXSStyle('.affine-attachment-rename-input-wrapper input')}

  .affine-attachment-rename-input-wrapper input::placeholder {
    color: var(--affine-placeholder-color);
  }

  .affine-attachment-rename-extension {
    font-size: var(--affine-font-xs);
    color: var(--affine-text-secondary-color);
  }

  .affine-attachment-rename-overlay-mask {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: var(--affine-z-index-popover);
  }
`;

export const styles = css`
  :host {
    z-index: 1;
  }
`;
