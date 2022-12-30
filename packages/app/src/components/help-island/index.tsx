import { useState } from 'react';
import {
  StyledIsland,
  StyledIconWrapper,
  StyledIslandWrapper,
  StyledTransformIcon,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import Grow from '@mui/material/Grow';
import { Tooltip } from '@/ui/tooltip';
import { useModal } from '@/providers/global-modal-provider';
import { useTheme } from '@/providers/themeProvider';
import useCurrentPageMeta from '@/hooks/use-current-page-meta';
export type IslandItemNames = 'contact' | 'shortcuts';
export const HelpIsland = ({
  showList = ['contact', 'shortcuts'],
}: {
  showList?: IslandItemNames[];
}) => {
  const [showContent, setShowContent] = useState(false);
  const { mode } = useTheme();
  const { mode: editorMode } = useCurrentPageMeta() || {};
  const { triggerShortcutsModal, triggerContactModal } = useModal();
  const isEdgelessDark = mode === 'dark' && editorMode === 'edgeless';

  return (
    <>
      <StyledIsland
        className=""
        onMouseEnter={() => {
          setShowContent(true);
        }}
        onMouseLeave={() => {
          setShowContent(false);
        }}
      >
        <Grow in={showContent}>
          <StyledIslandWrapper>
            {showList.includes('contact') && (
              <Tooltip content="Contact Us" placement="left-end">
                <StyledIconWrapper
                  data-testid="right-bottom-contact-us-icon"
                  isEdgelessDark={isEdgelessDark}
                  onClick={() => {
                    setShowContent(false);
                    triggerContactModal();
                  }}
                >
                  <ContactIcon />
                </StyledIconWrapper>
              </Tooltip>
            )}
            {showList.includes('shortcuts') && (
              <Tooltip content="Keyboard Shortcuts" placement="left-end">
                <StyledIconWrapper
                  data-testid="shortcuts-icon"
                  isEdgelessDark={isEdgelessDark}
                  onClick={() => {
                    setShowContent(false);
                    triggerShortcutsModal();
                  }}
                >
                  <KeyboardIcon />
                </StyledIconWrapper>
              </Tooltip>
            )}
          </StyledIslandWrapper>
        </Grow>

        <div style={{ position: 'relative' }}>
          <StyledIconWrapper
            isEdgelessDark={isEdgelessDark}
            data-testid="faq-icon"
          >
            <HelpIcon />
          </StyledIconWrapper>
          <StyledTransformIcon in={showContent}>
            <CloseIcon />
          </StyledTransformIcon>
        </div>
      </StyledIsland>
    </>
  );
};

export default HelpIsland;
