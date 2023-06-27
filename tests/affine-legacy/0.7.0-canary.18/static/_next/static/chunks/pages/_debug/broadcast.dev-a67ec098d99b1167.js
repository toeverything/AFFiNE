(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [4050, 1142, 7274],
  {
    27489: function (e, t, a) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/_debug/broadcast.dev',
        function () {
          return a(15117);
        },
      ]);
    },
    97274: function (e, t, a) {
      'use strict';
      a.r(t),
        a.d(t, {
          BlockSuitePageList: function () {
            return y;
          },
        });
      var r = a(52903),
        i = a(37565),
        l = a(8183),
        n = a(96893),
        s = a(44502),
        o = a(72013),
        d = a(31921),
        c = a(91013);
      new WeakMap();
      let u = e => {
        let t = e.getBlockByFlavour('affine:paragraph'),
          a = t
            .slice(0, 10)
            .map(e => e.text.toString())
            .join('\n');
        return a.slice(0, 30);
      };
      var g = a(752),
        p = a(2784),
        f = a(74090),
        h = a(64813),
        P = a(53137);
      a(91108);
      var v = a(36054),
        k = a(5632),
        b = a(31747);
      let w = e => {
          let t = (0, k.useRouter)(),
            { openPage: r } = (0, b.$)(t),
            { createPage: i } = (0, v.S)(e),
            l = (0, g.Dv)(f.KA),
            n = (0, p.useCallback)(
              e => {
                var t;
                return (
                  (null === (t = l[e]) || void 0 === t ? void 0 : t.mode) ===
                  'edgeless'
                );
              },
              [l]
            ),
            s = (0, g.b9)(f.fZ),
            o = (0, p.useCallback)(() => {
              let t = i();
              return r(e.id, t.id);
            }, [e.id, i, r]),
            d = (0, p.useCallback)(() => {
              let t = i();
              return s(t.id, 'edgeless'), r(e.id, t.id);
            }, [e.id, i, r, s]),
            c = (0, p.useCallback)(async () => {
              let { showImportModal: t } = await a
                .e(280)
                .then(a.bind(a, 59799));
              t({ workspace: e });
            }, [e]);
          return {
            createPage: o,
            createEdgeless: d,
            importFile: c,
            isPreferredEdgeless: n,
          };
        },
        m = {
          all: e => !e.trash,
          public: e => !e.trash,
          trash: (e, t) => {
            let a = t.find(t => {
              var a;
              return null === (a = t.subpageIds) || void 0 === a
                ? void 0
                : a.includes(e.id);
            });
            return !(null == a ? void 0 : a.trash) && e.trash;
          },
          shared: e => e.isPublic && !e.trash,
        },
        C = e => {
          let { listType: t, createPage: a } = e,
            l = (0, o.X)();
          return (0, r.tZ)('div', {
            className: 'wrs27w0',
            children: (0, r.tZ)(i.HY, {
              title: l['com.affine.emptyDesc'](),
              description: (() => {
                if ('all' === t) {
                  let e = () =>
                    (0, r.tZ)('button', {
                      className: 'wrs27w1',
                      onClick: a,
                      children: 'New Page',
                    });
                  if (n.OB.isDesktop) {
                    let t = n.OB.isMacOs ? '⌘ + N' : 'Ctrl + N';
                    return (0, r.BX)(s.cC, {
                      i18nKey: 'emptyAllPagesClient',
                      children: [
                        'Click on the ',
                        (0, r.tZ)(e, {}),
                        ' button Or press',
                        (0, r.tZ)('kbd', {
                          className: 'wrs27w2 wrs27w1',
                          children: { shortcut: t },
                        }),
                        ' to create your first page.',
                      ],
                    });
                  }
                  return (0, r.BX)(s.cC, {
                    i18nKey: 'emptyAllPages',
                    children: [
                      'Click on the',
                      (0, r.tZ)(e, {}),
                      'button to create your first page.',
                    ],
                  });
                }
                return 'trash' === t
                  ? l.emptyTrash()
                  : 'shared' === t
                  ? l.emptySharedPages()
                  : void 0;
              })(),
            }),
          });
        },
        y = e => {
          let {
              blockSuiteWorkspace: t,
              onOpenPage: a,
              listType: i,
              isPublic: n = !1,
              view: s,
            } = e,
            v = (0, c.r)(t),
            {
              toggleFavorite: k,
              removeToTrash: b,
              restoreFromTrash: y,
              permanentlyDeletePage: D,
              cancelPublicPage: Z,
            } = (0, h.a)(t),
            [N] = (0, g.KO)(f.GE),
            {
              createPage: E,
              createEdgeless: _,
              importFile: A,
              isPreferredEdgeless: B,
            } = w(t),
            T = (0, o.X)(),
            S = (0, p.useMemo)(
              () =>
                v
                  .filter(
                    e =>
                      'all' === N ||
                      ('edgeless' === N
                        ? B(e.id)
                        : 'page' === N
                        ? !B(e.id)
                        : (console.error('unknown filter mode', e, N), !0))
                  )
                  .filter(e => {
                    var t;
                    return (
                      !!m[i](e, v) &&
                      (!s ||
                        (0, l.tN)(s.filterList, {
                          'Is Favourited': !!e.favorite,
                          Created: e.createDate,
                          Updated:
                            null !== (t = e.updatedDate) && void 0 !== t
                              ? t
                              : e.createDate,
                        }))
                    );
                  }),
              [v, N, B, i, s]
            );
          if ('trash' === i) {
            let e = S.map(e => {
              let i = t.getPage(e.id),
                l = i ? u(i) : void 0;
              return {
                icon: B(e.id)
                  ? (0, r.tZ)(d.EdgelessIcon, {})
                  : (0, r.tZ)(d.PageIcon, {}),
                pageId: e.id,
                title: e.title,
                preview: l,
                createDate: new Date(e.createDate),
                trashDate: e.trashDate ? new Date(e.trashDate) : void 0,
                onClickPage: () => a(e.id),
                onClickRestore: () => {
                  y(e.id);
                },
                onRestorePage: () => {
                  y(e.id),
                    (0, P.A)(T.restored({ title: e.title || 'Untitled' }));
                },
                onPermanentlyDeletePage: () => {
                  D(e.id), (0, P.A)(T['Permanently deleted']());
                },
              };
            });
            return (0, r.tZ)(l.ng, {
              list: e,
              fallback: (0, r.tZ)(C, { listType: i }),
            });
          }
          let I = S.map(e => {
            var i;
            let l = t.getPage(e.id),
              n = l ? u(l) : void 0;
            return {
              icon: B(e.id)
                ? (0, r.tZ)(d.EdgelessIcon, {})
                : (0, r.tZ)(d.PageIcon, {}),
              pageId: e.id,
              title: e.title,
              preview: n,
              favorite: !!e.favorite,
              isPublicPage: !!e.isPublic,
              createDate: new Date(e.createDate),
              updatedDate: new Date(
                null !== (i = e.updatedDate) && void 0 !== i ? i : e.createDate
              ),
              onClickPage: () => a(e.id),
              onOpenPageInNewTab: () => a(e.id, !0),
              onClickRestore: () => {
                y(e.id);
              },
              removeToTrash: () => {
                b(e.id), (0, P.A)(T['Successfully deleted']());
              },
              onRestorePage: () => {
                y(e.id), (0, P.A)(T.restored({ title: e.title || 'Untitled' }));
              },
              bookmarkPage: () => {
                k(e.id),
                  (0, P.A)(
                    e.favorite
                      ? T['Removed from Favorites']()
                      : T['Added to Favorites']()
                  );
              },
              onDisablePublicSharing: () => {
                Z(e.id),
                  (0, P.A)('Successfully disabled', { portal: document.body });
              },
            };
          });
          return (0, r.tZ)(l.LK, {
            onCreateNewPage: E,
            onCreateNewEdgeless: _,
            onImportFile: A,
            isPublicWorkspace: n,
            list: I,
            fallback: (0, r.tZ)(C, { createPage: E, listType: i }),
          });
        };
    },
    15117: function (e, t, a) {
      'use strict';
      a.r(t);
      var r = a(52903),
        i = a(37565),
        l = a(90643),
        n = a(5587),
        s = a(91337),
        o = a(25540),
        d = a(62980),
        c = a(13246),
        u = a(62197),
        g = a(2784),
        p = a(97274),
        f = a(53137);
      let h = new n.b('broadcast'),
        P = () => {
          let e = (0, g.useMemo)(
              () => (0, d.LM)('broadcast-test', s.b8.LOCAL),
              []
            ),
            [t, a] = (0, g.useState)(null);
          return ((0, g.useEffect)(() => {
            let t = (0, o.HK)(e);
            return (
              a(t),
              (globalThis.currentBroadCastChannel = t),
              t.connect(),
              () => {
                t.disconnect(),
                  (globalThis.currentBroadCastChannel = void 0),
                  a(null);
              }
            );
          }, [e]),
          t)
            ? (0, r.tZ)(l.zj, {
                children: (0, r.BX)(l.tz, {
                  children: [
                    (0, r.tZ)(u.Z, {
                      variant: 'h5',
                      children: 'Broadcast Provider Test',
                    }),
                    (0, r.tZ)(i.zx, {
                      type: 'primary',
                      'data-testid': 'create-page',
                      onClick: () => {
                        h.info('create page'),
                          e.createPage({ id: (0, c.x0)() });
                      },
                      children: 'Create Page',
                    }),
                    (0, r.tZ)(p.BlockSuitePageList, {
                      blockSuiteWorkspace: e,
                      listType: 'all',
                      onOpenPage: () => {
                        (0, f.A)('do nothing');
                      },
                    }),
                  ],
                }),
              })
            : null;
        };
      t.default = P;
    },
    36054: function (e, t, a) {
      'use strict';
      a.d(t, {
        S: function () {
          return n;
        },
      });
      var r = a(13246),
        i = a(61222),
        l = a(2784);
      function n(e) {
        return (0, l.useMemo)(
          () => ({
            createPage: t => ((0, r.kP)(e), e.createPage({ id: t })),
            markMilestone: async t => {
              (0, r.kP)(e);
              let a = e.doc;
              await (0, i.J6)(e.id, a, t);
            },
            revertMilestone: async t => {
              (0, r.kP)(e);
              let a = e.doc,
                l = await (0, i.gu)(e.id);
              if (!l) throw Error('no milestone');
              let n = l[t];
              n && (0, i.dE)(a, n, () => 'Map');
            },
            listMilestone: async () => ((0, r.kP)(e), await (0, i.gu)(e.id)),
          }),
          [e]
        );
      }
    },
    91108: function () {},
  },
  function (e) {
    e.O(0, [5024, 4057, 6882, 1866, 9774, 2888, 179], function () {
      return e((e.s = 27489));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=broadcast.dev-a67ec098d99b1167.js.map
