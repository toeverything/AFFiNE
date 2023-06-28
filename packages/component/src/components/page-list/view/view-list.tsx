import { EditView } from '@affine/component/page-list';
import type { Filter, View } from '@affine/env/filter';
import {
  DeleteIcon,
  FilteredIcon,
  FolderIcon,
  PenIcon,
  PinIcon,
  ViewLayersIcon,
} from '@blocksuite/icons';
import clsx from 'clsx';
import { useAtom } from 'jotai';
import type { MouseEvent, ReactNode } from 'react';
import { useCallback, useMemo, useState } from 'react';

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

const ViewOption = ({
  view,
  setting,
  updateView,
}: {
  view: View;
  setting: ReturnType<typeof useAllPageSetting>;
  updateView: (view: View) => void;
}) => {
  const actions: {
    icon: ReactNode;
    click: () => void;
    className?: string;
  }[] = useMemo(
    () => [
      {
        icon: <PinIcon />,
        click: () => {
          return setting.updateView({
            ...view,
            pinned: !view.pinned,
          });
        },
      },
      {
        icon: <PenIcon />,
        click: () => {
          updateView(view);
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
    ],
    [setting, updateView, view]
  );
  const selectView = useCallback(
    () => setting.selectView(view.id),
    [setting, view.id]
  );
  return (
    <MenuItem
      icon={<ViewLayersIcon></ViewLayersIcon>}
      onClick={selectView}
      key={view.id}
      className={styles.viewMenu}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>{view.name}</div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
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
      </div>
    </MenuItem>
  );
};
export const ViewList = ({
  setting,
}: {
  setting: ReturnType<typeof useAllPageSetting>;
}) => {
  const [open] = useAtom(appSidebarOpenAtom);
  const [view, setView] = useState<View>();
  const onChange = useCallback(
    (filterList: Filter[]) => {
      return setting.updateView({
        ...setting.currentView,
        filterList,
      });
    },
    [setting]
  );
  const closeUpdateViewModal = useCallback(() => setView(undefined), []);
  const onConfirm = useCallback(
    (view: View) => {
      return setting.updateView(view).then(() => {
        closeUpdateViewModal();
      });
    },
    [closeUpdateViewModal, setting]
  );
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
              <MenuItem
                icon={<FolderIcon></FolderIcon>}
                onClick={setting.backToAll}
                className={styles.viewMenu}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>All</div>
                </div>
              </MenuItem>
              <div className={styles.menuTitleStyle}>Saved View</div>
              <div className={styles.menuDividerStyle}></div>
              {setting.savedViews.map(view => (
                <ViewOption
                  key={view.id}
                  view={view}
                  setting={setting}
                  updateView={setView}
                />
              ))}
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
            onChange={onChange}
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
      <Modal open={view != null} onClose={closeUpdateViewModal}>
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
            onClick={closeUpdateViewModal}
            hoverColor="var(--affine-icon-color)"
          />
          {view ? (
            <EditView
              title="Update View"
              init={view}
              onCancel={closeUpdateViewModal}
              onConfirm={onConfirm}
            />
          ) : null}
        </ModalWrapper>
      </Modal>
    </div>
  );
};
