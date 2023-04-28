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
    vi.stubGlobal('fetch', fetch);
  });

  afterEach(() => {
    fetch.mockReset();
  });

  const gql = gqlFetcherFactory('https://example.com/graphql');

  it('should send POST request to given endpoint', () => {
    gql(
      // @ts-expect-error variables is actually optional
      { query }
    );

    expect(fetch).toBeCalledTimes(1);
    expect(fetch.mock.lastCall[0]).toBe('https://example.com/graphql');
    const ctx = fetch.mock.lastCall[1] as RequestInit;
    expect(ctx.method).toBe('POST');
  });

  it('should send with correct graphql JSON body', () => {
    gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: 1, b: '2', c: { d: false } },
    });

    expect(fetch.mock.lastCall[1]).toMatchInlineSnapshot(`
      {
        "body": "{\\"query\\":\\"query { field }\\",\\"variables\\":{\\"a\\":1,\\"b\\":\\"2\\",\\"c\\":{\\"d\\":false}},\\"operationName\\":\\"query\\"}",
        "headers": {
          "x-definition-name": "query",
          "x-operation-name": "query",
        },
        "method": "POST",
      }
    `);
  });

  it('should correctly ignore nil variables', () => {
    gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: false, b: null, c: undefined },
    });

    expect(fetch.mock.lastCall[1].body).toMatchInlineSnapshot(
      '"{\\"query\\":\\"query { field }\\",\\"variables\\":{\\"a\\":false,\\"b\\":null},\\"operationName\\":\\"query\\"}"'
    );

    gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: false, b: null, c: undefined },
      keepNilVariables: false,
    });

    expect(fetch.mock.lastCall[1].body).toMatchInlineSnapshot(
      '"{\\"query\\":\\"query { field }\\",\\"variables\\":{\\"a\\":false},\\"operationName\\":\\"query\\"}"'
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

    await expect(gql({ query, variables: {} })).rejects.toMatchInlineSnapshot(`
      [
        [GraphQLError: error],
      ]
    `);
  });
});
