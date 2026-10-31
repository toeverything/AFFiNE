import { SettingPanels } from '@affine/core/desktop/dialogs/setting';
import { useI18n } from '@affine/i18n';
import { useState } from 'react';

import { SettingGroup } from '../group';
import { RowLayout } from '../row.layout';
import { SwipeDialog } from '../swipe-dialog';

/**
 * 999.14: the full desktop settings menu (general, workspace -- preference
 * incl. templates, properties, members, storage, ... -- and account) on
 * mobile. Reuses the desktop sections and panels via `SettingPanels` in its
 * mobile layout (section list, then a full-screen panel with a back bar).
 */
export const FullSettingsGroup = () => {
  const t = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <SettingGroup title={t['com.affine.settingSidebar.settings.workspace']()}>
      <RowLayout
        label={t['com.affine.settingSidebar.title']()}
        onClick={() => setOpen(true)}
      />
      {open ? (
        <SwipeDialog
          title={t['com.affine.settingSidebar.title']()}
          open
          onOpenChange={setOpen}
        >
          <SettingPanels
            layout="mobile"
            onCloseSetting={() => setOpen(false)}
          />
        </SwipeDialog>
      ) : null}
    </SettingGroup>
  );
};
