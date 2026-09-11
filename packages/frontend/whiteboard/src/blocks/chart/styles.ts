import { css } from 'lit';

export const chartBlockStyles = css`
  .wb-chart {
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
    color: var(--affine-text-primary-color);
    overflow: hidden;
  }

  .wb-chart__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px 0;
    flex: 0 0 auto;
  }

  .wb-chart__title {
    font-size: 14px;
    line-height: 22px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .wb-chart__body {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
  }

  .wb-chart__host,
  .wb-chart__snapshot,
  .wb-chart__placeholder {
    position: absolute;
    inset: 8px 12px 12px;
  }

  .wb-chart__snapshot {
    width: calc(100% - 24px);
    height: calc(100% - 20px);
    object-fit: contain;
  }

  .wb-chart__placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--affine-text-secondary-color);
    font-size: 13px;
    text-align: center;
    padding: 16px;
  }

  .wb-chart__banner {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    padding: 6px 8px;
    border-radius: 4px;
    background: var(--affine-background-warning-color, #fff6e0);
    color: var(--affine-text-primary-color);
    font-size: 12px;
  }

  .wb-chart-settings {
    position: fixed;
    top: 72px;
    right: 16px;
    width: 320px;
    max-height: calc(100vh - 96px);
    overflow: auto;
    z-index: 20;
    box-sizing: border-box;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-overlay-panel-color);
    box-shadow: var(--affine-shadow-2);
    color: var(--affine-text-primary-color);
  }

  .wb-chart-settings h3 {
    margin: 0 0 12px;
    font-size: 14px;
    font-weight: 600;
  }

  .wb-chart-settings label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-bottom: 10px;
    font-size: 12px;
    color: var(--affine-text-secondary-color);
  }

  .wb-chart-settings input,
  .wb-chart-settings select,
  .wb-chart-settings textarea {
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    color: var(--affine-text-primary-color);
    border-radius: 4px;
    padding: 6px 8px;
    font: inherit;
  }

  .wb-chart-settings textarea {
    min-height: 64px;
    resize: vertical;
  }

  .wb-chart-settings__row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 12px;
  }
`;
