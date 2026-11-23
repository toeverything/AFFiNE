import { Checkbox, MenuItem, MenuSub } from '@affine/component';
import { useI18n } from '@affine/i18n';
import track from '@affine/track';
import { useCallback } from 'react';

import { type QuickAction, quickActions } from '../quick-actions.constants';
import type { ExplorerDisplayPreference } from '../types';

export const QuickActionsConfig = ({
  displayPreference,
  onDisplayPreferenceChange,
}: {
  displayPreference: ExplorerDisplayPreference;
  onDisplayPreferenceChange: (
    displayPreference: ExplorerDisplayPreference
  ) => void;
}) => {
  const t = useI18n();

  return (
    <MenuSub
      items={quickActions.map(action => {
        if (action.disabled) return null;

        return (
          <QuickActionItem
            key={action.key}
            action={action}
            active={displayPreference[`${action.key}`] ?? false}
            onClick={() => {
              track.allDocs.header.displayMenu.editDisplayMenu({
                control: 'quickActions',
                type: action.key,
              });
              onDisplayPreferenceChange({
                ...displayPreference,
                [action.key]: !displayPreference[action.key],
              });
            }}
          />
        );
      })}
    >
      {t['com.affine.all-docs.quick-actions']()}
    </MenuSub>
  );
};

const QuickActionItem = ({
  action,
  active,
  onClick,
}: {
  action: QuickAction;
  active: boolean;
  onClick: () => void;
}) => {
  const t = useI18n();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onClick();
    },
    [onClick]
  );

  return (
    <MenuItem prefixIcon={<Checkbox checked={active} />} onClick={handleClick}>
      {t.t(action.name)}
    </MenuItem>
  );
};
