(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [5405],
  {
    87314: function (e, t, o) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/',
        function () {
          return o(18306);
        },
      ]);
    },
    18306: function (e, t, o) {
      'use strict';
      o.r(t);
      var r = o(52903),
        n = o(90643),
        l = o(5587),
        a = o(91337),
        i = o(5632),
        u = o(2784),
        s = o(41142),
        c = o(31747),
        d = o(87175),
        p = o(11264),
        f = o(99341);
      let _ = new l.b('index-page'),
        g = () => {
          let e = (0, i.useRouter)(),
            { jumpToPage: t, jumpToSubPath: o } = (0, c.$)(e),
            l = (0, d._)(),
            s = (0, d.z)();
          return (
            (0, u.useEffect)(() => {
              if (!e.isReady) return;
              let r = localStorage.getItem('last_workspace_id'),
                n = localStorage.getItem('last_page_id'),
                i =
                  (r &&
                    l.find(e => {
                      let { id: t } = e;
                      return t === r;
                    })) ||
                  l.at(0);
              if (i) {
                var u, s, d;
                let e = i.blockSuiteWorkspace.meta.pageMetas.filter(e => {
                    let { trash: t } = e;
                    return !t;
                  }),
                  r =
                    null !==
                      (d =
                        null ===
                          (u = e.find(e => {
                            let { id: t } = e;
                            return t === n;
                          })) || void 0 === u
                          ? void 0
                          : u.id) && void 0 !== d
                      ? d
                      : null === (s = e.at(0)) || void 0 === s
                      ? void 0
                      : s.id;
                if (r)
                  _.debug('Found target workspace. Jump to page', r),
                    t(i.id, r, c.t.REPLACE).catch(e => {
                      console.error(e);
                    });
                else {
                  let e = setTimeout(() => {
                      r.dispose(),
                        _.debug('Found target workspace. Jump to all pages'),
                        o(i.id, a._0.ALL, c.t.REPLACE).catch(e => {
                          console.error(e);
                        });
                    }, 1e3),
                    r = i.blockSuiteWorkspace.slots.pageAdded.once(o => {
                      clearTimeout(e),
                        t(i.id, o, c.t.REPLACE).catch(e => {
                          console.error(e);
                        });
                    });
                  return () => {
                    clearTimeout(e), r.dispose();
                  };
                }
              } else
                console.warn(
                  'No target workspace. This should not happen in production'
                );
            }, [s, t, o, e, l]),
            (0, r.tZ)(u.Suspense, {
              fallback: (0, r.tZ)(n.aD, {}),
              children: (0, r.tZ)(p.rz, { children: (0, r.tZ)(f.Y, {}) }),
            })
          );
        },
        k = () =>
          (0, r.tZ)(u.Suspense, {
            fallback: (0, r.tZ)(s.SX, {}),
            children: (0, r.tZ)(g, {}),
          });
      t.default = k;
    },
  },
  function (e) {
    e.O(0, [5024, 4057, 6882, 6675, 1866, 1264, 9774, 2888, 179], function () {
      return e((e.s = 87314));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=index-c6bdcd34e4de98ec.js.map
