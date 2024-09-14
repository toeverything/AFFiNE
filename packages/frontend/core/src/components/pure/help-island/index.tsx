import { Tooltip } from '@affine/component/ui/tooltip';
import { popupWindow } from '@affine/core/utils';
import { useI18n } from '@affine/i18n';
import { CloseIcon, NewIcon } from '@blocksuite/icons/rc';
import {
  GlobalContextService,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import { useSetAtom } from 'jotai/react';
import { useCallback, useState } from 'react';

import type { SettingProps } from '../../affine/setting-modal';
import { openSettingModalAtom } from '../../atoms';
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
  const { globalContextService } = useServices({
    GlobalContextService,
  });
  const docId = useLiveData(globalContextService.globalContext.docId.$);
  const docMode = useLiveData(globalContextService.globalContext.docMode.$);
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);
  const [spread, setShowSpread] = useState(false);
  const t = useI18n();
  const openSettingModal = useCallback(
    (tab: SettingProps['activeTab']) => {
      setShowSpread(false);

      setOpenSettingModalAtom({
        open: true,
        activeTab: tab,
      });
    },
    [setOpenSettingModalAtom]
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
                popupWindow(BUILD_CONFIG.changelogUrl);
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
