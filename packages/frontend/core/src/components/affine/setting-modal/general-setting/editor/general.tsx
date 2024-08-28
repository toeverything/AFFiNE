import {
  Loading,
  Menu,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
  Scrollable,
  Switch,
} from '@affine/component';
import {
  SettingRow,
  SettingWrapper,
} from '@affine/component/setting-components';
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
import { DoneIcon, SearchIcon } from '@blocksuite/icons/rc';
import { type DocMode, useLiveData, useServices } from '@toeverything/infra';
import clsx from 'clsx';
import {
  type ChangeEvent,
  forwardRef,
  type HTMLAttributes,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
} from 'react';
import { Virtuoso } from 'react-virtuoso';

import * as styles from './style.css';

const FontFamilySettings = () => {
  const t = useI18n();
  const { editorSettingService } = useServices({ EditorSettingService });
  const settings = useLiveData(editorSettingService.editorSetting.settings$);

  const getLabel = useCallback(
    (fontKey: FontFamily) => {
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
    },
    [t]
  );

  const radioItems = useMemo(() => {
    return fontStyleOptions
      .map(({ key, value }) => {
        if (key === 'Custom' && !environment.isDesktop) {
          return null;
        }
        const label = getLabel(key);
        let fontFamily = value;
        if (key === 'Custom' && settings.customFontFamily) {
          fontFamily = `${settings.customFontFamily}, ${value}`;
        }
        return {
          value: key,
          label,
          testId: 'system-font-style-trigger',
          style: {
            fontFamily,
          },
        } satisfies RadioItem;
      })
      .filter(item => item !== null);
  }, [getLabel, settings.customFontFamily]);

  const handleFontFamilyChange = useCallback(
    (value: FontFamily) => {
      editorSettingService.editorSetting.set('fontFamily', value);
    },
    [editorSettingService.editorSetting]
  );

  return (
    <RadioGroup
      items={radioItems}
      value={settings.fontFamily}
      width={250}
      className={styles.settingWrapper}
      onChange={handleFontFamilyChange}
    />
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
    (e: ChangeEvent<HTMLInputElement>) => {
      systemFontFamily.search(e.target.value);
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
        <input
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
        <Scrollable.Root style={{ height: '200px' }}>
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
              <div>No results found.</div>
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
    () => onSelect(font.fullName),
    [font, onSelect]
  );
  const fontFamily = getFontFamily(font.family);
  const selected = currentFont === font.fullName;

  return (
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

        {selected && <DoneIcon fontSize={20} className={styles.selectedIcon} />}
      </div>
    </MenuItem>
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
  if (settings.fontFamily !== 'Custom' || !environment.isDesktop) {
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
          style: { width: '250px' },
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
    <RadioGroup
      items={radioItems}
      value={settings.newDocDefaultMode}
      width={250}
      className={styles.settingWrapper}
      onChange={updateNewDocDefaultMode}
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
      <CustomFontFamilySettings />
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
            className: styles.menu,
          }}
          items={<MenuItem>Plain Text</MenuItem>}
        >
          <MenuTrigger className={styles.menuTrigger} disabled>
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
