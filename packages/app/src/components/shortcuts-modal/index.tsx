import { createPortal } from 'react-dom';
import { KeyboardIcon } from './icons';
import {
  StyledListItem,
  StyledModalHeader,
  StyledShortcutsModal,
  StyledSubTitle,
  StyledTitle,
  CloseButton,
} from './style';
import {
  macKeyboardShortcuts,
  macMarkdownShortcuts,
  windowsKeyboardShortcuts,
  winMarkdownShortcuts,
} from '@/components/shortcuts-modal/config';
import CloseIcon from '@mui/icons-material/Close';
import Slide from '@mui/material/Slide';
type ModalProps = {
  open: boolean;
  onClose: () => void;
};

const isMac = () => {
  return /macintosh|mac os x/i.test(navigator.userAgent);
};

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const markdownShortcuts = isMac()
    ? macMarkdownShortcuts
    : winMarkdownShortcuts;
  const keyboardShortcuts = isMac()
    ? macKeyboardShortcuts
    : windowsKeyboardShortcuts;
  return createPortal(
    <Slide direction="left" in={open} mountOnEnter unmountOnExit>
      <StyledShortcutsModal>
        <>
          <StyledModalHeader>
            <StyledTitle>
              <KeyboardIcon />
              Shortcuts
            </StyledTitle>

            <CloseButton
              onClick={() => {
                onClose();
              }}
            >
              <CloseIcon />
            </CloseButton>
          </StyledModalHeader>
          <StyledSubTitle style={{ marginTop: 0 }}>
            Keyboard Shortcuts
          </StyledSubTitle>
          {Object.entries(keyboardShortcuts).map(([title, shortcuts]) => {
            return (
              <StyledListItem key={title}>
                <span>{title}</span>
                <span>{shortcuts}</span>
              </StyledListItem>
            );
          })}
          <StyledSubTitle>Markdown Syntax</StyledSubTitle>
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
