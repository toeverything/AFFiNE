import {
  Loading,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  RowInput,
  Scrollable,
  Switch,
  useConfirmModal,
} from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
import { ServerConfigService } from '@affine/core/modules/cloud';
import {
  EditorSettingService,
  type FontFamily,
  fontStyleOptions,
} from '@affine/core/modules/editor-settting';
import {
  type FontData,
  SystemFontFamilyService,
} from '@affine/core/modules/system-font-family';
import { useI18n } from '@affine/i18n';
import type { DocMode } from '@blocksuite/affine/blocks';
import { DoneIcon, SearchIcon } from '@blocksuite/icons/rc';
import {
  FeatureFlagService,
  useLiveData,
  useServices,
} from '@toeverything/infra';
import clsx from 'clsx';
import {
  forwardRef,
  type HTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import { DropdownMenu } from './menu';
import * as styles from './style.css';

const getLabel = (fontKey: FontFamily, t: ReturnType<typeof useI18n>) => {
  switch (fontKey) {
    case 'Sans':
      return t['com.affine.appearanceSettings.fontStyle.sans']();
    case 'Serif':
      return t['com.affine.appearanceSettings.fontStyle.serif']();
    case 'Mono':
      return t[`com.affine.appearanceSettings.fontStyle.mono`]();
    case 'Custom':
      return t['com.affine.settings.editorSettings.edgeless.custom']();
    default:
      return '';
  }
};

export const getBaseFontStyleOptions = (
  t: ReturnType<typeof useI18n>
): Array<Omit<RadioItem, 'value'> & { value: FontFamily }> => {
  return fontStyleOptions
    .map(({ key, value }) => {
      if (key === 'Custom') {
        return null;
      }
      const label = getLabel(key, t);
      return {
        value: key,
        label,
        testId: 'system-font-style-trigger',
        style: {
          fontFamily: value,
        },
      } satisfies RadioItem;
    })
    .filter(item => item !== null);
};

const FontFamilySettings = () => {
  const t = useI18n();
  const { editorSettingService } = useServices({ EditorSettingService });
  const settings = useLiveData(editorSettingService.editorSetting.settings$);

  const radioItems = useMemo(() => {
    const items = getBaseFontStyleOptions(t);
    if (!BUILD_CONFIG.isElectron) return items;

    // resolve custom fonts
    const customOption = fontStyleOptions.find(opt => opt.key === 'Custom');
    if (customOption) {
      const fontFamily = settings.customFontFamily
        ? `${settings.customFontFamily}, ${customOption.value}`
        : customOption.value;
      items.push({
        value: customOption.key,
        label: getLabel(customOption.key, t),
        testId: 'system-font-style-trigger',
        style: { fontFamily },
      });
    }

    return items;
  }, [settings.customFontFamily, t]);

  const handleFontFamilyChange = useCallback(
    (value: FontFamily) => {
      editorSettingService.editorSetting.set('fontFamily', value);
    },
    [editorSettingService.editorSetting]
  );

  return (
    <SettingRow
      name={t['com.affine.appearanceSettings.font.title']()}
      desc={t['com.affine.appearanceSettings.font.description']()}
    >
      <RadioGroup
        items={radioItems}
        value={settings.fontFamily}
        width={250}
        className={styles.settingWrapper}
        onChange={handleFontFamilyChange}
      />
    </SettingRow>
  );
};

const getFontFamily = (font: string) => `${font}, ${fontStyleOptions[0].value}`;

const Scroller = forwardRef<
  HTMLDivElement,
  PropsWithChildren<HTMLAttributes<HTMLDivElement>>
>(({ children, ...props }, ref) => {
  return (
    <Scrollable.Root>
      <Scrollable.Viewport {...props} ref={ref}>
        {children}
      </Scrollable.Viewport>
      <Scrollable.Scrollbar />
    </Scrollable.Root>
  );
});

Scroller.displayName = 'Scroller';

const FontMenuItems = ({ onSelect }: { onSelect: (font: string) => void }) => {
  const { systemFontFamilyService, editorSettingService } = useServices({
    SystemFontFamilyService,
    EditorSettingService,
  });
  const systemFontFamily = systemFontFamilyService.systemFontFamily;

  const currentCustomFont = useLiveData(
    editorSettingService.editorSetting.settings$
  ).customFontFamily;
  useEffect(() => {
    if (systemFontFamily.fontList$.value.length === 0) {
      systemFontFamily.loadFontList();
    }
    systemFontFamily.clearSearch();
  }, [systemFontFamily]);

  const isLoading = useLiveData(systemFontFamily.isLoading$);
  const result = useLiveData(systemFontFamily.result$);
  const searchText = useLiveData(systemFontFamily.searchText$);

  const onInputChange = useCallback(
    (value: string) => {
      systemFontFamily.search(value);
    },
    [systemFontFamily]
  );
  const onInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation(); // avoid typeahead search built-in in the menu
    },
    []
  );

  return (
    <div>
      <div className={styles.InputContainer}>
        <SearchIcon className={styles.searchIcon} />
        <RowInput
          value={searchText ?? ''}
          onChange={onInputChange}
          onKeyDown={onInputKeyDown}
          autoFocus
          className={styles.searchInput}
          placeholder="Fonts"
        />
      </div>
      <MenuSeparator />
      {isLoading ? (
        <Loading />
      ) : (
        <Scrollable.Root style={{ height: '330px' }}>
          <Scrollable.Viewport>
            {result.length > 0 ? (
              <Virtuoso
                totalCount={result.length}
                components={{
                  Scroller: Scroller,
                }}
                itemContent={index => (
                  <FontMenuItem
                    key={result[index].fullName}
                    font={result[index]}
                    onSelect={onSelect}
                    currentFont={currentCustomFont}
                  />
                )}
              />
            ) : (
              <div className={styles.notFound}>No results found.</div>
            )}
          </Scrollable.Viewport>
          <Scrollable.Scrollbar />
        </Scrollable.Root>
      )}
    </div>
  );
};

