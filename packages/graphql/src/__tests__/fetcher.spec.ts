import { nanoid } from 'nanoid';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gqlFetcherFactory } from '../fetcher';
import type { GraphQLQuery } from '../graphql';
import {
  generateRandUTF16Chars,
  SPAN_ID_BYTES,
  TRACE_ID_BYTES,
  TraceReporter,
} from '../utils';

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

  it('should send POST request to given endpoint', async () => {
    await gql(
      // @ts-expect-error variables is actually optional
      { query }
    );

    expect(fetch).toBeCalledTimes(1);
    expect(fetch.mock.lastCall[0]).toBe('https://example.com/graphql');
    const ctx = fetch.mock.lastCall[1] as RequestInit;
    expect(ctx.method).toBe('POST');
  });

  it('should send with correct graphql JSON body', async () => {
    await gql({
      query,
      // @ts-expect-error forgive the fake variables
      variables: { a: 1, b: '2', c: { d: false } },
    });

    expect(fetch.mock.lastCall[1]).toEqual(
      expect.objectContaining({
        body: '{"query":"query { field }","variables":{"a":1,"b":"2","c":{"d":false}},"operationName":"query"}',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-definition-name': 'query',
          'x-operation-name': 'query',
          'x-request-id': expect.any(String),
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

    expect(fetch.mock.lastCall[1].body).toMatchInlineSnapshot(
      '"{\\"query\\":\\"query { field }\\",\\"variables\\":{\\"a\\":false,\\"b\\":null},\\"operationName\\":\\"query\\"}"'
    );

    await gql({
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

    await expect(gql({ query, variables: void 0 })).rejects
      .toMatchInlineSnapshot(`
      [
        [GraphQLError: error],
      ]
    `);
  });
});

describe('Trace Reporter', () => {
  const startTime = new Date().toISOString();
  const traceId = generateRandUTF16Chars(TRACE_ID_BYTES);
  const spanId = generateRandUTF16Chars(SPAN_ID_BYTES);
  const requestId = nanoid();

  it('spanId, traceId should be right format', () => {
    expect(
      new RegExp(`^[0-9a-f]{${SPAN_ID_BYTES * 2}}$`).test(
        generateRandUTF16Chars(SPAN_ID_BYTES)
      )
    ).toBe(true);
    expect(
      new RegExp(`^[0-9a-f]{${TRACE_ID_BYTES * 2}}$`).test(
        generateRandUTF16Chars(TRACE_ID_BYTES)
      )
    ).toBe(true);
  });

  it('test createTraceSpan', () => {
    const traceSpan = TraceReporter.createTraceSpan(
      traceId,
      spanId,
      requestId,
      startTime
    );
    expect(traceSpan.startTime).toBe(startTime);
    expect(
      traceSpan.name ===
        `projects/{GCP_PROJECT_ID}/traces/${traceId}/spans/${spanId}`
    ).toBe(true);
    expect(traceSpan.spanId).toBe(spanId);
    expect(traceSpan.attributes.attributeMap.requestId.stringValue.value).toBe(
      requestId
    );
  });
});
