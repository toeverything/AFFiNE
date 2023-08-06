import type { PluginContext } from '@affine/sdk/entry';
import { createApp } from 'vue';

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import App from './app.vue';

export const entry = (context: PluginContext) => {
  context.register('headerItem', div => {
    const app = createApp(App);
    app.mount(div, false, false);
    return () => {
      app.unmount();
    };
  });

  return () => {};
};
