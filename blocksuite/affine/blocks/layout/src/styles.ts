import { css } from 'lit';

export const layoutStyles = css`
  .affine-layout-row-container {
    display: flex;
    flex-direction: row;
    width: 100%;
    gap: 16px;
    margin: 8px 0;
  }

  .affine-layout-column-container {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
  }
`;
