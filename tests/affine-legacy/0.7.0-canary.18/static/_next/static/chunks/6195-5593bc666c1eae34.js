'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6195],
  {
    32955: function (e, t, r) {
      r.d(t, {
        SV: function () {
          return u;
        },
      });
      var n = r(2784);
      let l = (0, n.createContext)(null),
        i = { didCatch: !1, error: null };
      class u extends n.Component {
        constructor(e) {
          super(e),
            (this.resetErrorBoundary = this.resetErrorBoundary.bind(this)),
            (this.state = i);
        }
        static getDerivedStateFromError(e) {
          return { didCatch: !0, error: e };
        }
        resetErrorBoundary() {
          let { error: e } = this.state;
          if (null !== e) {
            for (
              var t, r, n = arguments.length, l = Array(n), u = 0;
              u < n;
              u++
            )
              l[u] = arguments[u];
            null === (t = (r = this.props).onReset) ||
              void 0 === t ||
              t.call(r, { args: l, reason: 'imperative-api' }),
              this.setState(i);
          }
        }
        componentDidCatch(e, t) {
          var r, n;
          null === (r = (n = this.props).onError) ||
            void 0 === r ||
            r.call(n, e, t);
        }
        componentDidUpdate(e, t) {
          let { didCatch: r } = this.state,
            { resetKeys: n } = this.props;
          if (
            r &&
            null !== t.error &&
            (function () {
              let e =
                  arguments.length > 0 && void 0 !== arguments[0]
                    ? arguments[0]
                    : [],
                t =
                  arguments.length > 1 && void 0 !== arguments[1]
                    ? arguments[1]
                    : [];
              return (
                e.length !== t.length || e.some((e, r) => !Object.is(e, t[r]))
              );
            })(e.resetKeys, n)
          ) {
            var l, u;
            null === (l = (u = this.props).onReset) ||
              void 0 === l ||
              l.call(u, { next: n, prev: e.resetKeys, reason: 'keys' }),
              this.setState(i);
          }
        }
        render() {
          let {
              children: e,
              fallbackRender: t,
              FallbackComponent: r,
              fallback: i,
            } = this.props,
            { didCatch: u, error: o } = this.state,
            a = e;
          if (u) {
            let e = { error: o, resetErrorBoundary: this.resetErrorBoundary };
            if ((0, n.isValidElement)(i)) a = i;
            else if ('function' == typeof t) a = t(e);
            else if (r) a = (0, n.createElement)(r, e);
            else
              throw Error(
                'react-error-boundary requires either a fallback, fallbackRender, or FallbackComponent prop'
              );
          }
          return (0, n.createElement)(
            l.Provider,
            {
              value: {
                didCatch: u,
                error: o,
                resetErrorBoundary: this.resetErrorBoundary,
              },
            },
            a
          );
        }
      }
    },
    45943: function (e, t, r) {
      r.d(t, {
        OT: function () {
          return Z;
        },
        eh: function () {
          return Q;
        },
        s_: function () {
          return x;
        },
      });
      var n,
        l = r(2784);
      let {
          createElement: i,
          createContext: u,
          forwardRef: o,
          useCallback: a,
          useContext: c,
          useEffect: s,
          useImperativeHandle: d,
          useLayoutEffect: f,
          useMemo: h,
          useRef: m,
          useState: p,
        } = n || (n = r.t(l, 2)),
        v = (n || (n = r.t(l, 2)))['useId'.toString()],
        z = !!(
          'undefined' != typeof window &&
          void 0 !== window.document &&
          void 0 !== window.document.createElement
        ),
        g = z ? f : () => {},
        w = 'function' == typeof v ? v : () => null,
        y = 0;
      function b(e = null) {
        let t = w(),
          r = m(e || t || null);
        return null === r.current && (r.current = '' + y++), r.current;
      }
      let E = u(null);
      function S({
        children: e = null,
        className: t = '',
        collapsible: r = !1,
        defaultSize: n = null,
        forwardedRef: l,
        id: u = null,
        maxSize: o = 100,
        minSize: a = 10,
        onCollapse: f = null,
        onResize: h = null,
        order: p = null,
        style: v = {},
        tagName: z = 'div',
      }) {
        let w = c(E);
        if (null === w)
          throw Error(
            'Panel components must be rendered within a PanelGroup container'
          );
        let y = b(u),
          {
            collapsePanel: S,
            expandPanel: x,
            getPanelStyle: P,
            registerPanel: A,
            resizePanel: I,
            unregisterPanel: L,
          } = w,
          C = m({ onCollapse: f, onResize: h });
        if (
          (s(() => {
            (C.current.onCollapse = f), (C.current.onResize = h);
          }),
          a < 0 || a > 100)
        )
          throw Error(`Panel minSize must be between 0 and 100, but was ${a}`);
        if (o < 0 || o > 100)
          throw Error(`Panel maxSize must be between 0 and 100, but was ${o}`);
        if (null !== n) {
          if (n < 0 || n > 100)
            throw Error(
              `Panel defaultSize must be between 0 and 100, but was ${n}`
            );
          a > n &&
            !r &&
            (console.error(
              `Panel minSize ${a} cannot be greater than defaultSize ${n}`
            ),
            (n = a));
        }
        let M = P(y, n),
          N = m({ size: k(M) }),
          R = m({
            callbacksRef: C,
            collapsible: r,
            defaultSize: n,
            id: y,
            maxSize: o,
            minSize: a,
            order: p,
          });
        return (
          g(() => {
            (N.current.size = k(M)),
              (R.current.callbacksRef = C),
              (R.current.collapsible = r),
              (R.current.defaultSize = n),
              (R.current.id = y),
              (R.current.maxSize = o),
              (R.current.minSize = a),
              (R.current.order = p);
          }),
          g(
            () => (
              A(y, R),
              () => {
                L(y);
              }
            ),
            [p, y, A, L]
          ),
          d(
            l,
            () => ({
              collapse: () => S(y),
              expand: () => x(y),
              getCollapsed: () => 0 === N.current.size,
              getSize: () => N.current.size,
              resize: e => I(y, e),
            }),
            [S, x, y, I]
          ),
          i(z, {
            children: e,
            className: t,
            'data-panel': '',
            'data-panel-collapsible': r || void 0,
            'data-panel-id': y,
            'data-panel-size': parseFloat('' + M.flexGrow).toFixed(1),
            id: `data-panel-id-${y}`,
            style: { ...M, ...v },
          })
        );
      }
      E.displayName = 'PanelGroupContext';
      let x = o((e, t) => i(S, { ...e, forwardedRef: t }));
      function k(e) {
        let { flexGrow: t } = e;
        return 'string' == typeof t ? parseFloat(t) : t;
      }
      function P(e, t, r, n, l, i, u, o) {
        let { sizes: a } = o || {},
          c = a || i;
        if (0 === l) return c;
        let s = $(t),
          d = c.concat(),
          f = 0;
        {
          let t = l < 0 ? n : r,
            i = s.findIndex(e => e.current.id === t),
            o = s[i],
            a = c[i],
            d = B(o, Math.abs(l), a, e);
          if (a === d) return c;
          0 === d && a > 0 && u.set(t, a), (l = l < 0 ? a - d : d - a);
        }
        let h = l < 0 ? r : n,
          m = s.findIndex(e => e.current.id === h);
        for (;;) {
          let t = s[m],
            r = c[m],
            n = Math.abs(l) - Math.abs(f),
            i = B(t, 0 - n, r, e);
          if (
            r !== i &&
            (0 === i && r > 0 && u.set(t.current.id, r),
            (f += r - i),
            (d[m] = i),
            f
              .toPrecision(10)
              .localeCompare(Math.abs(l).toPrecision(10), void 0, {
                numeric: !0,
              }) >= 0)
          )
            break;
          if (l < 0) {
            if (--m < 0) break;
          } else if (++m >= s.length) break;
        }
        return 0 === f
          ? c
          : ((h = l < 0 ? n : r),
            (d[(m = s.findIndex(e => e.current.id === h))] = c[m] + f),
            d);
      }
      function A(e, t, r) {
        t.forEach((t, n) => {
          let { callbacksRef: l, collapsible: i, id: u } = e[n].current,
            o = r[u];
          if (o !== t) {
            r[u] = t;
            let { onCollapse: e, onResize: n } = l.current;
            n && n(t),
              i && e && (o || 0 === t ? 0 !== o && 0 === t && e(!0) : e(!1));
          }
        });
      }
      function I(e, t) {
        if (t.length < 2) return [null, null];
        let r = t.findIndex(t => t.current.id === e);
        if (r < 0) return [null, null];
        let n = r === t.length - 1,
          l = n ? t[r - 1].current.id : e,
          i = n ? e : t[r + 1].current.id;
        return [l, i];
      }
      function L(e, t, r) {
        if (1 === e.size) return '100';
        let n = $(e),
          l = n.findIndex(e => e.current.id === t),
          i = r[l];
        return null == i ? '0' : i.toPrecision(10);
      }
      function C(e) {
        let t = document.querySelector(`[data-panel-group-id="${e}"]`);
        return t || null;
      }
      function M(e) {
        let t = document.querySelector(`[data-panel-resize-handle-id="${e}"]`);
        return t || null;
      }
      function N() {
        return Array.from(
          document.querySelectorAll('[data-panel-resize-handle-id]')
        );
      }
      function R(e) {
        return Array.from(
          document.querySelectorAll(
            `[data-panel-resize-handle-id][data-panel-group-id="${e}"]`
          )
        );
      }
      function D(e, t, r) {
        let n = M(t),
          l = R(e),
          i = n ? l.indexOf(n) : -1,
          u = r[i]?.current?.id ?? null,
          o = r[i + 1]?.current?.id ?? null;
        return [u, o];
      }
      function $(e) {
        return Array.from(e.values()).sort((e, t) => {
          let r = e.current.order,
            n = t.current.order;
          return null == r && null == n
            ? 0
            : null == r
            ? -1
            : null == n
            ? 1
            : r - n;
        });
      }
      function B(e, t, r, n) {
        let l = r + t;
        if (e.current.collapsible) {
          if (r > 0) {
            if (l <= e.current.minSize / 2) return 0;
          } else {
            let t = n?.type?.startsWith('key');
            if (!t && l < e.current.minSize) return 0;
          }
        }
        let i = Math.min(e.current.maxSize, Math.max(e.current.minSize, l));
        return i;
      }
      function G(e, t = 'Assertion failed!') {
        if (!e) throw (console.error(t), Error(t));
      }
      function O(e, t, r, n = 0, l = null) {
        let i = 'horizontal' === r,
          u = 0;
        if (F(e)) u = i ? e.clientX : e.clientY;
        else {
          if (!T(e)) return 0;
          let t = e.touches[0];
          u = i ? t.screenX : t.screenY;
        }
        let o = M(t),
          a = l || o.getBoundingClientRect(),
          c = i ? a.left : a.top;
        return u - c - n;
      }
      function F(e) {
        return e.type.startsWith('mouse');
      }
      function T(e) {
        return e.type.startsWith('touch');
      }
      (S.displayName = 'Panel'), (x.displayName = 'forwardRef(Panel)');
      let q = null,
        H = null;
      function _(e) {
        switch (e) {
          case 'horizontal':
            return 'ew-resize';
          case 'horizontal-max':
            return 'w-resize';
          case 'horizontal-min':
            return 'e-resize';
          case 'vertical':
            return 'ns-resize';
          case 'vertical-max':
            return 'n-resize';
          case 'vertical-min':
            return 's-resize';
        }
      }
      function K(e) {
        if (q === e) return;
        q = e;
        let t = _(e);
        null === H &&
          ((H = document.createElement('style')), document.head.appendChild(H)),
          (H.innerHTML = `*{cursor: ${t}!important;}`);
      }
      function U(e) {
        return e
          .map(e => {
            let { minSize: t, order: r } = e.current;
            return r ? `${r}:${t}` : `${t}`;
          })
          .sort((e, t) => e.localeCompare(t))
          .join(',');
      }
      function j(e, t) {
        try {
          let r = t.getItem(`PanelGroup:sizes:${e}`);
          if (r) {
            let e = JSON.parse(r);
            if ('object' == typeof e && null != e) return e;
          }
        } catch (e) {}
        return null;
      }
      function W(e, t, r, n) {
        let l = U(t),
          i = j(e, n) || {};
        i[l] = r;
        try {
          n.setItem(`PanelGroup:sizes:${e}`, JSON.stringify(i));
        } catch (e) {
          console.error(e);
        }
      }
      let J = {};
      function V(e) {
        try {
          if ('undefined' != typeof localStorage)
            (e.getItem = e => localStorage.getItem(e)),
              (e.setItem = (e, t) => {
                localStorage.setItem(e, t);
              });
          else throw Error('localStorage not supported in this environment');
        } catch (t) {
          console.error(t), (e.getItem = () => null), (e.setItem = () => {});
        }
      }
      let X = {
        getItem: e => (V(X), X.getItem(e)),
        setItem: (e, t) => {
          V(X), X.setItem(e, t);
        },
      };
      function Y({
        autoSaveId: e,
        children: t = null,
        className: r = '',
        direction: n,
        disablePointerEventsDuringResize: l = !1,
        forwardedRef: u,
        id: o = null,
        onLayout: c,
        storage: f = X,
        style: v = {},
        tagName: z = 'div',
      }) {
        let w = b(o),
          [y, S] = p(null),
          [x, k] = p(new Map()),
          N = m(null),
          B = m({ onLayout: c });
        s(() => {
          B.current.onLayout = c;
        });
        let _ = m({}),
          [V, Y] = p([]),
          Q = m(new Map()),
          Z = m(0),
          ee = m({ direction: n, panels: x, sizes: V });
        d(
          u,
          () => ({
            getLayout: () => {
              let { sizes: e } = ee.current;
              return e;
            },
            setLayout: e => {
              let t = e.reduce((e, t) => e + t, 0);
              G(100 === t, 'Panel sizes must add up to 100%');
              let { panels: r } = ee.current,
                n = _.current,
                l = $(r);
              A(l, e, n), Y(e);
            },
          }),
          []
        ),
          g(() => {
            (ee.current.direction = n),
              (ee.current.panels = x),
              (ee.current.sizes = V);
          }),
          (function ({
            committedValuesRef: e,
            groupId: t,
            panels: r,
            setSizes: n,
            sizes: l,
            panelSizeBeforeCollapse: i,
          }) {
            s(() => {
              let { direction: r, panels: u } = e.current,
                o = C(t),
                { height: a, width: c } = o.getBoundingClientRect(),
                s = R(t),
                d = s.map(e => {
                  let o = e.getAttribute('data-panel-resize-handle-id'),
                    s = $(u),
                    [d, f] = D(t, o, s);
                  if (null == d || null == f) return () => {};
                  let h = 0,
                    m = 100,
                    p = 0,
                    v = 0;
                  s.forEach(e => {
                    e.current.id === d
                      ? ((m = e.current.maxSize), (h = e.current.minSize))
                      : ((p += e.current.minSize), (v += e.current.maxSize));
                  });
                  let z = Math.min(m, 100 - p),
                    g = Math.max(h, (s.length - 1) * 100 - v),
                    w = L(u, d, l);
                  e.setAttribute('aria-valuemax', '' + Math.round(z)),
                    e.setAttribute('aria-valuemin', '' + Math.round(g)),
                    e.setAttribute(
                      'aria-valuenow',
                      '' + Math.round(parseInt(w))
                    );
                  let y = e => {
                    if (!e.defaultPrevented && 'Enter' === e.key) {
                      e.preventDefault();
                      let t = s.findIndex(e => e.current.id === d);
                      if (t >= 0) {
                        let o = s[t],
                          h = l[t];
                        if (null != h) {
                          let t = 0;
                          t =
                            h.toPrecision(10) <=
                            o.current.minSize.toPrecision(10)
                              ? 'horizontal' === r
                                ? c
                                : a
                              : -('horizontal' === r ? c : a);
                          let s = P(e, u, d, f, t, l, i.current, null);
                          l !== s && n(s);
                        }
                      }
                    }
                  };
                  e.addEventListener('keydown', y);
                  let b = (function (e) {
                    let t = document.querySelector(`[data-panel-id="${e}"]`);
                    return t || null;
                  })(d);
                  return (
                    null != b && e.setAttribute('aria-controls', b.id),
                    () => {
                      e.removeAttribute('aria-valuemax'),
                        e.removeAttribute('aria-valuemin'),
                        e.removeAttribute('aria-valuenow'),
                        e.removeEventListener('keydown', y),
                        null != b && e.removeAttribute('aria-controls');
                    }
                  );
                });
              return () => {
                d.forEach(e => e());
              };
            }, [e, t, r, i, n, l]);
          })({
            committedValuesRef: ee,
            groupId: w,
            panels: x,
            setSizes: Y,
            sizes: V,
            panelSizeBeforeCollapse: Q,
          }),
          s(() => {
            let { onLayout: e } = B.current;
            if (e) {
              let { panels: t, sizes: r } = ee.current;
              if (r.length > 0) {
                e(r);
                let n = _.current,
                  l = $(t);
                A(l, r, n);
              }
            }
          }, [V]),
          g(() => {
            let t = ee.current.sizes;
            if (t.length === x.size) return;
            let r = null;
            if (e) {
              let t = $(x);
              r = (function (e, t, r) {
                let n = j(e, r);
                if (n) {
                  let e = U(t);
                  return n[e] ?? null;
                }
                return null;
              })(e, t, f);
            }
            if (null != r) Y(r);
            else {
              let e = $(x),
                t = 0,
                r = 0,
                n = 0;
              if (
                (e.forEach(e => {
                  (n += e.current.minSize),
                    null === e.current.defaultSize
                      ? t++
                      : (r += e.current.defaultSize);
                }),
                r > 100)
              )
                throw Error('Default panel sizes cannot exceed 100%');
              if (e.length > 1 && 0 === t && 100 !== r)
                throw Error('Invalid default sizes specified for panels');
              if (n > 100)
                throw Error('Minimum panel sizes cannot exceed 100%');
              Y(
                e.map(e =>
                  null === e.current.defaultSize
                    ? (100 - r) / t
                    : e.current.defaultSize
                )
              );
            }
          }, [e, x, f]),
          s(() => {
            if (e) {
              if (0 === V.length || V.length !== x.size) return;
              let t = $(x);
              J[e] ||
                (J[e] = (function (e, t = 10) {
                  let r = null;
                  return (...n) => {
                    null !== r && clearTimeout(r),
                      (r = setTimeout(() => {
                        e(...n);
                      }, t));
                  };
                })(W, 100)),
                J[e](e, t, V, f);
            }
          }, [e, x, V, f]);
        let et = a(
            (e, t) => {
              let { panels: r } = ee.current;
              if (0 === r.size)
                return {
                  flexBasis: 0,
                  flexGrow: null != t ? t : void 0,
                  flexShrink: 1,
                  overflow: 'hidden',
                };
              let n = L(r, e, V);
              return {
                flexBasis: 0,
                flexGrow: n,
                flexShrink: 1,
                overflow: 'hidden',
                pointerEvents: l && null !== y ? 'none' : void 0,
              };
            },
            [y, l, V]
          ),
          er = a((e, t) => {
            k(r => {
              if (r.has(e)) return r;
              let n = new Map(r);
              return n.set(e, t), n;
            });
          }, []),
          en = a(
            e => {
              let t = t => {
                t.preventDefault();
                let { direction: r, panels: n, sizes: l } = ee.current,
                  i = $(n),
                  [u, o] = D(w, e, i);
                if (null == u || null == o) return;
                let a = (function (e, t, r, n, l, i, u) {
                  let {
                    dragOffset: o = 0,
                    dragHandleRect: a,
                    sizes: c,
                  } = u || {};
                  if ('keydown' !== e.type) return O(e, r, l, o, a);
                  {
                    let u = 'horizontal' === l,
                      o = C(t),
                      a = o.getBoundingClientRect(),
                      s = u ? a.width : a.height,
                      d = e.shiftKey ? 10 : 100,
                      f = s / d,
                      h = 0;
                    switch (e.key) {
                      case 'ArrowDown':
                        h = u ? 0 : f;
                        break;
                      case 'ArrowLeft':
                        h = u ? -f : 0;
                        break;
                      case 'ArrowRight':
                        h = u ? f : 0;
                        break;
                      case 'ArrowUp':
                        h = u ? 0 : -f;
                        break;
                      case 'End':
                        h = s;
                        break;
                      case 'Home':
                        h = -s;
                    }
                    let [m, p] = D(t, r, n),
                      v = h < 0 ? m : p,
                      z = n.findIndex(e => e.current.id === v),
                      g = n[z];
                    if (g.current.collapsible) {
                      let e = (c || i)[z];
                      (0 === e ||
                        e.toPrecision(10) ===
                          g.current.minSize.toPrecision(10)) &&
                        (h =
                          h < 0
                            ? -g.current.minSize * s
                            : g.current.minSize * s);
                    }
                    return h;
                  }
                })(t, w, e, i, r, l, N.current);
                if (0 === a) return;
                let c = C(w),
                  s = c.getBoundingClientRect(),
                  d = 'horizontal' === r;
                'rtl' === document.dir && d && (a = -a);
                let f = d ? s.width : s.height,
                  h = (a / f) * 100,
                  m = P(t, n, u, o, h, l, Q.current, N.current),
                  p = !(function (e, t) {
                    if (e.length !== t.length) return !1;
                    for (let r = 0; r < e.length; r++)
                      if (e[r] !== t[r]) return !1;
                    return !0;
                  })(l, m);
                if (
                  ((F(t) || T(t)) &&
                    Z.current != h &&
                    (p
                      ? K(d ? 'horizontal' : 'vertical')
                      : d
                      ? K(a < 0 ? 'horizontal-min' : 'horizontal-max')
                      : K(a < 0 ? 'vertical-min' : 'vertical-max')),
                  p)
                ) {
                  let e = _.current;
                  A(i, m, e), Y(m);
                }
                Z.current = h;
              };
              return t;
            },
            [w]
          ),
          el = a(e => {
            k(t => {
              if (!t.has(e)) return t;
              let r = new Map(t);
              return r.delete(e), r;
            });
          }, []),
          ei = a(e => {
            let { panels: t, sizes: r } = ee.current,
              n = t.get(e);
            if (null == n || !n.current.collapsible) return;
            let l = $(t),
              i = l.indexOf(n);
            if (i < 0) return;
            let u = r[i];
            if (0 === u) return;
            Q.current.set(e, u);
            let [o, a] = I(e, l);
            if (null == o || null == a) return;
            let c = i === l.length - 1,
              s = P(null, t, o, a, c ? u : 0 - u, r, Q.current, null);
            if (r !== s) {
              let e = _.current;
              A(l, s, e), Y(s);
            }
          }, []),
          eu = a(e => {
            let { panels: t, sizes: r } = ee.current,
              n = t.get(e);
            if (null == n) return;
            let l = Q.current.get(e) || n.current.minSize;
            if (!l) return;
            let i = $(t),
              u = i.indexOf(n);
            if (u < 0) return;
            let o = r[u];
            if (0 !== o) return;
            let [a, c] = I(e, i);
            if (null == a || null == c) return;
            let s = u === i.length - 1,
              d = P(null, t, a, c, s ? 0 - l : l, r, Q.current, null);
            if (r !== d) {
              let e = _.current;
              A(i, d, e), Y(d);
            }
          }, []),
          eo = a((e, t) => {
            let { panels: r, sizes: n } = ee.current,
              l = r.get(e);
            if (null == l) return;
            let i = $(r),
              u = i.indexOf(l);
            if (u < 0) return;
            let o = n[u];
            if (o === t) return;
            (l.current.collapsible && 0 === t) ||
              (t = Math.min(l.current.maxSize, Math.max(l.current.minSize, t)));
            let [a, c] = I(e, i);
            if (null == a || null == c) return;
            let s = u === i.length - 1,
              d = s ? o - t : t - o,
              f = P(null, r, a, c, d, n, Q.current, null);
            if (n !== f) {
              let e = _.current;
              A(i, f, e), Y(f);
            }
          }, []),
          ea = h(
            () => ({
              activeHandleId: y,
              collapsePanel: ei,
              direction: n,
              expandPanel: eu,
              getPanelStyle: et,
              groupId: w,
              registerPanel: er,
              registerResizeHandle: en,
              resizePanel: eo,
              startDragging: (e, t) => {
                if ((S(e), F(t) || T(t))) {
                  let r = M(e);
                  N.current = {
                    dragHandleRect: r.getBoundingClientRect(),
                    dragOffset: O(t, e, n),
                    sizes: ee.current.sizes,
                  };
                }
              },
              stopDragging: () => {
                null !== H &&
                  (document.head.removeChild(H), (q = null), (H = null)),
                  S(null),
                  (N.current = null);
              },
              unregisterPanel: el,
            }),
            [y, ei, n, eu, et, w, er, en, eo, el]
          );
        return i(E.Provider, {
          children: i(z, {
            children: t,
            className: r,
            'data-panel-group': '',
            'data-panel-group-direction': n,
            'data-panel-group-id': w,
            style: {
              display: 'flex',
              flexDirection: 'horizontal' === n ? 'row' : 'column',
              height: '100%',
              overflow: 'hidden',
              width: '100%',
              ...v,
            },
          }),
          value: ea,
        });
      }
      let Q = o((e, t) => i(Y, { ...e, forwardedRef: t }));
      function Z({
        children: e = null,
        className: t = '',
        disabled: r = !1,
        id: n = null,
        onDragging: l,
        style: u = {},
        tagName: o = 'div',
      }) {
        let d = m(null),
          f = m({ onDragging: l });
        s(() => {
          f.current.onDragging = l;
        });
        let h = c(E);
        if (null === h)
          throw Error(
            'PanelResizeHandle components must be rendered within a PanelGroup container'
          );
        let {
            activeHandleId: v,
            direction: z,
            groupId: g,
            registerResizeHandle: w,
            startDragging: y,
            stopDragging: S,
          } = h,
          x = b(n),
          k = v === x,
          [P, A] = p(!1),
          [I, L] = p(null),
          C = a(() => {
            let e = d.current;
            e.blur(), S();
            let { onDragging: t } = f.current;
            t && t(!1);
          }, [S]);
        s(() => {
          if (r) L(null);
          else {
            let e = w(x);
            L(() => e);
          }
        }, [r, x, w]),
          s(() => {
            if (r || null == I || !k) return;
            let e = e => {
                I(e);
              },
              t = e => {
                I(e);
              },
              n = d.current,
              l = n.ownerDocument;
            return (
              l.body.addEventListener('contextmenu', C),
              l.body.addEventListener('mousemove', e),
              l.body.addEventListener('touchmove', e),
              l.body.addEventListener('mouseleave', t),
              window.addEventListener('mouseup', C),
              window.addEventListener('touchend', C),
              () => {
                l.body.removeEventListener('contextmenu', C),
                  l.body.removeEventListener('mousemove', e),
                  l.body.removeEventListener('touchmove', e),
                  l.body.removeEventListener('mouseleave', t),
                  window.removeEventListener('mouseup', C),
                  window.removeEventListener('touchend', C);
              }
            );
          }, [z, r, k, I, C]),
          (function ({ disabled: e, handleId: t, resizeHandler: r }) {
            s(() => {
              if (e || null == r) return;
              let n = M(t);
              if (null == n) return;
              let l = e => {
                if (!e.defaultPrevented)
                  switch (e.key) {
                    case 'ArrowDown':
                    case 'ArrowLeft':
                    case 'ArrowRight':
                    case 'ArrowUp':
                    case 'End':
                    case 'Home':
                      e.preventDefault(), r(e);
                      break;
                    case 'F6': {
                      e.preventDefault();
                      let r = N(),
                        n = (function (e) {
                          let t = N(),
                            r = t.findIndex(
                              t =>
                                t.getAttribute(
                                  'data-panel-resize-handle-id'
                                ) === e
                            );
                          return r ?? null;
                        })(t);
                      G(null !== n);
                      let l = e.shiftKey
                          ? n > 0
                            ? n - 1
                            : r.length - 1
                          : n + 1 < r.length
                          ? n + 1
                          : 0,
                        i = r[l];
                      i.focus();
                    }
                  }
              };
              return (
                n.addEventListener('keydown', l),
                () => {
                  n.removeEventListener('keydown', l);
                }
              );
            }, [e, t, r]);
          })({ disabled: r, handleId: x, resizeHandler: I });
        let R = { cursor: _(z), touchAction: 'none', userSelect: 'none' };
        return i(o, {
          children: e,
          className: t,
          'data-resize-handle-active': k ? 'pointer' : P ? 'keyboard' : void 0,
          'data-panel-group-direction': z,
          'data-panel-group-id': g,
          'data-panel-resize-handle-enabled': !r,
          'data-panel-resize-handle-id': x,
          onBlur: () => A(!1),
          onFocus: () => A(!0),
          onMouseDown: e => {
            y(x, e.nativeEvent);
            let { onDragging: t } = f.current;
            t && t(!0);
          },
          onMouseUp: C,
          onTouchCancel: C,
          onTouchEnd: C,
          onTouchStart: e => {
            y(x, e.nativeEvent);
            let { onDragging: t } = f.current;
            t && t(!0);
          },
          ref: d,
          role: 'separator',
          style: { ...R, ...u },
          tabIndex: 0,
        });
      }
      (Y.displayName = 'PanelGroup'),
        (Q.displayName = 'forwardRef(PanelGroup)'),
        (Z.displayName = 'PanelResizeHandle');
    },
  },
]);
//# sourceMappingURL=6195-5593bc666c1eae34.js.map
