import { MuiFade, Tooltip } from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon, UserGuideIcon } from '@blocksuite/icons';
import { useSetAtom } from 'jotai/react';
import { useAtomValue } from 'jotai/react';
import { useCallback, useState } from 'react';

import { openOnboardingModalAtom, openSettingModalAtom } from '../../../atoms';
import { currentModeAtom } from '../../../atoms/mode';
import { ShortcutsModal } from '../shortcuts-modal';
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

  const [openShortCut, setOpenShortCut] = useState(false);

  const openAbout = useCallback(() => {
    setShowSpread(false);

    setOpenSettingModalAtom({
      open: true,
      activeTab: 'about',
      workspaceId: null,
    });
  }, [setOpenSettingModalAtom]);

  return (
    <>
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
            <Tooltip
              content={t["Discover what's new!"]()}
              placement="left-end"
              showArrow={true}
            >
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
            <Tooltip
              content={t['Contact Us']()}
              placement="left-end"
              showArrow={true}
            >
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
              content={t['Keyboard Shortcuts']()}
              placement="left-end"
              showArrow={true}
            >
              <StyledIconWrapper
                data-testid="shortcuts-icon"
                onClick={() => {
                  setShowSpread(false);
                  setOpenShortCut(true);
                }}
              >
                <KeyboardIcon />
              </StyledIconWrapper>
            </Tooltip>
          )}
          {showList.includes('guide') && (
            <Tooltip
              content={t['com.affine.helpIsland.gettingStarted']()}
              placement="left-end"
              showArrow={true}
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

        <Tooltip
          content={t['Help and Feedback']()}
          placement={'left-end'}
          showArrow={true}
        >
          <MuiFade in={!spread} data-testid="faq-icon">
            <StyledTriggerWrapper>
              <HelpIcon />
            </StyledTriggerWrapper>
          </MuiFade>
        </Tooltip>
        <MuiFade in={spread}>
          <StyledTriggerWrapper spread>
            <CloseIcon />
          </StyledTriggerWrapper>
        </MuiFade>
      </StyledIsland>
      <ShortcutsModal
        open={openShortCut}
        onClose={() => setOpenShortCut(false)}
      />
    </>
  );
};
