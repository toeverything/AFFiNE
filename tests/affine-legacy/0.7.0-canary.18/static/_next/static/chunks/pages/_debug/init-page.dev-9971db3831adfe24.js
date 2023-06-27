(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [3594],
  {
    54399: function (e, n, t) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/_debug/init-page.dev',
        function () {
          return t(2216);
        },
      ]);
    },
    2216: function (e, n, t) {
      'use strict';
      t.r(n);
      var u = t(52903),
        i = t(90643),
        d = t(5632),
        r = t(2784);
      let l = (0, r.lazy)(() =>
          t
            .e(6116)
            .then(t.bind(t, 56116))
            .then(e => ({ default: e.default }))
        ),
        _ = () => {
          let e = (0, d.useRouter)();
          return e.isReady
            ? (0, u.tZ)(i.zj, {
                children: (0, u.BX)(i.tz, {
                  children: [
                    (0, u.tZ)(r.Suspense, { children: (0, u.tZ)(l, {}) }),
                    (0, u.tZ)('div', { id: 'toolWrapper' }),
                  ],
                }),
              })
            : (0, u.tZ)(u.HY, { children: 'loading...' });
        };
      n.default = _;
    },
  },
  function (e) {
    e.O(0, [9774, 2888, 179], function () {
      return e((e.s = 54399));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=init-page.dev-9971db3831adfe24.js.map
