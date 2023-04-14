/**
 * @vitest-environment happy-dom
 */
import { PassThrough } from 'node:stream';

import { resourceContextAtom } from '@affine/jotai';
import type { Atom } from 'jotai';
import { createStore, Provider, useAtomValue } from 'jotai';
import { Suspense } from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import {
  assertDispatchAtom,
  assertEffectAtom,
  assertPrimitiveAtom,
  createModule,
  dispatchAtom,
  effectAtom,
  primitiveAtom,
} from '../module';

type FakeUser = {
  id: string;
  name: string;
};

describe('module', () => {
  test(
    'basic',
    async () => {
      let resolved = false;
      const store = createStore();
      store.set(resourceContextAtom, {
        fetch: async (url: string) => {
          console.log('fetch', url);
          if (url.endsWith('/2')) {
            return new Promise(resolve => {
              setTimeout(() => {
                resolve(
                  new Response(
                    JSON.stringify({
                      id: '2',
                      name: 'test2',
                    })
                  )
                );
              }, 100);
            });
          }
          throw new Error('not found');
        },
        // assume the incoming user is `2`
        requestUser: {
          id: '2',
          name: 'test2',
        },
      });

      const init = createModule('user', context => {
        const { fetch, requestUser } = context.store.get(
          context.atoms.resourceContextAtom
        );
        const userIdAtom = primitiveAtom<string | null>(
          requestUser?.id ?? null
        );
        const userAtom = effectAtom<FakeUser | null>(async get => {
          const id = get(userIdAtom);
          if (id === null) {
            return null;
          } else {
            const user = (await fetch(`http://localhost:3000/${id}`).then(r =>
              r.json()
            )) as FakeUser;
            resolved = true;
            return user;
          }
        });
        const changeUserAtom = dispatchAtom((get, set, id: string) => {
          set(userIdAtom, id);
        });
        return [userIdAtom, userAtom, changeUserAtom];
      });

      const { name, effects, primitives, dispatches } = init(store);
      expect(name).toBe('user');
      expect(effects.length).toBe(1);
      expect(primitives.length).toBe(1);
      expect(dispatches.length).toBe(1);

      const effect = effects[0];
      assertPrimitiveAtom(primitives[0]);
      assertDispatchAtom(dispatches[0]);
      assertEffectAtom(effect);

      const Component = () => {
        const user = useAtomValue(effect) as FakeUser;
        console.log('render', user);
        return <div>{user.name}</div>;
      };

      type AppProps = {
        store: ReturnType<typeof createStore>;
      };

      const App = ({ store }: AppProps) => {
        return (
          <Provider store={store}>
            <Suspense fallback="loading">
              <Component />
            </Suspense>
          </Provider>
        );
      };
      const revalidateAtoms = new Set<Atom<unknown>>();

      console.log('start sub');
      effects.forEach(atom => {
        store.sub(atom, () => {
          console.log('effect called', atom);
          revalidateAtoms.add(atom);
        });
      });
      const writable = new PassThrough();
      const readable = new ReadableStream({
        start(controller) {
          writable.on('data', chunk => {
            controller.enqueue(chunk);
          });
          writable.on('end', () => {
            controller.close();
          });
        },
      });
      const { pipe } = renderToPipeableStream(<App store={store} />);
      pipe(writable);
      const reader = readable.getReader();
      let html = '';
      await reader.read().then(function processText({ done, value }): any {
        if (done) {
          return;
        }
        html += value;
        return reader.read().then(processText);
      });

      expect(resolved).toBe(true);
      expect(await store.get(effects[0])).toEqual({
        id: '2',
        name: 'test2',
      });
      expect(html).toMatchSnapshot();
    },
    {
      timeout: 5000,
    }
  );
});
