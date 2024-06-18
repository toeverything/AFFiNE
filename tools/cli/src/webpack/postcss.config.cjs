const { join } = require('node:path');

const cssnano = require('cssnano');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');

const { getCwdFromDistribution } = require('../config/cwd.cjs');

const projectCwd = getCwdFromDistribution(process.env.DISTRIBUTION);

const twConfig = (function () {
  try {
    const config = require(`${projectCwd}/tailwind.config.js`);
    const { content } = config;
    if (Array.isArray(content)) {
      config.content = content.map(c =>
        c.startsWith(projectCwd) ? c : join(projectCwd, c)
      );
    }
    return config;
  } catch {
    return null;
  }
})();

module.exports = function (context) {
  const plugins = [
    cssnano({
      preset: [
        'default',
        {
          convertValues: false,
        },
      ],
    }),
  ];

  if (twConfig) {
    plugins.push(tailwindcss(twConfig), autoprefixer());
  }

  return {
    from: context.from,
    plugins,
    to: context.to,
  };
};
