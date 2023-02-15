import { useState, useEffect } from 'react';
import {
  StyledIsland,
  StyledIconWrapper,
  StyledAnimateWrapper,
  StyledTriggerWrapper,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './Icons';
import { Tooltip } from '@affine/component';

import { useTranslation } from '@affine/i18n';
import { useModal } from '@/store/globalModal';
import { MuiFade } from '@affine/component';
import { useGlobalState } from '@/store/app';
export type IslandItemNames = 'contact' | 'shortcuts';
export const HelpIsland = ({
  showList = ['contact', 'shortcuts'],
}: {
  showList?: IslandItemNames[];
}) => {
  const [spread, setShowSpread] = useState(false);
  const { triggerShortcutsModal, triggerContactModal } = useModal();
  const blockHub = useGlobalState(store => store.blockHub);
  const { t } = useTranslation();

  useEffect(() => {
    blockHub?.blockHubStatusUpdated.on(status => {
      if (status) {
        setShowSpread(false);
      }
    });
    return () => {
      blockHub?.blockHubStatusUpdated.dispose();
    };
  }, [blockHub]);

  useEffect(() => {
    spread && blockHub?.toggleMenu(false);
  }, [blockHub, spread]);
  return (
    <StyledIsland
      spread={spread}
      onClick={() => {
        setShowSpread(!spread);
      }}
    >
      <StyledAnimateWrapper
        style={{ height: spread ? `${showList.length * 44}px` : 0 }}
      >
        {showList.includes('contact') && (
          <Tooltip content={t('Contact Us')} placement="left-end">
            <StyledIconWrapper
              data-testid="right-bottom-contact-us-icon"
              onClick={() => {
                setShowSpread(false);
                triggerContactModal();
              }}
            >
              <ContactIcon />
            </StyledIconWrapper>
          </Tooltip>
        )}
        {showList.includes('shortcuts') && (
          <Tooltip content={t('Keyboard Shortcuts')} placement="left-end">
            <StyledIconWrapper
              data-testid="shortcuts-icon"
              onClick={() => {
                setShowSpread(false);
                triggerShortcutsModal();
              }}
            >
              <KeyboardIcon />
            </StyledIconWrapper>
          </Tooltip>
        )}
      </StyledAnimateWrapper>

      <MuiFade in={!spread} data-testid="faq-icon">
        <StyledTriggerWrapper>
          <HelpIcon />
        </StyledTriggerWrapper>
      </MuiFade>
      <MuiFade in={spread}>
        <StyledTriggerWrapper>
          <CloseIcon />
        </StyledTriggerWrapper>
      </MuiFade>
    </StyledIsland>
  );
};

export default HelpIsland;
