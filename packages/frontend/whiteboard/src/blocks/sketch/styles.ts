import { css } from 'lit';

export const sketchBlockStyles = css`
  .wb-sketch {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 160px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    box-shadow: var(--affine-shadow-1);
    overflow: hidden;
  }

  .wb-sketch--editing {
    outline: 2px solid var(--affine-primary-color);
  }

  .wb-sketch__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid var(--affine-border-color);
    user-select: none;
  }

  .wb-sketch__title {
    font-size: 13px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wb-sketch__kicker {
    font-size: 11px;
    color: var(--affine-text-secondary-color);
  }

  .wb-sketch__body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .wb-sketch__host,
  .wb-sketch__snapshot,
  .wb-sketch__placeholder {
    position: absolute;
    inset: 0;
  }

  .wb-sketch__snapshot {
    width: 100%;
    height: 100%;
    object-fit: contain;
    pointer-events: none;
  }

  .wb-sketch__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    color: var(--affine-text-secondary-color);
    font-size: 13px;
    text-align: center;
  }

  .wb-sketch__banner {
    position: absolute;
    left: 8px;
    bottom: 8px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--affine-background-overlay-panel-color);
    font-size: 11px;
    z-index: 2;
  }

  .wb-sketch__cursor {
    position: absolute;
    z-index: 3;
    transform: translate(-2px, -2px);
    pointer-events: none;
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--wb-sketch-cursor, var(--affine-primary-color));
  }

  .wb-sketch__cursor-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 0 2px #fff;
  }

  .wb-sketch__cursor-name {
    font-size: 10px;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    background: currentColor;
    color: #fff;
    white-space: nowrap;
  }

  .wb-sketch__fallback,
  .wb-sketch__canvas,
  .wb-sketch__canvas svg {
    width: 100%;
    height: 100%;
  }

  .wb-sketch__tools {
    display: flex;
    gap: 4px;
    padding: 4px 6px;
  }

  .wb-sketch__tools button {
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    border-radius: 4px;
    padding: 2px 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .wb-sketch__tools .is-active {
    border-color: var(--affine-primary-color);
    color: var(--affine-primary-color);
  }
`;
