import { css } from 'lit';

export const styles = css`
  .affine-attachment-card {
    margin: 0 auto;
    box-sizing: border-box;
    display: flex;
    gap: 12px;

    width: 100%;
    height: 100%;

    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--affine-background-tertiary-color);

    opacity: var(--add, 1);
    background: var(--affine-background-primary-color);
    user-select: none;
  }

  .affine-attachment-content {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    flex: 1 0 0;

    border-radius: var(--1, 0px);
    opacity: var(--add, 1);
  }

  .affine-attachment-content-title {
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;

    align-self: stretch;
    padding: var(--1, 0px);
    border-radius: var(--1, 0px);
    opacity: var(--add, 1);
  }

  .affine-attachment-content-title-icon {
    display: flex;
    width: 16px;
    height: 16px;
    align-items: center;
    justify-content: center;
  }

  .affine-attachment-content-title-icon svg {
    width: 16px;
    height: 16px;
    fill: var(--affine-background-primary-color);
  }

  .affine-attachment-content-title-text {
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;

    word-break: break-all;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--affine-text-primary-color);

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-sm);
    font-style: normal;
    font-weight: 600;
    line-height: 22px;
  }

  .affine-attachment-content-info {
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    flex: 1 0 0;

    word-break: break-all;
    overflow: hidden;
    color: var(--affine-text-secondary-color);
    text-overflow: ellipsis;

    font-family: var(--affine-font-family);
    font-size: var(--affine-font-xs);
    font-style: normal;
    font-weight: 400;
    line-height: 20px;
  }

  .affine-attachment-banner {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .affine-attachment-banner svg {
    width: 40px;
    height: 40px;
  }

  .affine-attachment-card.loading {
    background: var(--affine-background-secondary-color);

    .affine-attachment-content-title-text {
      color: var(--affine-placeholder-color);
    }
  }

  .affine-attachment-card.error,
  .affine-attachment-card.unsynced {
    background: var(--affine-background-secondary-color);
  }

  .affine-attachment-card.cubeThick {
    flex-direction: column-reverse;

    .affine-attachment-content {
      width: 100%;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
    }

    .affine-attachment-banner {
      justify-content: flex-start;
    }
  }

  .affine-attachment-embed-container {
    position: relative;
    width: 100%;
    height: 100%;
  }
`;
