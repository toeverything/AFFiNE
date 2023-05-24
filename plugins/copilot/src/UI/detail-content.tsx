import { useAtomValue } from 'jotai';

import { contentExpandAtom } from './jotai';

export function DetailContent() {
  const expand = useAtomValue(contentExpandAtom);
  if (!expand) {
    return null;
  }
  return <div>Hello, world!</div>;
}
