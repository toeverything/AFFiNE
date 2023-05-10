import { IconButton } from '@affine/component';
import { getEnvironment } from '@affine/env/config';
import {
  ArrowLeftSmallIcon,
  ArrowRightSmallIcon,
  SidebarIcon,
} from '@blocksuite/icons';
import { useAtom } from 'jotai';

import { navHeaderStyle, sidebarButtonStyle } from '../index.css';
import { appSidebarOpenAtom } from '../index.jotai';

export const SidebarHeader = () => {
  const [open, setOpen] = useAtom(appSidebarOpenAtom);
  const environment = getEnvironment();
  const isMacosDesktop = environment.isDesktop && environment.isMacOs;
  return (
    <div
      className={navHeaderStyle}
      data-is-macos-electron={isMacosDesktop}
      data-open={open}
    >
      {isMacosDesktop && (
        <>
          <IconButton
            size="middle"
            onClick={() => {
              window.history.back();
            }}
          >
            <ArrowLeftSmallIcon />
          </IconButton>
          <IconButton
            size="middle"
            onClick={() => {
              window.history.forward();
            }}
          >
            <ArrowRightSmallIcon />
          </IconButton>
        </>
      )}
      <IconButton
        data-testid="app-sidebar-arrow-button-collapse"
        className={sidebarButtonStyle}
        onClick={() => setOpen(open => !open)}
      >
        <SidebarIcon width={24} height={24} />
      </IconButton>
    </div>
  );
};
