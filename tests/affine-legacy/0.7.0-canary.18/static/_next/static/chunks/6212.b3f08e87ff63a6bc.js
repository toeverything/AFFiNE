'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6212],
  {
    46212: function (e, i, o) {
      o.r(i);
      var n = o(1347),
        l = o(1384);
      (0, n.Cw)(
        {
          id: 'com.affine.copilot',
          name: {
            fallback: 'AFFiNE Copilot',
            i18nKey: 'com.affine.copilot.name',
          },
          description: {
            fallback:
              'AFFiNE Copilot will help you with best writing experience on the World.',
          },
          publisher: {
            name: { fallback: 'AFFiNE' },
            link: 'https://affine.pro',
          },
          stage: l.Y.NIGHTLY,
          version: '0.0.1',
          commands: [],
        },
        {
          load: () =>
            Promise.all([o.e(4326), o.e(8709)]).then(o.bind(o, 18709)),
          hotModuleReload: e => void 0,
        }
      );
    },
    1384: function (e, i, o) {
      o.d(i, {
        Y: function () {
          return l;
        },
      });
      var n,
        l =
          (((n = l || {}).NIGHTLY = 'nightly'),
          (n.PROD = 'prod'),
          (n.DEV = 'dev'),
          n);
    },
  },
]);
//# sourceMappingURL=6212.b3f08e87ff63a6bc.js.map
