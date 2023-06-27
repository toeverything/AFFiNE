(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [4720],
  {
    37118: function (e, t, n) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/_debug/login.dev',
        function () {
          return n(95988);
        },
      ]);
    },
    95988: function (e, t, n) {
      'use strict';
      n.r(t);
      var i = n(52903),
        o = n(37565),
        l = n(90643),
        r = n(42049),
        a = n(22903),
        s = n(752),
        c = n(2784),
        h = n(53137),
        u = n(38617);
      let d = (0, c.lazy)(() =>
          n
            .e(8870)
            .then(n.bind(n, 38870))
            .then(e => ({ default: e.JsonViewer }))
        ),
        f = () => {
          let [e, t] = (0, s.KO)(r.j),
            n = (0, c.useMemo)(() => (0, a.iB)(), []);
          return (0, i.tZ)(l.zj, {
            children: (0, i.BX)(l.tz, {
              children: [
                (0, i.tZ)('h1', { children: 'LoginDevPage' }),
                (0, i.tZ)(o.zx, {
                  onClick: async () => {
                    let e = (0, a.Ut)();
                    if (e) {
                      let t = (0, a.X4)(e.token);
                      (0, a.Bw)(t) && (await n.refreshToken(e));
                    }
                    let i = await n.generateToken(a.wD.Google);
                    if (i) {
                      (0, a.rs)(i);
                      let e = (0, a.X4)(i.token);
                      t(e);
                    } else (0, h.A)('Login failed');
                  },
                  children: 'Login',
                }),
                (0, i.tZ)(o.zx, {
                  onClick: async () => {
                    let e = (0, a.Ut)();
                    if (!e) throw Error('No storage');
                    let i = await n.refreshToken(e);
                    if (i) {
                      (0, a.rs)(i);
                      let e = (0, a.X4)(i.token);
                      t(e);
                    } else (0, h.A)('Login failed');
                  },
                  children: 'Refresh Token',
                }),
                (0, i.tZ)(o.zx, {
                  onClick: () => {
                    (0, a.WB)(), t(null);
                  },
                  children: 'Reset Storage',
                }),
                (0, i.tZ)(o.zx, {
                  onClick: async () => {
                    var e, t;
                    let n = await fetch('/api/workspace', {
                      method: 'GET',
                      headers: {
                        'Cache-Control': 'no-cache',
                        Authorization:
                          null !==
                            (t =
                              null === (e = (0, a.Ut)()) || void 0 === e
                                ? void 0
                                : e.token) && void 0 !== t
                            ? t
                            : '',
                      },
                    }).then(e => e.status);
                    (0, h.A)('Response Status: '.concat(n));
                  },
                  children: 'Check Permission',
                }),
                (0, i.tZ)(c.Suspense, {
                  children: (0, i.tZ)(d, {
                    theme:
                      'light' === (0, u.F)().resolvedTheme ? 'light' : 'dark',
                    value: e,
                  }),
                }),
              ],
            }),
          });
        };
      t.default = f;
    },
  },
  function (e) {
    e.O(0, [9774, 2888, 179], function () {
      return e((e.s = 37118));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=login.dev-b68ba09b4eb3625d.js.map
