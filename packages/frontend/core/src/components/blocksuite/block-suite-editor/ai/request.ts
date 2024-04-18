import { toTextStream } from '@blocksuite/presets';
import { partition } from 'lodash-es';

import { CopilotClient } from './copilot-client';
import type { PromptKey } from './prompt';

const TIMEOUT = 50000;

const client = new CopilotClient();

async function calculateBlobHash(blob: Blob) {
  const buffer = await blob.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
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

  const options: Parameters<CopilotClient['createMessage']>[0] = {
    sessionId,
    content,
    params,
  };

  if (hasAttachments) {
    const [stringAttachments, blobs] = partition(
      attachments,
      attachment => typeof attachment === 'string'
    ) as [string[], (Blob | File)[]];
    options.attachments = stringAttachments;
    options.blobs = await Promise.all(
      blobs.map(async blob => {
        if (blob instanceof File) {
          return blob;
        } else {
          return new File([blob], await calculateBlobHash(blob));
        }
      })
    );
  }
  const messageId = await client.createMessage(options);
  return {
    messageId,
    sessionId,
  };
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
      });

      const eventSource = client.imagesStream(messageId, sessionId);
      yield* toTextStream(eventSource, { timeout, type: 'attachment' });
    },
  };
}
