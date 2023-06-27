(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [1142, 7274],
  {
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
        s = a(96893),
        n = a(44502),
        d = a(72013),
        o = a(31921),
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
        P = a(64813),
        k = a(53137);
      a(91108);
      var v = a(36054),
        h = a(5632),
        m = a(31747);
      let b = e => {
          let t = (0, h.useRouter)(),
            { openPage: r } = (0, m.$)(t),
            { createPage: i } = (0, v.S)(e),
            l = (0, g.Dv)(f.KA),
            s = (0, p.useCallback)(
              e => {
                var t;
                return (
                  (null === (t = l[e]) || void 0 === t ? void 0 : t.mode) ===
                  'edgeless'
                );
              },
              [l]
            ),
            n = (0, g.b9)(f.fZ),
            d = (0, p.useCallback)(() => {
              let t = i();
              return r(e.id, t.id);
            }, [e.id, i, r]),
            o = (0, p.useCallback)(() => {
              let t = i();
              return n(t.id, 'edgeless'), r(e.id, t.id);
            }, [e.id, i, r, n]),
            c = (0, p.useCallback)(async () => {
              let { showImportModal: t } = await a
                .e(280)
                .then(a.bind(a, 59799));
              t({ workspace: e });
            }, [e]);
          return {
            createPage: d,
            createEdgeless: o,
            importFile: c,
            isPreferredEdgeless: s,
          };
        },
        w = {
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
        D = e => {
          let { listType: t, createPage: a } = e,
            l = (0, d.X)();
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
                  if (s.OB.isDesktop) {
                    let t = s.OB.isMacOs ? '⌘ + N' : 'Ctrl + N';
                    return (0, r.BX)(n.cC, {
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
                  return (0, r.BX)(n.cC, {
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
              isPublic: s = !1,
              view: n,
            } = e,
            v = (0, c.r)(t),
            {
              toggleFavorite: h,
              removeToTrash: m,
              restoreFromTrash: y,
              permanentlyDeletePage: C,
              cancelPublicPage: Z,
            } = (0, P.a)(t),
            [N] = (0, g.KO)(f.GE),
            {
              createPage: A,
              createEdgeless: E,
              importFile: I,
              isPreferredEdgeless: M,
            } = b(t),
            S = (0, d.X)(),
            B = (0, p.useMemo)(
              () =>
                v
                  .filter(
                    e =>
                      'all' === N ||
                      ('edgeless' === N
                        ? M(e.id)
                        : 'page' === N
                        ? !M(e.id)
                        : (console.error('unknown filter mode', e, N), !0))
                  )
                  .filter(e => {
                    var t;
                    return (
                      !!w[i](e, v) &&
                      (!n ||
                        (0, l.tN)(n.filterList, {
                          'Is Favourited': !!e.favorite,
                          Created: e.createDate,
                          Updated:
                            null !== (t = e.updatedDate) && void 0 !== t
                              ? t
                              : e.createDate,
                        }))
                    );
                  }),
              [v, N, M, i, n]
            );
          if ('trash' === i) {
            let e = B.map(e => {
              let i = t.getPage(e.id),
                l = i ? u(i) : void 0;
              return {
                icon: M(e.id)
                  ? (0, r.tZ)(o.EdgelessIcon, {})
                  : (0, r.tZ)(o.PageIcon, {}),
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
                    (0, k.A)(S.restored({ title: e.title || 'Untitled' }));
                },
                onPermanentlyDeletePage: () => {
                  C(e.id), (0, k.A)(S['Permanently deleted']());
                },
              };
            });
            return (0, r.tZ)(l.ng, {
              list: e,
              fallback: (0, r.tZ)(D, { listType: i }),
            });
          }
          let F = B.map(e => {
            var i;
            let l = t.getPage(e.id),
              s = l ? u(l) : void 0;
            return {
              icon: M(e.id)
                ? (0, r.tZ)(o.EdgelessIcon, {})
                : (0, r.tZ)(o.PageIcon, {}),
              pageId: e.id,
              title: e.title,
              preview: s,
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
                m(e.id), (0, k.A)(S['Successfully deleted']());
              },
              onRestorePage: () => {
                y(e.id), (0, k.A)(S.restored({ title: e.title || 'Untitled' }));
              },
              bookmarkPage: () => {
                h(e.id),
                  (0, k.A)(
                    e.favorite
                      ? S['Removed from Favorites']()
                      : S['Added to Favorites']()
                  );
              },
              onDisablePublicSharing: () => {
                Z(e.id),
                  (0, k.A)('Successfully disabled', { portal: document.body });
              },
            };
          });
          return (0, r.tZ)(l.LK, {
            onCreateNewPage: A,
            onCreateNewEdgeless: E,
            onImportFile: I,
            isPublicWorkspace: s,
            list: F,
            fallback: (0, r.tZ)(D, { createPage: A, listType: i }),
          });
        };
    },
    36054: function (e, t, a) {
      'use strict';
      a.d(t, {
        S: function () {
          return s;
        },
      });
      var r = a(13246),
        i = a(61222),
        l = a(2784);
      function s(e) {
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
              let s = l[t];
              s && (0, i.dE)(a, s, () => 'Map');
            },
            listMilestone: async () => ((0, r.kP)(e), await (0, i.gu)(e.id)),
          }),
          [e]
        );
      }
    },
    91108: function () {},
  },
]);
//# sourceMappingURL=1142.782e5d55c66dfd1c.js.map
