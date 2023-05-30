import type { PluginUIAdapter } from '@toeverything/plugin-infra/type';

export const DebugContent: PluginUIAdapter['debugContent'] = () => {
  return <div>Debug Page</div>;
};
