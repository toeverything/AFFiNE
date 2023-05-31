import { Button, MenuItem } from '@affine/component';
import { FilteredIcon } from '@blocksuite/icons';

import Menu from '../../../ui/menu/menu';
import { CreateFilterMenu } from '../filter/vars';
import type { useAllPageSetting } from '../use-all-page-setting';
import { filterButton } from './view-list.css';

export const ViewList = ({
  setting,
}: {
  setting: ReturnType<typeof useAllPageSetting>;
}) => {
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
        <Button icon={<FilteredIcon />} className={filterButton}>
          Filter
        </Button>
      </Menu>
    </div>
  );
};
