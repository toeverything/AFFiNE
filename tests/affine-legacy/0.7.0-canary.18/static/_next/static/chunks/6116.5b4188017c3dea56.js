(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6116],
  {
    56116: function (e, r, t) {
      'use strict';
      t.r(r);
      var n = t(52903),
        l = t(33027),
        o = t(91337),
        a = t(62980),
        i = t(13246),
        s = t(2784),
        u = t(35698);
      let c = (0, a.LM)('test', o.b8.LOCAL, {
          idGenerator: i.RO.AutoIncrement,
        }),
        d = c.createPage({ id: 'page0' }),
        h = () => {
          let e = (0, s.useCallback)(
            (e, r) => (
              (globalThis.page = e), (globalThis.editor = r), () => void 0
            ),
            []
          );
          return d
            ? (0, n.tZ)(u.h, { page: d, mode: 'page', onInit: l.E, onLoad: e })
            : (0, n.tZ)(n.HY, { children: 'loading...' });
        };
      r.default = h;
    },
    35698: function (e, r, t) {
      'use strict';
      t.d(r, {
        h: function () {
          return n.h;
        },
      });
      var n = t(17915);
    },
    17915: function (e, r, t) {
      'use strict';
      t.d(r, {
        h: function () {
          return m;
        },
        N: function () {
          return v;
        },
      });
      var n = t(52903),
        l = t(96893),
        o = t(37025),
        a = t(31054),
        i = t(79906),
        s = t(752),
        u = t(2784),
        c = t(28316),
        d = t(32955);
      t(81424);
      let h = (0, u.lazy)(() =>
          Promise.all([t.e(5024), t.e(4057), t.e(280), t.e(9760)])
            .then(t.bind(t, 40899))
            .then(e => ({ default: e.ImagePreviewModal }))
        ),
        p = e => {
          let { onLoad: r, page: t, mode: l, style: i, onInit: c } = e,
            d = (0, s.Dv)(o.E);
          (0, a.kP)(t, 'page should not be null');
          let h = (0, u.useRef)(null),
            p = (0, u.useRef)(null);
          null === h.current &&
            ((h.current = new d()),
            (h.current.autofocus = !0),
            (globalThis.currentEditor = h.current));
          let f = h.current;
          (0, a.kP)(h, 'editorRef.current should not be null'),
            f.mode !== l && (f.mode = l),
            (0, u.useEffect)(() => {
              f.page !== t && ((f.page = t), null === t.root && c(t, f));
            }, [f, t, c]),
            (0, u.useEffect)(() => {
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
          let v = (0, u.useRef)(null);
          (0, u.useEffect)(() => {
            let e = h.current;
            (0, a.kP)(e);
            let r = v.current;
            if (r)
              return (
                t.awarenessStore.getFlag('enable_block_hub') &&
                  e
                    .createBlockHub()
                    .then(e => {
                      p.current && p.current.remove(), (p.current = e);
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
                  null === (t = p.current) || void 0 === t || t.remove(),
                    r.removeChild(e);
                }
              );
          }, [f, t]);
          let m = 'editor-wrapper '.concat(f.mode, '-mode');
          return (0, n.tZ)('div', {
            'data-testid': 'editor-'.concat(t.id),
            className: m,
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
        v = (0, u.memo)(function () {
          return (0,
          n.BX)('div', { className: 'gl51ce0', children: [(0, n.tZ)(i.Z, { className: 'gl51ce1', animation: 'wave', height: 50 }), (0, n.tZ)(i.Z, { animation: 'wave', height: 30, width: '40%' })] });
        }),
        m = (0, u.memo)(function (e) {
          return (0,
          n.BX)(d.SV, { fallbackRender: (0, u.useCallback)(r => (0, n.tZ)(f, { ...r, onReset: e.onReset }), [e.onReset]), children: [(0, n.tZ)(u.Suspense, { fallback: (0, n.tZ)(v, {}), children: (0, n.tZ)(p, { ...e }) }), l.vc.enableImagePreviewModal && e.page && (0, n.tZ)(u.Suspense, { fallback: null, children: (0, c.createPortal)((0, n.tZ)(h, { workspace: e.page.workspace, pageId: e.page.id }), document.body) })] });
        });
      m.displayName = 'BlockSuiteEditor';
    },
    81424: function () {},
    32955: function (e, r, t) {
      'use strict';
      t.d(r, {
        SV: function () {
          return a;
        },
      });
      var n = t(2784);
      let l = (0, n.createContext)(null),
        o = { didCatch: !1, error: null };
      class a extends n.Component {
        constructor(e) {
          super(e),
            (this.resetErrorBoundary = this.resetErrorBoundary.bind(this)),
            (this.state = o);
        }
        static getDerivedStateFromError(e) {
          return { didCatch: !0, error: e };
        }
        resetErrorBoundary() {
          let { error: e } = this.state;
          if (null !== e) {
            for (
              var r, t, n = arguments.length, l = Array(n), a = 0;
              a < n;
              a++
            )
              l[a] = arguments[a];
            null === (r = (t = this.props).onReset) ||
              void 0 === r ||
              r.call(t, { args: l, reason: 'imperative-api' }),
              this.setState(o);
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
            var l, a;
            null === (l = (a = this.props).onReset) ||
              void 0 === l ||
              l.call(a, { next: n, prev: e.resetKeys, reason: 'keys' }),
              this.setState(o);
          }
        }
        render() {
          let {
              children: e,
              fallbackRender: r,
              FallbackComponent: t,
              fallback: o,
            } = this.props,
            { didCatch: a, error: i } = this.state,
            s = e;
          if (a) {
            let e = { error: i, resetErrorBoundary: this.resetErrorBoundary };
            if ((0, n.isValidElement)(o)) s = o;
            else if ('function' == typeof r) s = r(e);
            else if (t) s = (0, n.createElement)(t, e);
            else
              throw Error(
                'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
              );
          }
          return (0, n.createElement)(
            l.Provider,
            {
              value: {
                didCatch: a,
                error: i,
                resetErrorBoundary: this.resetErrorBoundary,
              },
            },
            s
          );
        }
      }
    },
  },
]);
//# sourceMappingURL=6116.5b4188017c3dea56.js.map
