import { RadioButton, RadioButtonGroup } from '@affine/component';
import type { AllPageFilterOption } from '@affine/core/atoms';
import { allPageFilterSelectAtom } from '@affine/core/atoms';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import * as styles from './index.css';

export const WorkspaceModeFilterTab = ({
  workspaceId,
  activeFilter,
}: {
  workspaceId: string;
  activeFilter: AllPageFilterOption;
}) => {
  const t = useAFFiNEI18N();
  const [value, setValue] = useState(activeFilter);
  const [filterMode, setFilterMode] = useAtom(allPageFilterSelectAtom);
  const { jumpToCollections, jumpToTags, jumpToSubPath } = useNavigateHelper();
  const handleValueChange = useCallback(
    (value: AllPageFilterOption) => {
      switch (value) {
        case 'collections':
          jumpToCollections(workspaceId);
          break;
        case 'tags':
          jumpToTags(workspaceId);
          break;
        case 'docs':
          jumpToSubPath(workspaceId, WorkspaceSubPath.ALL);
          break;
      }
    },
    [jumpToCollections, jumpToSubPath, jumpToTags, workspaceId]
  );

  useEffect(() => {
    if (value !== activeFilter) {
      setValue(activeFilter);
      setFilterMode(activeFilter);
    }
  }, [activeFilter, filterMode, setFilterMode, value]);

  return (
    <RadioButtonGroup value={value} onValueChange={handleValueChange}>
      <RadioButton spanStyle={styles.filterTab} value="docs">
        {t['com.affine.docs.header']()}
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="collections">
        {t['com.affine.collections.header']()}
      </RadioButton>
      <RadioButton spanStyle={styles.filterTab} value="tags">
        {t['Tags']()}
      </RadioButton>
    </RadioButtonGroup>
  );
};
