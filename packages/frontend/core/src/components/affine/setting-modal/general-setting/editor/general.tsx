import {
  Menu,
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  Switch,
} from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useAppSettingHelper } from '@affine/core/hooks/affine/use-app-setting-helper';
import { useI18n } from '@affine/i18n';
import {
  type AppSetting,
  type DocMode,
  fontStyleOptions,
} from '@toeverything/infra';
import { useCallback, useMemo, useState } from 'react';

import { menu, menuTrigger, settingWrapper } from './style.css';

const FontFamilySettings = () => {
  const t = useI18n();
  const { appSettings, updateSettings } = useAppSettingHelper();

  const radioItems = useMemo(() => {
    return fontStyleOptions.map(({ key, value }) => {
      const label =
        key === 'Mono'
          ? t[`com.affine.appearanceSettings.fontStyle.mono`]()
          : key === 'Sans'
            ? t['com.affine.appearanceSettings.fontStyle.sans']()
            : key === 'Serif'
              ? t['com.affine.appearanceSettings.fontStyle.serif']()
              : '';
      return {
        value: key,
        label,
        testId: 'system-font-style-trigger',
        style: { fontFamily: value },
      } satisfies RadioItem;
    });
  }, [t]);

  return (
    <RadioGroup
      items={radioItems}
      value={appSettings.fontStyle}
      width={250}
      className={settingWrapper}
      onChange={useCallback(
        (value: AppSetting['fontStyle']) => {
          updateSettings('fontStyle', value);
        },
        [updateSettings]
      )}
    />
  );
};
const NewDocDefaultModeSettings = () => {
  const t = useI18n();
  const [value, setValue] = useState<DocMode>('page');
  const radioItems = useMemo<RadioItem[]>(
    () => [
      {
        value: 'page',
        label: t['Page'](),
        testId: 'page-mode-trigger',
      },
      {
        value: 'edgeless',
        label: t['Edgeless'](),
        testId: 'edgeless-mode-trigger',
      },
    ],
    [t]
  );
  return (
    <RadioGroup
      items={radioItems}
      value={value}
      width={250}
      className={settingWrapper}
      onChange={setValue}
    />
  );
};

export const General = () => {
  const t = useI18n();
  return (
    <SettingWrapper title={t['com.affine.settings.editorSettings.general']()}>
      <SettingRow
        name={t['com.affine.settings.editorSettings.general.ai.title']()}
        desc={t['com.affine.settings.editorSettings.general.ai.description']()}
      >
        <Switch />
      </SettingRow>
      <SettingRow
        name={t['com.affine.appearanceSettings.font.title']()}
        desc={t['com.affine.appearanceSettings.font.description']()}
      >
        <FontFamilySettings />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.font-family.custom.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.font-family.custom.description'
        ]()}
      >
        <Switch />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.font-family.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.font-family.description'
        ]()}
      >
        <Menu items={<MenuItem>inter</MenuItem>}>
          <MenuTrigger className={menuTrigger} disabled>
            inter
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t['com.affine.settings.editorSettings.general.font-size.title']()}
        desc={t[
          'com.affine.settings.editorSettings.general.font-size.description'
        ]()}
      >
        <Menu
          contentOptions={{
            className: menu,
          }}
          items={<MenuItem>15</MenuItem>}
        >
          <MenuTrigger className={menuTrigger} disabled>
            15
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.default-new-doc.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.default-new-doc.description'
        ]()}
      >
        <NewDocDefaultModeSettings />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.default-code-block.language.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.default-code-block.language.description'
        ]()}
      >
        <Menu
          contentOptions={{
            className: menu,
          }}
          items={<MenuItem>Plain Text</MenuItem>}
        >
          <MenuTrigger className={menuTrigger} disabled>
            Plain Text
          </MenuTrigger>
        </Menu>
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.default-code-block.wrap.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.default-code-block.wrap.description'
        ]()}
      >
        <Switch />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.spell-check.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.spell-check.description'
        ]()}
      >
        <Switch />
      </SettingRow>
    </SettingWrapper>
  );
};
