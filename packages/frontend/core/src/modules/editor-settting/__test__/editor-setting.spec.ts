import { Framework, GlobalState, MemoryMemento } from '@toeverything/infra';
import { expect, test } from 'vitest';

import { unflattenObject } from '../../../utils/unflatten-object';
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
  expect(editorSettingService.editorSetting.settings$.value).toMatchObject({
    fontFamily: 'Sans',
    'connector.stroke': '#000000',
  });

  editorSettingService.editorSetting.set('fontFamily', 'Serif');
  expect(editorSettingService.editorSetting.settings$.value).toMatchObject({
    fontFamily: 'Serif',
  });

  // nested object, should be serialized
  editorSettingService.editorSetting.set('connector.stroke', {
    dark: '#000000',
    light: '#ffffff',
  });
  expect(
    (
      editorSettingService.editorSetting
        .provider as GlobalStateEditorSettingProvider
    ).get('connector.stroke')
  ).toBe('{"dark":"#000000","light":"#ffffff"}');

  // invalid font family
  editorSettingService.editorSetting.provider.set(
    'fontFamily',
    JSON.stringify('abc')
  );

  // should fallback to default value
  expect(editorSettingService.editorSetting.settings$.value['fontFamily']).toBe(
    'Sans'
  );

  // expend demo
  const expended = unflattenObject(
    editorSettingService.editorSetting.settings$.value
  );
  expect(expended).toMatchObject({
    fontFamily: 'Sans',
    connector: {
      stroke: {
        dark: '#000000',
        light: '#ffffff',
      },
    },
  });
});
