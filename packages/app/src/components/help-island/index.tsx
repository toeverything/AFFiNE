import { useState } from 'react';
import {
  StyledIsland,
  StyledIconWrapper,
  StyledAnimateWrapper,
  StyledTriggerWrapper,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './Icons';
import { Tooltip } from '@affine/component';

import { useTranslation } from '@affine/i18n';
import { useModal } from '@/providers/GlobalModalProvider';
import { MuiFade } from '@affine/component';
export type IslandItemNames = 'contact' | 'shortcuts';
export const HelpIsland = ({
  showList = ['contact', 'shortcuts'],
}: {
  showList?: IslandItemNames[];
}) => {
  const [spread, setShowSpread] = useState(false);
  const { triggerShortcutsModal, triggerContactModal } = useModal();
  const { t } = useTranslation();
  return (
    <StyledIsland
      spread={spread}
      onClick={() => {
        setShowSpread(!spread);
      }}
    >
      <StyledAnimateWrapper spread={spread}>
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
