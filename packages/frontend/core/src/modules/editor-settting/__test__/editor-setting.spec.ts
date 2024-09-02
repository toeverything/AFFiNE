import { Framework, GlobalState, MemoryMemento } from '@toeverything/infra';
import { expect, test } from 'vitest';

import { EditorSetting } from '../entities/editor-setting';
import { GlobalStateEditorSettingProvider } from '../impls/global-state';
import { EditorSettingProvider } from '../provider/editor-setting-provider';
import { EditorSettingService } from '../services/editor-setting';

test('editor setting service', () => {
  const framework = new Framework();

  framework
    .service(EditorSettingService)
    .entity(EditorSetting, [EditorSettingProvider])
    .impl(EditorSettingProvider, GlobalStateEditorSettingProvider, [
      GlobalState,
    ])
    .impl(GlobalState, MemoryMemento);

  const provider = framework.provider();

  const editorSettingService = provider.get(EditorSettingService);

  // default value
  expect(editorSettingService.editorSetting.get('fontFamily')).toBe('Sans');

  // set plain object
  editorSettingService.editorSetting.set('fontFamily', 'Serif');
  expect(editorSettingService.editorSetting.get('fontFamily')).toBe('Serif');

  // set nested object
  editorSettingService.editorSetting.set('connector', {
    stroke: {
      dark: '#000000',
      light: '#ffffff',
    },
  });
  expect(editorSettingService.editorSetting.get('connector').stroke).toEqual({
    dark: '#000000',
    light: '#ffffff',
  });

  // invalid font family
  editorSettingService.editorSetting.provider.set(
    'fontFamily',
    JSON.stringify('abc')
  );

  // fallback to default value
  expect(editorSettingService.editorSetting.get('fontFamily')).toBe('Sans');
});
