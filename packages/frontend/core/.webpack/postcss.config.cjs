const cssnano = require('cssnano');

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

  return {
    from: context.from,
    plugins,
    to: context.to,
  };
};
