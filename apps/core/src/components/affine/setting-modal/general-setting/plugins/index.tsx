import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  registeredPluginAtom,
  settingItemsAtom,
} from '@toeverything/plugin-infra/atom';
import { useAtomValue } from 'jotai';
import type { FC, ReactNode } from 'react';
import { useRef } from 'react';

import { pluginItem } from './style.css';

const PluginSettingWrapper: FC<{
  id: string;
  title?: ReactNode;
}> = ({ title, id }) => {
  const Setting = useAtomValue(settingItemsAtom)[id];
  const disposeRef = useRef<(() => void) | null>(null);
  return (
    <div>
      {title ? <div className="title">{title}</div> : null}
      <div
        ref={ref => {
          if (ref && Setting) {
            setTimeout(() => {
              disposeRef.current = Setting(ref);
            });
          } else if (ref === null) {
            setTimeout(() => {
              disposeRef.current?.();
            });
          }
        }}
      />
    </div>
  );
};

export const Plugins = () => {
  const t = useAFFiNEI18N();
  const allowedPlugins = useAtomValue(registeredPluginAtom);
  return (
    <>
      <SettingHeader
        title={'Plugins'}
        subtitle={allowedPlugins.length === 0 && t['None yet']()}
        data-testid="plugins-title"
      />
      {allowedPlugins.map(plugin => (
        <div className={pluginItem} key={plugin}>
          <PluginSettingWrapper key={plugin} id={plugin} title={plugin} />
        </div>
      ))}
    </>
  );
};
