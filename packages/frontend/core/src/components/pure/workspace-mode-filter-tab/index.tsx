import { RadioButton, RadioButtonGroup } from '@affine/component';
import type { AllPageFilterOption } from '@affine/core/atoms';
import { allPageFilterSelectAtom } from '@affine/core/atoms';
import { useNavigateHelper } from '@affine/core/hooks/use-navigate-helper';
import { WorkspaceSubPath } from '@affine/core/shared';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useService } from '@toeverything/infra';
import { Workspace } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useState } from 'react';

import * as styles from './index.css';

export const WorkspaceModeFilterTab = ({
  activeFilter,
}: {
  activeFilter: AllPageFilterOption;
}) => {
  const workspace = useService(Workspace);
  const t = useAFFiNEI18N();
  const [value, setValue] = useState(activeFilter);
  const [filterMode, setFilterMode] = useAtom(allPageFilterSelectAtom);
  const { jumpToCollections, jumpToTags, jumpToSubPath } = useNavigateHelper();
  const handleValueChange = useCallback(
    (value: AllPageFilterOption) => {
      switch (value) {
        case 'collections':
          jumpToCollections(workspace.id);
          break;
        case 'tags':
          jumpToTags(workspace.id);
          break;
        case 'docs':
          jumpToSubPath(workspace.id, WorkspaceSubPath.ALL);
          break;
      }
    },
    [jumpToCollections, jumpToSubPath, jumpToTags, workspace]
  );

  useEffect(() => {
    if (value !== activeFilter) {
      setValue(activeFilter);
      setFilterMode(activeFilter);
    }
  }, [activeFilter, filterMode, setFilterMode, value]);

  return (
    <RadioButtonGroup value={value} onValueChange={handleValueChange}>
      <RadioButton
        spanStyle={styles.filterTab}
        value="docs"
        data-testid="workspace-docs-button"
      >
        {t['com.affine.docs.header']()}
      </RadioButton>
      <RadioButton
        spanStyle={styles.filterTab}
        value="collections"
        data-testid="workspace-collections-button"
      >
        {t['com.affine.collections.header']()}
      </RadioButton>
      <RadioButton
        spanStyle={styles.filterTab}
        value="tags"
        data-testid="workspace-tags-button"
      >
        {t['Tags']()}
      </RadioButton>
    </RadioButtonGroup>
  );
};
