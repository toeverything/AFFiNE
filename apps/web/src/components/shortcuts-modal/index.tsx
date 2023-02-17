import {
  ModalCloseButton,
  MuiClickAwayListener,
  MuiSlide,
} from '@affine/component';
import { useTranslation } from '@affine/i18n';
import { createPortal } from 'react-dom';

import {
  useMacKeyboardShortcuts,
  useMacMarkdownShortcuts,
  useWindowsKeyboardShortcuts,
  useWinMarkdownShortcuts,
} from '@/components/shortcuts-modal/config';
import { getUaHelper } from '@/utils';

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

const isMac = () => {
  return getUaHelper().isMacOs;
};

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const { t } = useTranslation();
  const macMarkdownShortcuts = useMacMarkdownShortcuts();
  const winMarkdownShortcuts = useWinMarkdownShortcuts();
  const macKeyboardShortcuts = useMacKeyboardShortcuts();
  const windowsKeyboardShortcuts = useWindowsKeyboardShortcuts();
  const markdownShortcuts = isMac()
    ? macMarkdownShortcuts
    : winMarkdownShortcuts;
  const keyboardShortcuts = isMac()
    ? macKeyboardShortcuts
    : windowsKeyboardShortcuts;

  return createPortal(
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
    </MuiSlide>,
    document.body
  );
};

export default ShortcutsModal;
