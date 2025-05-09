import { Tooltip } from '@affine/component/ui/tooltip';
import { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { SettingTab } from '@affine/core/modules/dialogs/constant';
import { GlobalContextService } from '@affine/core/modules/global-context';
import { UrlService } from '@affine/core/modules/url';
import { useI18n } from '@affine/i18n';
import { CloseIcon, NewIcon } from '@blocksuite/icons/rc';
import { useLiveData, useService, useServices } from '@toeverything/infra';
import { useCallback, useState } from 'react';

import { ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import {
  StyledAnimateWrapper,
  StyledIconWrapper,
  StyledIsland,
  StyledTriggerWrapper,
} from './style';

const DEFAULT_SHOW_LIST: IslandItemNames[] = [
  'whatNew',
  'contact',
  'shortcuts',
];

const DESKTOP_SHOW_LIST: IslandItemNames[] = [...DEFAULT_SHOW_LIST];
type IslandItemNames = 'whatNew' | 'contact' | 'shortcuts';

const showList = BUILD_CONFIG.isElectron
  ? DESKTOP_SHOW_LIST
  : DEFAULT_SHOW_LIST;

export const HelpIsland = () => {
  const { globalContextService, urlService } = useServices({
    GlobalContextService,
    UrlService,
  });
  const docId = useLiveData(globalContextService.globalContext.docId.$);
  const docMode = useLiveData(globalContextService.globalContext.docMode.$);
  const workspaceDialogService = useService(WorkspaceDialogService);
  const [spread, setShowSpread] = useState(false);
  const t = useI18n();
  const openSettingModal = useCallback(
    (tab: SettingTab) => {
      setShowSpread(false);

      workspaceDialogService.open('setting', {
        activeTab: tab,
      });
    },
    [workspaceDialogService]
  );
  const openAbout = useCallback(
    () => openSettingModal('about'),
    [openSettingModal]
  );
  const openShortcuts = useCallback(
    () => openSettingModal('shortcuts'),
    [openSettingModal]
  );

  return (
    <StyledIsland
      spread={spread}
      data-testid="help-island"
      onClick={() => {
        setShowSpread(!spread);
      }}
      inEdgelessPage={!!docId && docMode === 'edgeless'}
    >
      <StyledAnimateWrapper
        style={{ height: spread ? `${showList.length * 40 + 4}px` : 0 }}
      >
        {showList.includes('whatNew') && (
          <Tooltip content={t['com.affine.appUpdater.whatsNew']()} side="left">
            <StyledIconWrapper
              data-testid="right-bottom-change-log-icon"
              onClick={() => {
                urlService.openPopupWindow(BUILD_CONFIG.changelogUrl);
              }}
            >
              <NewIcon />
            </StyledIconWrapper>
          </Tooltip>
        )}
        {showList.includes('contact') && (
          <Tooltip content={t['com.affine.helpIsland.contactUs']()} side="left">
            <StyledIconWrapper
              data-testid="right-bottom-contact-us-icon"
              onClick={openAbout}
            >
              <ContactIcon />
            </StyledIconWrapper>
          </Tooltip>
        )}
        {showList.includes('shortcuts') && (
          <Tooltip
            content={t['com.affine.keyboardShortcuts.title']()}
            side="left"
          >
            <StyledIconWrapper
              data-testid="shortcuts-icon"
              onClick={openShortcuts}
            >
              <KeyboardIcon />
            </StyledIconWrapper>
          </Tooltip>
        )}
      </StyledAnimateWrapper>

      {spread ? (
        <StyledTriggerWrapper spread>
          <CloseIcon />
        </StyledTriggerWrapper>
      ) : (
        <Tooltip
          content={t['com.affine.helpIsland.helpAndFeedback']()}
          side="left"
        >
          <StyledTriggerWrapper data-testid="faq-icon">
            <HelpIcon />
          </StyledTriggerWrapper>
        </Tooltip>
      )}
    </StyledIsland>
  );
};
