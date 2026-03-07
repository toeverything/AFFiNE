import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css } from 'lit';

export const latexBlockStyles = css`
  .latex-block-container {
    display: flex;
    position: relative;
    width: 100%;
    height: 100%;
    padding: 10px 24px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    overflow-x: auto;
    user-select: none;
  }

  .latex-block-container:hover {
    background: ${unsafeCSSVar('hoverColor')};
  }

  .latex-block-error-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    border: 1.5px solid ${unsafeCSSVarV2('text/highlight/fg/red')};
    border-radius: 8px;
    background: color-mix(
      in srgb,
      ${unsafeCSSVarV2('text/highlight/fg/red')} 8%,
      transparent
    );
    color: ${unsafeCSSVarV2('text/highlight/fg/red')};
    font-family: Inter;
    font-size: 12px;
    font-weight: 500;
    line-height: normal;
    user-select: none;
    max-width: 100%;
  }

  .latex-block-error-placeholder__icon {
    font-size: 20px;
    line-height: 1;
  }

  .latex-block-error-placeholder__source {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12px;
    opacity: 0.85;
    word-break: break-word;
    text-align: center;
  }

  .latex-block-error-placeholder__msg {
    font-size: 11px;
    opacity: 0.7;
    text-align: center;
    word-break: break-word;
  }

  .latex-block-empty-placeholder {
    color: ${unsafeCSSVarV2('text/secondary')};
    font-family: Inter;
    font-size: 12px;
    font-weight: 500;
    line-height: normal;
    user-select: none;
  }
`;
