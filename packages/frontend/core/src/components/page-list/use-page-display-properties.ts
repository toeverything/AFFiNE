import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';

import type { PageDisplayProperties } from './types';

export const pageDisplayPropertiesAtom = atomWithStorage<PageDisplayProperties>(
  'pageDisplayProperties',
  {
    bodyNotes: true,
    tags: true,
    createDate: true,
    updatedDate: true,
  }
);

export const usePageDisplayProperties = (): [
  PageDisplayProperties,
  (key: keyof PageDisplayProperties, value: boolean) => void,
] => {
  const [properties, setProperties] = useAtom(pageDisplayPropertiesAtom);
  const onChange = useCallback(
    (key: keyof PageDisplayProperties, value: boolean) => {
      setProperties(prev => ({ ...prev, [key]: value }));
    },
    [setProperties]
  );
  return [properties, onChange];
};
