import { baseTheme } from '@toeverything/theme';
import { css, unsafeCSS } from 'lit';

export const PeekViewStyles = css`
  :host {
    width: 100%;
    height: 100%;
  }

  .ai-chat-block-peek-view-container {
    gap: 8px;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    box-sizing: border-box;
    justify-content: start;
    flex-direction: column;
    box-sizing: border-box;
    padding: 24px 120px 16px 120px;
    font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
  }

  .ai-chat-messages-container {
    display: flex;
    align-items: center;
    justify-content: start;
    flex-direction: column;
    box-sizing: border-box;
    width: 100%;
    color: var(--affine-text-primary-color);
    line-height: 22px;
    font-size: var(--affine-font-sm);
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1;
    gap: 24px;
    -ms-overflow-style: none; /* IE and Edge */
    scrollbar-width: none; /* Firefox */
  }

  .new-chat-messages-container {
    width: 100%;
    box-sizing: border-box;
    min-height: 450px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .ai-chat-messages-container::-webkit-scrollbar {
    display: none;
  }

  .assistant-message-container {
    width: 100%;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .peek-view-footer {
    padding: 0 12px;
    width: 100%;
    height: 20px;
    display: flex;
    gap: 4px;
    align-items: center;
    color: var(--affine-text-secondary-color);
    font-size: var(--affine-font-xs);
    user-select: none;
  }
`;
