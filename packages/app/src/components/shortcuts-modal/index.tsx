import { createPortal } from 'react-dom';
import { KeyboardIcon } from './icons';
import {
  StyledListItem,
  StyledModalHeader,
  StyledShortcutsModal,
  StyledSubTitle,
  StyledTitle,
} from './style';
import {
  macKeyboardShortcuts,
  macMarkdownShortcuts,
  windowsKeyboardShortcuts,
  winMarkdownShortcuts,
} from '@/components/shortcuts-modal/config';
import Slide from '@mui/material/Slide';
import { ModalCloseButton } from '@/ui/modal';
import { getUaHelper } from '@/utils';
import { useTranslation } from 'react-i18next';
type ModalProps = {
  open: boolean;
  onClose: () => void;
};

const isMac = () => {
  return getUaHelper().isMacOs;
};

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const markdownShortcuts = isMac()
    ? macMarkdownShortcuts()
    : winMarkdownShortcuts();
  const keyboardShortcuts = isMac()
    ? macKeyboardShortcuts()
    : windowsKeyboardShortcuts();
  const { t } = useTranslation();
  return createPortal(
    <Slide direction="left" in={open} mountOnEnter unmountOnExit>
      <StyledShortcutsModal data-testid="shortcuts-modal">
        <>
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
        </>
      </StyledShortcutsModal>
    </Slide>,
    document.body
  );
};

export default ShortcutsModal;
