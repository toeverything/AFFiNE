import { EditView } from '@affine/component/page-list';
import type { View } from '@affine/env/filter';
import {
  DeleteIcon,
  FilteredIcon,
  PenIcon,
  PinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import type { MouseEvent, ReactNode } from 'react';
import { useState } from 'react';

import {
  Button,
  MenuItem,
  Modal,
  ModalCloseButton,
  ModalWrapper,
} from '../../..';
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
  const [view, setView] = useState<View>();
  return (
    <div
      className={clsx({
        [styles.filterButtonCollapse]: !open,
      })}
      style={{ marginLeft: 4, display: 'flex', alignItems: 'center' }}
    >
      {setting.savedViews.length > 0 && (
        <Menu
          trigger="click"
          content={
            <div style={{ minWidth: 150 }}>
              <div className={styles.menuTitleStyle}>Saved View</div>
              <div className={styles.menuDividerStyle}></div>
              {setting.savedViews.map(view => {
                const actions: {
                  icon: ReactNode;
                  click: () => void;
                  className?: string;
                }[] = [
                  {
                    icon: <PinIcon />,
                    click: () => {
                      setting.updateView({
                        ...view,
                        pinned: !view.pinned,
                      });
                    },
                  },
                  {
                    icon: <PenIcon />,
                    click: () => {
                      setView(view);
                    },
                  },
                  {
                    icon: <DeleteIcon style={{ color: 'red' }} />,
                    click: () => {
                      setting.deleteView(view.id).catch(err => {
                        console.error(err);
                      });
                    },
                  },
                ];
                return (
                  <MenuItem
                    icon={<ViewLayersIcon></ViewLayersIcon>}
                    onClick={() => setting.selectView(view.id)}
                    key={view.id}
                    className={styles.viewMenu}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      {view.name}
                      {actions.map((v, i) => {
                        const onClick = (e: MouseEvent<HTMLDivElement>) => {
                          e.stopPropagation();
                          v.click();
                        };
                        return (
                          <div
                            key={i}
                            onClick={onClick}
                            style={{ marginLeft: i === 0 ? 28 : undefined }}
                            className={clsx(styles.viewOption, v.className)}
                          >
                            {v.icon}
                          </div>
                        );
                      })}
                    </div>
                  </MenuItem>
                );
              })}
            </div>
          }
        >
          <Button
            size="small"
            className={clsx(styles.viewButton)}
            hoverColor="var(--affine-icon-color)"
          >
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
              setting.updateView({
                ...setting.currentView,
                filterList,
              });
            }}
          />
        }
      >
        <Button
          icon={<FilteredIcon />}
          className={clsx(styles.filterButton)}
          size="small"
          hoverColor="var(--affine-icon-color)"
        >
          Filter
        </Button>
      </Menu>
      <Modal open={view != null} onClose={() => setView(undefined)}>
        <ModalWrapper
          width={560}
          style={{
            padding: '40px',
            background: 'var(--affine-background-primary-color)',
          }}
        >
          <ModalCloseButton
            top={12}
            right={12}
            onClick={() => setView(undefined)}
            hoverColor="var(--affine-icon-color)"
          />
          {view ? (
            <EditView
              title="Update View"
              init={view}
              onCancel={() => setView(undefined)}
              onConfirm={view => {
                setting.updateView(view);
                setView(undefined);
              }}
            />
          ) : null}
        </ModalWrapper>
      </Modal>
    </div>
  );
};
