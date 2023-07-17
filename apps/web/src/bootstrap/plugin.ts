import { DebugLogger } from '@affine/debug';

const logger = new DebugLogger('plugin');

const base = new URL(location.origin);

const builtInPlugins: string[] = ['hello-world'];

const importMap = `<script type='importmap'>

</script>`;

document.head.insertAdjacentHTML('beforeend', importMap);

builtInPlugins.forEach(plugin => {
  const url = new URL(`plugins/${plugin}/package.json`, base);
  fetch(url)
    .then(res => res.json())
    .then(async packageJson => {
      const entry = new URL(packageJson.entry.core, url);
      logger.info('loading', entry.toString());
      const m = await import(/* webpackIgnore: true */ entry.toString());
      const defaultExport = m.default;
      if (typeof defaultExport === 'function') {
        defaultExport(
          new Proxy(
            {},
            {
              get() {
                throw new Error('not implemented');
              },
            }
          )
        );
      }
    })
    .catch(console.error);
});
