(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6546],
  {
    40844: function (e) {
      var t = /[\\\/\-_+.# \t"@\[\(\{&]/,
        n = /[\\\/\-_+.# \t"@\[\(\{&]/g;
      e.exports = function (e, r) {
        return (function e(r, o, l, u, a, i) {
          if (i === o.length) return a === r.length ? 1 : 0.99;
          for (
            var c, s, d, f = u.charAt(i), m = l.indexOf(f, a), v = 0;
            m >= 0;

          )
            (c = e(r, o, l, u, m + 1, i + 1)) > v &&
              (m === a
                ? (c *= 1)
                : t.test(r.charAt(m - 1))
                ? ((c *= 0.9),
                  (d = r.slice(a, m - 1).match(n)) &&
                    a > 0 &&
                    (c *= Math.pow(0.999, d.length)))
                : t.test(r.slice(a, m - 1))
                ? ((c *= 0), a > 0 && (c *= Math.pow(0.999, m - a)))
                : ((c *= 0.3), a > 0 && (c *= Math.pow(0.999, m - a))),
              r.charAt(m) !== o.charAt(i) && (c *= 0.9999)),
              c < 0.1 &&
                l.charAt(m - 1) === u.charAt(i + 1) &&
                l.charAt(m - 1) !== u.charAt(i) &&
                0.1 * (s = e(r, o, l, u, m + 1, i + 2)) > c &&
                (c = 0.1 * s),
              c > v && (v = c),
              (m = l.indexOf(f, m + 1));
          return v;
        })(e, r, e.toLowerCase(), r.toLowerCase(), 0, 0);
      };
    },
    26546: function (e, t, n) {
      'use strict';
      let r, o;
      n.d(t, {
        mY: function () {
          return tg;
        },
      });
      var l,
        u,
        a,
        i,
        c,
        s,
        d = n(7896),
        f = n(2784),
        m = n.t(f, 2);
      function v(e, t, { checkForDefaultPrevented: n = !0 } = {}) {
        return function (r) {
          if ((null == e || e(r), !1 === n || !r.defaultPrevented))
            return null == t ? void 0 : t(r);
        };
      }
      function p(...e) {
        return t =>
          e.forEach(e => {
            var n;
            'function' == typeof (n = e) ? n(t) : null != n && (n.current = t);
          });
      }
      function h(...e) {
        return (0, f.useCallback)(p(...e), e);
      }
      let g = (null == globalThis ? void 0 : globalThis.document)
          ? f.useLayoutEffect
          : () => {},
        E = m['useId'.toString()] || (() => void 0),
        y = 0;
      function b(e) {
        let [t, n] = f.useState(E());
        return (
          g(() => {
            e || n(e => (null != e ? e : String(y++)));
          }, [e]),
          e || (t ? `radix-${t}` : '')
        );
      }
      function w(e) {
        let t = (0, f.useRef)(e);
        return (
          (0, f.useEffect)(() => {
            t.current = e;
          }),
          (0, f.useMemo)(
            () =>
              (...e) => {
                var n;
                return null === (n = t.current) || void 0 === n
                  ? void 0
                  : n.call(t, ...e);
              },
            []
          )
        );
      }
      var C = n(28316);
      let S = (0, f.forwardRef)((e, t) => {
        let { children: n, ...r } = e,
          o = f.Children.toArray(n),
          l = o.find(N);
        if (l) {
          let e = l.props.children,
            n = o.map(t =>
              t !== l
                ? t
                : f.Children.count(e) > 1
                ? f.Children.only(null)
                : (0, f.isValidElement)(e)
                ? e.props.children
                : null
            );
          return (0, f.createElement)(
            R,
            (0, d.Z)({}, r, { ref: t }),
            (0, f.isValidElement)(e) ? (0, f.cloneElement)(e, void 0, n) : null
          );
        }
        return (0, f.createElement)(R, (0, d.Z)({}, r, { ref: t }), n);
      });
      S.displayName = 'Slot';
      let R = (0, f.forwardRef)((e, t) => {
        let { children: n, ...r } = e;
        return (0, f.isValidElement)(n)
          ? (0, f.cloneElement)(n, {
              ...(function (e, t) {
                let n = { ...t };
                for (let r in t) {
                  let o = e[r],
                    l = t[r],
                    u = /^on[A-Z]/.test(r);
                  u
                    ? (n[r] = (...e) => {
                        null == l || l(...e), null == o || o(...e);
                      })
                    : 'style' === r
                    ? (n[r] = { ...o, ...l })
                    : 'className' === r &&
                      (n[r] = [o, l].filter(Boolean).join(' '));
                }
                return { ...e, ...n };
              })(r, n.props),
              ref: p(t, n.ref),
            })
          : f.Children.count(n) > 1
          ? f.Children.only(null)
          : null;
      });
      R.displayName = 'SlotClone';
      let k = ({ children: e }) => (0, f.createElement)(f.Fragment, null, e);
      function N(e) {
        return (0, f.isValidElement)(e) && e.type === k;
      }
      let A = [
          'a',
          'button',
          'div',
          'h2',
          'h3',
          'img',
          'li',
          'nav',
          'ol',
          'p',
          'span',
          'svg',
          'ul',
        ].reduce((e, t) => {
          let n = (0, f.forwardRef)((e, n) => {
            let { asChild: r, ...o } = e,
              l = r ? S : t;
            return (
              (0, f.useEffect)(() => {
                window[Symbol.for('radix-ui')] = !0;
              }, []),
              (0, f.createElement)(l, (0, d.Z)({}, o, { ref: n }))
            );
          });
          return (n.displayName = `Primitive.${t}`), { ...e, [t]: n };
        }, {}),
        D = 'dismissableLayer.update',
        P = (0, f.createContext)({
          layers: new Set(),
          layersWithOutsidePointerEventsDisabled: new Set(),
          branches: new Set(),
        }),
        x = (0, f.forwardRef)((e, t) => {
          let {
              disableOutsidePointerEvents: n = !1,
              onEscapeKeyDown: o,
              onPointerDownOutside: l,
              onFocusOutside: u,
              onInteractOutside: a,
              onDismiss: i,
              ...c
            } = e,
            s = (0, f.useContext)(P),
            [m, p] = (0, f.useState)(null),
            [, g] = (0, f.useState)({}),
            E = h(t, e => p(e)),
            y = Array.from(s.layers),
            [b] = [...s.layersWithOutsidePointerEventsDisabled].slice(-1),
            C = y.indexOf(b),
            S = m ? y.indexOf(m) : -1,
            R = s.layersWithOutsidePointerEventsDisabled.size > 0,
            k = S >= C,
            N = (function (e) {
              let t = w(e),
                n = (0, f.useRef)(!1),
                r = (0, f.useRef)(() => {});
              return (
                (0, f.useEffect)(() => {
                  let e = e => {
                      if (e.target && !n.current) {
                        let n = { originalEvent: e };
                        function o() {
                          M('dismissableLayer.pointerDownOutside', t, n, {
                            discrete: !0,
                          });
                        }
                        'touch' === e.pointerType
                          ? (document.removeEventListener('click', r.current),
                            (r.current = o),
                            document.addEventListener('click', r.current, {
                              once: !0,
                            }))
                          : o();
                      }
                      n.current = !1;
                    },
                    o = window.setTimeout(() => {
                      document.addEventListener('pointerdown', e);
                    }, 0);
                  return () => {
                    window.clearTimeout(o),
                      document.removeEventListener('pointerdown', e),
                      document.removeEventListener('click', r.current);
                  };
                }, [t]),
                { onPointerDownCapture: () => (n.current = !0) }
              );
            })(e => {
              let t = e.target,
                n = [...s.branches].some(e => e.contains(t));
              !k ||
                n ||
                (null == l || l(e),
                null == a || a(e),
                e.defaultPrevented || null == i || i());
            }),
            x = (function (e) {
              let t = w(e),
                n = (0, f.useRef)(!1);
              return (
                (0, f.useEffect)(() => {
                  let e = e => {
                    e.target &&
                      !n.current &&
                      M(
                        'dismissableLayer.focusOutside',
                        t,
                        { originalEvent: e },
                        { discrete: !1 }
                      );
                  };
                  return (
                    document.addEventListener('focusin', e),
                    () => document.removeEventListener('focusin', e)
                  );
                }, [t]),
                {
                  onFocusCapture: () => (n.current = !0),
                  onBlurCapture: () => (n.current = !1),
                }
              );
            })(e => {
              let t = e.target,
                n = [...s.branches].some(e => e.contains(t));
              n ||
                (null == u || u(e),
                null == a || a(e),
                e.defaultPrevented || null == i || i());
            });
          return (
            !(function (e) {
              let t = w(e);
              (0, f.useEffect)(() => {
                let e = e => {
                  'Escape' === e.key && t(e);
                };
                return (
                  document.addEventListener('keydown', e),
                  () => document.removeEventListener('keydown', e)
                );
              }, [t]);
            })(e => {
              let t = S === s.layers.size - 1;
              t &&
                (null == o || o(e),
                !e.defaultPrevented && i && (e.preventDefault(), i()));
            }),
            (0, f.useEffect)(() => {
              if (m)
                return (
                  n &&
                    (0 === s.layersWithOutsidePointerEventsDisabled.size &&
                      ((r = document.body.style.pointerEvents),
                      (document.body.style.pointerEvents = 'none')),
                    s.layersWithOutsidePointerEventsDisabled.add(m)),
                  s.layers.add(m),
                  L(),
                  () => {
                    n &&
                      1 === s.layersWithOutsidePointerEventsDisabled.size &&
                      (document.body.style.pointerEvents = r);
                  }
                );
            }, [m, n, s]),
            (0, f.useEffect)(
              () => () => {
                m &&
                  (s.layers.delete(m),
                  s.layersWithOutsidePointerEventsDisabled.delete(m),
                  L());
              },
              [m, s]
            ),
            (0, f.useEffect)(() => {
              let e = () => g({});
              return (
                document.addEventListener(D, e),
                () => document.removeEventListener(D, e)
              );
            }, []),
            (0, f.createElement)(
              A.div,
              (0, d.Z)({}, c, {
                ref: E,
                style: {
                  pointerEvents: R ? (k ? 'auto' : 'none') : void 0,
                  ...e.style,
                },
                onFocusCapture: v(e.onFocusCapture, x.onFocusCapture),
                onBlurCapture: v(e.onBlurCapture, x.onBlurCapture),
                onPointerDownCapture: v(
                  e.onPointerDownCapture,
                  N.onPointerDownCapture
                ),
              })
            )
          );
        });
      function L() {
        let e = new CustomEvent(D);
        document.dispatchEvent(e);
      }
      function M(e, t, n, { discrete: r }) {
        let o = n.originalEvent.target,
          l = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: n });
        (t && o.addEventListener(e, t, { once: !0 }), r)
          ? o && (0, C.flushSync)(() => o.dispatchEvent(l))
          : o.dispatchEvent(l);
      }
      function I(...e) {
        return t =>
          e.forEach(e => {
            var n;
            'function' == typeof (n = e) ? n(t) : null != n && (n.current = t);
          });
      }
      let O = (0, f.forwardRef)((e, t) => {
        let { children: n, ...r } = e,
          o = f.Children.toArray(n),
          l = o.find(_);
        if (l) {
          let e = l.props.children,
            n = o.map(t =>
              t !== l
                ? t
                : f.Children.count(e) > 1
                ? f.Children.only(null)
                : (0, f.isValidElement)(e)
                ? e.props.children
                : null
            );
          return (0, f.createElement)(
            T,
            (0, d.Z)({}, r, { ref: t }),
            (0, f.isValidElement)(e) ? (0, f.cloneElement)(e, void 0, n) : null
          );
        }
        return (0, f.createElement)(T, (0, d.Z)({}, r, { ref: t }), n);
      });
      O.displayName = 'Slot';
      let T = (0, f.forwardRef)((e, t) => {
        let { children: n, ...r } = e;
        return (0, f.isValidElement)(n)
          ? (0, f.cloneElement)(n, {
              ...(function (e, t) {
                let n = { ...t };
                for (let r in t) {
                  let o = e[r],
                    l = t[r],
                    u = /^on[A-Z]/.test(r);
                  u
                    ? (n[r] = (...e) => {
                        null == l || l(...e), null == o || o(...e);
                      })
                    : 'style' === r
                    ? (n[r] = { ...o, ...l })
                    : 'className' === r &&
                      (n[r] = [o, l].filter(Boolean).join(' '));
                }
                return { ...e, ...n };
              })(r, n.props),
              ref: I(t, n.ref),
            })
          : f.Children.count(n) > 1
          ? f.Children.only(null)
          : null;
      });
      T.displayName = 'SlotClone';
      let F = ({ children: e }) => (0, f.createElement)(f.Fragment, null, e);
      function _(e) {
        return (0, f.isValidElement)(e) && e.type === F;
      }
      let W = [
        'a',
        'button',
        'div',
        'h2',
        'h3',
        'img',
        'li',
        'nav',
        'ol',
        'p',
        'span',
        'svg',
        'ul',
      ].reduce((e, t) => {
        let n = (0, f.forwardRef)((e, n) => {
          let { asChild: r, ...o } = e,
            l = r ? O : t;
          return (
            (0, f.useEffect)(() => {
              window[Symbol.for('radix-ui')] = !0;
            }, []),
            (0, f.createElement)(l, (0, d.Z)({}, o, { ref: n }))
          );
        });
        return (n.displayName = `Primitive.${t}`), { ...e, [t]: n };
      }, {});
      function Z(e) {
        let t = (0, f.useRef)(e);
        return (
          (0, f.useEffect)(() => {
            t.current = e;
          }),
          (0, f.useMemo)(
            () =>
              (...e) => {
                var n;
                return null === (n = t.current) || void 0 === n
                  ? void 0
                  : n.call(t, ...e);
              },
            []
          )
        );
      }
      let K = 'focusScope.autoFocusOnMount',
        $ = 'focusScope.autoFocusOnUnmount',
        B = { bubbles: !1, cancelable: !0 },
        U = (0, f.forwardRef)((e, t) => {
          let {
              loop: n = !1,
              trapped: r = !1,
              onMountAutoFocus: o,
              onUnmountAutoFocus: l,
              ...u
            } = e,
            [a, i] = (0, f.useState)(null),
            c = Z(o),
            s = Z(l),
            m = (0, f.useRef)(null),
            v = (function (...e) {
              return (0, f.useCallback)(I(...e), e);
            })(t, e => i(e)),
            p = (0, f.useRef)({
              paused: !1,
              pause() {
                this.paused = !0;
              },
              resume() {
                this.paused = !1;
              },
            }).current;
          (0, f.useEffect)(() => {
            if (r) {
              function e(e) {
                if (p.paused || !a) return;
                let t = e.target;
                a.contains(t) ? (m.current = t) : q(m.current, { select: !0 });
              }
              function t(e) {
                p.paused ||
                  !a ||
                  a.contains(e.relatedTarget) ||
                  q(m.current, { select: !0 });
              }
              return (
                document.addEventListener('focusin', e),
                document.addEventListener('focusout', t),
                () => {
                  document.removeEventListener('focusin', e),
                    document.removeEventListener('focusout', t);
                }
              );
            }
          }, [r, a, p.paused]),
            (0, f.useEffect)(() => {
              if (a) {
                z.add(p);
                let e = document.activeElement,
                  t = a.contains(e);
                if (!t) {
                  let t = new CustomEvent(K, B);
                  a.addEventListener(K, c),
                    a.dispatchEvent(t),
                    t.defaultPrevented ||
                      ((function (e, { select: t = !1 } = {}) {
                        let n = document.activeElement;
                        for (let r of e)
                          if (
                            (q(r, { select: t }), document.activeElement !== n)
                          )
                            return;
                      })(
                        V(a).filter(e => 'A' !== e.tagName),
                        { select: !0 }
                      ),
                      document.activeElement === e && q(a));
                }
                return () => {
                  a.removeEventListener(K, c),
                    setTimeout(() => {
                      let t = new CustomEvent($, B);
                      a.addEventListener($, s),
                        a.dispatchEvent(t),
                        t.defaultPrevented ||
                          q(null != e ? e : document.body, { select: !0 }),
                        a.removeEventListener($, s),
                        z.remove(p);
                    }, 0);
                };
              }
            }, [a, c, s, p]);
          let h = (0, f.useCallback)(
            e => {
              if ((!n && !r) || p.paused) return;
              let t = 'Tab' === e.key && !e.altKey && !e.ctrlKey && !e.metaKey,
                o = document.activeElement;
              if (t && o) {
                let t = e.currentTarget,
                  [r, l] = (function (e) {
                    let t = V(e),
                      n = j(t, e),
                      r = j(t.reverse(), e);
                    return [n, r];
                  })(t);
                r && l
                  ? e.shiftKey || o !== l
                    ? e.shiftKey &&
                      o === r &&
                      (e.preventDefault(), n && q(l, { select: !0 }))
                    : (e.preventDefault(), n && q(r, { select: !0 }))
                  : o === t && e.preventDefault();
              }
            },
            [n, r, p.paused]
          );
          return (0, f.createElement)(
            W.div,
            (0, d.Z)({ tabIndex: -1 }, u, { ref: v, onKeyDown: h })
          );
        });
      function V(e) {
        let t = [],
          n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
            acceptNode: e => {
              let t = 'INPUT' === e.tagName && 'hidden' === e.type;
              return e.disabled || e.hidden || t
                ? NodeFilter.FILTER_SKIP
                : e.tabIndex >= 0
                ? NodeFilter.FILTER_ACCEPT
                : NodeFilter.FILTER_SKIP;
            },
          });
        for (; n.nextNode(); ) t.push(n.currentNode);
        return t;
      }
      function j(e, t) {
        for (let n of e)
          if (
            !(function (e, { upTo: t }) {
              if ('hidden' === getComputedStyle(e).visibility) return !0;
              for (; e && (void 0 === t || e !== t); ) {
                if ('none' === getComputedStyle(e).display) return !0;
                e = e.parentElement;
              }
              return !1;
            })(n, { upTo: t })
          )
            return n;
      }
      function q(e, { select: t = !1 } = {}) {
        if (e && e.focus) {
          var n;
          let r = document.activeElement;
          e.focus({ preventScroll: !0 }),
            e !== r &&
              (n = e) instanceof HTMLInputElement &&
              'select' in n &&
              t &&
              e.select();
        }
      }
      let z =
        ((o = []),
        {
          add(e) {
            let t = o[0];
            e !== t && (null == t || t.pause()), (o = Y(o, e)).unshift(e);
          },
          remove(e) {
            var t;
            null === (t = (o = Y(o, e))[0]) || void 0 === t || t.resume();
          },
        });
      function Y(e, t) {
        let n = [...e],
          r = n.indexOf(t);
        return -1 !== r && n.splice(r, 1), n;
      }
      let X = (0, f.forwardRef)((e, t) => {
          var n;
          let {
            container: r = null == globalThis
              ? void 0
              : null === (n = globalThis.document) || void 0 === n
              ? void 0
              : n.body,
            ...o
          } = e;
          return r
            ? C.createPortal(
                (0, f.createElement)(A.div, (0, d.Z)({}, o, { ref: t })),
                r
              )
            : null;
        }),
        H = e => {
          let { present: t, children: n } = e,
            r = (function (e) {
              var t;
              let [n, r] = (0, f.useState)(),
                o = (0, f.useRef)({}),
                l = (0, f.useRef)(e),
                u = (0, f.useRef)('none'),
                [a, i] =
                  ((t = {
                    mounted: {
                      UNMOUNT: 'unmounted',
                      ANIMATION_OUT: 'unmountSuspended',
                    },
                    unmountSuspended: {
                      MOUNT: 'mounted',
                      ANIMATION_END: 'unmounted',
                    },
                    unmounted: { MOUNT: 'mounted' },
                  }),
                  (0, f.useReducer)(
                    (e, n) => {
                      let r = t[e][n];
                      return null != r ? r : e;
                    },
                    e ? 'mounted' : 'unmounted'
                  ));
              return (
                (0, f.useEffect)(() => {
                  let e = G(o.current);
                  u.current = 'mounted' === a ? e : 'none';
                }, [a]),
                g(() => {
                  let t = o.current,
                    n = l.current;
                  if (n !== e) {
                    let r = u.current,
                      o = G(t);
                    e
                      ? i('MOUNT')
                      : 'none' === o ||
                        (null == t ? void 0 : t.display) === 'none'
                      ? i('UNMOUNT')
                      : n && r !== o
                      ? i('ANIMATION_OUT')
                      : i('UNMOUNT'),
                      (l.current = e);
                  }
                }, [e, i]),
                g(() => {
                  if (n) {
                    let e = e => {
                        let t = G(o.current),
                          r = t.includes(e.animationName);
                        e.target === n &&
                          r &&
                          (0, C.flushSync)(() => i('ANIMATION_END'));
                      },
                      t = e => {
                        e.target === n && (u.current = G(o.current));
                      };
                    return (
                      n.addEventListener('animationstart', t),
                      n.addEventListener('animationcancel', e),
                      n.addEventListener('animationend', e),
                      () => {
                        n.removeEventListener('animationstart', t),
                          n.removeEventListener('animationcancel', e),
                          n.removeEventListener('animationend', e);
                      }
                    );
                  }
                  i('ANIMATION_END');
                }, [n, i]),
                {
                  isPresent: ['mounted', 'unmountSuspended'].includes(a),
                  ref: (0, f.useCallback)(e => {
                    e && (o.current = getComputedStyle(e)), r(e);
                  }, []),
                }
              );
            })(t),
            o =
              'function' == typeof n
                ? n({ present: r.isPresent })
                : f.Children.only(n),
            l = h(r.ref, o.ref);
          return 'function' == typeof n || r.isPresent
            ? (0, f.cloneElement)(o, { ref: l })
            : null;
        };
      function G(e) {
        return (null == e ? void 0 : e.animationName) || 'none';
      }
      H.displayName = 'Presence';
      let J = 0;
      function Q() {
        let e = document.createElement('span');
        return (
          e.setAttribute('data-radix-focus-guard', ''),
          (e.tabIndex = 0),
          (e.style.cssText =
            'outline: none; opacity: 0; position: fixed; pointer-events: none'),
          e
        );
      }
      var ee = n(5163),
        et = 'right-scroll-bar-position',
        en = 'width-before-scroll-bar',
        er =
          (void 0 === l && (l = {}),
          ((void 0 === u &&
            (u = function (e) {
              return e;
            }),
          (a = []),
          (i = !1),
          (c = {
            read: function () {
              if (i)
                throw Error(
                  'Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.'
                );
              return a.length ? a[a.length - 1] : null;
            },
            useMedium: function (e) {
              var t = u(e, i);
              return (
                a.push(t),
                function () {
                  a = a.filter(function (e) {
                    return e !== t;
                  });
                }
              );
            },
            assignSyncMedium: function (e) {
              for (i = !0; a.length; ) {
                var t = a;
                (a = []), t.forEach(e);
              }
              a = {
                push: function (t) {
                  return e(t);
                },
                filter: function () {
                  return a;
                },
              };
            },
            assignMedium: function (e) {
              i = !0;
              var t = [];
              if (a.length) {
                var n = a;
                (a = []), n.forEach(e), (t = a);
              }
              var r = function () {
                  var n = t;
                  (t = []), n.forEach(e);
                },
                o = function () {
                  return Promise.resolve().then(r);
                };
              o(),
                (a = {
                  push: function (e) {
                    t.push(e), o();
                  },
                  filter: function (e) {
                    return (t = t.filter(e)), a;
                  },
                });
            },
          })).options = (0, ee.pi)({ async: !0, ssr: !1 }, l)),
          c),
        eo = function () {},
        el = f.forwardRef(function (e, t) {
          var n,
            r,
            o,
            l = f.useRef(null),
            u = f.useState({
              onScrollCapture: eo,
              onWheelCapture: eo,
              onTouchMoveCapture: eo,
            }),
            a = u[0],
            i = u[1],
            c = e.forwardProps,
            s = e.children,
            d = e.className,
            m = e.removeScrollBar,
            v = e.enabled,
            p = e.shards,
            h = e.sideCar,
            g = e.noIsolation,
            E = e.inert,
            y = e.allowPinchZoom,
            b = e.as,
            w = (0, ee._T)(e, [
              'forwardProps',
              'children',
              'className',
              'removeScrollBar',
              'enabled',
              'shards',
              'sideCar',
              'noIsolation',
              'inert',
              'allowPinchZoom',
              'as',
            ]),
            C =
              ((n = [l, t]),
              (r = function (e) {
                return n.forEach(function (t) {
                  var n;
                  return (
                    'function' == typeof (n = t) ? n(e) : n && (n.current = e),
                    n
                  );
                });
              }),
              ((o = (0, f.useState)(function () {
                return {
                  value: null,
                  callback: r,
                  facade: {
                    get current() {
                      return o.value;
                    },
                    set current(value) {
                      var e = o.value;
                      e !== value && ((o.value = value), o.callback(value, e));
                    },
                  },
                };
              })[0]).callback = r),
              o.facade),
            S = (0, ee.pi)((0, ee.pi)({}, w), a);
          return f.createElement(
            f.Fragment,
            null,
            v &&
              f.createElement(h, {
                sideCar: er,
                removeScrollBar: m,
                shards: p,
                noIsolation: g,
                inert: E,
                setCallbacks: i,
                allowPinchZoom: !!y,
                lockRef: l,
              }),
            c
              ? f.cloneElement(
                  f.Children.only(s),
                  (0, ee.pi)((0, ee.pi)({}, S), { ref: C })
                )
              : f.createElement(
                  void 0 === b ? 'div' : b,
                  (0, ee.pi)({}, S, { className: d, ref: C }),
                  s
                )
          );
        });
      (el.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }),
        (el.classNames = { fullWidth: en, zeroRight: et });
      var eu = function (e) {
        var t = e.sideCar,
          n = (0, ee._T)(e, ['sideCar']);
        if (!t)
          throw Error(
            'Sidecar: please provide `sideCar` property to import the right car'
          );
        var r = t.read();
        if (!r) throw Error('Sidecar medium not found');
        return f.createElement(r, (0, ee.pi)({}, n));
      };
      eu.isSideCarExport = !0;
      var ea = function () {
          var e = 0,
            t = null;
          return {
            add: function (r) {
              if (
                0 == e &&
                (t = (function () {
                  if (!document) return null;
                  var e = document.createElement('style');
                  e.type = 'text/css';
                  var t = s || n.nc;
                  return t && e.setAttribute('nonce', t), e;
                })())
              ) {
                var o, l;
                (o = t).styleSheet
                  ? (o.styleSheet.cssText = r)
                  : o.appendChild(document.createTextNode(r)),
                  (l = t),
                  (
                    document.head || document.getElementsByTagName('head')[0]
                  ).appendChild(l);
              }
              e++;
            },
            remove: function () {
              --e ||
                !t ||
                (t.parentNode && t.parentNode.removeChild(t), (t = null));
            },
          };
        },
        ei = function () {
          var e = ea();
          return function (t, n) {
            f.useEffect(
              function () {
                return (
                  e.add(t),
                  function () {
                    e.remove();
                  }
                );
              },
              [t && n]
            );
          };
        },
        ec = function () {
          var e = ei();
          return function (t) {
            return e(t.styles, t.dynamic), null;
          };
        },
        es = { left: 0, top: 0, right: 0, gap: 0 },
        ed = function (e) {
          return parseInt(e || '', 10) || 0;
        },
        ef = function (e) {
          var t = window.getComputedStyle(document.body),
            n = t['padding' === e ? 'paddingLeft' : 'marginLeft'],
            r = t['padding' === e ? 'paddingTop' : 'marginTop'],
            o = t['padding' === e ? 'paddingRight' : 'marginRight'];
          return [ed(n), ed(r), ed(o)];
        },
        em = function (e) {
          if ((void 0 === e && (e = 'margin'), 'undefined' == typeof window))
            return es;
          var t = ef(e),
            n = document.documentElement.clientWidth,
            r = window.innerWidth;
          return {
            left: t[0],
            top: t[1],
            right: t[2],
            gap: Math.max(0, r - n + t[2] - t[0]),
          };
        },
        ev = ec(),
        ep = function (e, t, n, r) {
          var o = e.left,
            l = e.top,
            u = e.right,
            a = e.gap;
          return (
            void 0 === n && (n = 'margin'),
            '\n  .'
              .concat('with-scroll-bars-hidden', ' {\n   overflow: hidden ')
              .concat(r, ';\n   padding-right: ')
              .concat(a, 'px ')
              .concat(r, ';\n  }\n  body {\n    overflow: hidden ')
              .concat(r, ';\n    overscroll-behavior: contain;\n    ')
              .concat(
                [
                  t && 'position: relative '.concat(r, ';'),
                  'margin' === n &&
                    '\n    padding-left: '
                      .concat(o, 'px;\n    padding-top: ')
                      .concat(l, 'px;\n    padding-right: ')
                      .concat(
                        u,
                        'px;\n    margin-left:0;\n    margin-top:0;\n    margin-right: '
                      )
                      .concat(a, 'px ')
                      .concat(r, ';\n    '),
                  'padding' === n &&
                    'padding-right: '.concat(a, 'px ').concat(r, ';'),
                ]
                  .filter(Boolean)
                  .join(''),
                '\n  }\n  \n  .'
              )
              .concat(et, ' {\n    right: ')
              .concat(a, 'px ')
              .concat(r, ';\n  }\n  \n  .')
              .concat(en, ' {\n    margin-right: ')
              .concat(a, 'px ')
              .concat(r, ';\n  }\n  \n  .')
              .concat(et, ' .')
              .concat(et, ' {\n    right: 0 ')
              .concat(r, ';\n  }\n  \n  .')
              .concat(en, ' .')
              .concat(en, ' {\n    margin-right: 0 ')
              .concat(r, ';\n  }\n  \n  body {\n    ')
              .concat('--removed-body-scroll-bar-size', ': ')
              .concat(a, 'px;\n  }\n')
          );
        },
        eh = function (e) {
          var t = e.noRelative,
            n = e.noImportant,
            r = e.gapMode,
            o = void 0 === r ? 'margin' : r,
            l = f.useMemo(
              function () {
                return em(o);
              },
              [o]
            );
          return f.createElement(ev, {
            styles: ep(l, !t, o, n ? '' : '!important'),
          });
        },
        eg = !1;
      if ('undefined' != typeof window)
        try {
          var eE = Object.defineProperty({}, 'passive', {
            get: function () {
              return (eg = !0), !0;
            },
          });
          window.addEventListener('test', eE, eE),
            window.removeEventListener('test', eE, eE);
        } catch (e) {
          eg = !1;
        }
      var ey = !!eg && { passive: !1 },
        eb = function (e) {
          var t = window.getComputedStyle(e);
          return (
            'hidden' !== t.overflowY &&
            !(t.overflowY === t.overflowX && 'visible' === t.overflowY)
          );
        },
        ew = function (e) {
          var t = window.getComputedStyle(e);
          return (
            'hidden' !== t.overflowX &&
            !(t.overflowY === t.overflowX && 'visible' === t.overflowX)
          );
        },
        eC = function (e, t) {
          var n = t;
          do {
            if (
              ('undefined' != typeof ShadowRoot &&
                n instanceof ShadowRoot &&
                (n = n.host),
              eS(e, n))
            ) {
              var r = eR(e, n);
              if (r[1] > r[2]) return !0;
            }
            n = n.parentNode;
          } while (n && n !== document.body);
          return !1;
        },
        eS = function (e, t) {
          return 'v' === e ? eb(t) : ew(t);
        },
        eR = function (e, t) {
          return 'v' === e
            ? [t.scrollTop, t.scrollHeight, t.clientHeight]
            : [t.scrollLeft, t.scrollWidth, t.clientWidth];
        },
        ek = function (e, t, n, r, o) {
          var l,
            u =
              ((l = window.getComputedStyle(t).direction),
              'h' === e && 'rtl' === l ? -1 : 1),
            a = u * r,
            i = n.target,
            c = t.contains(i),
            s = !1,
            d = a > 0,
            f = 0,
            m = 0;
          do {
            var v = eR(e, i),
              p = v[0],
              h = v[1] - v[2] - u * p;
            (p || h) && eS(e, i) && ((f += h), (m += p)), (i = i.parentNode);
          } while (
            (!c && i !== document.body) ||
            (c && (t.contains(i) || t === i))
          );
          return (
            d && ((o && 0 === f) || (!o && a > f))
              ? (s = !0)
              : !d && ((o && 0 === m) || (!o && -a > m)) && (s = !0),
            s
          );
        },
        eN = function (e) {
          return 'changedTouches' in e
            ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
            : [0, 0];
        },
        eA = function (e) {
          return [e.deltaX, e.deltaY];
        },
        eD = function (e) {
          return e && 'current' in e ? e.current : e;
        },
        eP = 0,
        ex = [],
        eL =
          (er.useMedium(function (e) {
            var t = f.useRef([]),
              n = f.useRef([0, 0]),
              r = f.useRef(),
              o = f.useState(eP++)[0],
              l = f.useState(function () {
                return ec();
              })[0],
              u = f.useRef(e);
            f.useEffect(
              function () {
                u.current = e;
              },
              [e]
            ),
              f.useEffect(
                function () {
                  if (e.inert) {
                    document.body.classList.add(
                      'block-interactivity-'.concat(o)
                    );
                    var t = (0, ee.ev)(
                      [e.lockRef.current],
                      (e.shards || []).map(eD),
                      !0
                    ).filter(Boolean);
                    return (
                      t.forEach(function (e) {
                        return e.classList.add(
                          'allow-interactivity-'.concat(o)
                        );
                      }),
                      function () {
                        document.body.classList.remove(
                          'block-interactivity-'.concat(o)
                        ),
                          t.forEach(function (e) {
                            return e.classList.remove(
                              'allow-interactivity-'.concat(o)
                            );
                          });
                      }
                    );
                  }
                },
                [e.inert, e.lockRef.current, e.shards]
              );
            var a = f.useCallback(function (e, t) {
                if ('touches' in e && 2 === e.touches.length)
                  return !u.current.allowPinchZoom;
                var o,
                  l = eN(e),
                  a = n.current,
                  i = 'deltaX' in e ? e.deltaX : a[0] - l[0],
                  c = 'deltaY' in e ? e.deltaY : a[1] - l[1],
                  s = e.target,
                  d = Math.abs(i) > Math.abs(c) ? 'h' : 'v';
                if ('touches' in e && 'h' === d && 'range' === s.type)
                  return !1;
                var f = eC(d, s);
                if (!f) return !0;
                if (
                  (f ? (o = d) : ((o = 'v' === d ? 'h' : 'v'), (f = eC(d, s))),
                  !f)
                )
                  return !1;
                if (
                  (!r.current &&
                    'changedTouches' in e &&
                    (i || c) &&
                    (r.current = o),
                  !o)
                )
                  return !0;
                var m = r.current || o;
                return ek(m, t, e, 'h' === m ? i : c, !0);
              }, []),
              i = f.useCallback(function (e) {
                if (ex.length && ex[ex.length - 1] === l) {
                  var n = 'deltaY' in e ? eA(e) : eN(e),
                    r = t.current.filter(function (t) {
                      var r;
                      return (
                        t.name === e.type &&
                        t.target === e.target &&
                        (r = t.delta)[0] === n[0] &&
                        r[1] === n[1]
                      );
                    })[0];
                  if (r && r.should) {
                    e.preventDefault();
                    return;
                  }
                  if (!r) {
                    var o = (u.current.shards || [])
                      .map(eD)
                      .filter(Boolean)
                      .filter(function (t) {
                        return t.contains(e.target);
                      });
                    (o.length > 0 ? a(e, o[0]) : !u.current.noIsolation) &&
                      e.preventDefault();
                  }
                }
              }, []),
              c = f.useCallback(function (e, n, r, o) {
                var l = { name: e, delta: n, target: r, should: o };
                t.current.push(l),
                  setTimeout(function () {
                    t.current = t.current.filter(function (e) {
                      return e !== l;
                    });
                  }, 1);
              }, []),
              s = f.useCallback(function (e) {
                (n.current = eN(e)), (r.current = void 0);
              }, []),
              d = f.useCallback(function (t) {
                c(t.type, eA(t), t.target, a(t, e.lockRef.current));
              }, []),
              m = f.useCallback(function (t) {
                c(t.type, eN(t), t.target, a(t, e.lockRef.current));
              }, []);
            f.useEffect(function () {
              return (
                ex.push(l),
                e.setCallbacks({
                  onScrollCapture: d,
                  onWheelCapture: d,
                  onTouchMoveCapture: m,
                }),
                document.addEventListener('wheel', i, ey),
                document.addEventListener('touchmove', i, ey),
                document.addEventListener('touchstart', s, ey),
                function () {
                  (ex = ex.filter(function (e) {
                    return e !== l;
                  })),
                    document.removeEventListener('wheel', i, ey),
                    document.removeEventListener('touchmove', i, ey),
                    document.removeEventListener('touchstart', s, ey);
                }
              );
            }, []);
            var v = e.removeScrollBar,
              p = e.inert;
            return f.createElement(
              f.Fragment,
              null,
              p
                ? f.createElement(l, {
                    styles: '\n  .block-interactivity-'
                      .concat(
                        o,
                        ' {pointer-events: none;}\n  .allow-interactivity-'
                      )
                      .concat(o, ' {pointer-events: all;}\n'),
                  })
                : null,
              v ? f.createElement(eh, { gapMode: 'margin' }) : null
            );
          }),
          eu),
        eM = f.forwardRef(function (e, t) {
          return f.createElement(
            el,
            (0, ee.pi)({}, e, { ref: t, sideCar: eL })
          );
        });
      eM.classNames = el.classNames;
      var eI = new WeakMap(),
        eO = new WeakMap(),
        eT = {},
        eF = 0,
        e_ = function (e) {
          return e && (e.host || e_(e.parentNode));
        },
        eW = function (e, t, n, r) {
          var o = (Array.isArray(e) ? e : [e])
            .map(function (e) {
              if (t.contains(e)) return e;
              var n = e_(e);
              return n && t.contains(n)
                ? n
                : (console.error(
                    'aria-hidden',
                    e,
                    'in not contained inside',
                    t,
                    '. Doing nothing'
                  ),
                  null);
            })
            .filter(function (e) {
              return !!e;
            });
          eT[n] || (eT[n] = new WeakMap());
          var l = eT[n],
            u = [],
            a = new Set(),
            i = new Set(o),
            c = function (e) {
              !e || a.has(e) || (a.add(e), c(e.parentNode));
            };
          o.forEach(c);
          var s = function (e) {
            !e ||
              i.has(e) ||
              Array.prototype.forEach.call(e.children, function (e) {
                if (a.has(e)) s(e);
                else {
                  var t = e.getAttribute(r),
                    o = null !== t && 'false' !== t,
                    i = (eI.get(e) || 0) + 1,
                    c = (l.get(e) || 0) + 1;
                  eI.set(e, i),
                    l.set(e, c),
                    u.push(e),
                    1 === i && o && eO.set(e, !0),
                    1 === c && e.setAttribute(n, 'true'),
                    o || e.setAttribute(r, 'true');
                }
              });
          };
          return (
            s(t),
            a.clear(),
            eF++,
            function () {
              u.forEach(function (e) {
                var t = eI.get(e) - 1,
                  o = l.get(e) - 1;
                eI.set(e, t),
                  l.set(e, o),
                  t || (eO.has(e) || e.removeAttribute(r), eO.delete(e)),
                  o || e.removeAttribute(n);
              }),
                --eF ||
                  ((eI = new WeakMap()),
                  (eI = new WeakMap()),
                  (eO = new WeakMap()),
                  (eT = {}));
            }
          );
        },
        eZ = function (e, t, n) {
          void 0 === n && (n = 'data-aria-hidden');
          var r = Array.from(Array.isArray(e) ? e : [e]),
            o =
              t ||
              ('undefined' == typeof document
                ? null
                : (Array.isArray(e) ? e[0] : e).ownerDocument.body);
          return o
            ? (r.push.apply(r, Array.from(o.querySelectorAll('[aria-live]'))),
              eW(r, o, n, 'aria-hidden'))
            : function () {
                return null;
              };
        };
      let eK = 'Dialog',
        [e$, eB] = (function (e, t = []) {
          let n = [],
            r = () => {
              let t = n.map(e => (0, f.createContext)(e));
              return function (n) {
                let r = (null == n ? void 0 : n[e]) || t;
                return (0, f.useMemo)(
                  () => ({ [`__scope${e}`]: { ...n, [e]: r } }),
                  [n, r]
                );
              };
            };
          return (
            (r.scopeName = e),
            [
              function (t, r) {
                let o = (0, f.createContext)(r),
                  l = n.length;
                function u(t) {
                  let { scope: n, children: r, ...u } = t,
                    a = (null == n ? void 0 : n[e][l]) || o,
                    i = (0, f.useMemo)(() => u, Object.values(u));
                  return (0, f.createElement)(a.Provider, { value: i }, r);
                }
                return (
                  (n = [...n, r]),
                  (u.displayName = t + 'Provider'),
                  [
                    u,
                    function (n, u) {
                      let a = (null == u ? void 0 : u[e][l]) || o,
                        i = (0, f.useContext)(a);
                      if (i) return i;
                      if (void 0 !== r) return r;
                      throw Error(`\`${n}\` must be used within \`${t}\``);
                    },
                  ]
                );
              },
              (function (...e) {
                let t = e[0];
                if (1 === e.length) return t;
                let n = () => {
                  let n = e.map(e => ({
                    useScope: e(),
                    scopeName: e.scopeName,
                  }));
                  return function (e) {
                    let r = n.reduce((t, { useScope: n, scopeName: r }) => {
                      let o = n(e),
                        l = o[`__scope${r}`];
                      return { ...t, ...l };
                    }, {});
                    return (0, f.useMemo)(
                      () => ({ [`__scope${t.scopeName}`]: r }),
                      [r]
                    );
                  };
                };
                return (n.scopeName = t.scopeName), n;
              })(r, ...t),
            ]
          );
        })(eK),
        [eU, eV] = e$(eK),
        ej = e => {
          let {
              __scopeDialog: t,
              children: n,
              open: r,
              defaultOpen: o,
              onOpenChange: l,
              modal: u = !0,
            } = e,
            a = (0, f.useRef)(null),
            i = (0, f.useRef)(null),
            [c = !1, s] = (function ({
              prop: e,
              defaultProp: t,
              onChange: n = () => {},
            }) {
              let [r, o] = (function ({ defaultProp: e, onChange: t }) {
                  let n = (0, f.useState)(e),
                    [r] = n,
                    o = (0, f.useRef)(r),
                    l = w(t);
                  return (
                    (0, f.useEffect)(() => {
                      o.current !== r && (l(r), (o.current = r));
                    }, [r, o, l]),
                    n
                  );
                })({ defaultProp: t, onChange: n }),
                l = void 0 !== e,
                u = w(n),
                a = (0, f.useCallback)(
                  t => {
                    if (l) {
                      let n = 'function' == typeof t ? t(e) : t;
                      n !== e && u(n);
                    } else o(t);
                  },
                  [l, e, o, u]
                );
              return [l ? e : r, a];
            })({ prop: r, defaultProp: o, onChange: l });
          return (0, f.createElement)(
            eU,
            {
              scope: t,
              triggerRef: a,
              contentRef: i,
              contentId: b(),
              titleId: b(),
              descriptionId: b(),
              open: c,
              onOpenChange: s,
              onOpenToggle: (0, f.useCallback)(() => s(e => !e), [s]),
              modal: u,
            },
            n
          );
        },
        eq = 'DialogPortal',
        [ez, eY] = e$(eq, { forceMount: void 0 }),
        eX = e => {
          let {
              __scopeDialog: t,
              forceMount: n,
              children: r,
              container: o,
            } = e,
            l = eV(eq, t);
          return (0, f.createElement)(
            ez,
            { scope: t, forceMount: n },
            f.Children.map(r, e =>
              (0, f.createElement)(
                H,
                { present: n || l.open },
                (0, f.createElement)(X, { asChild: !0, container: o }, e)
              )
            )
          );
        },
        eH = 'DialogOverlay',
        eG = (0, f.forwardRef)((e, t) => {
          let n = eY(eH, e.__scopeDialog),
            { forceMount: r = n.forceMount, ...o } = e,
            l = eV(eH, e.__scopeDialog);
          return l.modal
            ? (0, f.createElement)(
                H,
                { present: r || l.open },
                (0, f.createElement)(eJ, (0, d.Z)({}, o, { ref: t }))
              )
            : null;
        }),
        eJ = (0, f.forwardRef)((e, t) => {
          let { __scopeDialog: n, ...r } = e,
            o = eV(eH, n);
          return (0, f.createElement)(
            eM,
            { as: S, allowPinchZoom: !0, shards: [o.contentRef] },
            (0, f.createElement)(
              A.div,
              (0, d.Z)({ 'data-state': e4(o.open) }, r, {
                ref: t,
                style: { pointerEvents: 'auto', ...r.style },
              })
            )
          );
        }),
        eQ = 'DialogContent',
        e0 = (0, f.forwardRef)((e, t) => {
          let n = eY(eQ, e.__scopeDialog),
            { forceMount: r = n.forceMount, ...o } = e,
            l = eV(eQ, e.__scopeDialog);
          return (0, f.createElement)(
            H,
            { present: r || l.open },
            l.modal
              ? (0, f.createElement)(e1, (0, d.Z)({}, o, { ref: t }))
              : (0, f.createElement)(e9, (0, d.Z)({}, o, { ref: t }))
          );
        }),
        e1 = (0, f.forwardRef)((e, t) => {
          let n = eV(eQ, e.__scopeDialog),
            r = (0, f.useRef)(null),
            o = h(t, n.contentRef, r);
          return (
            (0, f.useEffect)(() => {
              let e = r.current;
              if (e) return eZ(e);
            }, []),
            (0, f.createElement)(
              e2,
              (0, d.Z)({}, e, {
                ref: o,
                trapFocus: n.open,
                disableOutsidePointerEvents: !0,
                onCloseAutoFocus: v(e.onCloseAutoFocus, e => {
                  var t;
                  e.preventDefault(),
                    null === (t = n.triggerRef.current) ||
                      void 0 === t ||
                      t.focus();
                }),
                onPointerDownOutside: v(e.onPointerDownOutside, e => {
                  let t = e.detail.originalEvent,
                    n = 0 === t.button && !0 === t.ctrlKey,
                    r = 2 === t.button || n;
                  r && e.preventDefault();
                }),
                onFocusOutside: v(e.onFocusOutside, e => e.preventDefault()),
              })
            )
          );
        }),
        e9 = (0, f.forwardRef)((e, t) => {
          let n = eV(eQ, e.__scopeDialog),
            r = (0, f.useRef)(!1);
          return (0, f.createElement)(
            e2,
            (0, d.Z)({}, e, {
              ref: t,
              trapFocus: !1,
              disableOutsidePointerEvents: !1,
              onCloseAutoFocus: t => {
                var o, l;
                null === (o = e.onCloseAutoFocus) ||
                  void 0 === o ||
                  o.call(e, t),
                  t.defaultPrevented ||
                    (r.current ||
                      null === (l = n.triggerRef.current) ||
                      void 0 === l ||
                      l.focus(),
                    t.preventDefault()),
                  (r.current = !1);
              },
              onInteractOutside: t => {
                var o, l;
                null === (o = e.onInteractOutside) ||
                  void 0 === o ||
                  o.call(e, t),
                  t.defaultPrevented || (r.current = !0);
                let u = t.target,
                  a =
                    null === (l = n.triggerRef.current) || void 0 === l
                      ? void 0
                      : l.contains(u);
                a && t.preventDefault();
              },
            })
          );
        }),
        e2 = (0, f.forwardRef)((e, t) => {
          let {
              __scopeDialog: n,
              trapFocus: r,
              onOpenAutoFocus: o,
              onCloseAutoFocus: l,
              ...u
            } = e,
            a = eV(eQ, n),
            i = (0, f.useRef)(null),
            c = h(t, i);
          return (
            (0, f.useEffect)(() => {
              var e, t;
              let n = document.querySelectorAll('[data-radix-focus-guard]');
              return (
                document.body.insertAdjacentElement(
                  'afterbegin',
                  null !== (e = n[0]) && void 0 !== e ? e : Q()
                ),
                document.body.insertAdjacentElement(
                  'beforeend',
                  null !== (t = n[1]) && void 0 !== t ? t : Q()
                ),
                J++,
                () => {
                  1 === J &&
                    document
                      .querySelectorAll('[data-radix-focus-guard]')
                      .forEach(e => e.remove()),
                    J--;
                }
              );
            }, []),
            (0, f.createElement)(
              f.Fragment,
              null,
              (0, f.createElement)(
                U,
                {
                  asChild: !0,
                  loop: !0,
                  trapped: r,
                  onMountAutoFocus: o,
                  onUnmountAutoFocus: l,
                },
                (0, f.createElement)(
                  x,
                  (0, d.Z)(
                    {
                      role: 'dialog',
                      id: a.contentId,
                      'aria-describedby': a.descriptionId,
                      'aria-labelledby': a.titleId,
                      'data-state': e4(a.open),
                    },
                    u,
                    { ref: c, onDismiss: () => a.onOpenChange(!1) }
                  )
                )
              ),
              !1
            )
          );
        });
      function e4(e) {
        return e ? 'open' : 'closed';
      }
      let [e6, e3] = (function (e, t) {
        let n = (0, f.createContext)(t);
        function r(e) {
          let { children: t, ...r } = e,
            o = (0, f.useMemo)(() => r, Object.values(r));
          return (0, f.createElement)(n.Provider, { value: o }, t);
        }
        return (
          (r.displayName = e + 'Provider'),
          [
            r,
            function (r) {
              let o = (0, f.useContext)(n);
              if (o) return o;
              if (void 0 !== t) return t;
              throw Error(`\`${r}\` must be used within \`${e}\``);
            },
          ]
        );
      })('DialogTitleWarning', {
        contentName: eQ,
        titleName: 'DialogTitle',
        docsSlug: 'dialog',
      });
      var e8 = n(40844),
        e5 = '[cmdk-group=""]',
        e7 = '[cmdk-group-items=""]',
        te = '[cmdk-item=""]',
        tt = `${te}:not([aria-disabled="true"])`,
        tn = 'cmdk-item-select',
        tr = 'data-value',
        to = (e, t) => e8(e, t),
        tl = f.createContext(void 0),
        tu = () => f.useContext(tl),
        ta = f.createContext(void 0),
        ti = () => f.useContext(ta),
        tc = f.createContext(void 0),
        ts = f.forwardRef((e, t) => {
          let n = f.useRef(null),
            r = tb(() => ({
              search: '',
              value: '',
              filtered: { count: 0, items: new Map(), groups: new Set() },
            })),
            o = tb(() => new Set()),
            l = tb(() => new Map()),
            u = tb(() => new Map()),
            a = tb(() => new Set()),
            i = tE(e),
            {
              label: c,
              children: s,
              value: d,
              onValueChange: m,
              filter: v,
              shouldFilter: p,
              ...h
            } = e,
            g = f.useId(),
            E = f.useId(),
            y = f.useId(),
            b = tR();
          ty(() => {
            if (void 0 !== d) {
              let e = d.trim().toLowerCase();
              (r.current.value = e), b(6, A), w.emit();
            }
          }, [d]);
          let w = f.useMemo(
              () => ({
                subscribe: e => (a.current.add(e), () => a.current.delete(e)),
                snapshot: () => r.current,
                setState: (e, t, n) => {
                  var o, l, u;
                  if (!Object.is(r.current[e], t)) {
                    if (((r.current[e] = t), 'search' === e)) N(), R(), b(1, k);
                    else if ('value' === e) {
                      if (
                        (null == (o = i.current) ? void 0 : o.value) !== void 0
                      ) {
                        null == (u = (l = i.current).onValueChange) ||
                          u.call(l, t);
                        return;
                      }
                      n || b(5, A);
                    }
                    w.emit();
                  }
                },
                emit: () => {
                  a.current.forEach(e => e());
                },
              }),
              []
            ),
            C = f.useMemo(
              () => ({
                value: (e, t) => {
                  t !== u.current.get(e) &&
                    (u.current.set(e, t),
                    r.current.filtered.items.set(e, S(t)),
                    b(2, () => {
                      R(), w.emit();
                    }));
                },
                item: (e, t) => (
                  o.current.add(e),
                  t &&
                    (l.current.has(t)
                      ? l.current.get(t).add(e)
                      : l.current.set(t, new Set([e]))),
                  b(3, () => {
                    N(), R(), r.current.value || k(), w.emit();
                  }),
                  () => {
                    u.current.delete(e),
                      o.current.delete(e),
                      r.current.filtered.items.delete(e),
                      b(4, () => {
                        N(), k(), w.emit();
                      });
                  }
                ),
                group: e => (
                  l.current.has(e) || l.current.set(e, new Set()),
                  () => {
                    u.current.delete(e), l.current.delete(e);
                  }
                ),
                filter: () => i.current.shouldFilter,
                label: c || e['aria-label'],
                listId: g,
                inputId: y,
                labelId: E,
              }),
              []
            );
          function S(e) {
            var t;
            let n = (null == (t = i.current) ? void 0 : t.filter) ?? to;
            return e ? n(e, r.current.search) : 0;
          }
          function R() {
            if (
              !n.current ||
              !r.current.search ||
              !1 === i.current.shouldFilter
            )
              return;
            let e = r.current.filtered.items,
              t = [];
            r.current.filtered.groups.forEach(n => {
              let r = l.current.get(n),
                o = 0;
              r.forEach(t => {
                o = Math.max(e.get(t), o);
              }),
                t.push([n, o]);
            });
            let o = n.current.querySelector('[cmdk-list-sizer=""]');
            P()
              .sort((t, n) => {
                let r = t.getAttribute(tr),
                  o = n.getAttribute(tr);
                return (e.get(o) ?? 0) - (e.get(r) ?? 0);
              })
              .forEach(e => {
                let t = e.closest(e7);
                t
                  ? t.appendChild(
                      e.parentElement === t ? e : e.closest(`${e7} > *`)
                    )
                  : o.appendChild(
                      e.parentElement === o ? e : e.closest(`${e7} > *`)
                    );
              }),
              t
                .sort((e, t) => t[1] - e[1])
                .forEach(e => {
                  let t = n.current.querySelector(`${e5}[${tr}="${e[0]}"]`);
                  null == t || t.parentElement.appendChild(t);
                });
          }
          function k() {
            let e = P().find(e => !e.ariaDisabled),
              t = null == e ? void 0 : e.getAttribute(tr);
            w.setState('value', t || void 0);
          }
          function N() {
            if (!r.current.search || !1 === i.current.shouldFilter) {
              r.current.filtered.count = o.current.size;
              return;
            }
            r.current.filtered.groups = new Set();
            let e = 0;
            for (let t of o.current) {
              let n = S(u.current.get(t));
              r.current.filtered.items.set(t, n), n > 0 && e++;
            }
            for (let [e, t] of l.current)
              for (let n of t)
                if (r.current.filtered.items.get(n) > 0) {
                  r.current.filtered.groups.add(e);
                  break;
                }
            r.current.filtered.count = e;
          }
          function A() {
            var e, t, n;
            let r = D();
            r &&
              ((null == (e = r.parentElement) ? void 0 : e.firstChild) === r &&
                (null ==
                  (n =
                    null == (t = r.closest(e5))
                      ? void 0
                      : t.querySelector('[cmdk-group-heading=""]')) ||
                  n.scrollIntoView({ block: 'nearest' })),
              r.scrollIntoView({ block: 'nearest' }));
          }
          function D() {
            return n.current.querySelector(`${te}[aria-selected="true"]`);
          }
          function P() {
            return Array.from(n.current.querySelectorAll(tt));
          }
          function x(e) {
            let t = P()[e];
            t && w.setState('value', t.getAttribute(tr));
          }
          function L(e) {
            var t;
            let n = D(),
              r = P(),
              o = r.findIndex(e => e === n),
              l = r[o + e];
            null != (t = i.current) &&
              t.loop &&
              (l =
                o + e < 0
                  ? r[r.length - 1]
                  : o + e === r.length
                  ? r[0]
                  : r[o + e]),
              l && w.setState('value', l.getAttribute(tr));
          }
          function M(e) {
            let t = D(),
              n = null == t ? void 0 : t.closest(e5),
              r;
            for (; n && !r; )
              r =
                null ==
                (n =
                  e > 0
                    ? (function (e, t) {
                        let n = e.nextElementSibling;
                        for (; n; ) {
                          if (n.matches(t)) return n;
                          n = n.nextElementSibling;
                        }
                      })(n, e5)
                    : (function (e, t) {
                        let n = e.previousElementSibling;
                        for (; n; ) {
                          if (n.matches(t)) return n;
                          n = n.previousElementSibling;
                        }
                      })(n, e5))
                  ? void 0
                  : n.querySelector(tt);
            r ? w.setState('value', r.getAttribute(tr)) : L(e);
          }
          let I = () => x(P().length - 1),
            O = e => {
              e.preventDefault(), e.metaKey ? I() : e.altKey ? M(1) : L(1);
            },
            T = e => {
              e.preventDefault(), e.metaKey ? x(0) : e.altKey ? M(-1) : L(-1);
            };
          return f.createElement(
            'div',
            {
              ref: tw([n, t]),
              ...h,
              'cmdk-root': '',
              onKeyDown: e => {
                var t;
                if (
                  (null == (t = h.onKeyDown) || t.call(h, e),
                  !e.defaultPrevented)
                )
                  switch (e.key) {
                    case 'n':
                    case 'j':
                      e.ctrlKey && O(e);
                      break;
                    case 'ArrowDown':
                      O(e);
                      break;
                    case 'p':
                    case 'k':
                      e.ctrlKey && T(e);
                      break;
                    case 'ArrowUp':
                      T(e);
                      break;
                    case 'Home':
                      e.preventDefault(), x(0);
                      break;
                    case 'End':
                      e.preventDefault(), I();
                      break;
                    case 'Enter': {
                      e.preventDefault();
                      let t = D();
                      if (t) {
                        let e = new Event(tn);
                        t.dispatchEvent(e);
                      }
                    }
                  }
              },
            },
            f.createElement(
              'label',
              {
                'cmdk-label': '',
                htmlFor: C.inputId,
                id: C.labelId,
                style: tk,
              },
              c
            ),
            f.createElement(
              ta.Provider,
              { value: w },
              f.createElement(tl.Provider, { value: C }, s)
            )
          );
        }),
        td = f.forwardRef((e, t) => {
          let n = f.useId(),
            r = f.useRef(null),
            o = f.useContext(tc),
            l = tu(),
            u = tE(e);
          ty(() => l.item(n, o), []);
          let a = tS(n, r, [e.value, e.children, r]),
            i = ti(),
            c = tC(e => e.value && e.value === a.current),
            s = tC(
              e => !1 === l.filter() || !e.search || e.filtered.items.get(n) > 0
            );
          function d() {
            var e, t;
            null == (t = (e = u.current).onSelect) || t.call(e, a.current);
          }
          if (
            (f.useEffect(() => {
              let t = r.current;
              if (!(!t || e.disabled))
                return (
                  t.addEventListener(tn, d), () => t.removeEventListener(tn, d)
                );
            }, [s, e.onSelect, e.disabled]),
            !s)
          )
            return null;
          let { disabled: m, value: v, onSelect: p, ...h } = e;
          return f.createElement(
            'div',
            {
              ref: tw([r, t]),
              ...h,
              'cmdk-item': '',
              role: 'option',
              'aria-disabled': m || void 0,
              'aria-selected': c || void 0,
              'data-selected': c || void 0,
              onPointerMove: m
                ? void 0
                : function () {
                    i.setState('value', a.current, !0);
                  },
              onClick: m ? void 0 : d,
            },
            e.children
          );
        }),
        tf = f.forwardRef((e, t) => {
          let { heading: n, children: r, ...o } = e,
            l = f.useId(),
            u = f.useRef(null),
            a = f.useRef(null),
            i = f.useId(),
            c = tu(),
            s = tC(
              e => !1 === c.filter() || !e.search || e.filtered.groups.has(l)
            );
          ty(() => c.group(l), []), tS(l, u, [e.value, e.heading, a]);
          let d = f.createElement(tc.Provider, { value: l }, r);
          return f.createElement(
            'div',
            {
              ref: tw([u, t]),
              ...o,
              'cmdk-group': '',
              role: 'presentation',
              hidden: !s || void 0,
            },
            n &&
              f.createElement(
                'div',
                { ref: a, 'cmdk-group-heading': '', 'aria-hidden': !0, id: i },
                n
              ),
            f.createElement(
              'div',
              {
                'cmdk-group-items': '',
                role: 'group',
                'aria-labelledby': n ? i : void 0,
              },
              d
            )
          );
        }),
        tm = f.forwardRef((e, t) => {
          let { alwaysRender: n, ...r } = e,
            o = f.useRef(null),
            l = tC(e => !e.search);
          return n || l
            ? f.createElement('div', {
                ref: tw([o, t]),
                ...r,
                'cmdk-separator': '',
                role: 'separator',
              })
            : null;
        }),
        tv = f.forwardRef((e, t) => {
          let { onValueChange: n, ...r } = e,
            o = null != e.value,
            l = ti(),
            u = tC(e => e.search),
            a = tu();
          return (
            f.useEffect(() => {
              null != e.value && l.setState('search', e.value);
            }, [e.value]),
            f.createElement('input', {
              ref: t,
              ...r,
              'cmdk-input': '',
              autoComplete: 'off',
              autoCorrect: 'off',
              spellCheck: !1,
              'aria-autocomplete': 'list',
              role: 'combobox',
              'aria-expanded': !0,
              'aria-controls': a.listId,
              'aria-labelledby': a.labelId,
              id: a.inputId,
              type: 'text',
              value: o ? e.value : u,
              onChange: e => {
                o || l.setState('search', e.target.value),
                  null == n || n(e.target.value);
              },
            })
          );
        }),
        tp = f.forwardRef((e, t) => {
          let { children: n, ...r } = e,
            o = f.useRef(null),
            l = f.useRef(null),
            u = tu();
          return (
            f.useEffect(() => {
              if (l.current && o.current) {
                let e = l.current,
                  t = o.current,
                  n,
                  r = new ResizeObserver(() => {
                    n = requestAnimationFrame(() => {
                      let n = e.getBoundingClientRect().height;
                      t.style.setProperty(
                        '--cmdk-list-height',
                        n.toFixed(1) + 'px'
                      );
                    });
                  });
                return (
                  r.observe(e),
                  () => {
                    cancelAnimationFrame(n), r.unobserve(e);
                  }
                );
              }
            }, []),
            f.createElement(
              'div',
              {
                ref: tw([o, t]),
                ...r,
                'cmdk-list': '',
                role: 'listbox',
                'aria-label': 'Suggestions',
                id: u.listId,
                'aria-labelledby': u.inputId,
              },
              f.createElement('div', { ref: l, 'cmdk-list-sizer': '' }, n)
            )
          );
        }),
        th = f.forwardRef((e, t) => {
          let { open: n, onOpenChange: r, container: o, ...l } = e;
          return f.createElement(
            ej,
            { open: n, onOpenChange: r },
            f.createElement(
              eX,
              { container: o },
              f.createElement(eG, { 'cmdk-overlay': '' }),
              f.createElement(
                e0,
                { 'aria-label': e.label, 'cmdk-dialog': '' },
                f.createElement(ts, { ref: t, ...l })
              )
            )
          );
        }),
        tg = Object.assign(ts, {
          List: tp,
          Item: td,
          Input: tv,
          Group: tf,
          Separator: tm,
          Dialog: th,
          Empty: f.forwardRef((e, t) => {
            let n = f.useRef(!0),
              r = tC(e => 0 === e.filtered.count);
            return (
              f.useEffect(() => {
                n.current = !1;
              }, []),
              n.current || !r
                ? null
                : f.createElement('div', {
                    ref: t,
                    ...e,
                    'cmdk-empty': '',
                    role: 'presentation',
                  })
            );
          }),
          Loading: f.forwardRef((e, t) => {
            let { progress: n, children: r, ...o } = e;
            return f.createElement(
              'div',
              {
                ref: t,
                ...o,
                'cmdk-loading': '',
                role: 'progressbar',
                'aria-valuenow': n,
                'aria-valuemin': 0,
                'aria-valuemax': 100,
                'aria-label': 'Loading...',
              },
              f.createElement('div', { 'aria-hidden': !0 }, r)
            );
          }),
        });
      function tE(e) {
        let t = f.useRef(e);
        return (
          ty(() => {
            t.current = e;
          }),
          t
        );
      }
      var ty = typeof window > 'u' ? f.useEffect : f.useLayoutEffect;
      function tb(e) {
        let t = f.useRef();
        return void 0 === t.current && (t.current = e()), t;
      }
      function tw(e) {
        return t => {
          e.forEach(e => {
            'function' == typeof e ? e(t) : null != e && (e.current = t);
          });
        };
      }
      function tC(e) {
        let t = ti(),
          n = () => e(t.snapshot());
        return f.useSyncExternalStore(t.subscribe, n, n);
      }
      function tS(e, t, n) {
        let r = f.useRef(),
          o = tu();
        return (
          ty(() => {
            var l;
            let u = (() => {
              var e;
              for (let t of n) {
                if ('string' == typeof t) return t.trim().toLowerCase();
                if ('object' == typeof t && 'current' in t && t.current)
                  return null == (e = t.current.textContent)
                    ? void 0
                    : e.trim().toLowerCase();
              }
            })();
            o.value(e, u),
              null == (l = t.current) || l.setAttribute(tr, u),
              (r.current = u);
          }),
          r
        );
      }
      var tR = () => {
          let [e, t] = f.useState(),
            n = tb(() => new Map());
          return (
            ty(() => {
              n.current.forEach(e => e()), (n.current = new Map());
            }, [e]),
            (e, r) => {
              n.current.set(e, r), t({});
            }
          );
        },
        tk = {
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: '0',
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          borderWidth: '0',
        };
    },
  },
]);
//# sourceMappingURL=6546.a35af7d91c89b9ec.js.map
