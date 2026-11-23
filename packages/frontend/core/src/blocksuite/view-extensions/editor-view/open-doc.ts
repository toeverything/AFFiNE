import { EditorSettingSchema } from '@affine/core/modules/editor-setting';
import { I18n } from '@affine/i18n';
import {
  type OpenDocConfig,
  type OpenDocConfigItem,
  OpenDocExtension,
} from '@blocksuite/affine/shared/services';
import {
  CenterPeekIcon,
  ExpandFullIcon,
  OpenInNewIcon,
  SplitViewIcon,
} from '@blocksuite/icons/lit';

type OpenDocAction = OpenDocConfigItem & {
  enabled: boolean;
  shortcut?: string;
};

export const openDocActions: Array<OpenDocAction> = [
  {
    type: 'open-in-active-view',
    label: I18n['com.affine.peek-view-controls.open-doc'](),
    icon: ExpandFullIcon(),
    enabled: true,
  },
  {
    type: 'open-in-new-view',
    label: I18n['com.affine.peek-view-controls.open-doc-in-split-view'](),
    icon: SplitViewIcon(),
    shortcut: '⌘ + ⌥ + click',
    enabled: BUILD_CONFIG.isElectron,
  },
  {
    type: 'open-in-new-tab',
    label: I18n['com.affine.peek-view-controls.open-doc-in-new-tab'](),
    icon: OpenInNewIcon(),
    shortcut: '⌘ + click',
    enabled: true,
  },
  {
    type: 'open-in-center-peek',
    label: I18n['com.affine.peek-view-controls.open-doc-in-center-peek'](),
    icon: CenterPeekIcon(),
    shortcut: '⇧ + click',
    enabled: true,
  },
].filter(
  (a): a is OpenDocAction =>
    a.enabled && EditorSettingSchema.shape.openDocMode.safeParse(a.type).success
);

export function patchOpenDocExtension() {
  const openDocConfig: OpenDocConfig = {
    items: openDocActions.map<OpenDocConfigItem>(({ type, label, icon }) => ({
      type,
      label,
      icon,
    })),
  };
  return OpenDocExtension(openDocConfig);
}
