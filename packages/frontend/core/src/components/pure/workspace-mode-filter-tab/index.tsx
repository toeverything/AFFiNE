import { RadioGroup, type RadioItem } from '@affine/component';
import type { AllPageFilterOption } from '@affine/core/components/atoms';
import { allPageFilterSelectAtom } from '@affine/core/components/atoms';
import { useNavigateHelper } from '@affine/core/components/hooks/use-navigate-helper';
import { useI18n } from '@affine/i18n';
import { useService, WorkspaceService } from '@toeverything/infra';
import { useAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react';

import * as styles from './index.css';

export const WorkspaceModeFilterTab = ({
  activeFilter,
}: {
  activeFilter: AllPageFilterOption;
}) => {
  const workspace = useService(WorkspaceService).workspace;
  const t = useI18n();
  const [value, setValue] = useState(activeFilter);
  const [filterMode, setFilterMode] = useAtom(allPageFilterSelectAtom);
  const { jumpToCollections, jumpToTags, jumpToPage } = useNavigateHelper();
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
          jumpToPage(workspace.id, 'all');
          break;
      }
    },
    [jumpToCollections, jumpToPage, jumpToTags, workspace]
  );

  useEffect(() => {
    if (value !== activeFilter) {
      setValue(activeFilter);
      setFilterMode(activeFilter);
    }
  }, [activeFilter, filterMode, setFilterMode, value]);

  return (
    <RadioGroup
      style={{ maxWidth: '100%', width: 273 }}
      value={value}
      onChange={handleValueChange}
      items={useMemo<RadioItem[]>(
        () => [
          {
            value: 'docs',
            label: t['com.affine.docs.header'](),
            testId: 'workspace-docs-button',
            className: styles.filterTab,
          },
          {
            value: 'collections',
            label: t['com.affine.collections.header'](),
            testId: 'workspace-collections-button',
            className: styles.filterTab,
          },
          {
            value: 'tags',
            label: t['Tags'](),
            testId: 'workspace-tags-button',
            className: styles.filterTab,
          },
        ],
        [t]
      )}
    />
  );
};
