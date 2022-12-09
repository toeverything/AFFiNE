import { useState } from 'react';
import {
  StyledFAQ,
  StyledIconWrapper,
  StyledFAQWrapper,
  StyledTransformIcon,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import Grow from '@mui/material/Grow';
import { Tooltip } from '@/ui/tooltip';
import { useEditor } from '@/providers/editor-provider';
import { useModal } from '@/providers/global-modal-provider';
import { useTheme } from '@/providers/themeProvider';

export const FAQ = () => {
  const [showContent, setShowContent] = useState(false);
  const { mode } = useTheme();
  const { mode: editorMode } = useEditor();
  const { triggerShortcutsModal, triggerContactModal } = useModal();
  const isEdgelessDark = mode === 'dark' && editorMode === 'edgeless';

  return (
    <>
      <StyledFAQ
        className=""
        onMouseEnter={() => {
          setShowContent(true);
        }}
        onMouseLeave={() => {
          setShowContent(false);
        }}
      >
        <Grow in={showContent}>
          <StyledFAQWrapper>
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
          </StyledFAQWrapper>
        </Grow>

        <div style={{ position: 'relative' }}>
          <StyledIconWrapper
            data-testid="faq-icon"
            isEdgelessDark={isEdgelessDark}
          >
            <HelpIcon />
          </StyledIconWrapper>
          <StyledTransformIcon in={showContent}>
            <CloseIcon />
          </StyledTransformIcon>
        </div>
      </StyledFAQ>
    </>
  );
};
