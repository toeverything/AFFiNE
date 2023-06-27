(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [3287],
  {
    63442: function (e, r, t) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/workspace/[workspaceId]/all',
        function () {
          return t(28569);
        },
      ]);
    },
    28569: function (e, r, t) {
      'use strict';
      t.r(r);
      var n = t(52903),
        c = t(8183),
        o = t(57670),
        u = t(91337),
        a = t(72013),
        i = t(13246),
        l = t(97729),
        s = t.n(l),
        k = t(5632),
        p = t(2784),
        w = t(66844),
        d = t(41142),
        _ = t(96450),
        f = t(31747),
        h = t(11264);
      let b = () => {
        let e = (0, k.useRouter)(),
          r = (0, c.ri)(),
          { jumpToPage: t } = (0, f.$)(e),
          [l] = (0, _.$)(),
          h = (0, a.X)(),
          b = (0, p.useCallback)(
            (e, r) => {
              (0, i.kP)(l),
                r
                  ? window.open(
                      '/workspace/'
                        .concat(null == l ? void 0 : l.id, '/')
                        .concat(e),
                      '_blank'
                    )
                  : t(l.id, e).catch(console.error);
            },
            [l, t]
          );
        if (!e.isReady) return (0, n.tZ)(d.SX, {});
        if ('string' != typeof e.query.workspaceId)
          throw new o.Y6('workspaceId', e.query.workspaceId);
        let { PageList: E, Header: y } = (0, w.getUIAdapter)(l.flavour);
        return (0, n.BX)(n.HY, {
          children: [
            (0, n.tZ)(s(), {
              children: (0, n.BX)('title', {
                children: [h['All pages'](), ' - AFFiNE'],
              }),
            }),
            (0, n.tZ)(y, {
              currentWorkspace: l,
              currentEntry: { subPath: u._0.ALL },
            }),
            (0, n.tZ)(E, {
              view: r.currentView,
              onOpenPage: b,
              blockSuiteWorkspace: l.blockSuiteWorkspace,
            }),
          ],
        });
      };
      (r.default = b), (b.getLayout = e => (0, n.tZ)(h.PJ, { children: e }));
    },
  },
  function (e) {
    e.O(0, [5024, 4057, 6882, 6675, 1866, 1264, 9774, 2888, 179], function () {
      return e((e.s = 63442));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=all-a5b3ad8d41f1ff9c.js.map
