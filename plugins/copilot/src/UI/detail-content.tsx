import { useAtomValue } from 'jotai';

import { contentExpandAtom } from './jotai';

export function DetailContent() {
  const expand = useAtomValue(contentExpandAtom);
  if (!expand) {
    return null;
  }
  return (
    <div
      style={{
        width: '300px',
      }}
    >
      Hello, world!
    </div>
  );
}
