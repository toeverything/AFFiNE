import { MuiFade, Tooltip } from '@affine/component';
import { getEnvironment } from '@affine/env';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { CloseIcon, NewIcon } from '@blocksuite/icons';
import { useAtom } from 'jotai';
import { lazy, Suspense, useState } from 'react';

import { openOnboardingModalAtom } from '../../../atoms';
import { useCurrentMode } from '../../../hooks/current/use-current-mode';
import { ShortcutsModal } from '../shortcuts-modal';
import { ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import {
  StyledAnimateWrapper,
  StyledIconWrapper,
  StyledIsland,
  StyledTriggerWrapper,
} from './style';
const env = getEnvironment();
const ContactModal = lazy(() =>
  import('@affine/component/contact-modal').then(({ ContactModal }) => ({
    default: ContactModal,
  }))
);
const DEFAULT_SHOW_LIST: IslandItemNames[] = [
  'whatNew',
  'contact',
  'shortcuts',
];
const DESKTOP_SHOW_LIST: IslandItemNames[] = [...DEFAULT_SHOW_LIST, 'guide'];
export type IslandItemNames = 'whatNew' | 'contact' | 'shortcuts' | 'guide';
export const HelpIsland = ({
  showList = env.isDesktop ? DESKTOP_SHOW_LIST : DEFAULT_SHOW_LIST,
}: {
  showList?: IslandItemNames[];
}) => {
  const mode = useCurrentMode();
  const [, setOpenOnboarding] = useAtom(openOnboardingModalAtom);
  const [spread, setShowSpread] = useState(false);
  // const { triggerShortcutsModal, triggerContactModal } = useModal();
  // const blockHub = useGlobalState(store => store.blockHub);
  const t = useAFFiNEI18N();
  //
  // useEffect(() => {
  //   blockHub?.blockHubStatusUpdated.on(status => {
  //     if (status) {
  //       setShowSpread(false);
  //     }
  //   });
  //   return () => {
  //     blockHub?.blockHubStatusUpdated.dispose();
  //   };
  // }, [blockHub]);
  //
  // useEffect(() => {
  //   spread && blockHub?.toggleMenu(false);
  // }, [blockHub, spread]);
  const [open, setOpen] = useState(false);
  const [openShortCut, setOpenShortCut] = useState(false);
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
          style={{ height: spread ? `${showList.length * 44}px` : 0 }}
        >
          {showList.includes('whatNew') && (
            <Tooltip content={t["Discover what's new!"]()} placement="left-end">
              <StyledIconWrapper
                data-testid="right-bottom-change-log-icon"
                onClick={() => {
                  window.open(
                    'https://github.com/toeverything/AFFiNE/releases',
                    '_blank'
                  );
                }}
              >
                <NewIcon />
              </StyledIconWrapper>
            </Tooltip>
          )}
          {showList.includes('contact') && (
            <Tooltip content={t['Contact Us']()} placement="left-end">
              <StyledIconWrapper
                data-testid="right-bottom-contact-us-icon"
                onClick={() => {
                  setShowSpread(false);
                  setOpen(true);
                }}
              >
                <ContactIcon />
              </StyledIconWrapper>
            </Tooltip>
          )}
          {showList.includes('shortcuts') && (
            <Tooltip content={t['Keyboard Shortcuts']()} placement="left-end">
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
            <Tooltip content={'Easy Guide'} placement="left-end">
              <StyledIconWrapper
                data-testid="easy-guide"
                onClick={() => {
                  setShowSpread(false);
                  setOpenOnboarding(true);
                }}
              >
                <HelpIcon />
              </StyledIconWrapper>
            </Tooltip>
          )}
        </StyledAnimateWrapper>

        <Tooltip content={t['Help and Feedback']()} placement="left-end">
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
      <Suspense>
        <ContactModal
          open={open}
          onClose={() => setOpen(false)}
          logoSrc="/imgs/affine-text-logo.png"
        />
      </Suspense>
      <ShortcutsModal
        open={openShortCut}
        onClose={() => setOpenShortCut(false)}
      />
    </>
  );
};
