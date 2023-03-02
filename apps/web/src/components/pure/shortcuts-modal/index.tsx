import {
  ModalCloseButton,
  MuiClickAwayListener,
  MuiSlide,
} from '@affine/component';
import { getEnvironment } from '@affine/env';
import { useTranslation } from '@affine/i18n';
import { useEffect, useState } from 'react';

import {
  useMacKeyboardShortcuts,
  useMacMarkdownShortcuts,
  useWindowsKeyboardShortcuts,
  useWinMarkdownShortcuts,
} from './config';
import { KeyboardIcon } from './Icons';
import {
  StyledListItem,
  StyledModalHeader,
  StyledShortcutsModal,
  StyledSubTitle,
  StyledTitle,
} from './style';
type ModalProps = {
  open: boolean;
  onClose: () => void;
};

const checkIsMac = () => {
  const env = getEnvironment();
  return env.isBrowser && env.isMacOs;
};

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const { t } = useTranslation();
  const macMarkdownShortcuts = useMacMarkdownShortcuts();
  const winMarkdownShortcuts = useWinMarkdownShortcuts();
  const macKeyboardShortcuts = useMacKeyboardShortcuts();
  const windowsKeyboardShortcuts = useWindowsKeyboardShortcuts();
  const [isMac, setIsMac] = useState(false);
  const markdownShortcuts = isMac ? macMarkdownShortcuts : winMarkdownShortcuts;
  const keyboardShortcuts = isMac
    ? macKeyboardShortcuts
    : windowsKeyboardShortcuts;

  useEffect(() => {
    setIsMac(checkIsMac());
  }, []);

  return (
    <MuiSlide direction="left" in={open} mountOnEnter unmountOnExit>
      <StyledShortcutsModal data-testid="shortcuts-modal">
        <MuiClickAwayListener
          onClickAway={() => {
            onClose();
          }}
        >
          <div>
            <StyledModalHeader>
              <StyledTitle>
                <KeyboardIcon />
                {t('Shortcuts')}
              </StyledTitle>

              <ModalCloseButton
                top={6}
                right={6}
                size={[24, 24]}
                iconSize={[15, 15]}
                onClick={() => {
                  onClose();
                }}
              />
            </StyledModalHeader>
            <StyledSubTitle style={{ marginTop: 0 }}>
              {t('Keyboard Shortcuts')}
            </StyledSubTitle>
            {Object.entries(keyboardShortcuts).map(([title, shortcuts]) => {
              return (
                <StyledListItem key={title}>
                  <span>{title}</span>
                  <span>{shortcuts}</span>
                </StyledListItem>
              );
            })}
            <StyledSubTitle>{t('Markdown Syntax')}</StyledSubTitle>
            {Object.entries(markdownShortcuts).map(([title, shortcuts]) => {
              return (
                <StyledListItem key={title}>
                  <span>{title}</span>
                  <span>{shortcuts}</span>
                </StyledListItem>
              );
            })}
          </div>
        </MuiClickAwayListener>
      </StyledShortcutsModal>
    </MuiSlide>
  );
};
