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

  .wb-board__lod {
    display: flex;
    align-items: stretch;
    gap: 8px;
    min-height: 100%;
    padding: 8px;
    box-sizing: border-box;
  }

  .wb-board__lod-spacer {
    flex: 0 0 auto;
  }

  .wb-board__column {
    flex: 0 0 160px;
    display: flex;
    flex-direction: column;
    min-width: 120px;
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--wb-board-column-color, var(--affine-tag-gray)) 18%,
      var(--affine-background-primary-color)
    );
    border: 1px solid var(--affine-border-color);
    overflow: hidden;
  }

  .wb-board__column-head {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    font-size: 12px;
    line-height: 18px;
  }

  .wb-board__column-swatch {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--wb-board-column-color, var(--affine-tag-gray));
    flex: 0 0 auto;
  }

  .wb-board__column-name {
    flex: 1 1 auto;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 600;
  }

  .wb-board__column-count {
    color: var(--affine-text-secondary-color);
    font-variant-numeric: tabular-nums;
  }

  .wb-board__column-cards {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 0 6px 6px;
  }

  .wb-board__card {
    height: 36px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--affine-background-primary-color);
    border: 1px solid var(--affine-border-color);
    font-size: 12px;
    line-height: 18px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  .wb-board__more {
    font-size: 11px;
    color: var(--affine-text-secondary-color);
    padding: 2px 8px;
  }

  .wb-board--l0 .wb-board__column {
    min-height: 72px;
  }
`;
