(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [3057],
  {
    74697: function (n, t, e) {
      'use strict';
      var u = e(2784),
        r = e(21399),
        i = e(52322);
      t.Z = function (n) {
        let { children: t, defer: e = !1, fallback: c = null } = n,
          [l, s] = u.useState(!1);
        return (
          (0, r.Z)(() => {
            e || s(!0);
          }, [e]),
          u.useEffect(() => {
            e && s(!0);
          }, [e]),
          (0, i.jsx)(u.Fragment, { children: l ? t : c })
        );
      };
    },
    14346: function (n, t, e) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/plugins',
        function () {
          return e(16612);
        },
      ]);
    },
    16612: function (n, t, e) {
      'use strict';
      e.r(t),
        e.d(t, {
          default: function () {
            return a;
          },
        });
      var u = e(52903),
        r = e(90643),
        i = e(96893),
        c = e(74697),
        l = e(1347),
        s = e(752),
        d = e(2784);
      let f = () => {
        let n = (0, s.Dv)(l.an);
        return (0, u.tZ)(c.Z, {
          children: (0, u.tZ)('div', {
            children: Object.values(n).map(n => {
              let { definition: t, uiAdapter: e } = n,
                r = e.debugContent;
              return (0, u.BX)(
                'div',
                { children: [t.name.fallback, r && (0, u.tZ)(r, {})] },
                t.id
              );
            }),
          }),
        });
      };
      function a() {
        return i.vc.enablePlugin
          ? (0, u.tZ)(r.zj, {
              children: (0, u.tZ)(r.tz, {
                children: (0, u.tZ)(d.Suspense, { children: (0, u.tZ)(f, {}) }),
              }),
            })
          : (0, u.tZ)(u.HY, {});
      }
    },
  },
  function (n) {
    n.O(0, [9774, 2888, 179], function () {
      return n((n.s = 14346));
    }),
      (_N_E = n.O());
  },
]);
//# sourceMappingURL=plugins-d69449923c351ece.js.map
