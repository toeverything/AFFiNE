import { Framework } from '@toeverything/infra';
import { Subject } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AccessTokenStore } from '../stores/access-token';
import { AccessTokenService } from './access-token';

function createStore() {
  return {
    subscribeUserAccessTokens: vi.fn(() => new Subject()),
    listUserAccessTokens: vi.fn().mockResolvedValue([
      {
        id: 'token-1',
        name: 'MCP',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      },
    ]),
    generateUserAccessToken: vi.fn().mockResolvedValue({
      id: 'token-1',
      name: 'MCP',
      createdAt: '2026-01-01T00:00:00.000Z',
      expiresAt: null,
      token: 'secret-token',
    }),
  } as unknown as AccessTokenStore;
}

describe('AccessTokenService', () => {
  test('does not store generated plaintext token in the long-lived list', async () => {
    const framework = new Framework();
    framework
      .store(AccessTokenStore, createStore())
      .service(AccessTokenService, [AccessTokenStore]);
    const service = framework.provider().get(AccessTokenService);

    const accessToken = await service.generateUserAccessToken('MCP');

    expect(accessToken.token).toBe('secret-token');
    expect(service.accessTokens$.value).toEqual([
      {
        id: 'token-1',
        name: 'MCP',
        createdAt: '2026-01-01T00:00:00.000Z',
        expiresAt: null,
      },
    ]);
    expect(JSON.stringify(service.accessTokens$.value)).not.toContain(
      'secret-token'
    );

    service.dispose();
  });
});
