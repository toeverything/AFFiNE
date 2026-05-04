/**
 * @vitest-environment happy-dom
 */
import { describe, expect, test, vi } from 'vitest';

import { CopilotClient, Endpoint } from './copilot-client';

describe('CopilotClient action streams', () => {
  test('routes action endpoint outside the deprecated workflow path', () => {
    const eventSource = vi.fn(
      () =>
        ({
          close: vi.fn(),
        }) as unknown as EventSource
    );
    const client = new CopilotClient(vi.fn(), eventSource);

    client.chatTextStream(
      {
        sessionId: 'session-1',
        messageId: 'message-1',
        actionId: 'mindmap.generate',
        actionVersion: 'v1',
        retry: true,
        runId: 'run-1',
      },
      Endpoint.Action
    );

    expect(eventSource).toHaveBeenCalledWith(
      '/api/copilot/actions/session-1/stream?messageId=message-1&actionId=mindmap.generate&actionVersion=v1&runId=run-1&retry=true'
    );
  });
});
