import { css } from 'lit';

export const boardBlockStyles = css`
  .wb-board {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 200px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    box-shadow: var(--affine-shadow-1);
    color: var(--affine-text-primary-color);
    overflow: hidden;
  }

  .wb-board__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    flex: 0 0 auto;
    border-bottom: 1px solid var(--affine-border-color);
    user-select: none;
  }

  .wb-board__title {
    font-size: 14px;
    line-height: 22px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wb-board__kicker {
    font-size: 12px;
    color: var(--affine-text-secondary-color);
  }

  .wb-board__body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }

  .wb-board__placeholder,
  .wb-board__snapshot {
    position: absolute;
    inset: 12px;
  }

  .wb-board__snapshot {
    width: calc(100% - 24px);
    height: calc(100% - 24px);
    object-fit: contain;
  }

  .wb-board__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--affine-text-secondary-color);
    font-size: 13px;
    text-align: center;
  }
`;
