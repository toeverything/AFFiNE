(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [4281],
  {
    30530: function (e, t, n) {
      'use strict';
      n.d(t, {
        C: function () {
          return l;
        },
      });
      var r = n(65058);
      let a = (0, r.cn)('editor'),
        l = (0, r.cn)(
          e => e(a),
          (e, t, n) => {
            t(a, e => {
              let t = ('function' != typeof n ? () => n : n)(e);
              if ('editor' === t) return t;
              if ('editor' !== t.first)
                throw Error(
                  'The first element of the layout should be editor.'
                );
              if (t.splitPercentage && t.splitPercentage < 70)
                throw Error('The split percentage should be greater than 70.');
              return t;
            });
          }
        );
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
            return M;
          },
        });
      var r = n(52903);
      n(13049);
      var a = n(57670),
        l = n(14192),
        o = n(13246),
        i = n(91013),
        u = n(85245),
        c = n(65058),
        s = n(752);
      let d = new WeakMap();
      var f = n(1347),
        p = n(97729),
        g = n.n(p),
        h = n(2784),
        m = n(45943),
        v = n(74090),
        P = n(30530),
        k = n(35698);
      let b = (0, h.memo)(function (e) {
          var t;
          let {
              workspace: n,
              pageId: c,
              onInit: d,
              onLoad: p,
              isPublic: g,
            } = e,
            m = (0, s.Dv)(f.an),
            P = (0, h.useMemo)(() => Object.values(m), [m]),
            b = n.blockSuiteWorkspace,
            Z = (0, u.j)(b, c);
          if (!Z) throw new a.GP(b, c);
          let w = (0, i.r)(b).find(e => e.id === c),
            M = (0, v.G9)(c),
            S = (0, s.Dv)(M),
            y =
              null !== (t = null == S ? void 0 : S.mode) && void 0 !== t
                ? t
                : a.Pr === c
                ? 'edgeless'
                : 'page',
            C = (0, s.b9)(l.Zy);
          return (
            (0, o.kP)(w),
            (0, r.tZ)(
              k.h,
              {
                style: { height: 'calc(100% - 52px)' },
                mode: g ? 'page' : y,
                page: Z,
                onInit: (0, h.useCallback)(
                  (e, t) => {
                    (0, h.startTransition)(() => {
                      C(t);
                    }),
                      d(e, t);
                  },
                  [d, C]
                ),
                onLoad: (0, h.useCallback)(
                  (e, t) => {
                    (0, h.startTransition)(() => {
                      C(t);
                    }),
                      e.workspace.setPageMeta(e.id, {
                        updatedDate: Date.now(),
                      }),
                      localStorage.setItem('last_page_id', e.id);
                    let n = () => {};
                    p && (n = p(e, t));
                    let r = P.map(e => e.blockSuiteAdapter.uiDecorator).filter(
                        e => !!e
                      ),
                      a = r.map(e => e(t));
                    return () => {
                      a.forEach(e => e()), n();
                    };
                  },
                  [P, p, C]
                ),
              },
              ''.concat(n.flavour, '-').concat(n.id, '-').concat(c)
            )
          );
        }),
        Z = (0, h.memo)(function (e) {
          let { detailContent: t } = e;
          return (0,
          r.tZ)('div', { className: 'lboeq70', children: t({ contentLayoutAtom: P.C }) });
        }),
        w = (0, h.memo)(function e(t) {
          let n = t.node;
          if ('string' != typeof n)
            return (0, r.BX)(m.eh, {
              style: { height: 'calc(100% - 52px)' },
              direction: n.direction,
              children: [
                (0, r.tZ)(m.s_, {
                  defaultSize: n.splitPercentage,
                  children: (0, r.tZ)(h.Suspense, {
                    children: (0, r.tZ)(e, {
                      node: n.first,
                      editorProps: t.editorProps,
                      plugins: t.plugins,
                    }),
                  }),
                }),
                (0, r.tZ)(m.OT, {}),
                (0, r.tZ)(m.s_, {
                  defaultSize: 100 - n.splitPercentage,
                  children: (0, r.tZ)(h.Suspense, {
                    children: (0, r.tZ)(e, {
                      node: n.second,
                      editorProps: t.editorProps,
                      plugins: t.plugins,
                    }),
                  }),
                }),
              ],
            });
          if ('editor' === n) return (0, r.tZ)(b, { ...t.editorProps });
          {
            let e = t.plugins.find(e => e.definition.id === n),
              a = null == e ? void 0 : e.uiAdapter.detailContent;
            return (0, o.kP)(a), (0, r.tZ)(Z, { detailContent: a });
          }
        }),
        M = e => {
          let { workspace: t, pageId: n } = e,
            l = t.blockSuiteWorkspace,
            i = (0, u.j)(l, n);
          if (!i) throw new a.GP(l, n);
          let p = (function (e, t) {
              let n = (function (e, t) {
                d.has(e) || d.set(e, new Map());
                let n = d.get(e);
                if (((0, o.kP)(n), n.has(t))) return n.get(t);
                {
                  var r;
                  let a = (0, c.cn)(
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
            })(l, n),
            m = (0, s.Dv)(P.C),
            v = (0, s.Dv)(f.an),
            k = (0, h.useMemo)(() => Object.values(v), [v]);
          return (0, r.BX)(r.HY, {
            children: [
              (0, r.tZ)(g(), { children: (0, r.tZ)('title', { children: p }) }),
              (0, r.tZ)(h.Suspense, {
                children: (0, r.tZ)(w, { node: m, editorProps: e, plugins: k }),
              }),
            ],
          });
        };
    },
    17915: function (e, t, n) {
      'use strict';
      n.d(t, {
        h: function () {
          return m;
        },
        N: function () {
          return h;
        },
      });
      var r = n(52903),
        a = n(96893),
        l = n(37025),
        o = n(31054),
        i = n(79906),
        u = n(752),
        c = n(2784),
        s = n(28316),
        d = n(32955);
      n(81424);
      let f = (0, c.lazy)(() =>
          Promise.all([n.e(5024), n.e(4057), n.e(280), n.e(9760)])
            .then(n.bind(n, 40899))
            .then(e => ({ default: e.ImagePreviewModal }))
        ),
        p = e => {
          let { onLoad: t, page: n, mode: a, style: i, onInit: s } = e,
            d = (0, u.Dv)(l.E);
          (0, o.kP)(n, 'page should not be null');
          let f = (0, c.useRef)(null),
            p = (0, c.useRef)(null);
          null === f.current &&
            ((f.current = new d()),
            (f.current.autofocus = !0),
            (globalThis.currentEditor = f.current));
          let g = f.current;
          (0, o.kP)(f, 'editorRef.current should not be null'),
            g.mode !== a && (g.mode = a),
            (0, c.useEffect)(() => {
              g.page !== n && ((g.page = n), null === n.root && s(n, g));
            }, [g, n, s]),
            (0, c.useEffect)(() => {
              if (g.page && t) {
                let e = [];
                return (
                  e.push(null == t ? void 0 : t(n, g)),
                  () => {
                    e.filter(e => !!e).forEach(e => e());
                  }
                );
              }
            }, [g, g.page, n, t]);
          let h = (0, c.useRef)(null);
          (0, c.useEffect)(() => {
            let e = f.current;
            (0, o.kP)(e);
            let t = h.current;
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
          }, [g, n]);
          let m = 'editor-wrapper '.concat(g.mode, '-mode');
          return (0, r.tZ)('div', {
            'data-testid': 'editor-'.concat(n.id),
            className: m,
            style: i,
            ref: h,
          });
        },
        g = e =>
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
        h = (0, c.memo)(function () {
          return (0,
          r.BX)('div', { className: 'gl51ce0', children: [(0, r.tZ)(i.Z, { className: 'gl51ce1', animation: 'wave', height: 50 }), (0, r.tZ)(i.Z, { animation: 'wave', height: 30, width: '40%' })] });
        }),
        m = (0, c.memo)(function (e) {
          return (0,
          r.BX)(d.SV, { fallbackRender: (0, c.useCallback)(t => (0, r.tZ)(g, { ...t, onReset: e.onReset }), [e.onReset]), children: [(0, r.tZ)(c.Suspense, { fallback: (0, r.tZ)(h, {}), children: (0, r.tZ)(p, { ...e }) }), a.vc.enableImagePreviewModal && e.page && (0, r.tZ)(c.Suspense, { fallback: null, children: (0, s.createPortal)((0, r.tZ)(f, { workspace: e.page.workspace, pageId: e.page.id }), document.body) })] });
        });
      m.displayName = 'BlockSuiteEditor';
    },
    91013: function (e, t, n) {
      'use strict';
      n.d(t, {
        J: function () {
          return c;
        },
        r: function () {
          return u;
        },
      });
      var r = n(13246),
        a = n(65058),
        l = n(752),
        o = n(2784);
      let i = new WeakMap();
      function u(e) {
        if (!i.has(e)) {
          let t = (0, a.cn)(e.meta.pageMetas);
          i.set(e, t),
            (t.onMount = t => {
              let n = e.meta.pageMetasUpdated.on(() => {
                t(e.meta.pageMetas);
              });
              return () => {
                n.dispose();
              };
            });
        }
        return (0, l.Dv)(i.get(e));
      }
      function c(e) {
        return (0, o.useMemo)(
          () => ({
            setPageTitle: (t, n) => {
              let a = e.getPage(t);
              (0, r.kP)(a);
              let l = a.getBlockByFlavour('affine:page').at(0);
              (0, r.kP)(l),
                a.transact(() => {
                  l.title.delete(0, l.title.length), l.title.insert(n, 0);
                }),
                e.meta.setPageMeta(t, { title: n });
            },
            setPageMeta: (t, n) => {
              e.meta.setPageMeta(t, n);
            },
            getPageMeta: t => e.meta.getPageMeta(t),
            shiftPageMeta: (t, n) => e.meta.shiftPageMeta(t, n),
          }),
          [e]
        );
      }
    },
    85245: function (e, t, n) {
      'use strict';
      n.d(t, {
        j: function () {
          return u;
        },
      });
      var r = n(13246),
        a = n(65058),
        l = n(752);
      let o = new WeakMap(),
        i = (0, a.cn)(null);
      function u(e, t) {
        let n = (function (e, t) {
          if (!t) return i;
          o.has(e) || o.set(e, new Map());
          let n = o.get(e);
          if (((0, r.kP)(n), n.has(t))) return n.get(t);
          {
            let l = (0, a.cn)(e.getPage(t));
            return (
              (l.onMount = n => {
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
              n.set(t, l),
              l
            );
          }
        })(e, t);
        return (0, r.kP)(n), (0, l.Dv)(n);
      }
    },
    81424: function () {},
    13049: function () {},
  },
]);
//# sourceMappingURL=4281.8acfba4806ac0da2.js.map
