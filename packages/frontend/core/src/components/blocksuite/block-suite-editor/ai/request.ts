import { toTextStream } from '@blocksuite/presets';

import { CopilotClient } from './copilot-client';
import type { PromptKey } from './prompt';

const TIMEOUT = 50000;

const client = new CopilotClient();

function readBlobAsURL(blob: Blob | File) {
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
  promptName?: PromptKey;
  sessionId?: string | Promise<string>;
  content?: string;
  attachments?: (string | Blob | File)[];
  params?: Record<string, string>;
  timeout?: number;
  stream?: boolean;
  forceToImage?: boolean; // force to image
};

export function createChatSession({
  workspaceId,
  docId,
}: {
  workspaceId: string;
  docId: string;
}) {
  return client.createSession({
    workspaceId,
    docId,
    promptName: 'debug:chat:gpt4',
  });
}

async function createSessionMessage({
  docId,
  workspaceId,
  promptName,
  content,
  sessionId: providedSessionId,
  attachments,
  params,
  forceToImage,
}: TextToTextOptions) {
  if (!promptName && !providedSessionId) {
    throw new Error('promptName or sessionId is required');
  }
  const hasAttachments = attachments && attachments.length > 0;
  const sessionId = await (providedSessionId ??
    client.createSession({
      workspaceId,
      docId,
      promptName: promptName as string,
    }));

  if (forceToImage || hasAttachments) {
    const options = {
      sessionId,
      content,
      params,
    } as {
      sessionId: string;
      content?: string;
      params?: Record<string, string>;
      attachments?: string[];
    };
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
      options.attachments = normalizedAttachments;
    }
    const messageId = await client.createMessage(options);
    return {
      messageId,
      sessionId,
    };
  } else if (content) {
    return {
      message: content,
      sessionId,
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
  sessionId,
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
          sessionId,
        });

        const eventSource = client.chatTextStream({
          sessionId: message.sessionId,
          messageId: message.messageId,
          message: message.message,
        });
        yield* toTextStream(eventSource, { timeout });
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
        sessionId,
      }).then(async message => {
        return await client.chatText({
          sessionId: message.sessionId,
          messageId: message.messageId,
          message: message.message,
        });
      }),
    ]);
  }
}

export const listHistories = client.getHistories;

// Only one image is currently being processed
export function toImage({
  docId,
  workspaceId,
  promptName,
  content,
  attachments,
  params,
  forceToImage,
  timeout = TIMEOUT,
}: TextToTextOptions) {
  return {
    [Symbol.asyncIterator]: async function* () {
      const { messageId, sessionId } = await createSessionMessage({
        docId,
        workspaceId,
        promptName,
        content,
        attachments,
        params,
        forceToImage,
      });

      const eventSource = client.imagesStream(
        // @ts-expect-error: messageId should exist
        messageId,
        sessionId
      );
      yield* toTextStream(eventSource, { timeout, type: 'attachment' });
    },
  };
}
