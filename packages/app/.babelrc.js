const plugins = [];

if (process.env.NODE_ENV === 'development' || process.env.COVERAGE === 'true') {
  console.log(
    'Detected development environment. Instrumenting code for coverage.'
  );
  plugins.push('istanbul');
}

plugins.push([
  '@emotion',
  {
    // See https://emotion.sh/docs/@emotion/babel-plugin
    importMap: {
      '@/styles': {
        styled: {
          canonicalImport: ['@emotion/styled', 'default'],
          styledBaseImport: ['@/styles', 'styled'],
        },
      },
    },
  },
]);

module.exports = {
  presets: ['next/babel'],
  plugins,
};
