import type { PluginContext } from '@affine/sdk/entry';
import ElementPlus from 'element-plus';
import { createApp } from 'vue';

import App from './app.vue';

export const entry = (context: PluginContext) => {
  context.register('headerItem', div => {
    const app = createApp(App);
    app.use(ElementPlus);
    app.mount(div, false, false);
    return () => {
      app.unmount();
    };
  });

  return () => {};
};
