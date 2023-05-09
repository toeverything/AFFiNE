import { BrowserWarning } from '@affine/component/affine-banner';
import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { CloseIcon, MinusIcon, RoundedRectangleIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import { useAtom } from 'jotai';
import type { FC, HTMLAttributes, PropsWithChildren } from 'react';
import {
  forwardRef,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { guideDownloadClientTipAtom } from '../../../atoms/guide';
import { useCurrentMode } from '../../../hooks/current/use-current-mode';
import type { AffineOfficialWorkspace } from '../../../shared';
import { DownloadClientTip } from './download-tips';
import EditPage from './header-right-items/edit-page';
import { EditorOptionMenu } from './header-right-items/editor-option-menu';
import { HeaderShareMenu } from './header-right-items/share-menu';
import SyncUser from './header-right-items/sync-user';
import TrashButtonGroup from './header-right-items/trash-button-group';
import UserAvatar from './header-right-items/user-avatar';
import * as styles from './styles.css';
import { OSWarningMessage, shouldShowWarning } from './utils';

const SidebarSwitch = lazy(() =>
  import('../../affine/sidebar-switch').then(module => ({
    default: module.SidebarSwitch,
  }))
);

export type BaseHeaderProps<
  Workspace extends AffineOfficialWorkspace = AffineOfficialWorkspace
> = {
  workspace: Workspace;
  currentPage: Page | null;
  isPublic: boolean;
  isPreview: boolean;
};

export const enum HeaderRightItemName {
  EditorOptionMenu = 'editorOptionMenu',
  TrashButtonGroup = 'trashButtonGroup',
  SyncUser = 'syncUser',
  ShareMenu = 'shareMenu',
  EditPage = 'editPage',
  UserAvatar = 'userAvatar',

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
      isPreview: boolean;
    }
  ) => boolean;
};

const HeaderRightItems: Record<HeaderRightItemName, HeaderItem> = {
  [HeaderRightItemName.TrashButtonGroup]: {
    Component: TrashButtonGroup,
    availableWhen: (_, currentPage) => {
      return currentPage?.meta.trash === true;
    },
  },
  [HeaderRightItemName.SyncUser]: {
    Component: SyncUser,
    availableWhen: (_, currentPage, { isPublic, isPreview }) => {
      return !isPublic && !isPreview;
    },
  },
  [HeaderRightItemName.ShareMenu]: {
    Component: HeaderShareMenu,
    availableWhen: (workspace, currentPage) => {
      return workspace.flavour !== WorkspaceFlavour.PUBLIC && !!currentPage;
    },
  },
  [HeaderRightItemName.EditPage]: {
    Component: EditPage,
    availableWhen: (workspace, currentPage, { isPublic }) => {
      return isPublic;
    },
  },
  [HeaderRightItemName.UserAvatar]: {
    Component: UserAvatar,
    availableWhen: (workspace, currentPage, { isPublic }) => {
      return isPublic;
    },
  },
  [HeaderRightItemName.EditorOptionMenu]: {
    Component: EditorOptionMenu,
    availableWhen: (_, currentPage, { isPublic, isPreview }) => {
      return !isPublic && !isPreview;
    },
  },
  [HeaderRightItemName.WindowsAppControls]: {
    Component: () => {
      return (
        <div className={styles.windowAppControlsWrapper}>
          <button
            data-type="minimize"
            className={styles.windowAppControl}
            onClick={() => {
              window.apis?.ui.handleMinimizeApp();
            }}
          >
            <MinusIcon />
          </button>
          <button
            data-type="maximize"
            className={styles.windowAppControl}
            onClick={() => {
              window.apis?.ui.handleMaximizeApp();
            }}
          >
            <RoundedRectangleIcon />
          </button>
          <button
            data-type="close"
            className={styles.windowAppControl}
            onClick={() => {
              window.apis?.ui.handleCloseApp();
            }}
          >
            <CloseIcon />
          </button>
        </div>
      );
    },
    availableWhen: () => {
      return environment.isDesktop && environment.isWindows;
    },
  },
};

export type HeaderProps = BaseHeaderProps;

export const Header = forwardRef<
  HTMLDivElement,
  PropsWithChildren<HeaderProps> & HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const [showWarning, setShowWarning] = useState(false);
  const [showGuideDownloadClientTip, setShowGuideDownloadClientTip] =
    useState(false);
  const [shouldShowGuideDownloadClientTip] = useAtom(
    guideDownloadClientTipAtom
  );
  useEffect(() => {
    setShowWarning(shouldShowWarning());
    setShowGuideDownloadClientTip(shouldShowGuideDownloadClientTip);
  }, [shouldShowGuideDownloadClientTip]);
  const [open] = useAtom(appSidebarOpenAtom);
  const t = useAFFiNEI18N();

  const mode = useCurrentMode();
  return (
    <div
      className={styles.headerContainer}
      ref={ref}
      data-has-warning={showWarning}
      data-open={open}
      {...props}
    >
      {showGuideDownloadClientTip ? (
        <DownloadClientTip />
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
        data-tauri-drag-region
        data-is-edgeless={mode === 'edgeless'}
      >
        <Suspense>
          <SidebarSwitch
            visible={!open}
            tooltipContent={t['Expand sidebar']()}
            data-testid="sliderBar-arrowButton-expand"
          />
        </Suspense>

        {props.children}
        <div className={styles.headerRightSide}>
          {useMemo(() => {
            return Object.entries(HeaderRightItems).map(
              ([name, { availableWhen, Component }]) => {
                if (
                  availableWhen(props.workspace, props.currentPage, {
                    isPreview: props.isPreview,
                    isPublic: props.isPublic,
                  })
                ) {
                  return (
                    <Component
                      workspace={props.workspace}
                      currentPage={props.currentPage}
                      isPreview={props.isPreview}
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
