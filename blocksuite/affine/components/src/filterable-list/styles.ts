import {
  panelBaseStyle,
  scrollbarStyle,
} from '@blocksuite/affine-shared/styles';
import { css } from 'lit';

export const filterableListStyles = css`
  ${panelBaseStyle(':host')}
  :host {
    flex-direction: column;
    padding: 0;

    max-height: 100%;
    pointer-events: auto;
    overflow: hidden;
    z-index: var(--affine-z-index-popover);
  }

  .affine-filterable-list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    width: 230px;
    padding: 8px;
    box-sizing: border-box;
    overflow: hidden;
  }

  .affine-filterable-list.flipped {
    flex-direction: column-reverse;
  }

  .items-container {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    overflow-y: scroll;
    padding-top: 5px;
    padding-left: 4px;
    padding-right: 4px;
  }

  editor-toolbar-separator {
    margin: 8px 0;
  }

  .input-wrapper {
    display: flex;
    align-items: center;
    border-radius: 4px;
    padding: 4px 10px;
    gap: 4px;
    border-width: 1px;
    border-style: solid;
    border-color: transparent;
  }

  .input-wrapper:focus-within {
    border-color: var(--affine-blue-700);
    box-shadow: var(--affine-active-shadow);
  }

  ${scrollbarStyle('.items-container')}

  .filterable-item {
    display: flex;
    justify-content: space-between;
    gap: 4px;
    padding: 12px;
  }

  .filterable-item > div[slot='suffix'] {
    display: flex;
    align-items: center;
  }

  .filterable-item svg {
    width: 20px;
    height: 20px;
  }

  .filterable-item.focussed {
    color: var(--affine-blue-700);
    background: var(--affine-hover-color-filled);
  }

  #filter-input {
    flex: 1;
    align-items: center;
    height: 20px;
    width: 140px;
    border-radius: 8px;
    padding-top: 2px;
    border: transparent;
    background: transparent;
    color: inherit;
  }

  #filter-input:focus {
    outline: none;
  }

  #filter-input::placeholder {
    color: var(--affine-placeholder-color);
    font-size: var(--affine-font-sm);
  }
`;
