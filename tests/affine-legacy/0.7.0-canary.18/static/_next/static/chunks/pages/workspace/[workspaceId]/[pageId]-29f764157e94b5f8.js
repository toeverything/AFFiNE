(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6266],
  {
    61940: function (e, r, t) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/workspace/[workspaceId]/[pageId]',
        function () {
          return t(47024);
        },
      ]);
    },
    47024: function (e, r, t) {
      'use strict';
      t.r(r),
        t.d(r, {
          default: function () {
            return E;
          },
        });
      var n = t(52903),
        o = t(17915);
      t(81951);
      let l = () =>
        (0, n.BX)('div', {
          className: '_1ci2e6i0',
          children: [
            (0, n.tZ)('div', { className: '_1ci2e6i1' }),
            (0, n.tZ)(o.N, {}),
          ],
        });
      var a = t(14192),
        i = t(13246),
        u = t(85245),
        s = t(752),
        c = t(5632),
        d = t(2784),
        p = t(66844),
        h = t(74090),
        f = t(37956),
        v = t(96450),
        k = t(31747),
        m = t(11264);
      let g = () => {
          let e = (0, c.useRouter)(),
            { openPage: r } = (0, k.$)(e),
            t = (0, s.Dv)(a.dv),
            [o] = (0, v.$)();
          (0, i.kP)(o), (0, i.kP)(t);
          let l = o.blockSuiteWorkspace,
            [u, f] = (0, s.KO)((0, h.G9)(t));
          u || f({ mode: 'page' });
          let m = (0, d.useCallback)(
              (e, t) => {
                let n = t.slots.pageLinkClicked.on(e => {
                  let { pageId: t } = e;
                  return r(l.id, t);
                });
                return () => {
                  n.dispose();
                };
              },
              [l.id, r]
            ),
            { PageDetail: g, Header: b } = (0, p.getUIAdapter)(o.flavour);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.tZ)(b, {
                currentWorkspace: o,
                currentEntry: { pageId: t },
              }),
              (0, n.tZ)(g, {
                currentWorkspace: o,
                currentPageId: t,
                onLoadEditor: m,
              }),
            ],
          });
        },
        b = () => {
          let e = (0, c.useRouter)(),
            r = (0, s.Dv)(f.x),
            t = (0, s.Dv)(a.dv),
            o = (0, u.j)(r.blockSuiteWorkspace, t);
          return e.isReady
            ? t && o
              ? (0, n.tZ)(g, {})
              : (0, n.tZ)(l, {}, 'current-page-is-null')
            : (0, n.tZ)(l, {}, 'router-not-ready');
        };
      var E = b;
      b.getLayout = e => (0, n.tZ)(m.PJ, { children: e });
    },
    17915: function (e, r, t) {
      'use strict';
      t.d(r, {
        h: function () {
          return k;
        },
        N: function () {
          return v;
        },
      });
      var n = t(52903),
        o = t(96893),
        l = t(37025),
        a = t(31054),
        i = t(79906),
        u = t(752),
        s = t(2784),
        c = t(28316),
        d = t(32955);
      t(81424);
      let p = (0, s.lazy)(() =>
          Promise.all([t.e(5024), t.e(4057), t.e(280), t.e(9760)])
            .then(t.bind(t, 40899))
            .then(e => ({ default: e.ImagePreviewModal }))
        ),
        h = e => {
          let { onLoad: r, page: t, mode: o, style: i, onInit: c } = e,
            d = (0, u.Dv)(l.E);
          (0, a.kP)(t, 'page should not be null');
          let p = (0, s.useRef)(null),
            h = (0, s.useRef)(null);
          null === p.current &&
            ((p.current = new d()),
            (p.current.autofocus = !0),
            (globalThis.currentEditor = p.current));
          let f = p.current;
          (0, a.kP)(p, 'editorRef.current should not be null'),
            f.mode !== o && (f.mode = o),
            (0, s.useEffect)(() => {
              f.page !== t && ((f.page = t), null === t.root && c(t, f));
            }, [f, t, c]),
            (0, s.useEffect)(() => {
              if (f.page && r) {
                let e = [];
                return (
                  e.push(null == r ? void 0 : r(t, f)),
                  () => {
                    e.filter(e => !!e).forEach(e => e());
                  }
                );
              }
            }, [f, f.page, t, r]);
          let v = (0, s.useRef)(null);
          (0, s.useEffect)(() => {
            let e = p.current;
            (0, a.kP)(e);
            let r = v.current;
            if (r)
              return (
                t.awarenessStore.getFlag('enable_block_hub') &&
                  e
                    .createBlockHub()
                    .then(e => {
                      h.current && h.current.remove(), (h.current = e);
                      let r = document.querySelector('#toolWrapper');
                      r
                        ? r.appendChild(e)
                        : console.warn(
                            'toolWrapper not found, block hub feature will not be available.'
                          );
                    })
                    .catch(e => {
                      console.error(e);
                    }),
                r.appendChild(e),
                () => {
                  var t;
                  null === (t = h.current) || void 0 === t || t.remove(),
                    r.removeChild(e);
                }
              );
          }, [f, t]);
          let k = 'editor-wrapper '.concat(f.mode, '-mode');
          return (0, n.tZ)('div', {
            'data-testid': 'editor-'.concat(t.id),
            className: k,
            style: i,
            ref: v,
          });
        },
        f = e =>
          (0, n.BX)('div', {
            children: [
              (0, n.tZ)('h1', { children: 'Sorry.. there was an error' }),
              (0, n.tZ)('div', { children: e.error.message }),
              (0, n.tZ)('button', {
                'data-testid': 'error-fallback-reset-button',
                onClick: () => {
                  var r;
                  null === (r = e.onReset) || void 0 === r || r.call(e),
                    e.resetErrorBoundary();
                },
                children: 'Try again',
              }),
            ],
          }),
        v = (0, s.memo)(function () {
          return (0,
          n.BX)('div', { className: 'gl51ce0', children: [(0, n.tZ)(i.Z, { className: 'gl51ce1', animation: 'wave', height: 50 }), (0, n.tZ)(i.Z, { animation: 'wave', height: 30, width: '40%' })] });
        }),
        k = (0, s.memo)(function (e) {
          return (0,
          n.BX)(d.SV, { fallbackRender: (0, s.useCallback)(r => (0, n.tZ)(f, { ...r, onReset: e.onReset }), [e.onReset]), children: [(0, n.tZ)(s.Suspense, { fallback: (0, n.tZ)(v, {}), children: (0, n.tZ)(h, { ...e }) }), o.vc.enableImagePreviewModal && e.page && (0, n.tZ)(s.Suspense, { fallback: null, children: (0, c.createPortal)((0, n.tZ)(p, { workspace: e.page.workspace, pageId: e.page.id }), document.body) })] });
        });
      k.displayName = 'BlockSuiteEditor';
    },
    81424: function () {},
    81951: function () {},
    32955: function (e, r, t) {
      'use strict';
      t.d(r, {
        SV: function () {
          return a;
        },
      });
      var n = t(2784);
      let o = (0, n.createContext)(null),
        l = { didCatch: !1, error: null };
      class a extends n.Component {
        constructor(e) {
          super(e),
            (this.resetErrorBoundary = this.resetErrorBoundary.bind(this)),
            (this.state = l);
        }
        static getDerivedStateFromError(e) {
          return { didCatch: !0, error: e };
        }
        resetErrorBoundary() {
          let { error: e } = this.state;
          if (null !== e) {
            for (
              var r, t, n = arguments.length, o = Array(n), a = 0;
              a < n;
              a++
            )
              o[a] = arguments[a];
            null === (r = (t = this.props).onReset) ||
              void 0 === r ||
              r.call(t, { args: o, reason: 'imperative-api' }),
              this.setState(l);
          }
        }
        componentDidCatch(e, r) {
          var t, n;
          null === (t = (n = this.props).onError) ||
            void 0 === t ||
            t.call(n, e, r);
        }
        componentDidUpdate(e, r) {
          let { didCatch: t } = this.state,
            { resetKeys: n } = this.props;
          if (
            t &&
            null !== r.error &&
            (function () {
              let e =
                  arguments.length > 0 && void 0 !== arguments[0]
                    ? arguments[0]
                    : [],
                r =
                  arguments.length > 1 && void 0 !== arguments[1]
                    ? arguments[1]
                    : [];
              return (
                e.length !== r.length || e.some((e, t) => !Object.is(e, r[t]))
              );
            })(e.resetKeys, n)
          ) {
            var o, a;
            null === (o = (a = this.props).onReset) ||
              void 0 === o ||
              o.call(a, { next: n, prev: e.resetKeys, reason: 'keys' }),
              this.setState(l);
          }
        }
        render() {
          let {
              children: e,
              fallbackRender: r,
              FallbackComponent: t,
              fallback: l,
            } = this.props,
            { didCatch: a, error: i } = this.state,
            u = e;
          if (a) {
            let e = { error: i, resetErrorBoundary: this.resetErrorBoundary };
            if ((0, n.isValidElement)(l)) u = l;
            else if ('function' == typeof r) u = r(e);
            else if (t) u = (0, n.createElement)(t, e);
            else
              throw Error(
                'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
              );
          }
          return (0, n.createElement)(
            o.Provider,
            {
              value: {
                didCatch: a,
                error: i,
                resetErrorBoundary: this.resetErrorBoundary,
              },
            },
            u
          );
        }
      }
    },
  },
  function (e) {
    e.O(0, [5024, 4057, 6882, 6675, 1866, 1264, 9774, 2888, 179], function () {
      return e((e.s = 61940));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=[pageId]-29f764157e94b5f8.js.map
