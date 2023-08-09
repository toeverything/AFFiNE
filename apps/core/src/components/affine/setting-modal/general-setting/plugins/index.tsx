import { Switch } from '@affine/component';
import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import type { CallbackMap } from '@affine/sdk/entry';
import {
  addCleanup,
  enabledPluginAtom,
  pluginPackageJson,
  pluginSettingAtom,
} from '@toeverything/infra/__internal__/plugin';
import { loadedPluginNameAtom } from '@toeverything/infra/atom';
import type { packageJsonOutputSchema } from '@toeverything/infra/type';
import { useAtom, useAtomValue } from 'jotai/react';
import { startTransition, useCallback, useMemo } from 'react';
import type { z } from 'zod';

import { pluginItemStyle } from './style.css';

type PluginItemProps = {
  json: z.infer<typeof packageJsonOutputSchema>;
};

type PluginSettingDetailProps = {
  pluginName: string;
  create: CallbackMap['setting'];
};

const PluginSettingDetail = ({
  pluginName,
  create,
}: PluginSettingDetailProps) => {
  return (
    <div
      ref={useCallback(
        (ref: HTMLDivElement | null) => {
          if (ref) {
            const cleanup = create(ref);
            addCleanup(pluginName, cleanup);
          }
        },
        [pluginName, create]
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
              startTransition(() => {
                setEnabledPlugins(plugins => {
                  if (checked) {
                    return [...plugins, json.name];
                  } else {
                    return plugins.filter(plugin => plugin !== json.name);
                  }
                });
              });
            },
            [json.name, setEnabledPlugins]
          )}
        />
      </div>
      <div>{json.description}</div>
      {create && <PluginSettingDetail pluginName={json.name} create={create} />}
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
