import { useTranslation } from '@affine/i18n';
import { CloseIcon } from '@blocksuite/icons';
import type { Page } from '@blocksuite/store';
import type { HTMLAttributes, PropsWithChildren } from 'react';
import type React from 'react';
import { forwardRef, useEffect, useMemo, useState } from 'react';

import {
  useSidebarFloating,
  useSidebarStatus,
} from '../../../hooks/use-sidebar-status';
import type { AffineOfficialWorkspace } from '../../../shared';
import { SidebarSwitch } from '../../affine/sidebar-switch';
import { EditorOptionMenu } from './header-right-items/EditorOptionMenu';
import SyncUser from './header-right-items/SyncUser';
import ThemeModeSwitch from './header-right-items/theme-mode-switch';
import TrashButtonGroup from './header-right-items/TrashButtonGroup';
import {
  StyledBrowserWarning,
  StyledCloseButton,
  StyledHeader,
  StyledHeaderContainer,
  StyledHeaderRightSide,
} from './styles';
import { OSWarningMessage, shouldShowWarning } from './utils';

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
  ThemeModeSwitch = 'themeModeSwitch',
  SyncUser = 'syncUser',
  ShareMenu = 'shareMenu',
}

type HeaderItem = {
  Component: React.FC<BaseHeaderProps>;
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
  [HeaderRightItemName.ThemeModeSwitch]: {
    Component: ThemeModeSwitch,
    availableWhen: (_, currentPage) => {
      return currentPage?.meta.trash !== true;
    },
  },
  [HeaderRightItemName.EditorOptionMenu]: {
    Component: EditorOptionMenu,
    availableWhen: (_, currentPage, { isPublic, isPreview }) => {
      return !!currentPage && !isPublic && !isPreview;
    },
  },
  [HeaderRightItemName.ShareMenu]: {
    Component: () => null,
    availableWhen: (_, currentPage, { isPublic, isPreview }) => {
      return false;
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
  const [open] = useSidebarStatus();
  const sidebarFloating = useSidebarFloating();
  const { t } = useTranslation();

  return (
    <StyledHeaderContainer
      sidebarFloating={sidebarFloating && open}
      ref={ref}
      hasWarning={showWarning}
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
        <SidebarSwitch
          visible={!open}
          tooltipContent={t('Expand sidebar')}
          testid="sliderBar-arrowButton-expand"
        />

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
