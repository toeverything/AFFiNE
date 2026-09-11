import { css } from 'lit';

export const helloBlockStyles = css`
  .wb-hello {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 16px;
    border-radius: 8px;
    border: 1px solid var(--affine-border-color);
    background: var(--affine-background-primary-color);
    box-shadow: var(--affine-shadow-1);
    color: var(--affine-text-primary-color);
    user-select: none;
  }

  .wb-hello__kicker {
    font-size: 12px;
    line-height: 16px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--affine-text-secondary-color);
  }

  .wb-hello__title {
    font-size: 20px;
    line-height: 28px;
    font-weight: 600;
  }

  .wb-hello__snapshot {
    width: 100%;
    height: 100%;
    object-fit: contain;
    border-radius: 4px;
  }
`;
