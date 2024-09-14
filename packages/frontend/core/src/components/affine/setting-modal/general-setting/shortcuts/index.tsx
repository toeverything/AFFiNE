import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

import type { ShortcutsInfo } from '../../../../../components/hooks/affine/use-shortcuts';
import {
  useEdgelessShortcuts,
  useGeneralShortcuts,
  useMarkdownShortcuts,
  usePageShortcuts,
} from '../../../../../components/hooks/affine/use-shortcuts';
import { shortcutKey, shortcutKeyContainer, shortcutRow } from './style.css';

const ShortcutsPanel = ({
  shortcutsInfo,
}: {
  shortcutsInfo: ShortcutsInfo;
}) => {
  return (
    <SettingWrapper title={shortcutsInfo.title}>
      {Object.entries(shortcutsInfo.shortcuts).map(([title, shortcuts]) => {
        return (
          <div key={title} className={shortcutRow}>
            <span>{title}</span>
            <div className={shortcutKeyContainer}>
              {shortcuts.map(key => {
                return (
                  <span className={shortcutKey} key={key}>
                    {key}
                  </span>
                );
              })}
            </div>
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
