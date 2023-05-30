import { AppContainer, MainContainer } from '@affine/component/workspace';
import { config } from '@affine/env';
import { affinePluginsAtom } from '@toeverything/plugin-infra/manager';
import { useAtomValue } from 'jotai';
import type { ReactElement } from 'react';

export default function PluginPage(): ReactElement {
  const plugins = useAtomValue(affinePluginsAtom);
  if (!config.enablePlugin) {
    return <></>;
  }
  return (
    <AppContainer>
      <MainContainer>
        {Object.values(plugins).map(({ definition, uiAdapter }) => {
          const Content = uiAdapter.debugContent;
          return (
            <div key={definition.id}>
              {/* todo: support i18n */}
              {definition.name.fallback}
              {Content && <Content />}
            </div>
          );
        })}
      </MainContainer>
    </AppContainer>
  );
}