const FontMenuItem = ({
  font,
  currentFont,
  onSelect,
}: {
  font: FontData;
  currentFont: string;
  onSelect: (font: string) => void;
}) => {
  const handleFontSelect = useCallback(
    () => onSelect(font.family),
    [font, onSelect]
  );
  const fontFamily = getFontFamily(font.family);
  const selected = currentFont === font.fullName;

  return (
    <div style={{ marginTop: '4px' }}>
      <MenuItem key={font.fullName} onSelect={handleFontSelect}>
        <div className={styles.fontItemContainer}>
          <div className={styles.fontItem}>
            <div className={styles.fontLabel} style={{ fontFamily }}>
              {font.fullName}
            </div>
            <div className={clsx(styles.fontLabel, 'secondary')}>
              {font.fullName}
            </div>
          </div>

          {selected && (
            <DoneIcon fontSize={20} className={styles.selectedIcon} />
          )}
        </div>
      </MenuItem>
    </div>
  );
};

const CustomFontFamilySettings = () => {
  const t = useI18n();
  const { editorSettingService } = useServices({ EditorSettingService });
  const settings = useLiveData(editorSettingService.editorSetting.settings$);

  const fontFamily = getFontFamily(settings.customFontFamily);

  const onCustomFontFamilyChange = useCallback(
    (fontFamily: string) => {
      editorSettingService.editorSetting.set('customFontFamily', fontFamily);
    },
    [editorSettingService.editorSetting]
  );
  if (settings.fontFamily !== 'Custom' || !BUILD_CONFIG.isElectron) {
    return null;
  }
  return (
    <SettingRow
      name={t[
        'com.affine.settings.editorSettings.general.font-family.custom.title'
      ]()}
      desc={t[
        'com.affine.settings.editorSettings.general.font-family.custom.description'
      ]()}
    >
      <Menu
        items={<FontMenuItems onSelect={onCustomFontFamilyChange} />}
        contentOptions={{
          align: 'end',
          style: { width: '250px', height: '380px' },
        }}
      >
        <MenuTrigger className={styles.menuTrigger} style={{ fontFamily }}>
          {settings.customFontFamily || 'Select a font'}
        </MenuTrigger>
      </Menu>
    </SettingRow>
  );
};
const NewDocDefaultModeSettings = () => {
  const t = useI18n();
  const { editorSettingService } = useServices({ EditorSettingService });
  const settings = useLiveData(editorSettingService.editorSetting.settings$);
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
  const updateNewDocDefaultMode = useCallback(
    (value: DocMode) => {
      editorSettingService.editorSetting.set('newDocDefaultMode', value);
    },
    [editorSettingService.editorSetting]
  );
  return (
    <SettingRow
      name={t[
        'com.affine.settings.editorSettings.general.default-new-doc.title'
      ]()}
      desc={t[
        'com.affine.settings.editorSettings.general.default-new-doc.description'
      ]()}
    >
      <RadioGroup
        items={radioItems}
        value={settings.newDocDefaultMode}
        width={250}
        className={styles.settingWrapper}
        onChange={updateNewDocDefaultMode}
      />
    </SettingRow>
  );
};

