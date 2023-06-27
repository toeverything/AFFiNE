(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6722],
  {
    84781: function (e, t, r) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/workspace/[workspaceId]/setting',
        function () {
          return r(28260);
        },
      ]);
    },
    64581: function (e, t, r) {
      'use strict';
      r.d(t, {
        c: function () {
          return d;
        },
      });
      var n = r(91337),
        a = r(42049),
        c = r(22903),
        u = r(78981),
        l = r(14192),
        o = r(752),
        i = r(2784),
        s = r(72293);
      function d() {
        let e = (0, s.O)(),
          t = (0, o.b9)(a.j),
          r = (0, o.b9)(l.At);
        return (0, i.useCallback)(
          async (a, l, o) => {
            let i = l === n.b8.AFFINE && !(0, c.Ut)();
            if (i) {
              let e = await u.j.generateToken(c.wD.Google);
              e && ((0, c.rs)(e), t((0, c.X4)(e.token)), c.vJ.emit());
            }
            let s = await e(a, l, o);
            window.dispatchEvent(
              new CustomEvent('affine-workspace:transform', {
                detail: { from: a, to: l, oldId: o.id, newId: s },
              })
            ),
              r(s);
          },
          [t, r, e]
        );
      }
    },
    72293: function (e, t, r) {
      'use strict';
      r.d(t, {
        O: function () {
          return l;
        },
      });
      var n = r(14192),
        a = r(752),
        c = r(2784),
        u = r(66844);
      function l() {
        let e = (0, a.b9)(n.nn);
        return (0, c.useCallback)(
          async (t, r, n) => {
            let a = await u.WorkspaceAdapters[r].CRUD.create(
              n.blockSuiteWorkspace
            );
            return (
              await u.WorkspaceAdapters[t].CRUD.delete(n),
              e(e => {
                let t = e.findIndex(e => e.id === n.id);
                return e.splice(t, 1, { id: a, flavour: r }), [...e];
              }),
              a
            );
          },
          [e]
        );
      }
    },
    28260: function (e, t, r) {
      'use strict';
      r.r(t);
      var n = r(52903),
        a = r(91337),
        c = r(72013),
        u = r(13246),
        l = r(752),
        o = r(87809),
        i = r(97729),
        s = r.n(i),
        d = r(5632),
        p = r(2784),
        f = r(66844),
        k = r(41142),
        h = r(96450),
        b = r(64581),
        w = r(87175),
        y = r(11264);
      let T = (0, o.O4)('workspaceId', a.ey.General),
        _ = () => {
          let e = (0, d.useRouter)(),
            [t] = (0, h.$)(),
            r = (0, c.X)(),
            [o, i] = (0, l.KO)(T),
            y = (0, p.useCallback)(
              t => {
                i(t),
                  e
                    .push({
                      pathname: e.pathname,
                      query: { ...e.query, currentTab: t },
                    })
                    .catch(e => {
                      console.error(e);
                    });
              },
              [e, i]
            );
          !(function (e, t, r) {
            if (!e.isReady) return;
            let n =
              'string' == typeof e.query.currentTab ? e.query.currentTab : null;
            (null !== n && -1 === a.SF.indexOf(n)) || -1 === a.SF.indexOf(t)
              ? (r(a.ey.General),
                e
                  .replace({
                    pathname: e.pathname,
                    query: { ...e.query, currentTab: a.ey.General },
                  })
                  .catch(console.error))
              : n !== t &&
                e
                  .replace({
                    pathname: e.pathname,
                    query: { ...e.query, currentTab: t },
                  })
                  .catch(console.error);
          })(e, o, i);
          let _ = (0, w.z)(),
            E = (0, p.useCallback)(async () => {
              (0, u.kP)(t);
              let e = t.id;
              return _.deleteWorkspace(e);
            }, [t, _]),
            m = (0, b.c)();
          if (!e.isReady || null === t || -1 === a.SF.indexOf(o))
            return (0, n.tZ)(k.SX, {});
          let { SettingsDetail: C, Header: O } = (0, f.getUIAdapter)(t.flavour);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.tZ)(s(), {
                children: (0, n.BX)('title', {
                  children: [r.Settings(), ' - AFFiNE'],
                }),
              }),
              (0, n.tZ)(O, {
                currentWorkspace: t,
                currentEntry: { subPath: a._0.SETTING },
              }),
              (0, n.tZ)(C, {
                onTransformWorkspace: m,
                onDeleteWorkspace: E,
                currentWorkspace: t,
                currentTab: o,
                onChangeTab: y,
              }),
            ],
          });
        };
      (t.default = _), (_.getLayout = e => (0, n.tZ)(y.PJ, { children: e }));
    },
  },
  function (e) {
    e.O(0, [5024, 4057, 6882, 6675, 1866, 1264, 9774, 2888, 179], function () {
      return e((e.s = 84781));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=setting-cd641873ae3b8ffe.js.map
