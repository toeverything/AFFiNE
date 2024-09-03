import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gqlFetcherFactory } from '../fetcher';
import type { GraphQLQuery } from '../graphql';

const query: GraphQLQuery = {
  id: 'query',
  query: 'query { field }',
  operationName: 'query',
  definitionName: 'query',
};

let fetch: Mock;
let gql: ReturnType<typeof gqlFetcherFactory>;
describe('GraphQL fetcher', () => {
  beforeEach(() => {
    fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { field: 1 } }), {
          headers: {
            'content-type': 'application/json',
          },
        })
      )
    );
    gql = gqlFetcherFactory('https://example.com/graphql', fetch);
  });

  afterEach(() => {
    fetch.mockReset();
  });

  it('should send POST request to given endpoint', async () => {
    await gql(
      // @ts-expect-error variables is actually optional
      { query }
    );

    expect(fetch).toBeCalledTimes(1);
    expect(fetch.mock.lastCall?.[0]).toBe('https://example.com/graphql');
    const ctx = fetch.mock.lastCall?.[1] as RequestInit;
    expect(ctx.method).toBe('POST');
  });

  it('should send with correct graphql JSON body', async () => {
    await gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: 1, b: '2', c: { d: false } },
    });

    expect(fetch.mock.lastCall?.[1]).toEqual(
      expect.objectContaining({
        body: '{"query":"query { field }","variables":{"a":1,"b":"2","c":{"d":false}},"operationName":"query"}',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-definition-name': 'query',
          'x-operation-name': 'query',
        }),
        method: 'POST',
      })
    );
  });

  it('should correctly ignore nil variables', async () => {
    await gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: false, b: null, c: undefined },
    });

    expect(fetch.mock.lastCall?.[1].body).toMatchInlineSnapshot(
      `"{"query":"query { field }","variables":{"a":false,"b":null},"operationName":"query"}"`
    );

    await gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: false, b: null, c: undefined },
      keepNilVariables: false,
    });

    expect(fetch.mock.lastCall?.[1].body).toMatchInlineSnapshot(
      `"{"query":"query { field }","variables":{"a":false},"operationName":"query"}"`
    );
  });

  it('should correct handle graphql error', async () => {
    fetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: null,
          errors: [{ message: 'error', path: ['field'] }],
        }),
        {
          headers: {
            'content-type': 'application/json',
          },
          status: 400,
        }
      )
    );

    await expect(
      gql({ query, variables: void 0 })
    ).rejects.toMatchInlineSnapshot(`[GraphQLError: error]`);
  });
});
