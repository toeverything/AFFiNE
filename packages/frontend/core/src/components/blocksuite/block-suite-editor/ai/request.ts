import { getBaseUrl } from '@affine/graphql';
import { CopilotClient, toTextStream } from '@blocksuite/presets';

const TIMEOUT = 5000;

export function textToTextStream({
  docId,
  workspaceId,
  prompt,
}: {
  docId: string;
  workspaceId: string;
  prompt: string;
}): BlockSuitePresets.TextStream {
  const client = new CopilotClient(getBaseUrl());
  return {
    [Symbol.asyncIterator]: async function* () {
      const session = await client.createSession({
        workspaceId,
        docId,
        promptName: 'Summary', // placeholder
      });
      const eventSource = client.textToTextStream(prompt, session);
      yield* toTextStream(eventSource, { timeout: TIMEOUT });
    },
  };
}
