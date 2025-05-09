import { SettingWrapper } from '@affine/component/setting-components';
import { useI18n } from '@affine/i18n';

import { ConnectorSettings } from './connector';
import { FrameSettings } from './frame';
import { GeneralEdgelessSetting } from './general';
import { MindMapSettings } from './mind-map';
import { NoteSettings } from './note';
import { PenSettings } from './pen';
import { ShapeSettings } from './shape';
import { TextSettings } from './text';

export const Edgeless = () => {
  const t = useI18n();
  return (
    <SettingWrapper title={t['com.affine.settings.editorSettings.edgeless']()}>
      <GeneralEdgelessSetting />
      <NoteSettings />
      <TextSettings />
      <ShapeSettings />
      <FrameSettings />
      <ConnectorSettings />
      <PenSettings />
      <MindMapSettings />
    </SettingWrapper>
  );
};
