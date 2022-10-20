import { useState } from 'react';
import {
  StyledFAQ,
  StyledIconWrapper,
  StyledFAQWrapper,
  StyledTransformIcon,
} from './style';
import { CloseIcon, ContactIcon, HelpIcon, KeyboardIcon } from './icons';
import Grow from '@mui/material/Grow';
import { Tooltip } from '../tooltip';
import { useEditor } from '@/components/editor-provider';
import { useModal } from '@/components/global-modal-provider';
import { useTheme } from '@/styles';

export const FAQ = () => {
  const [showContent, setShowContent] = useState(false);
  const { mode } = useTheme();
  const { mode: editorMode } = useEditor();
  const { shortcutsModalHandler, contactModalHandler } = useModal();
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
            <Tooltip content="Contact with us" placement="left-end">
              <StyledIconWrapper
                isEdgelessDark={isEdgelessDark}
                onClick={() => {
                  contactModalHandler(true);
                }}
              >
                <ContactIcon />
              </StyledIconWrapper>
            </Tooltip>
            <Tooltip content="Keyboard shorts" placement="left-end">
              <StyledIconWrapper
                isEdgelessDark={isEdgelessDark}
                onClick={() => {
                  shortcutsModalHandler(true);
                }}
              >
                <KeyboardIcon />
              </StyledIconWrapper>
            </Tooltip>
          </StyledFAQWrapper>
        </Grow>

        <div style={{ position: 'relative' }}>
          <StyledIconWrapper isEdgelessDark={isEdgelessDark}>
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
