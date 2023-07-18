/**
 * @vitest-environment happy-dom
 */
import { uploadAvatarMutation } from '@affine/graphql';
import { render } from '@testing-library/react';
import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useMutation, useQuery } from '../gql';

let fetch: Mock;
describe('GraphQL wrapper for SWR', () => {
  beforeEach(() => {
    fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ data: { hello: 1 } }), {
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

  describe('useQuery', () => {
    const Component = ({ id }: { id: number }) => {
      const { data, isLoading, error } = useQuery({
        query: {
          id: 'query',
          query: `
          query {
            hello
          }
        `,
          operationName: 'query',
          definitionName: 'query',
        },
        // @ts-expect-error forgive the fake variables
        variables: { id },
      });

      if (isLoading) {
        return <div>loading</div>;
      }

      if (error) {
        return <div>error</div>;
      }

      // @ts-expect-error
      return <div>number: {data!.hello}</div>;
    };

    it('should send query correctly', async () => {
      const component = <Component id={1} />;
      const renderer = render(component);
      const el = await renderer.findByText('number: 1');
      expect(el).toMatchInlineSnapshot(`
        <div>
          number: 
          1
        </div>
      `);
    });

    it('should not send request if cache hit', async () => {
      const component = <Component id={2} />;
      const renderer = render(component);
      expect(fetch).toBeCalledTimes(1);

      renderer.rerender(component);
      expect(fetch).toBeCalledTimes(1);

      render(<Component id={3} />);

      expect(fetch).toBeCalledTimes(2);
    });
  });

  describe('useMutation', () => {
    const Component = () => {
      const { trigger, error, isMutating } = useMutation({
        mutation: {
          id: 'mutation',
          query: `
          mutation {
            hello
          }
        `,
          operationName: 'mutation',
          definitionName: 'mutation',
        },
      });

      if (isMutating) {
        return <div>mutating</div>;
      }

      if (error) {
        return <div>error</div>;
      }

      return (
        <div>
          <button
            onClick={() =>
              // @ts-expect-error forgive the fake variables
              trigger()
            }
          >
            click
          </button>
        </div>
      );
    };

    it('should trigger mutation', async () => {
      const component = <Component />;
      const renderer = render(component);
      const button = await renderer.findByText('click');

      button.click();
      expect(fetch).toBeCalledTimes(1);

      renderer.rerender(component);
      expect(renderer.asFragment()).toMatchInlineSnapshot(`
        <DocumentFragment>
          <div>
            mutating
          </div>
        </DocumentFragment>
      `);
    });

    it('should get rid of generated types', async () => {
      function _NotActuallyRunDefinedForTypeTesting() {
        const { trigger } = useMutation({
          mutation: uploadAvatarMutation,
        });
        trigger({
          id: '1',
          avatar: new File([''], 'avatar.png'),
        });
      }
      expect(_NotActuallyRunDefinedForTypeTesting).toBeTypeOf('function');
    });
  });
});
