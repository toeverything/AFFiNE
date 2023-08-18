import { SettingHeader } from '@affine/component/setting-components';
import { SettingWrapper } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';

import {
  type ShortcutsInfo,
  useEdgelessShortcuts,
  useGeneralShortcuts,
  useMarkdownShortcuts,
  usePageShortcuts,
} from '../../../../../hooks/affine/use-shortcuts';
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
  const t = useAFFiNEI18N();

  const markdownShortcutsInfo = useMarkdownShortcuts();
  const pageShortcutsInfo = usePageShortcuts();
  const edgelessShortcutsInfo = useEdgelessShortcuts();
  const generalShortcutsInfo = useGeneralShortcuts();

  return (
    <>
      <SettingHeader
        title={t['Keyboard Shortcuts']()}
        subtitle={t['Check Keyboard Shortcuts quickly']()}
        data-testid="keyboard-shortcuts-title"
      />
      <ShortcutsPanel shortcutsInfo={generalShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={pageShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={edgelessShortcutsInfo} />
      <ShortcutsPanel shortcutsInfo={markdownShortcutsInfo} />
    </>
  );
};
