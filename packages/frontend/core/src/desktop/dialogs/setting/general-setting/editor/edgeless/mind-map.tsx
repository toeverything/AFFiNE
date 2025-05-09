import {
  MenuItem,
  MenuTrigger,
  RadioGroup,
  type RadioItem,
} from '@affine/component';
import { SettingRow } from '@affine/component/setting-components';
import { EditorSettingService } from '@affine/core/modules/editor-setting';
import { useI18n } from '@affine/i18n';
import { getSurfaceBlock } from '@blocksuite/affine/blocks/surface';
import { LayoutType, MindmapStyle } from '@blocksuite/affine/model';
import type { Store } from '@blocksuite/affine/store';
import { useFramework, useLiveData } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { DropdownMenu } from '../menu';
import { menuTrigger, settingWrapper } from '../style.css';
import { EdgelessSnapshot } from './snapshot';

const MINDMAP_STYLES = [
  {
    value: MindmapStyle.ONE,
    name: 'Style 1',
  },
  {
    value: MindmapStyle.TWO,
    name: 'Style 2',
  },
  {
    value: MindmapStyle.THREE,
    name: 'Style 3',
  },
  {
    value: MindmapStyle.FOUR,
    name: 'Style 4',
  },
];

export const MindMapSettings = () => {
  const t = useI18n();
  const framework = useFramework();
  const { editorSetting } = framework.get(EditorSettingService);
  const settings = useLiveData(editorSetting.settings$);

  const { layoutType } = settings.mindmap;
  const setLayoutType = useCallback(
    (value: LayoutType) => {
      editorSetting.set('mindmap', {
        layoutType: value,
      });
    },
    [editorSetting]
  );
  const layoutTypeItems = useMemo<RadioItem[]>(
    () => [
      {
        value: LayoutType.LEFT as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.left'
          ](),
      },
      {
        value: LayoutType.BALANCE as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.radial'
          ](),
      },
      {
        value: LayoutType.RIGHT as any,
        label:
          t[
            'com.affine.settings.editorSettings.edgeless.mind-map.layout.right'
          ](),
      },
    ],
    [t]
  );

  const styleItems = useMemo(() => {
    const { style } = settings.mindmap;
    return MINDMAP_STYLES.map(({ name, value }) => {
      const handler = () => {
        editorSetting.set('mindmap', { style: value });
      };
      const isSelected = style === value;
      return (
        <MenuItem key={name} onSelect={handler} selected={isSelected}>
          {name}
        </MenuItem>
      );
    });
  }, [editorSetting, settings]);

  const getElements = useCallback((doc: Store) => {
    const surface = getSurfaceBlock(doc);
    return surface?.getElementsByType('mindmap') || [];
  }, []);

  return (
    <>
      <EdgelessSnapshot
        title={t['com.affine.settings.editorSettings.edgeless.mind-map']()}
        docName="mindmap"
        keyName={'mindmap' as any}
        getElements={getElements}
        height={320}
      />
      <SettingRow
        name={t['com.affine.settings.editorSettings.edgeless.style']()}
        desc={''}
      >
        <DropdownMenu
          items={styleItems}
          trigger={
            <MenuTrigger className={menuTrigger}>
              {`Style ${settings.mindmap.style}`}
            </MenuTrigger>
          }
        />
      </SettingRow>
      <SettingRow
        name={t[
          'com.affine.settings.editorSettings.edgeless.mind-map.layout'
        ]()}
        desc={''}
      >
        <RadioGroup
          items={layoutTypeItems}
          value={layoutType}
          width={250}
          className={settingWrapper}
          onChange={setLayoutType}
        />
      </SettingRow>
    </>
  );
};
