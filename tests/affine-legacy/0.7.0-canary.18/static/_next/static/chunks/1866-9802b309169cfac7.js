(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [1866],
  {
    64813: function (e, t, r) {
      'use strict';
      r.d(t, {
        a: function () {
          return i;
        },
      });
      var a = r(91013),
        n = r(2784);
      function i(e) {
        let { setPageMeta: t, getPageMeta: r } = (0, a.J)(e),
          { addReferenceLink: i, removeReferenceLink: l } = (function (e) {
            let t = (0, n.useCallback)(
                (t, r) => {
                  let a = null == e ? void 0 : e.getPage(t);
                  if (!a) return;
                  let n = a.Text.fromDelta([
                      {
                        insert: ' ',
                        attributes: {
                          reference: { type: 'Subpage', pageId: r },
                        },
                      },
                    ]),
                    [i] = a.getBlockByFlavour('affine:frame');
                  i && a.addBlock('affine:paragraph', { text: n }, i.id);
                },
                [e]
              ),
              r = (0, n.useCallback)(
                t => {
                  e.indexer.backlink.removeSubpageNode(e, t);
                },
                [e]
              );
            return { addReferenceLink: t, removeReferenceLink: r };
          })(e),
          o = (0, a.r)(e),
          c = (0, n.useCallback)(
            e => {
              t(e, { favorite: !0 });
            },
            [t]
          ),
          s = (0, n.useCallback)(
            e => {
              t(e, { favorite: !1 });
            },
            [t]
          ),
          d = (0, n.useCallback)(
            e => {
              var a;
              let { favorite: n } =
                null !== (a = r(e)) && void 0 !== a ? a : {};
              t(e, { favorite: !n });
            },
            [r, t]
          ),
          u = (0, n.useCallback)(
            function (e) {
              var a;
              let n =
                  !(arguments.length > 1) ||
                  void 0 === arguments[1] ||
                  arguments[1],
                i = o.find(t => {
                  var r;
                  return null === (r = t.subpageIds) || void 0 === r
                    ? void 0
                    : r.includes(e);
                }),
                { subpageIds: c = [] } =
                  null !== (a = r(e)) && void 0 !== a ? a : {};
              c.forEach(e => {
                u(e, !1);
              }),
                t(e, {
                  trash: !0,
                  trashDate: +new Date(),
                  trashRelate: n ? (null == i ? void 0 : i.id) : void 0,
                }),
                i && n && l(e);
            },
            [r, o, l, t]
          ),
          p = (0, n.useCallback)(
            e => {
              var a;
              let { subpageIds: n = [], trashRelate: l } =
                null !== (a = r(e)) && void 0 !== a ? a : {};
              l && i(l, e),
                t(e, { trash: !1, trashDate: void 0, trashRelate: void 0 }),
                n.forEach(e => {
                  p(e);
                });
            },
            [i, r, t]
          ),
          h = (0, n.useCallback)(
            t => {
              e.removePage(t);
            },
            [e]
          ),
          f = (0, n.useCallback)(
            e => {
              t(e, { isPublic: !0 });
            },
            [t]
          ),
          m = (0, n.useCallback)(
            e => {
              t(e, { isPublic: !1 });
            },
            [t]
          );
        return {
          publicPage: f,
          cancelPublicPage: m,
          addToFavorite: c,
          removeFromFavorite: s,
          toggleFavorite: d,
          removeToTrash: u,
          restoreFromTrash: p,
          permanentlyDeletePage: h,
        };
      }
    },
    31747: function (e, t, r) {
      'use strict';
      r.d(t, {
        $: function () {
          return l;
        },
        t: function () {
          return n;
        },
      });
      var a,
        n,
        i = r(2784);
      function l(e) {
        let t = (0, i.useCallback)(
            function (t, r) {
              let a =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : n.PUSH;
              return e[a]({
                pathname: '/workspace/[workspaceId]/[pageId]',
                query: { workspaceId: t, pageId: r },
              });
            },
            [e]
          ),
          r = (0, i.useCallback)(
            function (t, r) {
              let a =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : n.PUSH;
              return e[a]({
                pathname: '/public-workspace/[workspaceId]/[pageId]',
                query: { workspaceId: t, pageId: r },
              });
            },
            [e]
          ),
          a = (0, i.useCallback)(
            function (t, r) {
              let a =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : n.PUSH;
              return e[a]({
                pathname: '/workspace/[workspaceId]/'.concat(r),
                query: { workspaceId: t },
              });
            },
            [e]
          ),
          l = (0, i.useCallback)(
            (a, n) => {
              let i = 'public-workspace' === e.pathname.split('/')[1];
              return i ? r(a, n) : t(a, n);
            },
            [t, r, e.pathname]
          );
        return {
          jumpToPage: t,
          jumpToPublicWorkspacePage: r,
          jumpToSubPath: a,
          openPage: l,
        };
      }
      ((a = n || (n = {})).REPLACE = 'replace'), (a.PUSH = 'push');
    },
    8183: function (e, t, r) {
      'use strict';
      r.d(t, {
        D7: function () {
          return B;
        },
        G6: function () {
          return eW;
        },
        Rf: function () {
          return F;
        },
        LK: function () {
          return ei;
        },
        ng: function () {
          return eo;
        },
        AD: function () {
          return e2;
        },
        no: function () {
          return b;
        },
        $X: function () {
          return y;
        },
        NC: function () {
          return e3;
        },
        tN: function () {
          return eQ;
        },
        ri: function () {
          return e$;
        },
      });
      var a = r(52903),
        n = r(57670),
        i = r(72013),
        l = r(31921),
        o = r(47746),
        c = r(38157),
        s = r(37565),
        d = r(10760),
        u = r(67089),
        p = r(23094),
        h = r(2784),
        f = r(45997);
      let m = (0, h.forwardRef)((e, t) => {
        let { active: r, onClick: n, ...o } = e,
          c = (0, i.X)();
        return (0, a.tZ)(s.u, {
          content: r ? c.Favorited() : c.Favorite(),
          placement: 'top-start',
          children: (0, a.tZ)(s.hU, {
            ref: t,
            iconSize: [20, 20],
            style: {
              color: r
                ? 'var(--affine-primary-color)'
                : 'var(--affine-icon-color)',
            },
            onClick: e => {
              e.stopPropagation(), null == n || n(e);
            },
            ...o,
            children: r
              ? (0, a.tZ)(l.FavoritedIcon, { 'data-testid': 'favorited-icon' })
              : (0, a.tZ)(l.FavoriteIcon, {}),
          }),
        });
      });
      m.displayName = 'FavoriteTag';
      var g = r(656),
        v = r(92987);
      let b = (0, f.zo)('div')(e => {
        let { theme: t } = e;
        return {
          height: '100%',
          padding: '0 32px 180px 32px',
          maxWidth: '100%',
          overflowY: 'scroll',
          [t.breakpoints.down('sm')]: {
            padding: '52px 0px',
            'tr > td:first-of-type': {
              borderTopLeftRadius: '0px',
              borderBottomLeftRadius: '0px',
            },
            'tr > td:last-of-type': {
              borderTopRightRadius: '0px',
              borderBottomRightRadius: '0px',
            },
          },
        };
      });
      (0, f.zo)('div')(() => ({
        ...(0, f.j2)('flex-start', 'center'),
        a: { color: 'inherit' },
        'a:visited': { color: 'unset' },
        'a:hover': { color: 'var(--affine-primary-color)' },
      }));
      let y = (0, f.zo)('div')(() => ({
          ...(0, f.j2)('flex-start', 'center'),
          color: 'var(--affine-text-primary-color)',
          '>svg': {
            fontSize: '24px',
            marginRight: '12px',
            color: 'var(--affine-icon-color)',
          },
        })),
        Z = (0, f.zo)('div')(() => ({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          width: '100%',
          overflow: 'hidden',
        })),
        k = (0, f.zo)(g.V)(() => ({
          fontWeight: 400,
          fontSize: 'var(--affine-font-xs)',
          maxWidth: '100%',
        })),
        x = (0, f.zo)(v.sh)(() => ({
          cursor: 'pointer',
          '.favorite-button': { visibility: 'hidden' },
          '&:hover': { '.favorite-button': { visibility: 'visible' } },
        })),
        w = h.forwardRef((e, t) => {
          let { icon: r, text: n, desc: i, suffix: l, children: o, ...c } = e,
            d = (0, h.useCallback)(() => {
              let e = (0, a.BX)(a.HY, {
                children: [
                  (0, a.BX)(y, {
                    children: [
                      r,
                      (0, a.BX)(Z, {
                        children: [
                          (0, a.tZ)(s.VY, {
                            ellipsis: !0,
                            maxWidth: '100%',
                            color: 'inherit',
                            fontSize: 'var(--affine-font-sm)',
                            weight: '600',
                            lineHeight: '18px',
                            children: n,
                          }),
                          i &&
                            (0, a.tZ)(k, {
                              ellipsis: !0,
                              color: 'var(--affine-text-secondary-color)',
                              children: i,
                            }),
                        ],
                      }),
                    ],
                  }),
                  l,
                ],
              });
              return o ? o(e) : e;
            }, [i, r, o, l, n]);
          return (0, a.tZ)(s.pj, { ref: t, ...c, children: d() });
        });
      w.displayName = 'TitleCell';
      var C = r(94286);
      let N = (0, s.zo)(s.sN)(e => {
          let { theme: t } = e;
          return {
            div: {
              color: t.palette.error.main,
              svg: { color: t.palette.error.main },
            },
            ':hover': {
              div: {
                color: t.palette.error.main,
                svg: { color: t.palette.error.main },
              },
            },
          };
        }),
        S = e => {
          let { onSelect: t, onItemClick: r, ...n } = e,
            o = (0, i.X)();
          return (0, a.tZ)(a.HY, {
            children: (0, a.tZ)(N, {
              ...n,
              onClick: () => {
                null == r || r(), null == t || t();
              },
              style: { color: 'red' },
              icon: (0, a.tZ)(l.ShareIcon, {}),
              children: o['Disable Public Sharing'](),
            }),
          });
        };
      S.DisablePublicSharingModal = C.Ld;
      var D = r(73939);
      let P = e => {
          let { onSelect: t } = e,
            r = (0, i.X)(),
            n = (0, h.useRef)(),
            { currentEditor: o } = globalThis,
            c = (0, h.useCallback)(() => {
              var e, r;
              if (!o) return;
              let a =
                null !== (r = n.current) && void 0 !== r
                  ? r
                  : (n.current = new D.F(o.page));
              null === (e = window.apis) ||
                void 0 === e ||
                e.export
                  .savePDFFileAs(o.page.root.title.toString())
                  .then(e => {
                    if (void 0 === e) return a.exportPdf();
                  })
                  .then(() => {
                    null == t || t({ type: 'pdf' });
                  })
                  .catch(e => {
                    console.error(e);
                  });
            }, [o, t]);
          return o && 'page' === o.mode
            ? (0, a.tZ)(s.sN, {
                'data-testid': 'export-to-pdf',
                onClick: c,
                icon: (0, a.tZ)(l.ExportToPdfIcon, {}),
                children: r['Export to PDF'](),
              })
            : null;
        },
        X = e => {
          let { onSelect: t } = e,
            r = (0, i.X)(),
            n = (0, h.useRef)(),
            { currentEditor: o } = globalThis,
            c = (0, h.useCallback)(() => {
              o &&
                (n.current || (n.current = new D.F(o.page)),
                n.current.exportHtml().catch(e => {
                  console.error(e);
                }),
                null == t || t({ type: 'html' }));
            }, [t, o]);
          return (0, a.tZ)(a.HY, {
            children: (0, a.tZ)(s.sN, {
              'data-testid': 'export-to-html',
              onClick: c,
              icon: (0, a.tZ)(l.ExportToHtmlIcon, {}),
              children: r['Export to HTML'](),
            }),
          });
        },
        M = e => {
          let { onSelect: t } = e,
            r = (0, i.X)(),
            n = (0, h.useRef)(),
            { currentEditor: o } = globalThis,
            c = (0, h.useCallback)(() => {
              o &&
                (n.current || (n.current = new D.F(o.page)),
                n.current.exportMarkdown().catch(e => {
                  console.error(e);
                }),
                null == t || t({ type: 'markdown' }));
            }, [t, o]);
          return (0, a.tZ)(a.HY, {
            children: (0, a.tZ)(s.sN, {
              'data-testid': 'export-to-markdown',
              onClick: c,
              icon: (0, a.tZ)(l.ExportToMarkdownIcon, {}),
              children: r['Export to Markdown'](),
            }),
          });
        },
        B = e => {
          let { onItemClick: t } = e,
            r = (0, i.X)();
          return (0, a.tZ)(s.v2, {
            width: 248,
            placement: 'left',
            trigger: 'click',
            content: (0, a.BX)(a.HY, {
              children: [(0, a.tZ)(P, {}), (0, a.tZ)(X, {}), (0, a.tZ)(M, {})],
            }),
            children: (0, a.tZ)(s.sN, {
              'data-testid': 'export-menu',
              icon: (0, a.tZ)(l.ExportIcon, {}),
              endIcon: (0, a.tZ)(l.ArrowRightSmallIcon, {}),
              onClick: e => {
                e.stopPropagation(), null == t || t();
              },
              children: r.Export(),
            }),
          });
        },
        F = e => {
          let { onSelect: t, onItemClick: r, ...n } = e,
            o = (0, i.X)();
          return (0, a.tZ)(a.HY, {
            children: (0, a.tZ)(s.sN, {
              ...n,
              onClick: () => {
                null == r || r(), null == t || t();
              },
              icon: (0, a.tZ)(l.DeleteTemporarilyIcon, {}),
              children: o['Move to Trash'](),
            }),
          });
        },
        I = e => {
          let { title: t, ...r } = e,
            n = (0, i.X)();
          return (0, a.tZ)(s.I4, {
            title: n['Delete page?'](),
            content: n['will be moved to Trash']({ title: t || 'Untitled' }),
            confirmText: n.Delete(),
            confirmType: 'danger',
            ...r,
          });
        };
      F.ConfirmModal = I;
      let R = e => {
          let {
              title: t,
              favorite: r,
              isPublic: n,
              onOpenPageInNewTab: o,
              onToggleFavoritePage: c,
              onRemoveToTrash: d,
              onDisablePublicSharing: u,
            } = e,
            p = (0, i.X)(),
            [f, m] = (0, h.useState)(!1),
            [g, v] = (0, h.useState)(!1),
            b = (0, a.BX)(a.HY, {
              children: [
                n &&
                  (0, a.tZ)(S, {
                    'data-testid': 'disable-public-sharing',
                    onItemClick: () => {
                      v(!0);
                    },
                  }),
                (0, a.tZ)(s.sN, {
                  onClick: c,
                  icon: r
                    ? (0, a.tZ)(l.FavoritedIcon, {
                        style: { color: 'var(--affine-primary-color)' },
                      })
                    : (0, a.tZ)(l.FavoriteIcon, {}),
                  children: r
                    ? p['Remove from favorites']()
                    : p['Add to Favorites'](),
                }),
                !environment.isDesktop &&
                  (0, a.tZ)(s.sN, {
                    onClick: o,
                    icon: (0, a.tZ)(l.OpenInNewIcon, {}),
                    children: p['Open in new tab'](),
                  }),
                (0, a.tZ)(F, {
                  'data-testid': 'move-to-trash',
                  onItemClick: () => {
                    m(!0);
                  },
                }),
              ],
            });
          return (0, a.BX)(a.HY, {
            children: [
              (0, a.tZ)(s.A0, {
                alignItems: 'center',
                justifyContent: 'center',
                children: (0, a.tZ)(s.v2, {
                  content: b,
                  placement: 'bottom',
                  disablePortal: !0,
                  trigger: 'click',
                  children: (0, a.tZ)(s.hU, {
                    'data-testid': 'page-list-operation-button',
                    children: (0, a.tZ)(l.MoreVerticalIcon, {}),
                  }),
                }),
              }),
              (0, a.tZ)(F.ConfirmModal, {
                open: f,
                title: t,
                onConfirm: () => {
                  d(), m(!1);
                },
                onClose: () => {
                  m(!1);
                },
                onCancel: () => {
                  m(!1);
                },
              }),
              (0, a.tZ)(S.DisablePublicSharingModal, {
                onConfirmDisable: u,
                open: g,
                onClose: () => {
                  v(!1);
                },
              }),
            ],
          });
        },
        T = e => {
          let { onPermanentlyDeletePage: t, onRestorePage: r } = e,
            n = (0, i.X)(),
            [o, c] = (0, h.useState)(!1);
          return (0, a.BX)(s.A0, {
            children: [
              (0, a.tZ)(s.u, {
                content: n['Restore it'](),
                placement: 'top-start',
                children: (0, a.tZ)(s.hU, {
                  style: { marginRight: '12px' },
                  onClick: () => {
                    r();
                  },
                  children: (0, a.tZ)(l.ResetIcon, {}),
                }),
              }),
              (0, a.tZ)(s.u, {
                content: n['Delete permanently'](),
                placement: 'top-start',
                children: (0, a.tZ)(s.hU, {
                  onClick: () => {
                    c(!0);
                  },
                  children: (0, a.tZ)(l.DeletePermanentlyIcon, {}),
                }),
              }),
              (0, a.tZ)(s.I4, {
                title: n['Delete permanently?'](),
                content: n.TrashButtonGroupDescription(),
                confirmText: n.Delete(),
                confirmType: 'danger',
                open: o,
                onConfirm: () => {
                  t(), c(!1);
                },
                onClose: () => {
                  c(!1);
                },
                onCancel: () => {
                  c(!1);
                },
              }),
            ],
          });
        },
        _ = () => {
          let e = (0, o.Z)(),
            t = (0, c.Z)(e.breakpoints.down(900));
          return t;
        };
      function A(e) {
        let t = new Date();
        return (
          e.getDate() == t.getDate() &&
          e.getMonth() == t.getMonth() &&
          e.getFullYear() == t.getFullYear()
        );
      }
      function E(e) {
        let t = new Date();
        return (
          t.setDate(t.getDate() - 1),
          e.getFullYear() === t.getFullYear() &&
            e.getMonth() === t.getMonth() &&
            e.getDate() === t.getDate()
        );
      }
      function z(e) {
        let t = new Date(),
          r = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 7);
        return e >= r && e < t;
      }
      function O(e) {
        let t = new Date(),
          r = new Date(t.getFullYear(), t.getMonth() - 1, t.getDate());
        return e >= r && e < t;
      }
      let Y = e => {
          let t = (e.getMonth() + 1).toString().padStart(2, '0'),
            r = e.getDate().toString().padStart(2, '0'),
            a = e.getHours().toString().padStart(2, '0'),
            n = e.getMinutes().toString().padStart(2, '0');
          return A(e)
            ? ''.concat(a, ':').concat(n)
            : ''.concat(t, '-').concat(r, ' ').concat(a, ':').concat(n);
        },
        j = e => {
          let { data: t, key: r } = e,
            a = (0, i.X)();
          if (!r) return t.map(e => ({ ...e, groupName: '' }));
          let n = {
              id: 'earlier',
              label: a['com.affine.earlier'](),
              match: e => !0,
            },
            l = [
              { id: 'today', label: a['com.affine.today'](), match: e => A(e) },
              {
                id: 'yesterday',
                label: a['com.affine.yesterday'](),
                match: e => E(e) && !A(e),
              },
              {
                id: 'last7Days',
                label: a['com.affine.last7Days'](),
                match: e => z(e) && !E(e),
              },
              {
                id: 'last30Days',
                label: a['com.affine.last30Days'](),
                match: e => O(e) && !z(e),
              },
              {
                id: 'currentYear',
                label: a['com.affine.currentYear'](),
                match: e =>
                  (function (e) {
                    let t = new Date(),
                      r = new Date(
                        t.getFullYear() - 1,
                        t.getMonth(),
                        t.getDate()
                      );
                    return e >= r && e < t;
                  })(e) && !O(e),
              },
            ];
          return t.map(e => {
            var t;
            let a =
              null !== (t = l.find(t => t.match(e[r]))) && void 0 !== t ? t : n;
            return { ...e, groupName: a.label };
          });
        },
        L = e => {
          let { children: t } = e;
          return (0, a.tZ)(x, {
            children: (0, a.tZ)(d.pj, {
              style: {
                color: 'var(--affine-text-secondary-color)',
                fontSize: 'var(--affine-font-sm)',
                background: 'initial',
                cursor: 'default',
              },
              children: t,
            }),
          });
        },
        W = e => {
          let { isPublicWorkspace: t, data: r, groupKey: n } = e,
            l = (0, i.X)(),
            o = _(),
            c = j({ data: r, key: n });
          return (0, a.tZ)(d.RM, {
            style: { overflowY: 'auto', height: '100%' },
            children: c.map((e, r) => {
              let {
                  groupName: n,
                  pageId: i,
                  title: s,
                  preview: u,
                  icon: p,
                  isPublicPage: f,
                  favorite: g,
                  createDate: v,
                  updatedDate: b,
                  onClickPage: y,
                  bookmarkPage: Z,
                  onOpenPageInNewTab: k,
                  removeToTrash: w,
                  onDisablePublicSharing: C,
                } = e,
                N = s || l.Untitled();
              return (0, a.BX)(
                h.Fragment,
                {
                  children: [
                    n &&
                      (0 === r || c[r - 1].groupName !== n) &&
                      (0, a.tZ)(L, { children: n }),
                    (0, a.BX)(x, {
                      'data-testid': 'page-list-item-'.concat(i),
                      children: [
                        (0, a.tZ)(U, {
                          pageId: i,
                          draggableData: { pageId: i, pageTitle: N, icon: p },
                          icon: p,
                          text: N,
                          desc: u,
                          'data-testid': 'title',
                          onClick: y,
                        }),
                        (0, a.tZ)(d.pj, {
                          'data-testid': 'created-date',
                          ellipsis: !0,
                          hidden: o,
                          onClick: y,
                          style: { fontSize: 'var(--affine-font-xs)' },
                          children: Y(v),
                        }),
                        (0, a.tZ)(d.pj, {
                          'data-testid': 'updated-date',
                          ellipsis: !0,
                          hidden: o,
                          onClick: y,
                          style: { fontSize: 'var(--affine-font-xs)' },
                          children: Y(null != b ? b : v),
                        }),
                        !t &&
                          (0, a.BX)(d.pj, {
                            style: {
                              padding: 0,
                              display: 'flex',
                              justifyContent: 'center',
                              alignItems: 'center',
                              gap: '10px',
                            },
                            'data-testid': 'more-actions-'.concat(i),
                            children: [
                              (0, a.tZ)(m, {
                                className: g ? '' : 'favorite-button',
                                onClick: Z,
                                active: !!g,
                              }),
                              (0, a.tZ)(R, {
                                title: s,
                                favorite: g,
                                isPublic: f,
                                onOpenPageInNewTab: k,
                                onToggleFavoritePage: Z,
                                onRemoveToTrash: w,
                                onDisablePublicSharing: C,
                              }),
                            ],
                          }),
                      ],
                    }),
                  ],
                },
                i
              );
            }),
          });
        },
        H = (0, f.zo)('button')(() => ({
          width: '100%',
          height: '100%',
          display: 'block',
        }));
      function U(e) {
        let { pageId: t, draggableData: r, ...n } = e,
          {
            setNodeRef: i,
            attributes: l,
            listeners: o,
            isDragging: c,
          } = (0, p.O1)({ id: 'page-list-item-title-' + t, data: r });
        return (0, a.tZ)(w, {
          ref: i,
          style: { opacity: c ? 0.5 : 1 },
          ...n,
          children: e => (0, a.tZ)(H, { ...o, ...l, children: e }),
        });
      }
      var V = r(50576),
        K = r(51243);
      r(10115);
      var q = '_1tentw41';
      let J = (0, h.forwardRef)((e, t) => {
        let { left: r, title: n, desc: i, right: l, ...o } = e;
        return (0, a.BX)('div', {
          ref: t,
          className: '_1tentw40',
          ...o,
          children: [
            r && (0, a.tZ)('div', { className: q, children: r }),
            (0, a.BX)('div', {
              className: '_1tentw42',
              children: [
                (0, a.tZ)('div', { children: n }),
                (0, a.tZ)('div', { className: '_1tentw43', children: i }),
              ],
            }),
            l && (0, a.tZ)('div', { className: q, children: l }),
          ],
        });
      });
      J.displayName = 'BlockCard';
      let G = e => {
          let { createNewPage: t, createNewEdgeless: r, importFile: n } = e,
            o = (0, i.X)();
          return (0, a.BX)('div', {
            style: {
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              padding: '8px',
            },
            children: [
              (0, a.tZ)(J, {
                title: o['New Page'](),
                desc: o['com.affine.write_with_a_blank_page'](),
                right: (0, a.tZ)(l.PageIcon, { width: 20, height: 20 }),
                onClick: t,
              }),
              (0, a.tZ)(J, {
                title: o['com.affine.new_edgeless'](),
                desc: o['com.affine.draw_with_a_blank_whiteboard'](),
                right: (0, a.tZ)(l.EdgelessIcon, { width: 20, height: 20 }),
                onClick: r,
              }),
              (0, a.tZ)(J, {
                title: o['com.affine.new_import'](),
                desc: o['com.affine.import_file'](),
                right: (0, a.tZ)(l.ImportIcon, { width: 20, height: 20 }),
                onClick: n,
              }),
            ],
          });
        },
        $ = e => {
          let { createNewPage: t, createNewEdgeless: r, importFile: n } = e,
            l = (0, i.X)(),
            [o, c] = (0, h.useState)(!1);
          return (0, a.tZ)(K.v, {
            visible: o,
            placement: 'bottom-end',
            trigger: ['click'],
            disablePortal: !0,
            onClickAway: () => {
              c(!1);
            },
            menuStyles: { padding: '0px' },
            content: (0, a.tZ)(G, {
              createNewPage: () => {
                t(), c(!1);
              },
              createNewEdgeless: () => {
                r(), c(!1);
              },
              importFile: () => {
                n(), c(!1);
              },
            }),
            children: (0, a.tZ)(V.P, {
              onClick: () => {
                t(), c(!1);
              },
              onClickDropDown: () => c(!o),
              children: l['New Page'](),
            }),
          });
        },
        Q = e => {
          let {
              isPublicWorkspace: t,
              createNewPage: r,
              createNewEdgeless: n,
              importFile: l,
            } = e,
            o = (0, i.X)();
          return (0, a.tZ)(s.ss, {
            children: (0, a.BX)(s.U8, {
              children: [
                (0, a.tZ)(s.pj, { proportion: 0.8, children: o.Title() }),
                !t &&
                  (0, a.tZ)(s.pj, {
                    children: (0, a.tZ)('div', {
                      style: {
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                      },
                      children: (0, a.tZ)($, {
                        createNewPage: r,
                        createNewEdgeless: n,
                        importFile: l,
                      }),
                    }),
                  }),
              ],
            }),
          });
        },
        ee = e => {
          let {
            list: t,
            isPublicWorkspace: r,
            createNewPage: n,
            createNewEdgeless: i,
            importFile: l,
          } = e;
          return (0, a.tZ)(b, {
            children: (0, a.BX)(s.iA, {
              children: [
                (0, a.tZ)(Q, {
                  isPublicWorkspace: r,
                  createNewPage: n,
                  createNewEdgeless: i,
                  importFile: l,
                }),
                (0, a.tZ)(W, {
                  isPublicWorkspace: r,
                  data: t,
                  groupKey: 'updatedDate',
                }),
              ],
            }),
          });
        },
        et = e => {
          let { list: t } = e,
            r = (0, i.X)(),
            n = t.map((e, t) => {
              let { pageId: n, title: i, icon: l, onClickPage: o } = e;
              return (0, a.tZ)(
                x,
                {
                  'data-testid': 'page-list-item-'.concat(n),
                  children: (0, a.tZ)(s.pj, {
                    onClick: o,
                    children: (0, a.BX)(y, {
                      children: [
                        l,
                        (0, a.tZ)(s.VY, {
                          ellipsis: !0,
                          color: 'inherit',
                          children: i || r.Untitled(),
                        }),
                      ],
                    }),
                  }),
                },
                ''.concat(n, '-').concat(t)
              );
            });
          return (0, a.tZ)(b, {
            children: (0, a.tZ)(s.iA, {
              children: (0, a.tZ)(s.RM, { children: n }),
            }),
          });
        },
        er = (e, t, r) => {
          let a = t[e.key],
            n = r[e.key],
            i = 'desc' === e.order,
            l = i ? -1 : 1;
          return 'string' == typeof a && 'string' == typeof n
            ? a.localeCompare(n) * l
            : 'number' == typeof a && 'number' == typeof n
            ? a - n * l
            : a instanceof Date && n instanceof Date
            ? (a.getTime() - n.getTime()) * l
            : a
            ? n
              ? (console.warn(
                  'Unsupported sorting type! Please use custom sorting function.',
                  a,
                  n
                ),
                0)
              : 1 * l
            : -1 * l;
        },
        ea = e => {
          let { data: t, ...r } = e,
            [a, n] = (0, h.useState)({ ...r, order: 'none' }),
            i =
              'none' === a.order
                ? { key: r.key, order: r.order }
                : { key: a.key, order: a.order },
            l = (e, t) => er(i, e, t),
            o = t.sort(l),
            c = e => {
              let t = ['asc', 'desc', 'none'];
              if (e && e !== a.key) {
                n({ ...a, key: e, order: t[0] });
                return;
              }
              n({ ...a, order: t[(t.indexOf(a.order) + 1) % t.length] });
            };
          return {
            data: o,
            order: a.order,
            key: 'none' !== a.order ? a.key : null,
            updateSorter: e => n({ ...a, ...e }),
            shiftOrder: c,
            resetSorter: () => n(r),
          };
        },
        en = e => {
          let {
              isPublicWorkspace: t,
              sorter: r,
              createNewPage: n,
              createNewEdgeless: o,
              importFile: c,
            } = e,
            d = (0, i.X)(),
            u = [
              { key: 'title', content: d.Title(), proportion: 0.5 },
              { key: 'createDate', content: d.Created(), proportion: 0.2 },
              { key: 'updatedDate', content: d.Updated(), proportion: 0.2 },
              {
                key: 'unsortable_action',
                content: (0, a.tZ)($, {
                  createNewPage: n,
                  createNewEdgeless: o,
                  importFile: c,
                }),
                showWhen: () => !t,
                sortable: !1,
                styles: { justifyContent: 'flex-end' },
              },
            ];
          return (0, a.tZ)(s.ss, {
            children: (0, a.tZ)(s.U8, {
              children: u
                .filter(e => {
                  let { showWhen: t = () => !0 } = e;
                  return t();
                })
                .map(e => {
                  let {
                    key: t,
                    content: n,
                    proportion: i,
                    sortable: o = !0,
                    styles: c,
                  } = e;
                  return (0, a.tZ)(
                    s.pj,
                    {
                      proportion: i,
                      active: r.key === t,
                      onClick: o ? () => r.shiftOrder(t) : void 0,
                      children: (0, a.BX)('div', {
                        style: { display: 'flex', alignItems: 'center', ...c },
                        children: [
                          n,
                          r.key === t &&
                            ('asc' === r.order
                              ? (0, a.tZ)(l.ArrowUpBigIcon, {
                                  width: 24,
                                  height: 24,
                                })
                              : (0, a.tZ)(l.ArrowDownBigIcon, {
                                  width: 24,
                                  height: 24,
                                })),
                        ],
                      }),
                    },
                    t
                  );
                }),
            }),
          });
        },
        ei = e => {
          let {
              isPublicWorkspace: t = !1,
              list: r,
              onCreateNewPage: i,
              onCreateNewEdgeless: l,
              onImportFile: o,
              fallback: c,
            } = e,
            d = ea({ data: r, key: n.Co, order: 'desc' }),
            [p, h] = (0, u.R)(),
            f = _();
          if (f)
            return (0, a.tZ)(ee, {
              isPublicWorkspace: t,
              createNewPage: i,
              createNewEdgeless: l,
              importFile: o,
              list: d.data,
            });
          let m =
            'createDate' === d.key || 'updatedDate' === d.key
              ? d.key
              : d.key
              ? void 0
              : n.Co;
          return (0, a.BX)(b, {
            ref: h,
            children: [
              (0, a.BX)(s.iA, {
                showBorder: p,
                style: { maxHeight: '100%' },
                children: [
                  (0, a.tZ)(en, {
                    isPublicWorkspace: t,
                    sorter: d,
                    createNewPage: i,
                    createNewEdgeless: l,
                    importFile: o,
                  }),
                  (0, a.tZ)(W, {
                    isPublicWorkspace: t,
                    groupKey: m,
                    data: d.data,
                  }),
                ],
              }),
              0 === d.data.length && c ? c : null,
            ],
          });
        },
        el = () => {
          let e = (0, i.X)();
          return (0, a.tZ)(s.ss, {
            children: (0, a.BX)(s.U8, {
              children: [
                (0, a.tZ)(s.pj, { proportion: 0.5, children: e.Title() }),
                (0, a.tZ)(s.pj, { proportion: 0.2, children: e.Created() }),
                (0, a.tZ)(s.pj, {
                  proportion: 0.2,
                  children: e['Moved to Trash'](),
                }),
                (0, a.tZ)(s.pj, { proportion: 0.1 }),
              ],
            }),
          });
        },
        eo = e => {
          let { list: t, fallback: r } = e,
            n = (0, i.X)(),
            l = (0, o.Z)(),
            [p, h] = (0, u.R)(),
            f = (0, c.Z)(l.breakpoints.down('sm'));
          if (f) {
            let e = t.map(e => {
              let { pageId: t, icon: r, title: a, onClickPage: n } = e;
              return { title: a, icon: r, pageId: t, onClickPage: n };
            });
            return (0, a.tZ)(et, { list: e });
          }
          let m = t.map((e, t) => {
            let {
              pageId: r,
              title: i,
              preview: l,
              icon: o,
              createDate: c,
              trashDate: u,
              onClickPage: p,
              onPermanentlyDeletePage: h,
              onRestorePage: f,
            } = e;
            return (0, a.BX)(
              d.sh,
              {
                'data-testid': 'page-list-item-'.concat(r),
                children: [
                  (0, a.tZ)(w, {
                    icon: o,
                    text: i || n.Untitled(),
                    desc: l,
                    onClick: p,
                  }),
                  (0, a.tZ)(s.pj, { onClick: p, children: Y(c) }),
                  (0, a.tZ)(s.pj, { onClick: p, children: u ? Y(u) : '--' }),
                  (0, a.tZ)(s.pj, {
                    style: { padding: 0 },
                    'data-testid': 'more-actions-'.concat(r),
                    children: (0, a.tZ)(T, {
                      onPermanentlyDeletePage: h,
                      onRestorePage: f,
                      onOpenPage: p,
                    }),
                  }),
                ],
              },
              ''.concat(r, '-').concat(t)
            );
          });
          return (0, a.BX)(b, {
            ref: h,
            children: [
              (0, a.BX)(s.iA, {
                showBorder: p,
                children: [(0, a.tZ)(el, {}), (0, a.tZ)(s.RM, { children: m })],
              }),
              0 === t.length && r ? r : null,
            ],
          });
        };
      var ec = r(28879),
        es = r.n(ec),
        ed = r(46097);
      r(85954);
      var eu = r(87612);
      let ep = e => ({ type: 'union', title: 'union', list: e }),
        eh = e => ({ type: 'array', title: 'array', ele: e }),
        ef = e => {
          var t;
          return {
            type: 'function',
            title: 'function',
            typeVars: null !== (t = e.typeVars) && void 0 !== t ? t : [],
            args: e.args,
            rt: e.rt,
          };
        };
      class em {
        create(e) {
          return { type: 'data', name: this.config.name, data: e };
        }
        is(e) {
          return 'data' === e.type && e.name === this.config.name;
        }
        isByName(e) {
          return e === this.config.name;
        }
        isSubOf(e) {
          return !!this.is(e) || this.config.supers.some(t => t.isSubOf(e));
        }
        isSubOfByName(e) {
          return (
            !!this.isByName(e) ||
            this.config.supers.some(t => t.isSubOfByName(e))
          );
        }
        isSuperOf(e) {
          let t = this.dataMap.get(e.name);
          if (!t) throw Error('bug');
          return t.isSubOfByName(this.config.name);
        }
        constructor(e, t) {
          (0, eu._)(this, 'config', void 0),
            (0, eu._)(this, 'dataMap', void 0),
            (this.config = e),
            (this.dataMap = t);
        }
      }
      let eg = function () {
          for (var e = arguments.length, t = Array(e), r = 0; r < e; r++)
            t[r] = arguments[r];
          return {
            create: e => ({ name: e, supers: t }),
            extends: e => eg(...t, e),
          };
        },
        ev = eg(),
        eb = new (class {
          defineData(e) {
            let t = new em(e, this.dataMap);
            return this.dataMap.set(e.name, t), t;
          }
          isDataType(e) {
            return 'data' === e.type;
          }
          isSubtype(e, t, r) {
            if ('typeRef' === e.type)
              return r && 'typeRef' != t.type && (r[e.name] = t), !0;
            if ('typeRef' === t.type) return r && (r[t.name] = e), !0;
            if (ey.is(e)) return !0;
            if ('union' === e.type)
              return e.list.some(e => this.isSubtype(e, t, r));
            if ('union' === t.type)
              return t.list.every(t => this.isSubtype(e, t, r));
            if (this.isDataType(t)) {
              let r = this.dataMap.get(t.name);
              if (!r) throw Error('bug');
              return !!this.isDataType(e) && r.isSubOf(e);
            }
            return (
              ('array' === e.type || 'array' === t.type) &&
              'array' === e.type &&
              'array' === t.type &&
              this.isSubtype(e.ele, t.ele, r)
            );
          }
          subst(e, t) {
            let r = t => {
                if (this.isDataType(t)) return t;
                switch (t.type) {
                  case 'typeRef':
                    return { ...e[t.name] };
                  case 'union':
                    return ep(t.list.map(e => r(e)));
                  case 'array':
                    return eh(r(t.ele));
                  case 'function':
                    throw Error('TODO');
                }
              },
              a = ef({ args: t.args.map(e => r(e)), rt: r(t.rt) });
            return a;
          }
          instance(e, t, r, a) {
            let n = { ...e };
            return (
              a.args.forEach((e, r) => {
                let a = t[r];
                a && this.isSubtype(e, a, n);
              }),
              this.isSubtype(r, a.rt),
              this.subst(n, a)
            );
          }
          constructor() {
            (0, eu._)(this, 'dataMap', new Map());
          }
        })(),
        ey = eb.defineData(ev.create('Unknown'));
      eb.defineData(ev.create('Number')), eb.defineData(ev.create('String'));
      let eZ = eb.defineData(ev.create('Boolean')),
        ek = eb.defineData(ev.create('Date'));
      class ex {
        register(e, t) {
          this.list.push({ type: e, data: t });
        }
        match(e) {
          var t;
          let r =
            null !== (t = this._match) && void 0 !== t
              ? t
              : eb.isSubtype.bind(eb);
          for (let t of this.list) if (r(t.type, e)) return t.data;
        }
        allMatched(e) {
          var t;
          let r =
              null !== (t = this._match) && void 0 !== t
                ? t
                : eb.isSubtype.bind(eb),
            a = [];
          for (let t of this.list) r(t.type, e) && a.push(t);
          return a;
        }
        allMatchedData(e) {
          return this.allMatched(e).map(e => e.data);
        }
        findData(e) {
          var t;
          return null === (t = this.list.find(t => e(t.data))) || void 0 === t
            ? void 0
            : t.data;
        }
        find(e) {
          return this.list.find(e);
        }
        all() {
          return this.list;
        }
        constructor(e) {
          (0, eu._)(this, '_match', void 0),
            (0, eu._)(this, 'list', void 0),
            (this._match = e),
            (this.list = []);
        }
      }
      let ew = {
          Created: { type: ek.create(), icon: (0, a.tZ)(l.DateTimeIcon, {}) },
          Updated: { type: ek.create(), icon: (0, a.tZ)(l.DateTimeIcon, {}) },
          'Is Favourited': {
            type: eZ.create(),
            icon: (0, a.tZ)(l.FavoritedIcon, {}),
          },
        },
        eC = Object.entries(ew).map(e => {
          let [t, r] = e;
          return { name: t, type: r.type, icon: r.icon };
        }),
        eN = e => {
          let t = eP.match(e.type);
          if (!t) throw Error('No matching function found');
          return {
            type: 'filter',
            left: { type: 'ref', name: e.name },
            funcName: t.name,
            args: t.defaultArgs().map(e => ({ type: 'literal', value: e })),
          };
        },
        eS = e => {
          let { value: t, onChange: r } = e;
          return (0, a.tZ)(eD, {
            selected: t,
            onSelect: e => {
              r([...t, e]);
            },
          });
        },
        eD = e => {
          let { onSelect: t } = e;
          return (0, a.BX)('div', {
            'data-testid': 'variable-select',
            children: [
              (0, a.tZ)('div', { className: '_1ovmub21', children: 'Filter' }),
              (0, a.tZ)('div', { className: '_1ovmub22' }),
              eC.map(e =>
                (0, a.tZ)(
                  ed.sN,
                  {
                    icon: ew[e.name].icon,
                    onClick: () => {
                      t(eN(e));
                    },
                    className: '_1ovmub20',
                    children: (0, a.tZ)('div', {
                      'data-testid': 'variable-select-item',
                      className: '_1ovmub23',
                      children: e.name,
                    }),
                  },
                  e.name
                )
              ),
            ],
          });
        },
        eP = new ex((e, t) => {
          var r, a;
          let n = eb.subst(
              Object.fromEntries(
                null !==
                  (a =
                    null === (r = e.typeVars) || void 0 === r
                      ? void 0
                      : r.map(e => [e.name, e.bound])) && void 0 !== a
                  ? a
                  : []
              ),
              e
            ),
            i = n.args[0];
          return i && eb.isSubtype(i, t);
        });
      eP.register(ef({ args: [eZ.create(), eZ.create()], rt: eZ.create() }), {
        name: 'is',
        defaultArgs: () => [!0],
        impl: (e, t) => e == t,
      }),
        eP.register(ef({ args: [ek.create(), ek.create()], rt: eZ.create() }), {
          name: 'after',
          defaultArgs: () => [es()().subtract(1, 'day').endOf('day').valueOf()],
          impl: (e, t) => {
            if ('number' != typeof e || 'number' != typeof t)
              throw Error('argument type error');
            return es()(e).isAfter(es()(t).endOf('day'));
          },
        }),
        eP.register(ef({ args: [ek.create(), ek.create()], rt: eZ.create() }), {
          name: 'before',
          defaultArgs: () => [es()().endOf('day').valueOf()],
          impl: (e, t) => {
            if ('number' != typeof e || 'number' != typeof t)
              throw Error('argument type error');
            return es()(e).isBefore(es()(t).startOf('day'));
          },
        });
      let eX = (e, t) => t[e.name],
        eM = e => e.value,
        eB = (e, t) => {
          var r;
          let a =
            null === (r = eP.findData(t => t.name === e.funcName)) ||
            void 0 === r
              ? void 0
              : r.impl;
          if (!a) throw Error('No function implementation found');
          let n = eX(e.left, t),
            i = e.args.map(eM);
          return a(n, ...i);
        },
        eF = (e, t) => e.every(e => eB(e, t));
      var eI = r(37726),
        eR = r.n(eI);
      r(70760);
      var eT = 'xis01s7',
        e_ = 'xis01s8';
      let eA = [
          'January',
          'February',
          'March',
          'April',
          'May',
          'June',
          'July',
          'August',
          'September',
          'October',
          'November',
          'December',
        ],
        eE = e => {
          let { value: t, onChange: r } = e,
            [n, i] = (0, h.useState)(!1),
            [o, c] = (0, h.useState)(t ? es()(t).toDate() : null),
            s = (0, h.useCallback)(() => {
              i(!0);
            }, []),
            d = (0, h.useCallback)(() => {
              i(!1);
            }, []),
            u = e => {
              e && (c(e), r(es()(e).format('YYYY-MM-DD')), i(!1));
            },
            p = e => {
              let {
                  date: t,
                  decreaseMonth: r,
                  increaseMonth: n,
                  prevMonthButtonDisabled: i,
                  nextMonthButtonDisabled: o,
                } = e,
                c = es()(t).year(),
                d = es()(t).month();
              return (0, a.BX)('div', {
                className: 'xis01s2',
                children: [
                  (0, a.tZ)('div', {
                    'data-testid': 'date-picker-current-month',
                    className: 'xis01s6',
                    children: eA[d],
                  }),
                  (0, a.tZ)('div', {
                    'data-testid': 'date-picker-current-year',
                    className: 'xis01s5',
                    children: c,
                  }),
                  (0, a.tZ)('div', {
                    'data-testid': 'month-picker-button',
                    className: 'xis01sc',
                    onClick: s,
                    children: (0, a.tZ)(l.ArrowDownSmallIcon, {}),
                  }),
                  (0, a.tZ)('button', {
                    'data-testid': 'date-picker-prev-button',
                    className: eT,
                    onClick: r,
                    disabled: i,
                    children: (0, a.tZ)(l.ArrowLeftSmallIcon, {}),
                  }),
                  (0, a.tZ)('button', {
                    'data-testid': 'date-picker-next-button',
                    className: e_,
                    onClick: n,
                    disabled: o,
                    children: (0, a.tZ)(l.ArrowRightSmallIcon, {}),
                  }),
                ],
              });
            },
            f = e => {
              let {
                  date: t,
                  decreaseYear: r,
                  increaseYear: n,
                  prevYearButtonDisabled: i,
                  nextYearButtonDisabled: o,
                } = e,
                c = es()(t).year();
              return (0, a.BX)('div', {
                className: 'xis01s3',
                children: [
                  (0, a.tZ)('div', {
                    'data-testid': 'month-picker-current-year',
                    className: 'xis01s4',
                    children: c,
                  }),
                  (0, a.tZ)('button', {
                    'data-testid': 'month-picker-prev-button',
                    className: eT,
                    onClick: r,
                    disabled: i,
                    children: (0, a.tZ)(l.ArrowLeftSmallIcon, {}),
                  }),
                  (0, a.tZ)('button', {
                    'data-testid': 'month-picker-next-button',
                    className: e_,
                    onClick: n,
                    disabled: o,
                    children: (0, a.tZ)(l.ArrowRightSmallIcon, {}),
                  }),
                ],
              });
            };
          return (0, a.tZ)(eR(), {
            onClickOutside: d,
            className: 'xis01s0',
            calendarClassName: 'xis01sa',
            weekDayClassName: () => 'xis01s9',
            dayClassName: () => 'xis01sb',
            popperClassName: 'xis01s1',
            monthClassName: () => 'xis01sd',
            selected: o,
            onChange: u,
            showPopperArrow: !1,
            dateFormat: 'MMM dd',
            showMonthYearPicker: n,
            shouldCloseOnSelect: !n,
            renderCustomHeader: e => {
              let {
                date: t,
                decreaseYear: r,
                increaseYear: a,
                decreaseMonth: i,
                increaseMonth: l,
                prevYearButtonDisabled: o,
                nextYearButtonDisabled: c,
                prevMonthButtonDisabled: s,
                nextMonthButtonDisabled: d,
              } = e;
              return n
                ? f({
                    date: t,
                    decreaseYear: r,
                    increaseYear: a,
                    prevYearButtonDisabled: o,
                    nextYearButtonDisabled: c,
                  })
                : p({
                    date: t,
                    decreaseMonth: i,
                    increaseMonth: l,
                    prevMonthButtonDisabled: s,
                    nextMonthButtonDisabled: d,
                  });
            },
          });
        },
        ez = new ex((e, t) => eb.isSubtype(e, t));
      ez.register(eZ.create(), {
        render: e => {
          var t;
          let { value: r, onChange: n } = e;
          return (0, a.tZ)('div', {
            className: '_1ovmub26',
            style: { cursor: 'pointer' },
            onClick: () => {
              n({ type: 'literal', value: !r.value });
            },
            children:
              null === (t = r.value) || void 0 === t ? void 0 : t.toString(),
          });
        },
      }),
        ez.register(ek.create(), {
          render: e => {
            let { value: t, onChange: r } = e;
            return (0, a.tZ)(eE, {
              value: es()(t.value).format('YYYY-MM-DD'),
              onChange: e => {
                r({ type: 'literal', value: es()(e, 'YYYY-MM-DD').valueOf() });
              },
            });
          },
        });
      let eO = e => {
          var t;
          let { value: r, onChange: n } = e,
            i = (0, h.useMemo)(
              () => eP.find(e => e.data.name === r.funcName),
              [r.funcName]
            );
          if (!i) return null;
          let l =
            null !== (t = i.data.render) && void 0 !== t
              ? t
              : e => {
                  let { ast: t } = e,
                    l = eL(r, n, i.type);
                  return (0, a.BX)('div', {
                    style: {
                      display: 'flex',
                      userSelect: 'none',
                      alignItems: 'center',
                    },
                    children: [
                      (0, a.tZ)(ed.v2, {
                        trigger: 'click',
                        content: (0, a.tZ)(eD, { selected: [], onSelect: n }),
                        children: (0, a.BX)('div', {
                          'data-testid': 'variable-name',
                          className: '_1ovmub28',
                          children: [
                            (0, a.tZ)('div', {
                              className: '_1ovmub29',
                              children: ew[t.left.name].icon,
                            }),
                            (0, a.tZ)('div', { children: t.left.name }),
                          ],
                        }),
                      }),
                      (0, a.tZ)(ed.v2, {
                        trigger: 'click',
                        content: (0, a.tZ)(eY, { value: r, onChange: n }),
                        children: (0, a.tZ)('div', {
                          className: '_1ovmub27',
                          'data-testid': 'filter-name',
                          children: t.funcName,
                        }),
                      }),
                      l,
                    ],
                  });
                };
          return (0, a.tZ)(a.HY, { children: l({ ast: r }) });
        },
        eY = e => {
          let { value: t, onChange: r } = e,
            n = (0, h.useMemo)(() => {
              var e;
              let r =
                null === (e = eC.find(e => e.name === t.left.name)) ||
                void 0 === e
                  ? void 0
                  : e.type;
              return r ? eP.allMatchedData(r) : [];
            }, [t.left.name]);
          return (0, a.tZ)('div', {
            'data-testid': 'filter-name-select',
            children: n.map(e =>
              (0, a.tZ)(
                ed.sN,
                {
                  onClick: () => {
                    r({
                      ...t,
                      funcName: e.name,
                      args: e
                        .defaultArgs()
                        .map(e => ({ type: 'literal', value: e })),
                    });
                  },
                  children: e.name,
                },
                e.name
              )
            ),
          });
        },
        ej = e => {
          let { type: t, value: r, onChange: n } = e,
            i = (0, h.useMemo)(() => ez.match(t), [t]);
          return i
            ? (0, a.tZ)('div', {
                'data-testid': 'filter-arg',
                style: { marginLeft: 4, fontWeight: 600 },
                children: i.render({ type: t, value: r, onChange: n }),
              })
            : null;
        },
        eL = (e, t, r) => {
          let n = r.args.slice(1);
          return n.map((r, n) => {
            let i = e.args[n];
            return (0, a.tZ)(
              ej,
              {
                type: r,
                value: i,
                onChange: r => {
                  let a = e.args.map((e, t) => (n === t ? r : e));
                  t({ ...e, args: a });
                },
              },
              n
            );
          });
        },
        eW = e => {
          let { value: t, onChange: r } = e;
          return (0, a.BX)('div', {
            style: { display: 'flex', flexWrap: 'wrap' },
            children: [
              t.map((e, n) =>
                (0, a.BX)(
                  'div',
                  {
                    className: '_1ovmub24',
                    children: [
                      (0, a.tZ)(eO, {
                        value: e,
                        onChange: e => {
                          r(t.map((t, r) => (r === n ? e : t)));
                        },
                      }),
                      (0, a.tZ)('div', {
                        className: '_1ovmub25',
                        onClick: () => {
                          r(t.filter((e, t) => n !== t));
                        },
                        children: (0, a.tZ)(l.CloseIcon, {}),
                      }),
                    ],
                  },
                  n
                )
              ),
              (0, a.tZ)(s.v2, {
                trigger: 'click',
                content: (0, a.tZ)(eS, { value: t, onChange: r }),
                children: (0, a.tZ)('div', {
                  style: {
                    cursor: 'pointer',
                    padding: 4,
                    marginLeft: 4,
                    display: 'flex',
                    alignItems: 'center',
                  },
                  children: (0, a.tZ)(l.PlusIcon, {}),
                }),
              }),
            ],
          });
        };
      var eH = r(55389),
        eU = r(752),
        eV = r(87809),
        eK = r(2303),
        eq = r(15865);
      let eJ = (0, eH.X3)('page-view', 1, {
          upgrade(e) {
            e.createObjectStore('view', { keyPath: 'id' });
          },
        }),
        eG = (0, eV.rw)({ name: 'default', id: eq.Z, filterList: [] }),
        e$ = () => {
          let { data: e, mutate: t } = (0, eK.Z)(['affine', 'page-view'], {
              fetcher: async () => {
                let e = await eJ,
                  t = e.transaction('view').objectStore('view');
                return await t.getAll();
              },
              suspense: !0,
              fallbackData: [],
              revalidateOnMount: !0,
            }),
            [r, a] = (0, eU.KO)(eG),
            n = (0, h.useCallback)(
              async e => {
                if (e.id === eq.Z) return;
                let r = await eJ,
                  a = r.transaction('view', 'readwrite').objectStore('view');
                await a.put(e), await t();
              },
              [t]
            );
          return {
            currentView: r,
            savedViews: e,
            createView: n,
            setCurrentView: a,
          };
        },
        eQ = (e, t) => eF(e, t);
      var e0 = r(13246);
      r(56142);
      let e1 = e => {
          let { init: t, onConfirm: r, onCancel: n } = e,
            [i, l] = (0, h.useState)({
              name: '',
              filterList: t,
              id: (0, e0.k$)(),
            });
          return (0, a.BX)('div', {
            children: [
              (0, a.tZ)('div', {
                className: 'i6ppfa8',
                children: 'Save As New View',
              }),
              (0, a.tZ)('div', {
                style: {
                  backgroundColor: 'var(--affine-hover-color)',
                  borderRadius: 8,
                  padding: 20,
                  marginTop: 20,
                },
                children: (0, a.tZ)(eW, {
                  value: i.filterList,
                  onChange: e => l({ ...i, filterList: e }),
                }),
              }),
              (0, a.tZ)('div', {
                style: { marginTop: 20 },
                children: (0, a.tZ)(s.II, {
                  placeholder: 'Untitled View',
                  value: i.name,
                  onChange: e => l({ ...i, name: e }),
                }),
              }),
              (0, a.BX)('div', {
                style: {
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginTop: 40,
                },
                children: [
                  (0, a.tZ)(s.zx, {
                    className: 'i6ppfa7',
                    onClick: n,
                    children: 'Cancel',
                  }),
                  (0, a.tZ)(s.zx, {
                    style: { marginLeft: 20, borderRadius: '8px' },
                    type: 'primary',
                    onClick: () => {
                      i.name.trim().length > 0 && r(i);
                    },
                    children: 'Create',
                  }),
                ],
              }),
            ],
          });
        },
        e2 = e => {
          let { init: t, onConfirm: r } = e,
            [n, i] = (0, h.useState)(!1);
          return (0, a.BX)(a.HY, {
            children: [
              (0, a.tZ)(s.zx, {
                className: 'i6ppfa3',
                onClick: () => i(!0),
                size: 'middle',
                children: (0, a.BX)('div', {
                  className: 'i6ppfa4',
                  children: [
                    (0, a.tZ)('div', {
                      className: 'i6ppfa5',
                      children: (0, a.tZ)(l.SaveIcon, {}),
                    }),
                    (0, a.tZ)('div', {
                      className: 'i6ppfa6',
                      children: 'Save View',
                    }),
                  ],
                }),
              }),
              (0, a.tZ)(s.u_, {
                open: n,
                onClose: () => i(!1),
                children: (0, a.BX)(s.AB, {
                  width: 560,
                  style: {
                    padding: '40px',
                    background: 'var(--affine-background-primary-color)',
                  },
                  children: [
                    (0, a.tZ)(s.ol, {
                      top: 12,
                      right: 12,
                      onClick: () => i(!1),
                      hoverColor: 'var(--affine-icon-color)',
                    }),
                    (0, a.tZ)(e1, {
                      init: t,
                      onCancel: () => i(!1),
                      onConfirm: e => {
                        r(e), i(!1);
                      },
                    }),
                  ],
                }),
              }),
            ],
          });
        };
      var e4 = r(6277),
        e8 = r(90301);
      let e3 = e => {
        let { setting: t } = e,
          [r] = (0, eU.KO)(e8.Hw);
        return (0, a.BX)('div', {
          style: { marginLeft: 4, display: 'flex', alignItems: 'center' },
          children: [
            t.savedViews.length > 0 &&
              (0, a.tZ)(K.Z, {
                trigger: 'click',
                content: (0, a.tZ)('div', {
                  children: t.savedViews.map(e =>
                    (0, a.tZ)(
                      s.sN,
                      { onClick: () => t.setCurrentView(e), children: e.name },
                      e.id
                    )
                  ),
                }),
                children: (0, a.tZ)(s.zx, {
                  style: { marginRight: 12, cursor: 'pointer' },
                  children: t.currentView.name,
                }),
              }),
            (0, a.tZ)(K.Z, {
              trigger: 'click',
              placement: 'bottom-start',
              content: (0, a.tZ)(eS, {
                value: t.currentView.filterList,
                onChange: e => {
                  t.setCurrentView(t => ({ ...t, filterList: e }));
                },
              }),
              children: (0, a.tZ)(s.zx, {
                icon: (0, a.tZ)(l.FilteredIcon, {}),
                className: (0, e4.Z)('i6ppfa0', { i6ppfa1: !r }),
                size: 'small',
                hoverColor: 'var(--affine-icon-color)',
                children: 'Filter',
              }),
            }),
          ],
        });
      };
    },
    94286: function (e, t, r) {
      'use strict';
      r.d(t, {
        Ld: function () {
          return p;
        },
        ve: function () {
          return H;
        },
      });
      var a = r(52903),
        n = r(72013),
        i = r(37565);
      let l = (0, i.zo)('div')(() => ({
          position: 'relative',
          padding: '0px',
          width: '560px',
          background: 'var(--affine-white)',
          borderRadius: '12px',
        })),
        o = (0, i.zo)('div')(() => ({
          margin: '44px 0px 12px 0px',
          width: '560px',
          fontWeight: '600',
          fontSize: 'var(--affine-font-h6)',
          textAlign: 'center',
        })),
        c = (0, i.zo)('div')(() => ({
          margin: 'auto',
          width: '560px',
          padding: '0px 84px',
          fontWeight: '400',
          fontSize: 'var(--affine-font-base)',
          textAlign: 'center',
        })),
        s = (0, i.zo)('div')(() => ({
          margin: '32px 0',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
        })),
        d = (0, i.zo)(i.Av)(() => ({
          color: 'var(--affine-primary-color)',
          height: '32px',
          background: '#F3F0FF',
          border: 'none',
          borderRadius: '8px',
          padding: '4px 20px',
        })),
        u = (0, i.zo)(i.Av)(() => ({
          color: '#FF631F',
          height: '32px',
          background:
            'linear-gradient(0deg, rgba(255, 99, 31, 0.1), rgba(255, 99, 31, 0.1)), #FFFFFF;',
          border: 'none',
          borderRadius: '8px',
          padding: '4px 20px',
        })),
        p = e => {
          let { open: t, onConfirmDisable: r, onClose: p } = e,
            h = (0, n.X)();
          return (0, a.tZ)(i.u_, {
            open: t,
            onClose: p,
            children: (0, a.BX)(l, {
              children: [
                (0, a.tZ)(i.ol, { onClick: p, top: 12, right: 12 }),
                (0, a.tZ)(o, { children: h['Disable Public Link ?']() }),
                (0, a.tZ)(c, {
                  children: h['Disable Public Link Description'](),
                }),
                (0, a.BX)(s, {
                  children: [
                    (0, a.tZ)(d, { onClick: p, children: h.Cancel() }),
                    (0, a.tZ)(u, {
                      'data-testid': 'disable-public-link-confirm-button',
                      onClick: () => {
                        r(), p();
                      },
                      style: { marginLeft: '24px' },
                      children: h.Disable(),
                    }),
                  ],
                }),
              ],
            }),
          });
        };
      var h = r(31921),
        f = r(13246),
        m = r(65058),
        g = r(752);
      let v = new WeakMap();
      function b(e) {
        if (!v.has(e)) {
          var t;
          let r = (0, m.cn)(
              null !== (t = e.meta.isPublic) && void 0 !== t && t
            ),
            a = (0, m.cn)(
              e => e(r),
              (t, a, n) => {
                e.workspace.setPageMeta(e.id, { isPublic: n }), a(r, n);
              }
            );
          (r.onMount = t => {
            let r = e.workspace.meta.pageMetasUpdated.on(() => {
              var r;
              t(null !== (r = e.meta.isPublic) && void 0 !== r && r);
            });
            return () => {
              r.dispose();
            };
          }),
            v.set(e, a);
        }
        let r = v.get(e);
        return (0, f.kP)(r), (0, g.KO)(r);
      }
      var y = r(2784),
        Z = r(51243),
        k = r(73939);
      r(85802);
      var x = '_1fidbyf2',
        w = '_1fidbyf8',
        C = '_1fidbyf1',
        N = '_1fidbyf9';
      let S = e => {
        let t = (0, y.useRef)(),
          r = (0, n.X)();
        return (0, a.BX)('div', {
          className: C,
          children: [
            (0, a.tZ)('div', {
              className: x,
              children: r['Export Shared Pages Description'](),
            }),
            (0, a.BX)('div', {
              className: '_1fidbyf4',
              children: [
                (0, a.BX)(i.zx, {
                  className: w,
                  onClick: () => (
                    t.current || (t.current = new k.F(e.currentPage)),
                    t.current.exportHtml()
                  ),
                  children: [
                    (0, a.tZ)(h.ExportToHtmlIcon, { className: N }),
                    r['Export to HTML'](),
                  ],
                }),
                (0, a.BX)(i.zx, {
                  className: w,
                  onClick: () => (
                    t.current || (t.current = new k.F(e.currentPage)),
                    t.current.exportMarkdown()
                  ),
                  children: [
                    (0, a.tZ)(h.ExportToMarkdownIcon, { className: N }),
                    r['Export to Markdown'](),
                  ],
                }),
              ],
            }),
          ],
        });
      };
      var D = r(96893),
        P = r(91337),
        X = r(44502);
      let M = (0, i.zo)(i.Av, { shouldForwardProp: e => 'isShared' !== e })(
        e => {
          let { isShared: t } = e;
          return {
            padding: '4px 8px',
            marginLeft: '4px',
            marginRight: '16px',
            border: '1px solid '.concat(
              t ? 'var(--affine-primary-color)' : 'var(--affine-icon-color)'
            ),
            color: t
              ? 'var(--affine-primary-color)'
              : 'var(--affine-icon-color)',
            borderRadius: '8px',
            ':hover': { border: '1px solid var(--affine-primary-color)' },
            span: { ...(0, i.j2)('center', 'center') },
          };
        }
      );
      (0, i.zo)('div')(() => ({
        ...(0, i.j2)('space-around', 'center'),
        position: 'relative',
      }));
      let B = (0, i.zo)('li')(e => {
          let { isActive: t } = e;
          return {
            ...(0, i.j2)('center', 'center'),
            flex: '1',
            height: '30px',
            color: 'var(--affine-text-primary-color)',
            opacity: t ? 1 : 0.2,
            fontWeight: '500',
            fontSize: 'var(--affine-font-base)',
            lineHeight: 'var(--affine-line-height)',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            padding: '0 10px',
            marginBottom: '4px',
            borderRadius: '4px',
            position: 'relative',
            ':hover': {
              background: 'var(--affine-hover-color)',
              opacity: 1,
              color: t
                ? 'var(--affine-text-primary-color)'
                : 'var(--affine-text-secondary-color)',
              svg: {
                fill: t
                  ? 'var(--affine-text-primary-color)'
                  : 'var(--affine-text-secondary-color)',
              },
            },
            svg: { fontSize: '20px', marginRight: '12px' },
            ':after': {
              content: '""',
              position: 'absolute',
              bottom: '-6px',
              left: '0',
              width: '100%',
              height: '2px',
              background: 'var(--affine-text-primary-color)',
              opacity: 0.2,
            },
          };
        }),
        F = (0, i.zo)('div')(() => ({
          height: '2px',
          background: 'var(--affine-text-primary-color)',
          position: 'absolute',
          left: '0',
          transition: 'left .3s, width .3s',
        })),
        I = (0, i.zo)('input')(() => ({
          padding: '4px 8px',
          height: '28px',
          color: 'var(--affine-placeholder-color)',
          border: '1px solid var(--affine-placeholder-color)',
          cursor: 'default',
          overflow: 'hidden',
          userSelect: 'text',
          borderRadius: '4px',
          flexGrow: 1,
          marginRight: '10px',
        })),
        R = (0, i.zo)(i.Av)(() => ({
          color: 'var(--affine-primary-color)',
          height: '32px',
          background: '#F3F0FF',
          border: 'none',
          borderRadius: '8px',
          padding: '4px 20px',
        })),
        T = (0, i.zo)(i.zx)(() => ({
          color: '#FF631F',
          height: '32px',
          border: 'none',
          marginTop: '16px',
          borderRadius: '8px',
          padding: '0',
        })),
        _ = (0, i.zo)('span')(() => ({
          marginLeft: '4px',
          color: 'var(--affine-primary-color)',
          fontWeight: '500',
          cursor: 'pointer',
        })),
        A = e => {
          let t = (0, n.X)();
          return (0, a.BX)('div', {
            className: C,
            children: [
              (0, a.tZ)('div', {
                className: x,
                children: t['Shared Pages Description'](),
              }),
              (0, a.tZ)(R, {
                'data-testid': 'share-menu-enable-affine-cloud-button',
                onClick: () => {
                  e.onEnableAffineCloud(e.workspace);
                },
                children: t['Enable AFFiNE Cloud'](),
              }),
            ],
          });
        },
        E = e => {
          let [t, r] = b(e.currentPage),
            [l, o] = (0, y.useState)(!1),
            c = (0, n.X)(),
            s = (0, y.useMemo)(
              () =>
                ''
                  .concat(D.uP, 'public-workspace/')
                  .concat(e.workspace.id, '/')
                  .concat(e.currentPage.id),
              [e.workspace.id, e.currentPage.id]
            ),
            d = (0, y.useCallback)(() => {
              r(!0);
            }, [r]),
            u = (0, y.useCallback)(async () => {
              await navigator.clipboard.writeText(s),
                (0, i.Am)(c['Copied link to clipboard']());
            }, [s, c]),
            h = (0, y.useCallback)(() => {
              r(!1),
                (0, i.Am)('Successfully disabled', { portal: document.body });
            }, [r]);
          return (0, a.BX)('div', {
            className: C,
            children: [
              (0, a.tZ)('div', {
                className: x,
                children: c['Create Shared Link Description'](),
              }),
              (0, a.BX)('div', {
                className: '_1fidbyf7',
                children: [
                  (0, a.tZ)(I, {
                    type: 'text',
                    readOnly: !0,
                    value: t ? s : 'https://app.affine.pro/xxxx',
                  }),
                  !t &&
                    (0, a.tZ)(R, {
                      'data-testid': 'affine-share-create-link',
                      onClick: d,
                      children: c.Create(),
                    }),
                  t &&
                    (0, a.tZ)(R, {
                      'data-testid': 'affine-share-copy-link',
                      onClick: u,
                      children: c['Copy Link'](),
                    }),
                ],
              }),
              (0, a.tZ)('div', {
                className: x,
                children: (0, a.BX)(X.cC, {
                  i18nKey: 'Shared Pages In Public Workspace Description',
                  children: [
                    'The entire Workspace is published on the web and can be edited via',
                    (0, a.tZ)(_, {
                      onClick: () => {
                        e.onOpenWorkspaceSettings(e.workspace);
                      },
                      children: 'Workspace Settings',
                    }),
                    '.',
                  ],
                }),
              }),
              t &&
                (0, a.BX)(a.HY, {
                  children: [
                    (0, a.tZ)(T, {
                      onClick: () => o(!0),
                      children: c['Disable Public Link'](),
                    }),
                    (0, a.tZ)(p, {
                      open: l,
                      onConfirmDisable: h,
                      onClose: () => {
                        o(!1);
                      },
                    }),
                  ],
                }),
            ],
          });
        },
        z = e => {
          if (e.workspace.flavour === P.b8.LOCAL) return (0, a.tZ)(A, { ...e });
          if (e.workspace.flavour === P.b8.AFFINE)
            return (0, a.tZ)(E, { ...e });
          throw Error('Unreachable');
        },
        O = e => {
          let t = (0, n.X)();
          return (0, a.BX)('div', {
            className: C,
            children: [
              (0, a.tZ)('div', {
                className: x,
                children: t['Share Menu Public Workspace Description1'](),
              }),
              (0, a.tZ)(R, {
                'data-testid': 'share-menu-enable-affine-cloud-button',
                onClick: () => {
                  e.onOpenWorkspaceSettings(e.workspace);
                },
                children: t['Open Workspace Settings'](),
              }),
            ],
          });
        },
        Y = e => {
          let t = e.workspace.public,
            r = (0, n.X)();
          return (0, a.BX)('div', {
            className: C,
            children: [
              (0, a.tZ)('div', {
                className: x,
                children: t
                  ? r['Share Menu Public Workspace Description2']()
                  : r['Share Menu Public Workspace Description1'](),
              }),
              (0, a.tZ)(R, {
                'data-testid': 'share-menu-publish-to-web-button',
                onClick: () => {
                  e.onOpenWorkspaceSettings(e.workspace);
                },
                children: r['Open Workspace Settings'](),
              }),
            ],
          });
        },
        j = e => {
          if (e.workspace.flavour === P.b8.LOCAL) return (0, a.tZ)(O, { ...e });
          if (e.workspace.flavour === P.b8.AFFINE)
            return (0, a.tZ)(Y, { ...e });
          throw Error('Unreachable');
        },
        L = { SharePage: z, Export: S, ShareWorkspace: j },
        W = {
          SharePage: (0, a.tZ)(h.ShareIcon, {}),
          Export: (0, a.tZ)(h.ExportIcon, {}),
          ShareWorkspace: (0, a.tZ)(h.PublishIcon, {}),
        },
        H = e => {
          let [t, r] = (0, y.useState)('SharePage'),
            [n] = b(e.currentPage),
            [i, l] = (0, y.useState)(!1),
            o = (0, y.useRef)(null),
            c = (0, y.useRef)(null),
            s = (0, y.useCallback)(() => {
              if (c.current && o.current) {
                let e = c.current,
                  r = o.current.querySelector(
                    '[data-tab-key="'.concat(t, '"]')
                  );
                !(function (e, t) {
                  if (!(e instanceof t))
                    throw Error('Object is not instance of type');
                })(r, HTMLElement),
                  requestAnimationFrame(() => {
                    (e.style.left = ''.concat(r.offsetLeft, 'px')),
                      (e.style.width = ''.concat(r.offsetWidth, 'px'));
                  });
              }
            }, [t]),
            d = (0, y.useCallback)(
              e => {
                r(e), s();
              },
              [r, s]
            ),
            u = L[t],
            p = e => {
              let { activeItem: t, onChangeTab: i } = e,
                l = e => {
                  i(e), r(e);
                };
              return (0, a.tZ)('div', {
                className: '_1fidbyf0',
                ref: o,
                children: Object.keys(L).map(e =>
                  (0, a.BX)(
                    B,
                    {
                      isActive: t === e,
                      'data-tab-key': e,
                      onClick: () => l(e),
                      children: [
                        W[e],
                        n && 'SharePage' === e ? 'SharedPage' : e,
                      ],
                    },
                    e
                  )
                ),
              });
            },
            h = (0, a.BX)(a.HY, {
              children: [
                (0, a.tZ)(p, { activeItem: t, onChangeTab: d }),
                (0, a.tZ)('div', {
                  className: '_1fidbyf6',
                  children: (0, a.tZ)(F, {
                    ref: e => {
                      (c.current = e), s();
                    },
                  }),
                }),
                (0, a.tZ)('div', {
                  className: '_1fidbyf5',
                  children: (0, a.tZ)(u, { ...e }),
                }),
              ],
            });
          return (0, a.tZ)(Z.v, {
            content: h,
            visible: i,
            placement: 'bottom',
            trigger: ['click'],
            width: 439,
            disablePortal: !0,
            onClickAway: () => {
              l(!1);
            },
            children: (0, a.tZ)(M, {
              'data-testid': 'share-menu-button',
              onClick: () => {
                l(!i);
              },
              isShared: n,
              children: (0, a.tZ)('div', { children: n ? 'Shared' : 'Share' }),
            }),
          });
        };
    },
    91013: function (e, t, r) {
      'use strict';
      r.d(t, {
        J: function () {
          return s;
        },
        r: function () {
          return c;
        },
      });
      var a = r(13246),
        n = r(65058),
        i = r(752),
        l = r(2784);
      let o = new WeakMap();
      function c(e) {
        if (!o.has(e)) {
          let t = (0, n.cn)(e.meta.pageMetas);
          o.set(e, t),
            (t.onMount = t => {
              let r = e.meta.pageMetasUpdated.on(() => {
                t(e.meta.pageMetas);
              });
              return () => {
                r.dispose();
              };
            });
        }
        return (0, i.Dv)(o.get(e));
      }
      function s(e) {
        return (0, l.useMemo)(
          () => ({
            setPageTitle: (t, r) => {
              let n = e.getPage(t);
              (0, a.kP)(n);
              let i = n.getBlockByFlavour('affine:page').at(0);
              (0, a.kP)(i),
                n.transact(() => {
                  i.title.delete(0, i.title.length), i.title.insert(r, 0);
                }),
                e.meta.setPageMeta(t, { title: r });
            },
            setPageMeta: (t, r) => {
              e.meta.setPageMeta(t, r);
            },
            getPageMeta: t => e.meta.getPageMeta(t),
            shiftPageMeta: (t, r) => e.meta.shiftPageMeta(t, r),
          }),
          [e]
        );
      }
    },
    10115: function () {},
    70760: function () {},
    85954: function () {},
    56142: function () {},
    85802: function () {},
    81323: function () {},
    29686: function () {},
  },
]);
//# sourceMappingURL=1866-9802b309169cfac7.js.map
