(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [3476],
  {
    89985: function (e, t, c) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/public-workspace/[workspaceId]',
        function () {
          return c(84289);
        },
      ]);
    },
    84289: function (e, t, c) {
      'use strict';
      c.r(t);
      var n = c(52903),
        r = c(37565),
        a = c(8183),
        i = c(57670),
        s = c(14192),
        l = c(31921),
        u = c(77352),
        o = c(78365),
        p = c(752),
        d = c(5632),
        h = c(2784),
        k = c(74090),
        b = c(43631),
        f = c(9532),
        w = c(41142),
        Z = c(86350),
        _ = c(73047);
      let y = (0, h.lazy)(() =>
          c
            .e(7274)
            .then(c.bind(c, 97274))
            .then(e => ({ default: e.BlockSuitePageList }))
        ),
        S = e => {
          let { workspaceId: t } = e,
            c = (0, d.useRouter)(),
            i = (0, p.Dv)(b.sd),
            s = i.blockSuiteWorkspace,
            S = (0, h.useCallback)(
              e =>
                c.push({
                  pathname: '/public-workspace/[workspaceId]/[pageId]',
                  query: { workspaceId: t, pageId: e },
                }),
              [c, t]
            ),
            [g] = (0, o.H)(s),
            [v] = (0, u.r)(s),
            I = (0, p.b9)(k.A8),
            X = (0, h.useCallback)(() => {
              I(!0);
            }, [I]);
          return s
            ? (0, n.BX)(n.HY, {
                children: [
                  (0, n.tZ)(Z.Y, { workspace: i }),
                  (0, n.BX)(_.NavContainer, {
                    sx: { px: '20px' },
                    children: [
                      (0, n.tZ)(r.Oo, {
                        children: (0, n.BX)(_.StyledBreadcrumbs, {
                          href: '/public-workspace/'.concat(s.id),
                          children: [
                            (0, n.tZ)(f.z, { size: 24, name: g, avatar: v }),
                            (0, n.tZ)('span', { children: g }),
                          ],
                        }),
                      }),
                      (0, n.tZ)(r.hU, {
                        onClick: X,
                        children: (0, n.tZ)(l.SearchIcon, {}),
                      }),
                    ],
                  }),
                  (0, n.tZ)(h.Suspense, {
                    fallback: (0, n.tZ)(a.no, {
                      children: (0, n.tZ)(r.cg, {}),
                    }),
                    children: (0, n.tZ)(y, {
                      listType: 'public',
                      isPublic: !0,
                      onOpenPage: S,
                      blockSuiteWorkspace: s,
                    }),
                  }),
                ],
              })
            : (0, n.tZ)(w.SX, {});
        },
        g = () => {
          let e = (0, d.useRouter)(),
            t = e.query.workspaceId,
            c = (0, p.b9)(b.Uv),
            l = (0, p.b9)(s.At);
          (0, h.useEffect)(() => {
            e.isReady && 'string' == typeof t && (c(t), l(t));
          }, [e.isReady, l, c, t]);
          let u = (0, p.Dv)(b.Uv);
          if (!e.isReady || !u) return (0, n.tZ)(w.SX, {});
          if ('string' != typeof t) throw new i.Y6('workspaceId', t);
          return (0, n.tZ)(h.Suspense, {
            fallback: (0, n.tZ)(a.no, { children: (0, n.tZ)(r.cg, {}) }),
            children: (0, n.tZ)(S, { workspaceId: t }),
          });
        };
      (t.default = g), (g.getLayout = e => (0, n.tZ)(Z.c, { children: e }));
    },
  },
  function (e) {
    e.O(
      0,
      [5024, 4057, 6882, 6195, 4372, 1866, 7473, 3047, 9774, 2888, 179],
      function () {
        return e((e.s = 89985));
      }
    ),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=[workspaceId]-8a1f904d147c7ca0.js.map