export const DeFaultCodeBlockSettings = () => {
  const t = useI18n();
  return (
    <>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.general.default-code-block.language.title'
        ]()}
        desc={t[
          'com.affine.settings.editorSettings.general.default-code-block.language.description'
        ]()}
      >
        <DropdownMenu
          items={<MenuItem>Plain Text</MenuItem>}
          trigger={
            <MenuTrigger className={styles.menuTrigger} disabled>
              Plain Text
            </MenuTrigger>
          }
        />
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
    </>
  );
};

export const SpellCheckSettings = () => {
  const t = useI18n();
  return (
    <SettingRow
      name={t['com.affine.settings.editorSettings.general.spell-check.title']()}
      desc={t[
        'com.affine.settings.editorSettings.general.spell-check.description'
      ]()}
    >
      <Switch />
    </SettingRow>
  );
};

const AISettings = () => {
  const t = useI18n();
  const { openConfirmModal } = useConfirmModal();
  const { featureFlagService, serverConfigService } = useServices({
    FeatureFlagService,
    ServerConfigService,
  });
  const serverFeatures = useLiveData(
    serverConfigService.serverConfig.features$
  );
  const enableAI = useLiveData(featureFlagService.flags.enable_ai.$);

  const onAIChange = useCallback(
    (checked: boolean) => {
      featureFlagService.flags.enable_ai.set(checked); // this will trigger page reload, see `FeatureFlagService`
    },
    [featureFlagService]
  );
  const onToggleAI = useCallback(
    (checked: boolean) => {
      openConfirmModal({
        title: checked
          ? t['com.affine.settings.editorSettings.general.ai.enable.title']()
          : t['com.affine.settings.editorSettings.general.ai.disable.title'](),
        description: checked
          ? t[
              'com.affine.settings.editorSettings.general.ai.enable.description'
            ]()
          : t[
              'com.affine.settings.editorSettings.general.ai.disable.description'
            ](),
        confirmText: checked
          ? t['com.affine.settings.editorSettings.general.ai.enable.confirm']()
          : t[
              'com.affine.settings.editorSettings.general.ai.disable.confirm'
            ](),
        cancelText: t['Cancel'](),
        onConfirm: () => onAIChange(checked),
        confirmButtonOptions: {
          variant: checked ? 'primary' : 'error',
        },
      });
    },
    [openConfirmModal, t, onAIChange]
  );

  if (!serverFeatures?.copilot) {
    return null;
  }

  return (
    <SettingRow
      name={t['com.affine.settings.editorSettings.general.ai.title']()}
      desc={t['com.affine.settings.editorSettings.general.ai.description']()}
    >
      <Switch checked={enableAI} onChange={onToggleAI} />
    </SettingRow>
  );
};

export const General = () => {
  const t = useI18n();

  return (
    <SettingWrapper title={t['com.affine.settings.editorSettings.general']()}>
      <AISettings />
      <FontFamilySettings />
      <CustomFontFamilySettings />
      <NewDocDefaultModeSettings />
      {/* // TODO(@akumatus): implement these settings
      <DeFaultCodeBlockSettings />
      <SpellCheckSettings /> */}
    </SettingWrapper>
  );
};
