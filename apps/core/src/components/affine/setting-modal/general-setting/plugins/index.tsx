import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { CallbackMap } from '@affine/sdk/entry';
import { assertExists } from '@blocksuite/global/utils';
import {
  enabledPluginAtom,
  pluginPackageJson,
  pluginSettingAtom,
} from '@toeverything/infra/__internal__/plugin';
import { loadedPluginNameAtom } from '@toeverything/infra/atom';
import type { packageJsonOutputSchema } from '@toeverything/infra/type';
import { useAtom, useAtomValue } from 'jotai/react';
import { useCallback, useMemo, useRef } from 'react';
import type { z } from 'zod';

import { pluginItemStyle } from './style.css';

type PluginItemProps = {
  json: z.infer<typeof packageJsonOutputSchema>;
};

type PluginSettingDetailProps = {
  create: CallbackMap['setting'];
};

const PluginSettingDetail = ({ create }: PluginSettingDetailProps) => {
  const disposeRef = useRef<(() => void) | null>(null);
  return (
    <div
      ref={useCallback(
        (ref: HTMLDivElement | null) => {
          if (ref) {
            disposeRef.current = create(ref);
          } else {
            assertExists(disposeRef.current);
            const dispose = disposeRef.current;
            setTimeout(() => {
              dispose();
              disposeRef.current = null;
            });
          }
        },
        [create]
      )}
    />
  );
};

const PluginItem = ({ json }: PluginItemProps) => {
  const [plugins, setEnabledPlugins] = useAtom(enabledPluginAtom);
  const checked = useMemo(
    () => plugins.includes(json.name),
    [json.name, plugins]
  );
  const create = useAtomValue(pluginSettingAtom)[json.name];
  return (
    <div className={pluginItemStyle} key={json.name}>
      <div>
        {json.name}
        <Switch
          checked={checked}
          onChange={useCallback(
            (checked: boolean) => {
              setEnabledPlugins(plugins => {
                if (checked) {
                  return [...plugins, json.name];
                } else {
                  return plugins.filter(plugin => plugin !== json.name);
                }
              });
            },
            [json.name, setEnabledPlugins]
          )}
        />
      </div>
      <div>{json.description}</div>
      {create && <PluginSettingDetail create={create} />}
    </div>
  );
};

export const Plugins = () => {
  const t = useAFFiNEI18N();
  const loadedPlugins = useAtomValue(loadedPluginNameAtom);
  return (
    <>
      <SettingHeader
        title={'Plugins'}
        subtitle={loadedPlugins.length === 0 && t['None yet']()}
        data-testid="plugins-title"
      />
      {useAtomValue(pluginPackageJson).map(json => (
        <PluginItem json={json} key={json.name} />
      ))}
    </>
  );
};
