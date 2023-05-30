import { MenuItem, styled } from '@affine/component';

import Menu from '../../../ui/menu/menu';
import { CreateFilterMenu } from '../filter/vars';
import type { useAllPageSetting } from '../use-all-page-setting';

const NoDragDiv = styled('div')`
  -webkit-app-region: no-drag;
`;

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
          <NoDragDiv style={{ marginRight: 12, cursor: 'pointer' }}>
            {setting.currentView.name}
          </NoDragDiv>
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
        <NoDragDiv style={{ cursor: 'pointer' }}>Filter</NoDragDiv>
      </Menu>
    </div>
  );
};
