import { RadioButton, RadioButtonGroup } from '@affine/component';
import { currentCollectionAtom } from '@affine/component/page-list';
import { type FilterMode, filterModeAtom } from '@affine/core/atoms';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useSetAtom } from 'jotai';
import { useState } from 'react';
import { NIL } from 'uuid';

import * as styles from './index.css';

export const WorkspaceModeFilterTab = ({
  workspaceId,
  active,
}: {
  active: 'docs' | 'collections' | 'tags';
  workspaceId: string;
}) => {
  const [value, setValue] = useState<FilterMode>(active);
  const setFilterMode = useSetAtom(filterModeAtom);
  const currentCollection = useSetAtom(currentCollectionAtom);
  const { jumpToSubPath, jumpToAllTags, jumpToAllCollections } =
    useNavigateHelper();

  const handleValueChange = (value: FilterMode) => {
    switch (value) {
      case 'docs':
        jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
        break;
      case 'collections':
        jumpToAllCollections(workspaceId);
        break;
      case 'tags':
        jumpToAllTags(workspaceId);
        break;
    }
    currentCollection(NIL);
    setValue(value);
    setFilterMode(value);
  };
  console.log('value', value);

  return (
    <RadioButtonGroup value={value} onValueChange={handleValueChange}>
      <RadioButton spanStyle={styles.filterTab} value="docs">
        Docs
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="collections">
        Collections
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="tags">
        Tags
      </RadioButton>
    </RadioButtonGroup>
  );
};
