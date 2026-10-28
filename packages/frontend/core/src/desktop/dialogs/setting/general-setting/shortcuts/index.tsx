import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';
import {
  type EdgelessToolShortcutId,
  getEdgelessToolShortcut,
  resetEdgelessToolShortcut,
  setEdgelessToolShortcut,
} from '@blocksuite/affine-shared/utils';
import { useState } from 'react';

import type { ShortcutsInfo } from '../../../../../components/hooks/affine/use-shortcuts';
import {
  useEdgelessShortcuts,
  useGeneralShortcuts,
  useMarkdownShortcuts,
  usePageShortcuts,
} from '../../../../../components/hooks/affine/use-shortcuts';
import {
  resetShortcut,
  shortcutKey,
  shortcutKeyConflict,
  shortcutKeyContainer,
  shortcutRecorder,
  shortcutRow,
} from './style.css';

const ShortcutRecorder = ({ id }: { id: EdgelessToolShortcutId }) => {
  const [recording, setRecording] = useState(false);
  const [conflict, setConflict] = useState(false);
  const shortcut = getEdgelessToolShortcut(id).toUpperCase();

  return (
    <div className={shortcutKeyContainer}>
      <button
        type="button"
        className={shortcutRecorder}
        aria-label={`Change ${id} shortcut`}
        aria-invalid={conflict}
        aria-pressed={recording}
        title={
          conflict
            ? 'Shortcut is already in use or reserved'
            : 'Click, then press a letter or number'
        }
        onBlur={() => {
          setRecording(false);
          setConflict(false);
        }}
        onClick={() => {
          setRecording(true);
          setConflict(false);
        }}
        onKeyDown={event => {
          if (!recording) return;
          if (event.key === 'Tab') return;
          event.preventDefault();
          event.stopPropagation();
          if (event.key === 'Escape') {
            setRecording(false);
            setConflict(false);
            return;
          }
          if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey)
            return;
          if (!/^[a-z0-9]$/i.test(event.key)) return;

          const conflictingId = setEdgelessToolShortcut(id, event.key);
          setConflict(Boolean(conflictingId));
          if (!conflictingId) setRecording(false);
        }}
      >
        <span
          className={`${shortcutKey} ${conflict ? shortcutKeyConflict : ''}`}
        >
          {recording ? '…' : shortcut}
        </span>
      </button>
      <button
        type="button"
        className={resetShortcut}
        aria-label={`Reset ${id} shortcut`}
        title="Reset shortcut"
        onClick={() => {
          const conflictingId = resetEdgelessToolShortcut(id);
          setConflict(Boolean(conflictingId));
        }}
      >
        ↺
      </button>
    </div>
  );
};

const ShortcutsPanel = ({
  shortcutsInfo,
}: {
  shortcutsInfo: ShortcutsInfo;
}) => {
  return (
    <SettingWrapper title={shortcutsInfo.title}>
      {Object.entries(shortcutsInfo.shortcuts).map(([title, shortcuts]) => {
        const editableId = shortcutsInfo.editableShortcuts?.[title];
        return (
          <div key={title} className={shortcutRow}>
            <span>{title}</span>
            {editableId ? (
              <ShortcutRecorder id={editableId} />
            ) : (
              <div className={shortcutKeyContainer}>
                {shortcuts.map(key => {
                  return (
                    <span className={shortcutKey} key={key}>
                      {key}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </SettingWrapper>
  );
};

export const Shortcuts = () => {
  const t = useI18n();

  const markdownShortcutsInfo = useMarkdownShortcuts();
  const pageShortcutsInfo = usePageShortcuts();
  const edgelessShortcutsInfo = useEdgelessShortcuts();
  const generalShortcutsInfo = useGeneralShortcuts();

  return (
    <>
      <SettingHeader
        title={t['com.affine.keyboardShortcuts.title']()}
        subtitle={t['com.affine.keyboardShortcuts.subtitle']()}
        data-testid="keyboard-shortcuts-title"
      />
      <ShortcutsPanel shortcutsInfo={generalShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={pageShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={edgelessShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={markdownShortcutsInfo} />
    </>
  );
};
