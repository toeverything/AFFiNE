import { getBaseUrl } from '@affine/graphql';
import { CopilotClient, toTextStream } from '@blocksuite/presets';

const TIMEOUT = 500000;

export function textToTextStream({
  docId,
  workspaceId,
  prompt,
  attachments,
  params,
}: {
  docId: string;
  workspaceId: string;
  prompt: string;
  attachments?: string[];
  params?: string;
}): BlockSuitePresets.TextStream {
  const client = new CopilotClient(getBaseUrl());
  return {
    [Symbol.asyncIterator]: async function* () {
      const hasAttachments = attachments && attachments.length > 0;
      const session = await client.createSession({
        workspaceId,
        docId,
        promptName: hasAttachments ? 'debug:action:vision4' : 'Summary',
      });
      if (hasAttachments) {
        const messageId = await client.createMessage({
          sessionId: session,
          content: prompt,
          attachments,
          params,
        });
        const eventSource = client.textStream(messageId, session);
        yield* toTextStream(eventSource, { timeout: TIMEOUT });
      } else {
        const eventSource = client.textToTextStream(prompt, session);
        yield* toTextStream(eventSource, { timeout: TIMEOUT });
      }
    },
  };
}

// Image to text(html)
export function imageToTextStream({
  docId,
  workspaceId,
  promptName,
  ...options
}: {
  docId: string;
  workspaceId: string;
  promptName: string;
  params?: string;
  content: string;
  attachments?: string[];
}) {
  const client = new CopilotClient(getBaseUrl());
  return {
    [Symbol.asyncIterator]: async function* () {
      const sessionId = await client.createSession({
        workspaceId,
        docId,
        promptName,
      });
      const messageId = await client.createMessage({
        sessionId,
        ...options,
      });
      const eventSource = client.textStream(messageId, sessionId);
      yield* toTextStream(eventSource, { timeout: TIMEOUT });
    },
  };
}

// Image to images
export function imageToImagesStream({
  docId,
  workspaceId,
  promptName,
  ...options
}: {
  docId: string;
  workspaceId: string;
  promptName: string;
  content: string;
  params?: string;
  attachments?: string[];
}) {
  const client = new CopilotClient(getBaseUrl());
  return {
    [Symbol.asyncIterator]: async function* () {
      const sessionId = await client.createSession({
        workspaceId,
        docId,
        promptName,
      });
      const messageId = await client.createMessage({
        sessionId,
        ...options,
      });
      const eventSource = client.imagesStream(messageId, sessionId);
      yield* toTextStream(eventSource, { timeout: TIMEOUT });
    },
  };
}
