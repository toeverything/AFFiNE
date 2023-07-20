import {
  SettingHeader,
  SettingWrapper,
} from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import {
  affinePluginsAtom,
  registeredPluginAtom,
} from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';

export const Plugins = () => {
  const t = useAFFiNEI18N();
  const plugins = useAtomValue(affinePluginsAtom);
  const allowedPlugins = useAtomValue(registeredPluginAtom);
  console.log('allowedPlugins', allowedPlugins);
  return (
    <>
      <SettingHeader
        title={'Plugins'}
        subtitle={allowedPlugins.length === 0 && t['None yet']()}
        data-testid="plugins-title"
      />
      {allowedPlugins.map(plugin => (
        <SettingWrapper key={plugin} title={plugin}></SettingWrapper>
      ))}
      {Object.values(plugins).map(({ definition, uiAdapter }) => {
        const Content = uiAdapter.debugContent;
        return <div key={definition.id}>{Content && <Content />}</div>;
      })}
    </>
  );
};
