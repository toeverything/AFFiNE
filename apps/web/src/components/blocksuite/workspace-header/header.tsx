import { appSidebarOpenAtom } from '@affine/component/app-sidebar';
import { useTranslation } from '@affine/i18n';
import { WorkspaceFlavour } from '@affine/workspace/type';
import { CloseIcon } from '@blocksuite/icons';
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

import type { AffineOfficialWorkspace } from '../../../shared';
import { EditorOptionMenu } from './header-right-items/EditorOptionMenu';
import EditPage from './header-right-items/EditPage';
import { HeaderShareMenu } from './header-right-items/ShareMenu';
import SyncUser from './header-right-items/SyncUser';
import TrashButtonGroup from './header-right-items/TrashButtonGroup';
import UserAvatar from './header-right-items/UserAvatar';
import {
  StyledBrowserWarning,
  StyledCloseButton,
  StyledHeader,
  StyledHeaderContainer,
  StyledHeaderRightSide,
} from './styles';
import { OSWarningMessage, shouldShowWarning } from './utils';

const SidebarSwitch = lazy(() =>
  import('../../affine/sidebar-switch').then(module => ({
    default: module.SidebarSwitch,
  }))
);

const BrowserWarning = ({
  show,
  onClose,
}: {
  show: boolean;
  onClose: () => void;
}) => {
  return (
    <StyledBrowserWarning show={show}>
      <OSWarningMessage />
      <StyledCloseButton onClick={onClose}>
        <CloseIcon />
      </StyledCloseButton>
    </StyledBrowserWarning>
  );
};

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
};

export type HeaderProps = BaseHeaderProps;

export const Header = forwardRef<
  HTMLDivElement,
  PropsWithChildren<HeaderProps> & HTMLAttributes<HTMLDivElement>
>((props, ref) => {
  const [showWarning, setShowWarning] = useState(false);
  useEffect(() => {
    setShowWarning(shouldShowWarning());
  }, []);
  const [open] = useAtom(appSidebarOpenAtom);
  const { t } = useTranslation();

  return (
    <StyledHeaderContainer
      ref={ref}
      hasWarning={showWarning}
      data-open={open}
      {...props}
    >
      <BrowserWarning
        show={showWarning}
        onClose={() => {
          setShowWarning(false);
        }}
      />
      <StyledHeader
        hasWarning={showWarning}
        data-testid="editor-header-items"
        data-tauri-drag-region
      >
        <Suspense>
          <SidebarSwitch
            visible={!open}
            tooltipContent={t('Expand sidebar')}
            data-testid="sliderBar-arrowButton-expand"
          />
        </Suspense>

        {props.children}
        <StyledHeaderRightSide>
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
          {/*<ShareMenu />*/}
        </StyledHeaderRightSide>
      </StyledHeader>
    </StyledHeaderContainer>
  );
});

Header.displayName = 'Header';
