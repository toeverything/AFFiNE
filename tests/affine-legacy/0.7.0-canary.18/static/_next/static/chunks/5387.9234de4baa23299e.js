(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [5387],
  {
    32701: function (e, t, r) {
      'use strict';
      r.r(t),
        r.d(t, {
          WorkspaceHeader: function () {
            return b;
          },
        });
      var l = r(52903),
        i = r(37565),
        n = r(8183),
        a = r(96893),
        c = r(91337),
        u = r(72013),
        s = r(31921),
        d = r(87809),
        o = r(15865),
        h = r(67473);
      r(97513);
      var f = r(752),
        g = r(74090),
        Z = r(44087),
        p = r(54734),
        P = r(29294);
      let v = e => {
          let { icon: t, children: r, ...i } = e,
            n = (0, f.b9)(g.A8);
          return (0, l.tZ)(Z.h, {
            ...i,
            children: (0, l.BX)('div', {
              className: p.y7,
              children: [
                (0, l.tZ)('div', { className: p.ZC, children: t }),
                r,
                (0, l.tZ)(P.G, {
                  onClick: () => {
                    n(!0);
                  },
                }),
              ],
            }),
          });
        },
        w = e => {
          let { ...t } = e,
            r = (0, u.X)(),
            [n, a] = (0, f.KO)(g.GE),
            c = e => {
              if ('all' !== e && 'page' !== e && 'edgeless' !== e)
                throw Error('Invalid value for page mode option');
              a(e);
            };
          return (0, l.tZ)(Z.h, {
            ...t,
            children: (0, l.tZ)('div', {
              className: p.SI,
              children: (0, l.BX)(i.SY, {
                defaultValue: n,
                onValueChange: c,
                children: [
                  (0, l.tZ)(i.EU, {
                    value: 'all',
                    style: { textTransform: 'capitalize' },
                    children: r.all(),
                  }),
                  (0, l.tZ)(i.EU, { value: 'page', children: r.Page() }),
                  (0, l.tZ)(i.EU, {
                    value: 'edgeless',
                    children: r.Edgeless(),
                  }),
                ],
              }),
            }),
          });
        };
      function b(e) {
        let { currentWorkspace: t, currentEntry: r } = e,
          f = (0, n.ri)(),
          g = (0, u.X)();
        if ('subPath' in r) {
          if (r.subPath === c._0.ALL) {
            let e = (0, l.tZ)(n.NC, { setting: f }),
              r =
                f.currentView.filterList.length > 0 &&
                (0, l.BX)('div', {
                  className: '_1o4po2a0',
                  children: [
                    (0, l.tZ)('div', {
                      style: { flex: 1 },
                      children: (0, l.tZ)(n.G6, {
                        value: f.currentView.filterList,
                        onChange: e => {
                          f.setCurrentView(t => ({ ...t, filterList: e }));
                        },
                      }),
                    }),
                    a.vc.enableAllPageFilter &&
                      (0, l.tZ)('div', {
                        children:
                          f.currentView.id !== o.Z ||
                          (f.currentView.id === o.Z &&
                            f.currentView.filterList.length > 0)
                            ? (0, l.tZ)(n.AD, {
                                init: f.currentView.filterList,
                                onConfirm: f.createView,
                              })
                            : (0, l.tZ)(i.zx, {
                                onClick: () => f.setCurrentView(d.td),
                                children: 'Back to all',
                              }),
                      }),
                  ],
                });
            return (0, l.BX)(l.HY, {
              children: [
                (0, l.tZ)(w, {
                  workspace: t,
                  currentPage: null,
                  isPublic: !1,
                  leftSlot: e,
                }),
                r,
              ],
            });
          }
          if (r.subPath === c._0.SETTING)
            return (0, l.tZ)(v, {
              workspace: t,
              currentPage: null,
              isPublic: !1,
              icon: (0, l.tZ)(s.SettingsIcon, {}),
              children: g['Workspace Settings'](),
            });
          if (r.subPath === c._0.SHARED || r.subPath === c._0.TRASH)
            return (0, l.tZ)(w, {
              workspace: t,
              currentPage: null,
              isPublic: !1,
            });
        } else if ('pageId' in r) {
          let e = r.pageId,
            i = t.flavour === c.b8.PUBLIC;
          return (0, l.tZ)(h.R, {
            isPublic: i,
            workspace: t,
            currentPage: t.blockSuiteWorkspace.getPage(e),
          });
        }
        return (0, l.tZ)(l.HY, {});
      }
    },
    97513: function () {},
  },
]);
//# sourceMappingURL=5387.9234de4baa23299e.js.map
