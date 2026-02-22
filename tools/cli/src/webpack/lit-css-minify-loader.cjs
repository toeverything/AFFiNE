const { minifyHTMLLiterals } = require('minify-html-literals');

/**
 * Minify CSS in tagged template literals (e.g. lit `css```) while leaving
 * HTML templates untouched to avoid parser regressions on dynamic templates.
 *
 * @type {import('webpack').LoaderDefinitionFunction}
 */
module.exports = function litCssMinifyLoader(source, sourceMap) {
  if (typeof source !== 'string' || !source.includes('`')) {
    return source;
  }

  try {
    const result = minifyHTMLLiterals(source, {
      fileName: this.resourcePath,
      shouldMinify: () => false,
      shouldMinifyCSS: template =>
        !!template.tag && template.tag.toLowerCase().includes('css'),
    });

    if (!result) {
      return source;
    }

    this.callback(null, result.code, result.map ?? sourceMap);
    return;
  } catch {
    return source;
  }
};
