import {
  ModalCloseButton,
  MuiClickAwayListener,
  MuiSlide,
} from '@affine/component';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  type ShortcutsInfo,
  useEdgelessShortcuts,
  useGeneralShortcuts,
  useMarkdownShortcuts,
  usePageShortcuts,
} from '../../../hooks/affine/use-shortcuts';
import { KeyboardIcon } from './icons';
import * as styles from './style.css';
// import {
//   StyledListItem,
//   StyledModalHeader,
//   StyledShortcutsModal,
//   StyledSubTitle,
//   StyledTitle,
// } from './style';
type ModalProps = {
  open: boolean;
  onClose: () => void;
};

const ShortcutsPanel = ({
  shortcutsInfo,
}: {
  shortcutsInfo: ShortcutsInfo;
}) => {
  return (
    <>
      <div className={styles.subtitle}>{shortcutsInfo.title}</div>

      {Object.entries(shortcutsInfo.shortcuts).map(([title, shortcuts]) => {
        return (
          <div className={styles.listItem} key={title}>
            <span>{title}</span>
            <div className={styles.keyContainer}>
              {shortcuts.map(key => {
                return (
                  <span className={styles.key} key={key}>
                    {key}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
};

export const ShortcutsModal = ({ open, onClose }: ModalProps) => {
  const t = useAFFiNEI18N();

  const markdownShortcutsInfo = useMarkdownShortcuts();
  const pageShortcutsInfo = usePageShortcuts();
  const edgelessShortcutsInfo = useEdgelessShortcuts();
  const generalShortcutsInfo = useGeneralShortcuts();

  return (
    <MuiSlide direction="left" in={open} mountOnEnter unmountOnExit>
      <div className={styles.shortcutsModal} data-testid="shortcuts-modal">
        <MuiClickAwayListener
          onClickAway={() => {
            onClose();
          }}
        >
          <div>
            <div
              className={styles.modalHeader}
              style={{ marginBottom: '-28px' }}
            >
              <div className={styles.title}>
                <KeyboardIcon />
                {t['Shortcuts']()}
              </div>

              <ModalCloseButton
                top={6}
                right={6}
                onClick={() => {
                  onClose();
                }}
              />
            </div>
            <ShortcutsPanel shortcutsInfo={generalShortcutsInfo} />
            <ShortcutsPanel shortcutsInfo={pageShortcutsInfo} />
            <ShortcutsPanel shortcutsInfo={edgelessShortcutsInfo} />
            <ShortcutsPanel shortcutsInfo={markdownShortcutsInfo} />
          </div>
        </MuiClickAwayListener>
      </div>
    </MuiSlide>
  );
};
