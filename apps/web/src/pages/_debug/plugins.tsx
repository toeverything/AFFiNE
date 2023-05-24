import { AppContainer, MainContainer } from '@affine/component/workspace';
import { affinePlugins } from '@toeverything/plugin-infra/manager';
import type { ReactElement } from 'react';
import { useMemo } from 'react';

export default function PluginPage(): ReactElement {
  const plugins = useMemo(() => [...affinePlugins.values()], []);
  return (
    <AppContainer>
      <MainContainer>
        {plugins.map(({ definition }) => {
          return (
            <div key={definition.id}>
              {/* todo: support i18n */}
              {definition.name.fallback}
            </div>
          );
        })}
      </MainContainer>
    </AppContainer>
  );
}
