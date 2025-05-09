import { Button, Menu, MenuSub } from '@affine/component';
import type {
  GroupByParams,
  OrderByParams,
} from '@affine/core/modules/collection-rules/types';
import { useI18n } from '@affine/i18n';
import { ArrowDownSmallIcon } from '@blocksuite/icons/rc';
import type React from 'react';
import { useCallback } from 'react';

import type { ExplorerPreference } from '../types';
import { GroupByList, GroupByName } from './group';
import { OrderByList, OrderByName } from './order';
import * as styles from './styles.css';

const ExplorerDisplayMenu = ({
  preference,
  onChange,
}: {
  preference: ExplorerPreference;
  onChange?: (preference: ExplorerPreference) => void;
}) => {
  const t = useI18n();

  const handleGroupByChange = useCallback(
    (groupBy: GroupByParams) => {
      onChange?.({
        ...preference,
        groupBy,
      });
    },
    [onChange, preference]
  );

  const handleOrderByChange = useCallback(
    (orderBy: OrderByParams) => {
      onChange?.({
        ...preference,
        orderBy,
      });
    },
    [onChange, preference]
  );

  return (
    <div className={styles.displayMenuContainer}>
      <MenuSub
        items={
          <GroupByList
            groupBy={preference.groupBy}
            onChange={handleGroupByChange}
          />
        }
      >
        <div className={styles.subMenuSelectorContainer}>
          <span>{t['com.affine.explorer.display-menu.grouping']()}</span>
          <span className={styles.subMenuSelectorSelected}>
            {preference.groupBy ? (
              <GroupByName groupBy={preference.groupBy} />
            ) : null}
          </span>
        </div>
      </MenuSub>
      <MenuSub
        items={
          <OrderByList
            orderBy={preference.orderBy}
            onChange={handleOrderByChange}
          />
        }
      >
        <div className={styles.subMenuSelectorContainer}>
          <span>{t['com.affine.explorer.display-menu.ordering']()}</span>
          <span className={styles.subMenuSelectorSelected}>
            {preference.orderBy ? (
              <OrderByName orderBy={preference.orderBy} />
            ) : null}
          </span>
        </div>
      </MenuSub>
    </div>
  );
};

export const ExplorerDisplayMenuButton = ({
  style,
  className,
  preference,
  onChange,
}: {
  style?: React.CSSProperties;
  className?: string;
  preference: ExplorerPreference;
  onChange?: (preference: ExplorerPreference) => void;
}) => {
  const t = useI18n();
  return (
    <Menu
      items={
        <ExplorerDisplayMenu preference={preference} onChange={onChange} />
      }
    >
      <Button
        className={className}
        style={style}
        suffix={<ArrowDownSmallIcon />}
      >
        {t['com.affine.explorer.display-menu.button']()}
      </Button>
    </Menu>
  );
};
