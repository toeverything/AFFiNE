import {
  Button,
  Divider,
  Menu,
  type MenuProps,
  MenuSub,
} from '@affine/component';
import type {
  GroupByParams,
  OrderByParams,
} from '@affine/core/modules/collection-rules/types';
import { useI18n } from '@affine/i18n';
import type React from 'react';
import { useCallback } from 'react';

import type { ExplorerDisplayPreference } from '../types';
import { GroupByList, GroupByName } from './group';
import { OrderByList, OrderByName } from './order';
import { DisplayProperties } from './properties';
import { QuickActionsConfig } from './quick-actions';
import * as styles from './styles.css';

const ExplorerDisplayMenu = ({
  displayPreference,
  onDisplayPreferenceChange,
}: {
  displayPreference: ExplorerDisplayPreference;
  onDisplayPreferenceChange: (
    displayPreference: ExplorerDisplayPreference
  ) => void;
}) => {
  const t = useI18n();

  const handleGroupByChange = useCallback(
    (groupBy: GroupByParams | undefined) => {
      onDisplayPreferenceChange({ ...displayPreference, groupBy });
    },
    [displayPreference, onDisplayPreferenceChange]
  );

  const handleOrderByChange = useCallback(
    (orderBy: OrderByParams) => {
      onDisplayPreferenceChange({ ...displayPreference, orderBy });
    },
    [displayPreference, onDisplayPreferenceChange]
  );

  return (
    <div className={styles.displayMenuContainer}>
      <MenuSub
        items={
          <GroupByList
            groupBy={displayPreference.groupBy}
            onChange={handleGroupByChange}
          />
        }
      >
        <div className={styles.subMenuSelectorContainer}>
          <span>{t['com.affine.explorer.display-menu.grouping']()}</span>
          <span className={styles.subMenuSelectorSelected}>
            {displayPreference.groupBy ? (
              <GroupByName groupBy={displayPreference.groupBy} />
            ) : null}
          </span>
        </div>
      </MenuSub>
      <MenuSub
        items={
          <OrderByList
            orderBy={displayPreference.orderBy}
            onChange={handleOrderByChange}
          />
        }
      >
        <div className={styles.subMenuSelectorContainer}>
          <span>{t['com.affine.explorer.display-menu.ordering']()}</span>
          <span className={styles.subMenuSelectorSelected}>
            {displayPreference.orderBy ? (
              <OrderByName orderBy={displayPreference.orderBy} />
            ) : null}
          </span>
        </div>
      </MenuSub>
      <Divider space={4} size="thinner" />
      <DisplayProperties
        displayPreference={displayPreference}
        onDisplayPreferenceChange={onDisplayPreferenceChange}
      />

      <Divider space={4} size="thinner" />
      <QuickActionsConfig
        displayPreference={displayPreference}
        onDisplayPreferenceChange={onDisplayPreferenceChange}
      />
    </div>
  );
};

export const ExplorerDisplayMenuButton = ({
  style,
  className,
  menuProps,
  displayPreference,
  onDisplayPreferenceChange,
}: {
  style?: React.CSSProperties;
  className?: string;
  menuProps?: Omit<MenuProps, 'items' | 'children'>;
  displayPreference: ExplorerDisplayPreference;
  onDisplayPreferenceChange: (
    displayPreference: ExplorerDisplayPreference
  ) => void;
}) => {
  const t = useI18n();
  return (
    <Menu
      items={
        <ExplorerDisplayMenu
          displayPreference={displayPreference}
          onDisplayPreferenceChange={onDisplayPreferenceChange}
        />
      }
      {...menuProps}
    >
      <Button className={className} style={style}>
        {t['com.affine.explorer.display-menu.button']()}
      </Button>
    </Menu>
  );
};
