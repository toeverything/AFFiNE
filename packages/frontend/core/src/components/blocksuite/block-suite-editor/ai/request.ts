import { toTextStream } from '@blocksuite/presets';

import { CopilotClient } from './copilot-client';
import type { PromptKey } from './prompt';

const TIMEOUT = 50000;

const client = new CopilotClient();

function readBlobAsURL(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      if (typeof e.target?.result === 'string') {
        resolve(e.target.result);
      } else {
        reject();
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export type TextToTextOptions = {
  docId: string;
  workspaceId: string;
  promptName: PromptKey;
  content?: string;
  attachments?: (string | Blob)[];
  params?: Record<string, string>;
  timeout?: number;
  stream?: boolean;
};

async function createSessionMessage({
  docId,
  workspaceId,
  promptName,
  content,
  attachments,
  params,
}: TextToTextOptions) {
  const hasAttachments = attachments && attachments.length > 0;
  const session = await client.createSession({
    workspaceId,
    docId,
    promptName,
  });
  if (hasAttachments) {
    const normalizedAttachments = await Promise.all(
      attachments.map(async attachment => {
        if (typeof attachment === 'string') {
          return attachment;
        }
        const url = await readBlobAsURL(attachment);
        return url;
      })
    );
    const messageId = await client.createMessage({
      sessionId: session,
      content,
      attachments: normalizedAttachments,
      params,
    });
    return {
      messageId,
      session,
    };
  } else if (content) {
    return {
      message: content,
      session,
    };
  } else {
    throw new Error('No content or attachments provided');
  }
}

export function textToText({
  docId,
  workspaceId,
  promptName,
  content,
  attachments,
  params,
  stream,
  timeout = TIMEOUT,
}: TextToTextOptions) {
  if (stream) {
    return {
      [Symbol.asyncIterator]: async function* () {
        const message = await createSessionMessage({
          docId,
          workspaceId,
          promptName,
          content,
          attachments,
          params,
        });

        const eventSource = client.chatTextStream({
          sessionId: message.session,
          messageId: message.messageId,
          message: message.message,
        });
        yield* toTextStream(eventSource, { timeout: timeout });
      },
    };
  } else {
    return Promise.race([
      timeout
        ? new Promise((_res, rej) => {
            setTimeout(() => {
              rej(new Error('Timeout'));
            }, timeout);
          })
        : null,
      createSessionMessage({
        docId,
        workspaceId,
        promptName,
        content,
        attachments,
        params,
      }).then(message => {
        return client.chatText({
          sessionId: message.session,
          messageId: message.messageId,
          message: message.message,
        });
      }),
    ]);
  }
}
