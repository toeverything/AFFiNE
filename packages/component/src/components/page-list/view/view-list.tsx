import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { FilteredIcon } from '@blocksuite/icons';
import clsx from 'clsx';
import { useAtom } from 'jotai';

import { Button, MenuItem } from '../../..';
import Menu from '../../../ui/menu/menu';
import { appSidebarOpenAtom } from '../../app-sidebar';
import { CreateFilterMenu } from '../filter/vars';
import type { useAllPageSetting } from '../use-all-page-setting';
import * as styles from './view-list.css';
export const ViewList = ({
  setting,
}: {
  setting: ReturnType<typeof useAllPageSetting>;
}) => {
  const [open] = useAtom(appSidebarOpenAtom);
  const t = useAFFiNEI18N();
  return (
    <div style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}>
      {setting.savedViews.length > 0 && (
        <Menu
          trigger="click"
          content={
            <div>
              {setting.savedViews.map(view => {
                return (
                  <MenuItem
                    onClick={() => setting.setCurrentView(view)}
                    key={view.id}
                  >
                    {view.name}
                  </MenuItem>
                );
              })}
            </div>
          }
        >
          <Button style={{ marginRight: 12, cursor: 'pointer' }}>
            {setting.currentView.name}
          </Button>
        </Menu>
      )}
      <Menu
        trigger="click"
        placement="bottom-start"
        content={
          <CreateFilterMenu
            value={setting.currentView.filterList}
            onChange={filterList => {
              setting.setCurrentView(view => ({
                ...view,
                filterList,
              }));
            }}
          />
        }
      >
        <Button
          icon={<FilteredIcon />}
          className={clsx(styles.filterButton, {
            [styles.filterButtonCollapse]: !open,
          })}
          size="small"
          hoverColor="var(--affine-icon-color)"
        >
          {t['com.affine.filter']()}
        </Button>
      </Menu>
    </div>
  );
};
