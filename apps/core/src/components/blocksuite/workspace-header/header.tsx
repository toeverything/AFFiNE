import { BrowserWarning } from '@affine/component/affine-banner';
import {
  appSidebarFloatingAtom,
  appSidebarOpenAtom,
} from '@affine/component/app-sidebar';
import { SidebarSwitch } from '@affine/component/app-sidebar/sidebar-header';
import { isDesktop } from '@affine/env/constant';
import { CloseIcon, MinusIcon, RoundedRectangleIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { headerItemsAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import type { FC, HTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { currentModeAtom } from '../../../atoms/mode';
import type { AffineOfficialWorkspace } from '../../../shared';
import DownloadClientTip from './download-tips';
import { EditorOptionMenu } from './header-right-items/editor-option-menu';
import * as styles from './styles.css';
import { OSWarningMessage, shouldShowWarning } from './utils';

export type BaseHeaderProps<
  Workspace extends AffineOfficialWorkspace = AffineOfficialWorkspace,
> = {
  workspace: Workspace;
  currentPage: Page | null;
  isPublic: boolean;
  leftSlot?: ReactNode;
};

export enum HeaderRightItemName {
  EditorOptionMenu = 'editorOptionMenu',
  // some windows only items
  WindowsAppControls = 'windowsAppControls',
}

type HeaderItem = {
  Component: FC<BaseHeaderProps>;
  // todo: public workspace should be one of the flavour
  availableWhen: (
    workspace: AffineOfficialWorkspace,
    currentPage: Page | null,
    status: {
      isPublic: boolean;
    }
  ) => boolean;
};

const HeaderRightItems: Record<HeaderRightItemName, HeaderItem> = {
  [HeaderRightItemName.EditorOptionMenu]: {
    Component: EditorOptionMenu,
    availableWhen: (_, currentPage, { isPublic }) => {
      return !isPublic && currentPage?.meta.trash !== true;
    },
  },
  [HeaderRightItemName.WindowsAppControls]: {
    Component: () => {
      const handleMinimizeApp = useCallback(() => {
        window.apis?.ui.handleMinimizeApp().catch(err => {
          console.error(err);
        });
      }, []);
      const handleMaximizeApp = useCallback(() => {
        window.apis?.ui.handleMaximizeApp().catch(err => {
          console.error(err);
        });
      }, []);
      const handleCloseApp = useCallback(() => {
        window.apis?.ui.handleCloseApp().catch(err => {
          console.error(err);
        });
      }, []);
      return (
        <div
          data-platform-target="win32"
          className={styles.windowAppControlsWrapper}
        >
          <button
            data-type="minimize"
            className={styles.windowAppControl}
            onClick={handleMinimizeApp}
          >
            <MinusIcon />
          </button>
          <button
            data-type="maximize"
            className={styles.windowAppControl}
            onClick={handleMaximizeApp}
          >
            <RoundedRectangleIcon />
          </button>
          <button
            data-type="close"
            className={styles.windowAppControl}
            onClick={handleCloseApp}
          >
            <CloseIcon />
          </button>
        </div>
      );
    },
    availableWhen: () => {
      return isDesktop && globalThis.platform === 'win32';
    },
  },
};

export type HeaderProps = BaseHeaderProps;

const PluginHeader = () => {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerItems = useAtomValue(headerItemsAtom);
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }
    let disposes: (() => void)[] = [];
    const renderTimeout = setTimeout(() => {
      disposes = Object.entries(headerItems).map(([id, headerItem]) => {
        const div = document.createElement('div');
        div.setAttribute('plugin-id', id);
        const cleanup = headerItem(div);
        root.appendChild(div);
        return () => {
          cleanup();
          root.removeChild(div);
        };
      });
    });

    return () => {
      clearTimeout(renderTimeout);
      setTimeout(() => {
        disposes.forEach(dispose => dispose());
      });
    };
  }, [headerItems]);

  return <div className={styles.pluginHeaderItems} ref={rootRef} />;
};

export const Header = forwardRef<
  HTMLDivElement,
  PropsWithChildren<HeaderProps> & HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const [showWarning, setShowWarning] = useState(false);
  const [showDownloadTip, setShowDownloadTip] = useState(true);
  // const [shouldShowGuideDownloadClientTip] = useAtom(
  //   guideDownloadClientTipAtom
  // );
  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);
  const open = useAtomValue(appSidebarOpenAtom);
  const appSidebarFloating = useAtomValue(appSidebarFloatingAtom);

  const mode = useAtomValue(currentModeAtom);

  return (
    <div
      className={styles.headerContainer}
      ref={ref}
      data-has-warning={showWarning}
      data-open={open}
      data-sidebar-floating={appSidebarFloating}
    >
      {showDownloadTip ? (
        <DownloadClientTip
          show={showDownloadTip}
          onClose={() => setShowDownloadTip(false)}
        />
      ) : (
        <BrowserWarning
          show={showWarning}
          message={<OSWarningMessage />}
          onClose={() => {
            setShowWarning(false);
          }}
        />
      )}
      <div
        className={styles.header}
        data-has-warning={showWarning}
        data-testid="editor-header-items"
        data-is-edgeless={mode === 'edgeless'}
      >
        <div className={styles.headerLeftSide}>
          {!open && <SidebarSwitch />}
          {props.leftSlot}
        </div>

        {props.children}
        <div className={styles.headerRightSide}>
          <PluginHeader />
          {useMemo(() => {
            return Object.entries(HeaderRightItems).map(
              ([name, { availableWhen, Component }]) => {
                if (
                  availableWhen(props.workspace, props.currentPage, {
                    isPublic: props.isPublic,
                  })
                ) {
                  return (
                    <Component
                      workspace={props.workspace}
                      currentPage={props.currentPage}
                      isPublic={props.isPublic}
                      key={name}
                    />
                  );
                }
                return null;
              }
            );
          }, [props])}
        </div>
      </div>
    </div>
  );
});

Header.displayName = 'Header';
