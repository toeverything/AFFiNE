import { atom, useAtomValue } from 'jotai';
import type { ReactElement } from 'react';
import { Suspense } from 'react';

import { globalContextAtom } from '../globalAtoms';

export const dataAtom = atom(async get => {
  const { fetch } = get(globalContextAtom);
  return fetch('https://jsonplaceholder.typicode.com/todos/1').then(res =>
    res.json()
  );
});

const innerDataAtom = atom(async get => {
  console.log('fetching');
  const { fetch } = get(globalContextAtom);
  return fetch('https://jsonplaceholder.typicode.com/todos/2').then(res =>
    res.json()
  );
});

const Inner = () => {
  const data = useAtomValue(innerDataAtom);
  console.log(1);
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
};

export const IndexPage = (): ReactElement => {
  const data = useAtomValue(dataAtom);
  return (
    <div>
      <h1>Hello, world!</h1>
      <pre>{JSON.stringify(data, null, 2)}</pre>
      <Suspense fallback="loading...">
        <Inner />
      </Suspense>
    </div>
  );
};
