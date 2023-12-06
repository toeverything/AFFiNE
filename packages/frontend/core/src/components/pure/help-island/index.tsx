import { Tooltip } from '@affine/component/ui/tooltip';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, UserGuideIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai/react';
import { useAtomValue } from 'jotai/react';
import { useCallback, useState } from 'react';

import { openOnboardingModalAtom, openSettingModalAtom } from '../../../atoms';
import { currentModeAtom } from '../../../atoms/mode';
import type { SettingProps } from '../../affine/setting-modal';
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
const DESKTOP_SHOW_LIST: IslandItemNames[] = [...DEFAULT_SHOW_LIST, 'guide'];
export type IslandItemNames = 'whatNew' | 'contact' | 'shortcuts' | 'guide';

export const HelpIsland = ({
  showList = environment.isDesktop ? DESKTOP_SHOW_LIST : DEFAULT_SHOW_LIST,
}: {
  showList?: IslandItemNames[];
}) => {
  const mode = useAtomValue(currentModeAtom);
  const setOpenOnboarding = useSetAtom(openOnboardingModalAtom);
  const setOpenSettingModalAtom = useSetAtom(openSettingModalAtom);
  const [spread, setShowSpread] = useState(false);
  const t = useAFFiNEI18N();

  const openSettingModal = useCallback(
    (tab: SettingProps['activeTab']) => {
      setShowSpread(false);

      setOpenSettingModalAtom({
        open: true,
        activeTab: tab,
        workspaceId: null,
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
      inEdgelessPage={mode === 'edgeless'}
    >
      <StyledAnimateWrapper
        style={{ height: spread ? `${showList.length * 40 + 4}px` : 0 }}
      >
        {showList.includes('whatNew') && (
          <Tooltip content={t['com.affine.appUpdater.whatsNew']()} side="left">
            <StyledIconWrapper
              data-testid="right-bottom-change-log-icon"
              onClick={() => {
                window.open(runtimeConfig.changelogUrl, '_blank');
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
        {showList.includes('guide') && (
          <Tooltip
            content={t['com.affine.helpIsland.gettingStarted']()}
            side="left"
          >
            <StyledIconWrapper
              data-testid="easy-guide"
              onClick={() => {
                setShowSpread(false);
                setOpenOnboarding(true);
              }}
            >
              <UserGuideIcon />
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
