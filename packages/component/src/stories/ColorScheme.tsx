import { createColorPaletteBlock } from '@rich-data/color-palette-plugin';
import { createJsonPlugins } from '@rich-data/json-plugin';
import { createViewerHook } from '@rich-data/viewer';

import { nextLightColorScheme } from '../styles/color-scheme';

const { Provider, Viewer } = createViewerHook({
  plugins: [createColorPaletteBlock(), ...createJsonPlugins()],
});

export const ColorScheme = () => {
  return (
    <div
      style={{
        height: '100vh',
        overflow: 'auto',
      }}
    >
      <div> Light Mode </div>
      <Provider>
        <Viewer value={nextLightColorScheme} />
      </Provider>
      <div> Dark Mode </div>
      <Provider>
        <Viewer value={nextLightColorScheme} />
      </Provider>
    </div>
  );
};
