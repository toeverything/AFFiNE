'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2530],
  {
    32530: function (o, e, a) {
      a.r(e);
      var k = a(1347),
        l = a(1384);
      (0, k.Cw)(
        {
          id: 'com.blocksuite.bookmark-block',
          name: {
            fallback: 'BlockSuite Bookmark Block',
            i18nKey: 'com.blocksuite.bookmark.name',
          },
          description: { fallback: 'Bookmark block' },
          publisher: {
            name: { fallback: 'AFFiNE' },
            link: 'https://affine.pro',
          },
          stage: l.Y.NIGHTLY,
          version: '0.0.1',
          commands: ['com.blocksuite.bookmark-block.get-bookmark-data-by-link'],
        },
        void 0,
        {
          load: () =>
            Promise.all([a.e(5024), a.e(2509)]).then(a.bind(a, 12509)),
          hotModuleReload: o => void 0,
        },
        {
          load: () => import('./server'),
          hotModuleReload: o => o(import('./server')),
        }
      );
    },
    1384: function (o, e, a) {
      a.d(e, {
        Y: function () {
          return l;
        },
      });
      var k,
        l =
          (((k = l || {}).NIGHTLY = 'nightly'),
          (k.PROD = 'prod'),
          (k.DEV = 'dev'),
          k);
    },
  },
]);
//# sourceMappingURL=2530.2fcf8c84823669d4.js.map
