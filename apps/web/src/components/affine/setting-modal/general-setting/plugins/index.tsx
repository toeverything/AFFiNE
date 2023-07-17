import { SettingHeader } from '@affine/component/setting-components';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';

export const Plugins = () => {
  const t = useAFFiNEI18N();
  const plugins = useAtomValue(affinePluginsAtom);
  return (
    <>
      <SettingHeader
        title={'Plugins'}
        subtitle={t['None yet']()}
        data-testid="plugins-title"
      />
      {Object.values(plugins).map(({ definition, uiAdapter }) => {
        const Content = uiAdapter.debugContent;
        return <div key={definition.id}>{Content && <Content />}</div>;
      })}
    </>
  );
};
