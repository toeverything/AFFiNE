import { useService, WorkspaceService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { useCallback } from 'react';

import type {
  DisplayProperties,
  PageDisplayProperties,
  PageGroupByType,
} from './types';

export const displayPropertiesAtom = atomWithStorage<{
  [workspaceId: string]: DisplayProperties;
}>('allDocDisplayProperties', {});

const defaultProps: DisplayProperties = {
  groupBy: 'updatedDate',
  displayProperties: {
    bodyNotes: true,
    tags: true,
    createDate: true,
    updatedDate: true,
  },
};

export const useAllDocDisplayProperties = (): [
  DisplayProperties,
  (
    key: keyof DisplayProperties,
    value: PageGroupByType | PageDisplayProperties
  ) => void,
] => {
  const workspace = useService(WorkspaceService).workspace;
  const [properties, setProperties] = useAtom(displayPropertiesAtom);

  const workspaceProperties = properties[workspace.id] || defaultProps;

  const onChange = useCallback(
    (
      key: keyof DisplayProperties,
      value: PageGroupByType | PageDisplayProperties
    ) => {
      setProperties(prev => ({
        ...prev,
        [workspace.id]: {
          ...(prev[workspace.id] || defaultProps),
          [key]: value,
        },
      }));
    },
    [setProperties, workspace.id]
  );

  return [workspaceProperties, onChange];
};
