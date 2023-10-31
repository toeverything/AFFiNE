import { toast as basicToast, type ToastOptions } from '@affine/component';
import type {
  CodeBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/blocks';
import type { BlockSuiteRoot } from '@blocksuite/lit';
import type { BaseBlockModel } from '@blocksuite/store';

export function getSelectedTextContent(root: BlockSuiteRoot) {
  const selections = root.selection.value.filter(selection =>
    selection.is('block')
  );

  return selections
    .map(
      selection => root.std.view.viewFromPath('block', selection.path)?.model
    )
    .filter(
      model =>
        model &&
        ['affine:paragraph', 'affine:list', 'affine:code'].includes(
          model.flavour
        )
    )
    .map(model => (model ? modelToMarkdown(model) : ''));
}

const paragraphToMarkdown = (model: ParagraphBlockModel) => {
  switch (model.type) {
    case 'text':
      return model.text.toString();
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return `${'#'.repeat(parseInt(model.type[1]))} ${model.text.toString()}`;
    case 'quote':
      return `> ${model.text.toString()}`;
  }
};

const listToMarkdown = (model: ListBlockModel) => {
  switch (model.type) {
    case 'bulleted':
      return `* ${model.text.toString()}`;
    case 'numbered':
      return `1 ${model.text.toString()}`;
    case 'todo':
      return `- [ ] ${model.text.toString()}`;
  }

  return model.text.toString();
};

const codeToMarkdown = (model: CodeBlockModel) => {
  return `\`\`\`${model.language}\n${model.text.toString()}\n\`\`\``;
};

const modelToMarkdownHandler = {
  'affine:paragraph': paragraphToMarkdown,
  'affine:list': listToMarkdown,
  'affine:code': codeToMarkdown,
};

export function modelToMarkdown(model: BaseBlockModel) {
  return (
    modelToMarkdownHandler[
      model.flavour as keyof typeof modelToMarkdownHandler
    ]?.(model as any) ??
    model.text?.toString() ??
    ''
  );
}

export function sendToSlack(blocksContent: string[]) {
  const url = 'http://127.0.0.1:8787/api/slack-bot';
  const payload = {
    blocks: blocksContent.map(content => {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: content,
        },
      };
    }),
  };

  return fetch(url, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export const toast = (message: string, options?: ToastOptions) => {
  const mainContainer = document.querySelector(
    '[plugin-id="@affine/slackbot-plugin"]'
  ) as HTMLElement;
  return basicToast(message, {
    portal: mainContainer || document.body,
    ...options,
  });
};
