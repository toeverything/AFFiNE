(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [3047],
  {
    43631: function (e, t, n) {
      'use strict';
      n.d(t, {
        Uv: function () {
          return s;
        },
        _c: function () {
          return u;
        },
        bq: function () {
          return f;
        },
        sd: function () {
          return p;
        },
      });
      var r = n(96893),
        a = n(91337),
        i = n(78981),
        o = n(62980),
        l = n(65058),
        c = n(84610);
      function d(e, t) {
        let n = arguments.length > 2 && void 0 !== arguments[2] && arguments[2],
          l = (0, o.LM)(e, a.b8.AFFINE, {
            workspaceApis: i._,
            cachePrefix: a.b8.PUBLIC + (n ? '-single-page' : ''),
          });
        return (
          c.w_.Y.applyUpdate(l.doc, new Uint8Array(t)),
          Object.entries(r.vc.editorFlags).forEach(e => {
            let [t, n] = e;
            l.awarenessStore.setFlag(t, n);
          }),
          l.awarenessStore.setFlag('enable_block_hub', !1),
          l.awarenessStore.setFlag('enable_drag_handle', !1),
          { flavour: a.b8.PUBLIC, id: e, blockSuiteWorkspace: l, providers: [] }
        );
      }
      let s = (0, l.cn)(null),
        u = (0, l.cn)(null),
        f = (0, l.cn)(async e => {
          let t = e(s),
            n = e(u);
          if (!t || !n) throw Error('No workspace id or page id');
          let r = await i._.downloadPublicWorkspacePage(t, n);
          return d(t, r, !0);
        }),
        p = (0, l.cn)(async e => {
          let t = e(s);
          if (!t) throw Error('No workspace id');
          let n = await i._.downloadWorkspace(t, !0);
          return d(t, n, !1);
        });
    },
    35698: function (e, t, n) {
      'use strict';
      n.d(t, {
        h: function () {
          return r.h;
        },
      });
      var r = n(17915);
    },
    44281: function (e, t, n) {
      'use strict';
      n.r(t),
        n.d(t, {
          PageDetailEditor: function () {
            return y;
          },
        });
      var r = n(52903);
      n(13049);
      var a = n(57670),
        i = n(14192),
        o = n(13246),
        l = n(91013),
        c = n(85245),
        d = n(65058),
        s = n(752);
      let u = new WeakMap();
      var f = n(1347),
        p = n(97729),
        h = n.n(p),
        g = n(2784),
        v = n(45943),
        m = n(74090),
        b = n(30530),
        k = n(35698);
      let w = (0, g.memo)(function (e) {
          var t;
          let {
              workspace: n,
              pageId: d,
              onInit: u,
              onLoad: p,
              isPublic: h,
            } = e,
            v = (0, s.Dv)(f.an),
            b = (0, g.useMemo)(() => Object.values(v), [v]),
            w = n.blockSuiteWorkspace,
            Z = (0, c.j)(w, d);
          if (!Z) throw new a.GP(w, d);
          let x = (0, l.r)(w).find(e => e.id === d),
            y = (0, m.G9)(d),
            P = (0, s.Dv)(y),
            S =
              null !== (t = null == P ? void 0 : P.mode) && void 0 !== t
                ? t
                : a.Pr === d
                ? 'edgeless'
                : 'page',
            z = (0, s.b9)(i.Zy);
          return (
            (0, o.kP)(x),
            (0, r.tZ)(
              k.h,
              {
                style: { height: 'calc(100% - 52px)' },
                mode: h ? 'page' : S,
                page: Z,
                onInit: (0, g.useCallback)(
                  (e, t) => {
                    (0, g.startTransition)(() => {
                      z(t);
                    }),
                      u(e, t);
                  },
                  [u, z]
                ),
                onLoad: (0, g.useCallback)(
                  (e, t) => {
                    (0, g.startTransition)(() => {
                      z(t);
                    }),
                      e.workspace.setPageMeta(e.id, {
                        updatedDate: Date.now(),
                      }),
                      localStorage.setItem('last_page_id', e.id);
                    let n = () => {};
                    p && (n = p(e, t));
                    let r = b
                        .map(e => e.blockSuiteAdapter.uiDecorator)
                        .filter(e => !!e),
                      a = r.map(e => e(t));
                    return () => {
                      a.forEach(e => e()), n();
                    };
                  },
                  [b, p, z]
                ),
              },
              ''.concat(n.flavour, '-').concat(n.id, '-').concat(d)
            )
          );
        }),
        Z = (0, g.memo)(function (e) {
          let { detailContent: t } = e;
          return (0,
          r.tZ)('div', { className: 'lboeq70', children: t({ contentLayoutAtom: b.C }) });
        }),
        x = (0, g.memo)(function e(t) {
          let n = t.node;
          if ('string' != typeof n)
            return (0, r.BX)(v.eh, {
              style: { height: 'calc(100% - 52px)' },
              direction: n.direction,
              children: [
                (0, r.tZ)(v.s_, {
                  defaultSize: n.splitPercentage,
                  children: (0, r.tZ)(g.Suspense, {
                    children: (0, r.tZ)(e, {
                      node: n.first,
                      editorProps: t.editorProps,
                      plugins: t.plugins,
                    }),
                  }),
                }),
                (0, r.tZ)(v.OT, {}),
                (0, r.tZ)(v.s_, {
                  defaultSize: 100 - n.splitPercentage,
                  children: (0, r.tZ)(g.Suspense, {
                    children: (0, r.tZ)(e, {
                      node: n.second,
                      editorProps: t.editorProps,
                      plugins: t.plugins,
                    }),
                  }),
                }),
              ],
            });
          if ('editor' === n) return (0, r.tZ)(w, { ...t.editorProps });
          {
            let e = t.plugins.find(e => e.definition.id === n),
              a = null == e ? void 0 : e.uiAdapter.detailContent;
            return (0, o.kP)(a), (0, r.tZ)(Z, { detailContent: a });
          }
        }),
        y = e => {
          let { workspace: t, pageId: n } = e,
            i = t.blockSuiteWorkspace,
            l = (0, c.j)(i, n);
          if (!l) throw new a.GP(i, n);
          let p = (function (e, t) {
              let n = (function (e, t) {
                u.has(e) || u.set(e, new Map());
                let n = u.get(e);
                if (((0, o.kP)(n), n.has(t))) return n.get(t);
                {
                  var r;
                  let a = (0, d.cn)(
                    (null === (r = e.getPage(t)) || void 0 === r
                      ? void 0
                      : r.meta.title) || 'Untitled'
                  );
                  return (
                    (a.onMount = n => {
                      let r = e.meta.pageMetasUpdated.on(() => {
                        let r = e.getPage(t);
                        n((null == r ? void 0 : r.meta.title) || 'Untitled');
                      });
                      return () => {
                        r.dispose();
                      };
                    }),
                    n.set(t, a),
                    a
                  );
                }
              })(e, t);
              return (0, o.kP)(n), (0, s.Dv)(n);
            })(i, n),
            v = (0, s.Dv)(b.C),
            m = (0, s.Dv)(f.an),
            k = (0, g.useMemo)(() => Object.values(m), [m]);
          return (0, r.BX)(r.HY, {
            children: [
              (0, r.tZ)(h(), { children: (0, r.tZ)('title', { children: p }) }),
              (0, r.tZ)(g.Suspense, {
                children: (0, r.tZ)(x, { node: v, editorProps: e, plugins: k }),
              }),
            ],
          });
        };
    },
    9532: function (e, t, n) {
      'use strict';
      n.d(t, {
        $: function () {
          return g;
        },
        z: function () {
          return v;
        },
      });
      var r = n(52903),
        a = n(37565),
        i = n(96893),
        o = n(72013),
        l = n(31921),
        c = n(752),
        d = n(2784),
        s = n(74090),
        u = n(53137);
      (0, a.zo)('div')(() => ({
        width: '1px',
        height: '20px',
        background: 'var(--affine-border-color)',
        marginRight: '24px',
      })),
        (0, a.zo)('div')(() => ({
          marginLeft: '15px',
          width: '202px',
          p: {
            height: '20px',
            fontSize: 'var(--affine-font-sm)',
            ...(0, a.j2)('flex-start', 'center'),
          },
          svg: { marginRight: '10px', fontSize: '16px', flexShrink: 0 },
          span: { flexGrow: 1, ...(0, a.vS)(1) },
        })),
        (0, a.zo)('div')(() => ({
          fontSize: 'var(--affine-font-base)',
          fontWeight: 600,
          lineHeight: '24px',
          marginBottom: '10px',
          maxWidth: '200px',
          ...(0, a.vS)(1),
        }));
      let f = (0, a.zo)('div')({
          height: '84px',
          padding: '0 40px',
          flexShrink: 0,
          ...(0, a.j2)('space-between', 'center'),
        }),
        p = (0, a.zo)('div')(() => ({
          textAlign: 'left',
          marginLeft: '16px',
          flex: 1,
          p: { lineHeight: '24px', color: 'var(--affine-icon-color)' },
          'p:first-of-type': {
            color: 'var(--affine-text-primary-color)',
            fontWeight: 600,
          },
        }));
      (0, a.zo)('div')(() => ({ ...(0, a.j2)('flex-start', 'center') })),
        (0, a.zo)('div')(() => ({
          fontWeight: 600,
          fontSize: 'var(--affine-font-h6)',
        })),
        (0, a.zo)('div')(() => ({
          color: 'var(--affine-icon-color)',
          marginLeft: '15px',
          fontWeight: 400,
          fontSize: 'var(--affine-font-h6)',
          ...(0, a.j2)('center', 'center'),
        })),
        (0, a.zo)('div')({
          height: '534px',
          padding: '8px 40px',
          marginTop: '72px',
          overflow: 'auto',
          ...(0, a.j2)('space-between', 'flex-start', 'flex-start'),
          flexWrap: 'wrap',
        }),
        (0, a.zo)('div')(() => ({ ...(0, a.j2)('flex-end', 'center') })),
        (0, a.zo)('div')(() => ({
          width: '58px',
          height: '58px',
          borderRadius: '100%',
          background: '#f4f5fa',
          border: '1.5px dashed #f4f5fa',
          transition: 'background .2s',
          ...(0, a.j2)('center', 'center'),
        })),
        (0, a.zo)('div')(() => ({
          width: '100%',
          height: '72px',
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: '24px 24px 0 0',
          padding: '0 40px',
          ...(0, a.j2)('space-between', 'center'),
        }));
      let h = (0, a.zo)(a.zx)(() => ({
          fontWeight: 600,
          paddingLeft: 0,
          '.circle': {
            width: '40px',
            height: '40px',
            borderRadius: '20px',
            backgroundColor: 'var(--affine-hover-color)',
            color: 'var(--affine-primary-color)',
            fontSize: '24px',
            flexShrink: 0,
            marginRight: '16px',
            ...(0, a.Qj)('center', 'center'),
          },
        })),
        g = e => {
          let { user: t, onLogin: n, onLogout: d } = e,
            u = (0, o.X)(),
            g = (0, c.b9)(s.Qe);
          return (0, r.BX)(f, {
            'data-testid': 'workspace-list-modal-footer',
            children: [
              t &&
                (0, r.BX)(r.HY, {
                  children: [
                    (0, r.BX)(a.A0, {
                      children: [
                        (0, r.tZ)(v, {
                          size: 40,
                          name: t.name,
                          avatar: t.avatar_url,
                        }),
                        (0, r.BX)(p, {
                          children: [
                            (0, r.tZ)('p', { children: t.name }),
                            (0, r.tZ)('p', { children: t.email }),
                          ],
                        }),
                      ],
                    }),
                    (0, r.tZ)(a.u, {
                      content: u['Sign out'](),
                      disablePortal: !0,
                      children: (0, r.tZ)(a.hU, {
                        'data-testid': 'workspace-list-modal-sign-out',
                        onClick: () => {
                          d();
                        },
                        children: (0, r.tZ)(l.SignOutIcon, {}),
                      }),
                    }),
                  ],
                }),
              !t &&
                (0, r.tZ)(h, {
                  'data-testid': 'sign-in-button',
                  noBorder: !0,
                  bold: !0,
                  icon: (0, r.tZ)('div', {
                    className: 'circle',
                    children: (0, r.tZ)(l.CloudWorkspaceIcon, {}),
                  }),
                  onClick: async () => {
                    i.vc.enableLegacyCloud ? n() : g(!0);
                  },
                  children: u['Sign in'](),
                }),
            ],
          });
        },
        v = (0, d.forwardRef)(function (e, t) {
          let n = e.size || 20,
            a = n + 'px';
          return (0,
          r.tZ)(r.HY, { children: e.avatar ? (0, r.tZ)('div', { style: { ...e.style, width: a, height: a, color: '#fff', borderRadius: '50%', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (0, r.tZ)('picture', { children: (0, r.tZ)('img', { style: { width: a, height: a }, src: e.avatar, alt: '', referrerPolicy: 'no-referrer' }) }) }) : (0, r.tZ)('div', { style: { ...e.style, width: a, height: a, border: '1px solid #fff', color: '#fff', fontSize: Math.ceil(0.5 * n) + 'px', background: (0, u.W)(e.name || 'AFFiNE'), borderRadius: '50%', textAlign: 'center', lineHeight: n + 'px', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (e.name || 'AFFiNE').substring(0, 1) }) });
        });
    },
    53430: function (e, t, n) {
      'use strict';
      n.d(t, {
        d: function () {
          return i;
        },
      });
      var r = n(2784),
        a = n(84610);
      function i(e) {
        return (0, r.useMemo)(() => {
          if (!e.isReady) return 'Loading...';
          if (
            !e.query.pageId &&
            e.pathname.startsWith('/workspace/[workspaceId]/')
          ) {
            let t = e.pathname.split('/').at(-1);
            if (t && t in a.HY) return a.HY[t] + ' - AFFiNE';
          }
          return 'AFFiNE';
        }, [e]);
      }
    },
    86350: function (e, t, n) {
      'use strict';
      n.d(t, {
        Y: function () {
          return p;
        },
        c: function () {
          return g;
        },
      });
      var r = n(52903),
        a = n(90643),
        i = n(752),
        o = n(97729),
        l = n.n(o),
        c = n(5632),
        d = n(2784),
        s = n(74090),
        u = n(53430);
      let f = (0, d.lazy)(() =>
          Promise.all([n.e(8421), n.e(6546), n.e(7114)])
            .then(n.bind(n, 32513))
            .then(e => ({ default: e.QuickSearchModal }))
        ),
        p = e => {
          let { workspace: t } = e,
            n = (0, c.useRouter)(),
            [a, o] = (0, i.KO)(s.A8);
          return (0, r.tZ)(d.Suspense, {
            children: (0, r.tZ)(f, {
              blockSuiteWorkspace: t.blockSuiteWorkspace,
              open: a,
              setOpen: o,
              router: n,
            }),
          });
        },
        h = e => {
          let t = (0, c.useRouter)(),
            n = (0, u.d)(t);
          return (0, r.BX)(r.HY, {
            children: [
              (0, r.tZ)(l(), { children: (0, r.tZ)('title', { children: n }) }),
              (0, r.tZ)(a.zj, {
                children: (0, r.tZ)(a.tz, { children: e.children }),
              }),
            ],
          });
        },
        g = e => (0, r.tZ)(h, { children: e.children });
    },
    73047: function (e, t, n) {
      'use strict';
      n.r(t),
        n.d(t, {
          NavContainer: function () {
            return y;
          },
          PublicWorkspaceDetailPage: function () {
            return z;
          },
          StyledBreadcrumbs: function () {
            return P;
          },
        });
      var r = n(52903),
        a = n(37565),
        i = n(33027),
        o = n(72013),
        l = n(31921),
        c = n(13246),
        d = n(77352),
        s = n(78365),
        u = n(752),
        f = n(39097),
        p = n.n(f),
        h = n(5632),
        g = n(2784),
        v = n(43631),
        m = n(67473),
        b = n(44281),
        k = n(9532),
        w = n(41142),
        Z = n(31747),
        x = n(86350);
      let y = (0, a.zo)('div')(() => ({
          width: '100vw',
          height: '52px',
          ...(0, a.j2)('space-between', 'center'),
          backgroundColor: 'var(--affine-background-primary-color)',
        })),
        P = (0, a.zo)(p())(() => ({
          flex: 1,
          ...(0, a.j2)('center', 'center'),
          paddingLeft: '12px',
          span: {
            padding: '0 12px',
            fontSize: 'var(--affine-font-base)',
            lineHeight: 'var(--affine-line-height)',
          },
          ':hover': { color: 'var(--affine-primary-color)' },
          transition: 'all .15s',
          ':visited': { ':hover': { color: 'var(--affine-primary-color)' } },
        })),
        S = () => {
          var e;
          let t = (0, u.Dv)(v._c);
          (0, c.kP)(t, 'pageId is null');
          let n = (0, u.Dv)(v.bq),
            f = n.blockSuiteWorkspace;
          if (!f) throw Error('cannot find workspace');
          let p = (0, h.useRouter)(),
            { openPage: g } = (0, Z.$)(p),
            w = (0, o.X)(),
            [S] = (0, s.H)(f),
            [z] = (0, d.r)(f),
            R =
              null === (e = f.meta.getPageMeta(t)) || void 0 === e
                ? void 0
                : e.title;
          return (0, r.BX)(r.HY, {
            children: [
              (0, r.tZ)(x.Y, { workspace: n }),
              (0, r.tZ)(m.R, {
                isPublic: !0,
                workspace: n,
                currentPage: f.getPage(t),
                children: (0, r.tZ)(y, {
                  children: (0, r.BX)(a.Oo, {
                    children: [
                      (0, r.BX)(P, {
                        href: '/public-workspace/'.concat(f.id),
                        children: [
                          (0, r.tZ)(k.z, { size: 24, name: S, avatar: z }),
                          (0, r.tZ)('span', { children: S }),
                        ],
                      }),
                      (0, r.BX)(P, {
                        href: '/public-workspace/'.concat(f.id, '/').concat(t),
                        children: [
                          (0, r.tZ)(l.PageIcon, { fontSize: 24 }),
                          (0, r.tZ)('span', { children: R || w.Untitled() }),
                        ],
                      }),
                    ],
                  }),
                }),
              }),
              (0, r.tZ)(b.PageDetailEditor, {
                isPublic: !0,
                pageId: t,
                workspace: n,
                onLoad: (e, t) => {
                  let { page: n } = t;
                  n.awarenessStore.setReadonly(n, !0);
                  let r = t.slots.pageLinkClicked.on(e => {
                    let { pageId: t } = e;
                    return g(f.id, t);
                  });
                  return () => {
                    r.dispose();
                  };
                },
                onInit: i.E,
              }),
            ],
          });
        },
        z = () => {
          let e = (0, h.useRouter)(),
            [t, n] = (0, u.KO)(v.Uv),
            [a, i] = (0, u.KO)(v._c);
          return ((0, g.useEffect)(() => {
            e.isReady &&
              ('string' == typeof e.query.workspaceId && n(e.query.workspaceId),
              'string' == typeof e.query.pageId && i(e.query.pageId));
          }, [e.isReady, e.query.pageId, e.query.workspaceId, i, n]),
          e.isReady && t && a)
            ? (0, r.tZ)(g.Suspense, {
                fallback: (0, r.tZ)(w.SX, {}),
                children: (0, r.tZ)(S, {}),
              })
            : (0, r.tZ)(w.SX, {});
        };
      (t.default = z), (z.getLayout = e => (0, r.tZ)(x.c, { children: e }));
    },
    17915: function (e, t, n) {
      'use strict';
      n.d(t, {
        h: function () {
          return v;
        },
        N: function () {
          return g;
        },
      });
      var r = n(52903),
        a = n(96893),
        i = n(37025),
        o = n(31054),
        l = n(79906),
        c = n(752),
        d = n(2784),
        s = n(28316),
        u = n(32955);
      n(81424);
      let f = (0, d.lazy)(() =>
          Promise.all([n.e(5024), n.e(4057), n.e(280), n.e(9760)])
            .then(n.bind(n, 40899))
            .then(e => ({ default: e.ImagePreviewModal }))
        ),
        p = e => {
          let { onLoad: t, page: n, mode: a, style: l, onInit: s } = e,
            u = (0, c.Dv)(i.E);
          (0, o.kP)(n, 'page should not be null');
          let f = (0, d.useRef)(null),
            p = (0, d.useRef)(null);
          null === f.current &&
            ((f.current = new u()),
            (f.current.autofocus = !0),
            (globalThis.currentEditor = f.current));
          let h = f.current;
          (0, o.kP)(f, 'editorRef.current should not be null'),
            h.mode !== a && (h.mode = a),
            (0, d.useEffect)(() => {
              h.page !== n && ((h.page = n), null === n.root && s(n, h));
            }, [h, n, s]),
            (0, d.useEffect)(() => {
              if (h.page && t) {
                let e = [];
                return (
                  e.push(null == t ? void 0 : t(n, h)),
                  () => {
                    e.filter(e => !!e).forEach(e => e());
                  }
                );
              }
            }, [h, h.page, n, t]);
          let g = (0, d.useRef)(null);
          (0, d.useEffect)(() => {
            let e = f.current;
            (0, o.kP)(e);
            let t = g.current;
            if (t)
              return (
                n.awarenessStore.getFlag('enable_block_hub') &&
                  e
                    .createBlockHub()
                    .then(e => {
                      p.current && p.current.remove(), (p.current = e);
                      let t = document.querySelector('#toolWrapper');
                      t
                        ? t.appendChild(e)
                        : console.warn(
                            'toolWrapper not found, block hub feature will not be available.'
                          );
                    })
                    .catch(e => {
                      console.error(e);
                    }),
                t.appendChild(e),
                () => {
                  var n;
                  null === (n = p.current) || void 0 === n || n.remove(),
                    t.removeChild(e);
                }
              );
          }, [h, n]);
          let v = 'editor-wrapper '.concat(h.mode, '-mode');
          return (0, r.tZ)('div', {
            'data-testid': 'editor-'.concat(n.id),
            className: v,
            style: l,
            ref: g,
          });
        },
        h = e =>
          (0, r.BX)('div', {
            children: [
              (0, r.tZ)('h1', { children: 'Sorry.. there was an error' }),
              (0, r.tZ)('div', { children: e.error.message }),
              (0, r.tZ)('button', {
                'data-testid': 'error-fallback-reset-button',
                onClick: () => {
                  var t;
                  null === (t = e.onReset) || void 0 === t || t.call(e),
                    e.resetErrorBoundary();
                },
                children: 'Try again',
              }),
            ],
          }),
        g = (0, d.memo)(function () {
          return (0,
          r.BX)('div', { className: 'gl51ce0', children: [(0, r.tZ)(l.Z, { className: 'gl51ce1', animation: 'wave', height: 50 }), (0, r.tZ)(l.Z, { animation: 'wave', height: 30, width: '40%' })] });
        }),
        v = (0, d.memo)(function (e) {
          return (0,
          r.BX)(u.SV, { fallbackRender: (0, d.useCallback)(t => (0, r.tZ)(h, { ...t, onReset: e.onReset }), [e.onReset]), children: [(0, r.tZ)(d.Suspense, { fallback: (0, r.tZ)(g, {}), children: (0, r.tZ)(p, { ...e }) }), a.vc.enableImagePreviewModal && e.page && (0, r.tZ)(d.Suspense, { fallback: null, children: (0, s.createPortal)((0, r.tZ)(f, { workspace: e.page.workspace, pageId: e.page.id }), document.body) })] });
        });
      v.displayName = 'BlockSuiteEditor';
    },
    77352: function (e, t, n) {
      'use strict';
      n.d(t, {
        r: function () {
          return o;
        },
      });
      var r = n(13246),
        a = n(2784),
        i = n(3255);
      function o(e) {
        let [t, n] = (0, a.useState)(() => e.meta.avatar);
        t !== e.meta.avatar && n(e.meta.avatar);
        let { data: o, mutate: l } = (0, i.ZP)(t, {
            fetcher: async t => {
              (0, r.kP)(e);
              let n = await e.blobs,
                a = await n.get(t);
              return a ? URL.createObjectURL(a) : null;
            },
            suspense: !0,
            fallbackData: null,
          }),
          c = (0, a.useCallback)(
            async t => {
              (0, r.kP)(e);
              let n = new Blob([t], { type: t.type }),
                a = await e.blobs,
                i = await a.set(n);
              e.meta.setAvatar(i), await l(i);
            },
            [e, l]
          );
        return (
          (0, a.useEffect)(() => {
            if (e) {
              let t = e.meta.commonFieldsUpdated.on(() => {
                n(e.meta.avatar);
              });
              return () => {
                t.dispose();
              };
            }
          }, [e]),
          [null != o ? o : null, c]
        );
      }
    },
    78365: function (e, t, n) {
      'use strict';
      n.d(t, {
        H: function () {
          return d;
        },
      });
      var r = n(96893),
        a = n(13246),
        i = n(65058),
        o = n(752);
      let l = new WeakMap(),
        c = (0, i.cn)(r.e6, () => {
          console.warn('you cannot set the name of an null workspace.'),
            console.warn('this is a bug in the code.');
        });
      function d(e) {
        let t;
        if (e) {
          if (l.has(e)) (t = l.get(e)), (0, a.kP)(t);
          else {
            var n;
            let a = (0, i.cn)(
                null !== (n = e.meta.name) && void 0 !== n ? n : r.e6
              ),
              o = (0, i.cn)(
                e => e(a),
                (t, n, r) => {
                  e.meta.setName(r), n(a, r);
                }
              );
            (a.onMount = t => {
              let n = e.meta.commonFieldsUpdated.on(() => {
                var n;
                t(null !== (n = e.meta.name) && void 0 !== n ? n : '');
              });
              return () => {
                n.dispose();
              };
            }),
              l.set(e, o),
              (t = o);
          }
        } else t = c;
        return (0, o.KO)(t);
      }
    },
    85245: function (e, t, n) {
      'use strict';
      n.d(t, {
        j: function () {
          return c;
        },
      });
      var r = n(13246),
        a = n(65058),
        i = n(752);
      let o = new WeakMap(),
        l = (0, a.cn)(null);
      function c(e, t) {
        let n = (function (e, t) {
          if (!t) return l;
          o.has(e) || o.set(e, new Map());
          let n = o.get(e);
          if (((0, r.kP)(n), n.has(t))) return n.get(t);
          {
            let i = (0, a.cn)(e.getPage(t));
            return (
              (i.onMount = n => {
                let a = new r.SJ();
                return (
                  a.add(
                    e.slots.pageAdded.on(r => {
                      t === r && n(e.getPage(r));
                    })
                  ),
                  a.add(
                    e.slots.pageRemoved.on(e => {
                      t === e && n(null);
                    })
                  ),
                  () => {
                    a.dispose();
                  }
                );
              }),
              n.set(t, i),
              i
            );
          }
        })(e, t);
        return (0, r.kP)(n), (0, i.Dv)(n);
      }
    },
    81424: function () {},
    13049: function () {},
  },
]);
//# sourceMappingURL=3047-be7fcb29fd8e9585.js.map
