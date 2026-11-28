import { Framework } from '@toeverything/infra';
import { EMPTY } from 'rxjs';
import { describe, expect, test, vi } from 'vitest';

import { AIModelService } from './models';

describe('AIModelService', () => {
  test('clears the previous model while a new scope is loading', async () => {
    let resolveSecond: ((value: unknown) => void) | undefined;
    const gql = vi
      .fn()
      .mockResolvedValueOnce({
        currentUser: {
          copilot: {
            routeOptions: {
              choices: [
                {
                  id: 'model-a',
                  displayName: 'Model A',
                  available: true,
                },
              ],
            },
          },
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSecond = resolve;
          })
      );
    const stored = new Map<string, unknown>();
    const framework = new Framework();
    framework.service(
      AIModelService,
      () =>
        new AIModelService(
          {
            globalState: {
              get: (key: string) => stored.get(key),
              set: (key: string, value: unknown) => stored.set(key, value),
            },
          } as never,
          { gql } as never,
          {
            subscription: { ai$: EMPTY },
          } as never
        )
    );
    const service = framework.provider().get(AIModelService);

    service.setScope('workspace-a', 'route-a');
    await vi.waitFor(() => expect(service.models.value).toHaveLength(1));
    service.setModel('model-a');

    service.setScope('workspace-b', 'route-b');
    expect(service.models.value).toEqual([]);
    expect(service.modelId.value).toBeUndefined();
    service.setModel('model-a');
    expect(stored.has('AIManagedRouteTarget:workspace-b:route-b')).toBe(false);

    resolveSecond?.({
      currentUser: { copilot: { routeOptions: { choices: [] } } },
    });
  });

  test('splits brand category and version across space and hyphen delimiters', async () => {
    const cases = [
      { displayName: 'GPT-6 Luna', category: 'GPT', version: '6 Luna' },
      { displayName: 'GPT-6.1 Terra', category: 'GPT', version: '6.1 Terra' },
      { displayName: 'GPT-5', category: 'GPT', version: '5' },
      {
        displayName: 'Claude Haiku 5.5',
        category: 'Claude',
        version: 'Haiku 5.5',
      },
      {
        displayName: 'Claude Sonnet 5.5',
        category: 'Claude',
        version: 'Sonnet 5.5',
      },
      {
        displayName: 'Gemini 4 Hydrogen',
        category: 'Gemini',
        version: '4 Hydrogen',
      },
      { displayName: 'Auto', category: 'Auto', version: '' },
    ];
    const gql = vi.fn().mockResolvedValueOnce({
      currentUser: {
        copilot: {
          routeOptions: {
            choices: cases.map((item, idx) => ({
              id: `model-${idx}`,
              displayName: item.displayName,
              available: true,
            })),
          },
        },
      },
    });
    const framework = new Framework();
    framework.service(
      AIModelService,
      () =>
        new AIModelService(
          {
            globalState: {
              get: () => undefined,
              set: () => {},
            },
          } as never,
          { gql } as never,
          {
            subscription: { ai$: EMPTY },
          } as never
        )
    );
    const service = framework.provider().get(AIModelService);

    service.setScope('workspace-a', 'route-a');
    await vi.waitFor(() =>
      expect(service.models.value).toHaveLength(cases.length)
    );

    expect(
      service.models.value.map(({ name, category, version }) => ({
        name,
        category,
        version,
      }))
    ).toEqual(
      cases.map(({ displayName, category, version }) => ({
        name: displayName,
        category,
        version,
      }))
    );
  });
});
