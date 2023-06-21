import {
  ModalCloseButton,
  MuiClickAwayListener,
  MuiSlide,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  useEdgelessShortcuts,
  useGeneralShortcuts,
  useMarkdownShortcuts,
  usePageShortcuts,
} from '../../../hooks/affine/use-shortcuts';
import { KeyboardIcon } from './icons';
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

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const t = useAFFiNEI18N();

  const markdownShortcuts = useMarkdownShortcuts();
  const pageShortcuts = usePageShortcuts();
  const edgelessShortcuts = useEdgelessShortcuts();
  const generalShortcuts = useGeneralShortcuts();

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
                {t['Shortcuts']()}
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
              {t['General']()}
            </StyledSubTitle>
            {Object.entries(generalShortcuts).map(([title, shortcuts]) => {
              return (
                <StyledListItem key={title}>
                  <span>{title}</span>
                  <span>{shortcuts}</span>
                </StyledListItem>
              );
            })}
            <StyledSubTitle>{t['Page']()}</StyledSubTitle>
            {Object.entries(pageShortcuts).map(([title, shortcuts]) => {
              return (
                <StyledListItem key={title}>
                  <span>{title}</span>
                  <span>{shortcuts}</span>
                </StyledListItem>
              );
            })}
            <StyledSubTitle>{t['Edgeless']()}</StyledSubTitle>
            {Object.entries(edgelessShortcuts).map(([title, shortcuts]) => {
              return (
                <StyledListItem key={title}>
                  <span>{title}</span>
                  <span>{shortcuts}</span>
                </StyledListItem>
              );
            })}
            <StyledSubTitle>{t['Markdown Syntax']()}</StyledSubTitle>
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
