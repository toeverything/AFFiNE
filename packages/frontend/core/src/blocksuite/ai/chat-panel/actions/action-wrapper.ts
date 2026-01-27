import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ThemeProvider } from '@blocksuite/affine-shared/services';
import {
  ArrowDownBigIcon as ArrowDownIcon,
  ArrowUpBigIcon as ArrowUpIcon,
  DoneIcon,
  ExplainIcon,
  ImageIcon,
  ImproveWritingIcon,
  LanguageIcon,
  LongerIcon,
  MakeItRealIcon,
  MindmapIcon,
  MindmapNodeIcon,
  PenIcon,
  PresentationIcon,
  SearchIcon,
  SelectionIcon,
  ShorterIcon,
  ToneIcon,
} from '@blocksuite/icons/lit';
import { css, html, LitElement, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

import { type ChatAction } from '../../components/ai-chat-messages';
import { createTextRenderer } from '../../components/text-renderer';
import { HISTORY_IMAGE_ACTIONS } from '../../utils/history-image-actions';

const icons: Record<string, TemplateResult<1>> = {
  'Fix spelling for it': DoneIcon(),
  'Improve grammar for it': DoneIcon(),
  'Explain this code': ExplainIcon(),
  'Check code error': SearchIcon(),
  'Explain this': SelectionIcon(),
  Translate: LanguageIcon(),
  'Change tone': ToneIcon(),
  'Improve writing for it': ImproveWritingIcon(),
  'Make it longer': LongerIcon(),
  'Make it shorter': ShorterIcon(),
  'Continue writing': PenIcon(),
  'Make it real': MakeItRealIcon(),
  'Find action items from it': SearchIcon(),
  Summary: PenIcon(),
  'Create headings': PenIcon(),
  'Write outline': PenIcon(),
  image: ImageIcon(),
  'Brainstorm mindmap': MindmapIcon(),
  'Expand mind map': MindmapNodeIcon(),
  'Create a presentation': PresentationIcon(),
  'Write a poem about this': PenIcon(),
  'Write a blog post about this': PenIcon(),
  'AI image filter clay style': ImageIcon(),
  'AI image filter sketch style': ImageIcon(),
  'AI image filter anime style': ImageIcon(),
  'AI image filter pixel style': ImageIcon(),
  Clearer: ImageIcon(),
  'Remove background': ImageIcon(),
  'Convert to sticker': ImageIcon(),
};

export class ActionWrapper extends WithDisposable(LitElement) {
  static override styles = css`
    .action-name {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 22px;
      margin-bottom: 12px;

      svg {
        color: ${unsafeCSSVar('primaryColor')};
      }

      div:last-child {
        cursor: pointer;
        display: flex;
        align-items: center;
        flex: 1;

        div:last-child svg {
          margin-left: auto;
        }
      }
    }

    .answer-prompt {
      padding: 8px;
      background-color: ${unsafeCSSVarV2('block/callout/background/grey')};
      display: flex;
      flex-direction: column;
      gap: 4px;
      font-size: 14px;
      font-weight: 400;
      color: ${unsafeCSSVarV2('text/primary')};
      max-height: 500px;
      overflow-y: auto;
      border-radius: 4px;

      .subtitle {
        font-size: 12px;
        font-weight: 500;
        color: ${unsafeCSSVarV2('text/secondary')};
        height: 20px;
        line-height: 20px;
      }

      .prompt {
        margin-top: 12px;
      }
    }

    .answer-prompt::-webkit-scrollbar {
      width: 4px;
      height: 4px;
    }
    .answer-prompt::-webkit-scrollbar-thumb {
      background-color: ${unsafeCSSVar('borderColor')};
    }
    .answer-prompt::-webkit-scrollbar-track {
      background: transparent;
    }
  `;

  @state()
  accessor promptShow = false;

  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  protected override render() {
    const { item } = this;

    const originalText = item.messages[1].content;
    const answer = item.messages[2]?.content;
    const images = item.messages[1].attachments;

    return html`<style></style>
      <slot></slot>
      <div
        class="action-name"
        data-testid="action-name"
        @click=${() => (this.promptShow = !this.promptShow)}
      >
        ${icons[item.action] ? icons[item.action] : DoneIcon()}
        <div>
          <div>${item.action}</div>
          <div>${this.promptShow ? ArrowDownIcon() : ArrowUpIcon()}</div>
        </div>
      </div>
      ${this.promptShow
        ? html`
            <div class="answer-prompt" data-testid="answer-prompt">
              <div class="subtitle">Answer</div>
              ${HISTORY_IMAGE_ACTIONS.includes(item.action)
                ? images &&
                  html`<chat-content-images
                    .images=${images}
                    data-testid="generated-image"
                  ></chat-content-images>`
                : nothing}
              ${answer
                ? createTextRenderer({
                    customHeading: true,
                    testId: 'chat-message-action-answer',
                    theme: this.host.std.get(ThemeProvider).app$,
                  })(answer)
                : nothing}
              ${originalText
                ? html`<div class="subtitle prompt">Prompt</div>
                    ${createTextRenderer({
                      customHeading: true,
                      testId: 'chat-message-action-prompt',
                      theme: this.host.std.get(ThemeProvider).app$,
                    })(item.messages[0].content + originalText)}`
                : nothing}
            </div>
          `
        : nothing} `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-wrapper': ActionWrapper;
  }
}
