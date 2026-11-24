import { WorkspaceLocalState } from '@affine/core/modules/workspace';
import { useService } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import type { DocListItemView } from './docs-view/doc-list-item';
import type { ExplorerDisplayPreference } from './types';

export const DefaultDisplayPreference: {
  [key in DocListItemView]: ExplorerDisplayPreference;
} = {
  grid: {
    view: 'grid',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: undefined,
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
  masonry: {
    view: 'masonry',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: undefined,
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
  list: {
    view: 'list',
    displayProperties: [
      'system:createdAt',
      'system:updatedAt',
      'system:createdBy',
      'system:tags',
    ],
    orderBy: {
      type: 'system',
      key: 'updatedAt',
      desc: true,
    },
    groupBy: {
      type: 'system',
      key: 'updatedAt',
    },
    showDocIcon: true,
    showDocPreview: true,
    quickFavorite: true,
    showDragHandle: true,
    showMoreOperation: true,
  },
};

/**
 * Persists the view mode and per-mode display preference in workspace local state.
 * The view mode is stored at `viewModeKey`, and the display preference for each mode
 * at `displayPreferenceKeyPrefix + mode`.
 *
 * Since split view allows users to open multiple views simultaneously, each with its own state,
 * we only read the stored state once during useState initialization to maintain independent states.
 */
export const useExplorerDisplayPreference = ({
  viewModeKey,
  displayPreferenceKeyPrefix,
}: {
  viewModeKey: string;
  displayPreferenceKeyPrefix: string;
}) => {
  const workspaceLocalState = useService(WorkspaceLocalState);

  const readSavedViewMode = useCallback(() => {
    return workspaceLocalState.get<DocListItemView>(viewModeKey) ?? 'list';
  }, [workspaceLocalState, viewModeKey]);

  const readSavedDisplayPreference = useCallback(
    (mode: DocListItemView) => {
      const saved = workspaceLocalState.get<ExplorerDisplayPreference>(
        displayPreferenceKeyPrefix + mode
      );
      return {
        ...DefaultDisplayPreference[mode],
        ...saved,
        view: mode,
      };
    },
    [workspaceLocalState, displayPreferenceKeyPrefix]
  );

  const [viewMode, setViewMode] = useState(readSavedViewMode);
  const [displayPreference, setDisplayPreference] =
    useState<ExplorerDisplayPreference>(() =>
      readSavedDisplayPreference(viewMode)
    );

  const handleViewModeChange = useCallback(
    (mode: DocListItemView) => {
      workspaceLocalState.set(viewModeKey, mode);
      setViewMode(mode);
      setDisplayPreference(readSavedDisplayPreference(mode));
    },
    [workspaceLocalState, viewModeKey, readSavedDisplayPreference]
  );

  const handleDisplayPreferenceChange = useCallback(
    (displayPreference: ExplorerDisplayPreference) => {
      workspaceLocalState.set(
        displayPreferenceKeyPrefix + viewMode,
        displayPreference
      );
      setDisplayPreference(displayPreference);
    },
    [viewMode, workspaceLocalState, displayPreferenceKeyPrefix]
  );

  return {
    viewMode,
    setViewMode: handleViewModeChange,
    displayPreference,
    setDisplayPreference: handleDisplayPreferenceChange,
  };
};
