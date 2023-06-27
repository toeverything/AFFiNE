(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [8870],
  {
    50381: function (e, t, n) {
      'use strict';
      var r = n(91706),
        o = { 'text/plain': 'Text', 'text/html': 'Url', default: 'Text' };
      e.exports = function (e, t) {
        var n,
          a,
          i,
          c,
          u,
          s,
          l,
          f,
          d = !1;
        t || (t = {}), (i = t.debug || !1);
        try {
          if (
            ((u = r()),
            (s = document.createRange()),
            (l = document.getSelection()),
            ((f = document.createElement('span')).textContent = e),
            (f.ariaHidden = 'true'),
            (f.style.all = 'unset'),
            (f.style.position = 'fixed'),
            (f.style.top = 0),
            (f.style.clip = 'rect(0, 0, 0, 0)'),
            (f.style.whiteSpace = 'pre'),
            (f.style.webkitUserSelect = 'text'),
            (f.style.MozUserSelect = 'text'),
            (f.style.msUserSelect = 'text'),
            (f.style.userSelect = 'text'),
            f.addEventListener('copy', function (n) {
              if ((n.stopPropagation(), t.format)) {
                if ((n.preventDefault(), void 0 === n.clipboardData)) {
                  i && console.warn('unable to use e.clipboardData'),
                    i && console.warn('trying IE specific stuff'),
                    window.clipboardData.clearData();
                  var r = o[t.format] || o.default;
                  window.clipboardData.setData(r, e);
                } else
                  n.clipboardData.clearData(),
                    n.clipboardData.setData(t.format, e);
              }
              t.onCopy && (n.preventDefault(), t.onCopy(n.clipboardData));
            }),
            document.body.appendChild(f),
            s.selectNodeContents(f),
            l.addRange(s),
            !document.execCommand('copy'))
          )
            throw Error('copy command was unsuccessful');
          d = !0;
        } catch (r) {
          i && console.error('unable to copy using execCommand: ', r),
            i && console.warn('trying IE specific stuff');
          try {
            window.clipboardData.setData(t.format || 'text', e),
              t.onCopy && t.onCopy(window.clipboardData),
              (d = !0);
          } catch (r) {
            i && console.error('unable to copy using clipboardData: ', r),
              i && console.error('falling back to prompt'),
              (n =
                'message' in t
                  ? t.message
                  : 'Copy to clipboard: #{key}, Enter'),
              (a =
                (/mac os x/i.test(navigator.userAgent) ? '⌘' : 'Ctrl') + '+C'),
              (c = n.replace(/#{\s*key\s*}/g, a)),
              window.prompt(c, e);
          }
        } finally {
          l &&
            ('function' == typeof l.removeRange
              ? l.removeRange(s)
              : l.removeAllRanges()),
            f && document.body.removeChild(f),
            u();
        }
        return d;
      };
    },
    91706: function (e) {
      e.exports = function () {
        var e = document.getSelection();
        if (!e.rangeCount) return function () {};
        for (
          var t = document.activeElement, n = [], r = 0;
          r < e.rangeCount;
          r++
        )
          n.push(e.getRangeAt(r));
        switch (t.tagName.toUpperCase()) {
          case 'INPUT':
          case 'TEXTAREA':
            t.blur();
            break;
          default:
            t = null;
        }
        return (
          e.removeAllRanges(),
          function () {
            'Caret' === e.type && e.removeAllRanges(),
              e.rangeCount ||
                n.forEach(function (t) {
                  e.addRange(t);
                }),
              t && t.focus();
          }
        );
      };
    },
    80402: function (e, t, n) {
      'use strict';
      /**
       * @license React
       * use-sync-external-store-shim/with-selector.production.min.js
       *
       * Copyright (c) Facebook, Inc. and its affiliates.
       *
       * This source code is licensed under the MIT license found in the
       * LICENSE file in the root directory of this source tree.
       */ var r = n(2784),
        o = n(43100),
        a =
          'function' == typeof Object.is
            ? Object.is
            : function (e, t) {
                return (
                  (e === t && (0 !== e || 1 / e == 1 / t)) || (e != e && t != t)
                );
              },
        i = o.useSyncExternalStore,
        c = r.useRef,
        u = r.useEffect,
        s = r.useMemo,
        l = r.useDebugValue;
      t.useSyncExternalStoreWithSelector = function (e, t, n, r, o) {
        var f = c(null);
        if (null === f.current) {
          var d = { hasValue: !1, value: null };
          f.current = d;
        } else d = f.current;
        f = s(
          function () {
            function e(e) {
              if (!u) {
                if (
                  ((u = !0), (i = e), (e = r(e)), void 0 !== o && d.hasValue)
                ) {
                  var t = d.value;
                  if (o(t, e)) return (c = t);
                }
                return (c = e);
              }
              if (((t = c), a(i, e))) return t;
              var n = r(e);
              return void 0 !== o && o(t, n) ? t : ((i = e), (c = n));
            }
            var i,
              c,
              u = !1,
              s = void 0 === n ? null : n;
            return [
              function () {
                return e(t());
              },
              null === s
                ? void 0
                : function () {
                    return e(s());
                  },
            ];
          },
          [t, n, r, o]
        );
        var p = i(e, f[0], f[1]);
        return (
          u(
            function () {
              (d.hasValue = !0), (d.value = p);
            },
            [p]
          ),
          l(p),
          p
        );
      };
    },
    41110: function (e, t, n) {
      'use strict';
      e.exports = n(80402);
    },
    38870: function (e, t, n) {
      'use strict';
      n.r(t),
        n.d(t, {
          JsonViewer: function () {
            return tL;
          },
          applyValue: function () {
            return e7;
          },
          createDataType: function () {
            return te;
          },
          darkColorspace: function () {
            return eQ;
          },
          isCycleReference: function () {
            return tt;
          },
          lightColorspace: function () {
            return eZ;
          },
        });
      var r,
        o,
        a,
        i = n(2784),
        c = n.t(i, 2),
        u = n(52322);
      let s = e => {
          let t;
          let n = new Set(),
            r = (e, r) => {
              let o = 'function' == typeof e ? e(t) : e;
              if (!Object.is(o, t)) {
                let e = t;
                (t = (null != r ? r : 'object' != typeof o)
                  ? o
                  : Object.assign({}, t, o)),
                  n.forEach(n => n(t, e));
              }
            },
            o = () => t,
            a = e => (n.add(e), () => n.delete(e)),
            i = () => {
              console.warn(
                '[DEPRECATED] The `destroy` method will be unsupported in a future version. Instead use unsubscribe function returned by subscribe. Everything will be garbage-collected if store is garbage-collected.'
              ),
                n.clear();
            },
            c = { setState: r, getState: o, subscribe: a, destroy: i };
          return (t = e(r, o, c)), c;
        },
        l = e => (e ? s(e) : s);
      var f = n(41110);
      let { useSyncExternalStoreWithSelector: d } = f;
      function p(e, t = e.getState, n) {
        let r = d(
          e.subscribe,
          e.getState,
          e.getServerState || e.getState,
          t,
          n
        );
        return (0, i.useDebugValue)(r), r;
      }
      let y = e => {
          'function' != typeof e &&
            console.warn(
              "[DEPRECATED] Passing a vanilla store will be unsupported in a future version. Instead use `import { useStore } from 'zustand'`."
            );
          let t = 'function' == typeof e ? l(e) : e,
            n = (e, n) => p(t, e, n);
          return Object.assign(n, t), n;
        },
        h = e => (e ? y(e) : y);
      var b = n(50381);
      function m(e, t, n) {
        return (
          t in e
            ? Object.defineProperty(e, t, {
                value: n,
                enumerable: !0,
                configurable: !0,
                writable: !0,
              })
            : (e[t] = n),
          e
        );
      }
      function g(e) {
        for (var t = 1; t < arguments.length; t++) {
          var n = null != arguments[t] ? arguments[t] : {},
            r = Object.keys(n);
          'function' == typeof Object.getOwnPropertySymbols &&
            (r = r.concat(
              Object.getOwnPropertySymbols(n).filter(function (e) {
                return Object.getOwnPropertyDescriptor(n, e).enumerable;
              })
            )),
            r.forEach(function (t) {
              m(e, t, n[t]);
            });
        }
        return e;
      }
      function C(e, t) {
        return (
          (t = null != t ? t : {}),
          Object.getOwnPropertyDescriptors
            ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t))
            : (function (e, t) {
                var n = Object.keys(e);
                if (Object.getOwnPropertySymbols) {
                  var r = Object.getOwnPropertySymbols(e);
                  n.push.apply(n, r);
                }
                return n;
              })(Object(t)).forEach(function (n) {
                Object.defineProperty(
                  e,
                  n,
                  Object.getOwnPropertyDescriptor(t, n)
                );
              }),
          e
        );
      }
      function S(e, t) {
        (null == t || t > e.length) && (t = e.length);
        for (var n = 0, r = Array(t); n < t; n++) r[n] = e[n];
        return r;
      }
      function w(e) {
        if (
          ('undefined' != typeof Symbol && null != e[Symbol.iterator]) ||
          null != e['@@iterator']
        )
          return Array.from(e);
      }
      function x(e, t) {
        if (e) {
          if ('string' == typeof e) return S(e, t);
          var n = Object.prototype.toString.call(e).slice(8, -1);
          if (
            ('Object' === n && e.constructor && (n = e.constructor.name),
            'Map' === n || 'Set' === n)
          )
            return Array.from(n);
          if (
            'Arguments' === n ||
            /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(n)
          )
            return S(e, t);
        }
      }
      function k(e) {
        return (
          (function (e) {
            if (Array.isArray(e)) return S(e);
          })(e) ||
          w(e) ||
          x(e) ||
          (function () {
            throw TypeError(
              'Invalid attempt to spread non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
            );
          })()
        );
      }
      var j = (function () {
          function e(e) {
            var t = this;
            (this._insertTag = function (e) {
              var n;
              (n =
                0 === t.tags.length
                  ? t.insertionPoint
                    ? t.insertionPoint.nextSibling
                    : t.prepend
                    ? t.container.firstChild
                    : t.before
                  : t.tags[t.tags.length - 1].nextSibling),
                t.container.insertBefore(e, n),
                t.tags.push(e);
            }),
              (this.isSpeedy = void 0 === e.speedy || e.speedy),
              (this.tags = []),
              (this.ctr = 0),
              (this.nonce = e.nonce),
              (this.key = e.key),
              (this.container = e.container),
              (this.prepend = e.prepend),
              (this.insertionPoint = e.insertionPoint),
              (this.before = null);
          }
          var t = e.prototype;
          return (
            (t.hydrate = function (e) {
              e.forEach(this._insertTag);
            }),
            (t.insert = function (e) {
              if (this.ctr % (this.isSpeedy ? 65e3 : 1) == 0) {
                var t;
                this._insertTag(
                  ((t = document.createElement('style')).setAttribute(
                    'data-emotion',
                    this.key
                  ),
                  void 0 !== this.nonce && t.setAttribute('nonce', this.nonce),
                  t.appendChild(document.createTextNode('')),
                  t.setAttribute('data-s', ''),
                  t)
                );
              }
              var n = this.tags[this.tags.length - 1];
              if (this.isSpeedy) {
                var r = (function (e) {
                  if (e.sheet) return e.sheet;
                  for (var t = 0; t < document.styleSheets.length; t++)
                    if (document.styleSheets[t].ownerNode === e)
                      return document.styleSheets[t];
                })(n);
                try {
                  r.insertRule(e, r.cssRules.length);
                } catch (e) {}
              } else n.appendChild(document.createTextNode(e));
              this.ctr++;
            }),
            (t.flush = function () {
              this.tags.forEach(function (e) {
                return e.parentNode && e.parentNode.removeChild(e);
              }),
                (this.tags = []),
                (this.ctr = 0);
            }),
            e
          );
        })(),
        O = '-ms-',
        A = '-moz-',
        E = '-webkit-',
        P = 'comm',
        N = 'rule',
        $ = 'decl',
        L = '@keyframes',
        M = Math.abs,
        T = String.fromCharCode,
        D = Object.assign;
      function _(e, t, n) {
        return e.replace(t, n);
      }
      function I(e, t) {
        return e.indexOf(t);
      }
      function z(e, t) {
        return 0 | e.charCodeAt(t);
      }
      function R(e, t, n) {
        return e.slice(t, n);
      }
      function K(e) {
        return e.length;
      }
      function V(e, t) {
        return t.push(e), e;
      }
      var F = 1,
        W = 1,
        H = 0,
        U = 0,
        G = 0,
        B = '';
      function q(e, t, n, r, o, a, i) {
        return {
          value: e,
          root: t,
          parent: n,
          type: r,
          props: o,
          children: a,
          line: F,
          column: W,
          length: i,
          return: '',
        };
      }
      function J(e, t) {
        return D(
          q('', null, null, '', null, null, 0),
          e,
          { length: -e.length },
          t
        );
      }
      function X() {
        return (G = U < H ? z(B, U++) : 0), W++, 10 === G && ((W = 1), F++), G;
      }
      function Y() {
        return z(B, U);
      }
      function Z(e) {
        switch (e) {
          case 0:
          case 9:
          case 10:
          case 13:
          case 32:
            return 5;
          case 33:
          case 43:
          case 44:
          case 47:
          case 62:
          case 64:
          case 126:
          case 59:
          case 123:
          case 125:
            return 4;
          case 58:
            return 3;
          case 34:
          case 39:
          case 40:
          case 91:
            return 2;
          case 41:
          case 93:
            return 1;
        }
        return 0;
      }
      function Q(e) {
        return (F = W = 1), (H = K((B = e))), (U = 0), [];
      }
      function ee(e) {
        var t, n;
        return ((t = U - 1),
        (n = (function e(t) {
          for (; X(); )
            switch (G) {
              case t:
                return U;
              case 34:
              case 39:
                34 !== t && 39 !== t && e(G);
                break;
              case 40:
                41 === t && e(t);
                break;
              case 92:
                X();
            }
          return U;
        })(91 === e ? e + 2 : 40 === e ? e + 1 : e)),
        R(B, t, n)).trim();
      }
      function et(e) {
        var t;
        return (
          (t = (function e(t, n, r, o, a, i, c, u, s) {
            for (
              var l,
                f = 0,
                d = 0,
                p = c,
                y = 0,
                h = 0,
                b = 0,
                m = 1,
                g = 1,
                C = 1,
                S = 0,
                w = '',
                x = a,
                k = i,
                j = o,
                O = w;
              g;

            )
              switch (((b = S), (S = X()))) {
                case 40:
                  if (108 != b && 58 == z(O, p - 1)) {
                    -1 != I((O += _(ee(S), '&', '&\f')), '&\f') && (C = -1);
                    break;
                  }
                case 34:
                case 39:
                case 91:
                  O += ee(S);
                  break;
                case 9:
                case 10:
                case 13:
                case 32:
                  O += (function (e) {
                    for (; (G = Y()); )
                      if (G < 33) X();
                      else break;
                    return Z(e) > 2 || Z(G) > 3 ? '' : ' ';
                  })(b);
                  break;
                case 92:
                  O += (function (e, t) {
                    for (
                      var n;
                      --t &&
                      X() &&
                      !(G < 48) &&
                      !(G > 102) &&
                      (!(G > 57) || !(G < 65)) &&
                      (!(G > 70) || !(G < 97));

                    );
                    return (
                      (n = U + (t < 6 && 32 == Y() && 32 == X())), R(B, e, n)
                    );
                  })(U - 1, 7);
                  continue;
                case 47:
                  switch (Y()) {
                    case 42:
                    case 47:
                      V(
                        q(
                          (l = (function (e, t) {
                            for (; X(); )
                              if (e + G === 57) break;
                              else if (e + G === 84 && 47 === Y()) break;
                            return (
                              '/*' +
                              R(B, t, U - 1) +
                              '*' +
                              T(47 === e ? e : X())
                            );
                          })(X(), U)),
                          n,
                          r,
                          P,
                          T(G),
                          R(l, 2, -2),
                          0
                        ),
                        s
                      );
                      break;
                    default:
                      O += '/';
                  }
                  break;
                case 123 * m:
                  u[f++] = K(O) * C;
                case 125 * m:
                case 59:
                case 0:
                  switch (S) {
                    case 0:
                    case 125:
                      g = 0;
                    case 59 + d:
                      h > 0 &&
                        K(O) - p &&
                        V(
                          h > 32
                            ? er(O + ';', o, r, p - 1)
                            : er(_(O, ' ', '') + ';', o, r, p - 2),
                          s
                        );
                      break;
                    case 59:
                      O += ';';
                    default:
                      if (
                        (V(
                          (j = en(
                            O,
                            n,
                            r,
                            f,
                            d,
                            a,
                            u,
                            w,
                            (x = []),
                            (k = []),
                            p
                          )),
                          i
                        ),
                        123 === S)
                      ) {
                        if (0 === d) e(O, n, j, j, x, i, p, u, k);
                        else
                          switch (99 === y && 110 === z(O, 3) ? 100 : y) {
                            case 100:
                            case 109:
                            case 115:
                              e(
                                t,
                                j,
                                j,
                                o &&
                                  V(
                                    en(t, j, j, 0, 0, a, u, w, a, (x = []), p),
                                    k
                                  ),
                                a,
                                k,
                                p,
                                u,
                                o ? x : k
                              );
                              break;
                            default:
                              e(O, j, j, j, [''], k, 0, u, k);
                          }
                      }
                  }
                  (f = d = h = 0), (m = C = 1), (w = O = ''), (p = c);
                  break;
                case 58:
                  (p = 1 + K(O)), (h = b);
                default:
                  if (m < 1) {
                    if (123 == S) --m;
                    else if (
                      125 == S &&
                      0 == m++ &&
                      125 ==
                        ((G = U > 0 ? z(B, --U) : 0),
                        W--,
                        10 === G && ((W = 1), F--),
                        G)
                    )
                      continue;
                  }
                  switch (((O += T(S)), S * m)) {
                    case 38:
                      C = d > 0 ? 1 : ((O += '\f'), -1);
                      break;
                    case 44:
                      (u[f++] = (K(O) - 1) * C), (C = 1);
                      break;
                    case 64:
                      45 === Y() && (O += ee(X())),
                        (y = Y()),
                        (d = p =
                          K(
                            (w = O +=
                              (function (e) {
                                for (; !Z(Y()); ) X();
                                return R(B, e, U);
                              })(U))
                          )),
                        S++;
                      break;
                    case 45:
                      45 === b && 2 == K(O) && (m = 0);
                  }
              }
            return i;
          })('', null, null, null, [''], (e = Q(e)), 0, [0], e)),
          (B = ''),
          t
        );
      }
      function en(e, t, n, r, o, a, i, c, u, s, l) {
        for (
          var f = o - 1,
            d = 0 === o ? a : [''],
            p = d.length,
            y = 0,
            h = 0,
            b = 0;
          y < r;
          ++y
        )
          for (
            var m = 0, g = R(e, f + 1, (f = M((h = i[y])))), C = e;
            m < p;
            ++m
          )
            (C = (h > 0 ? d[m] + ' ' + g : _(g, /&\f/g, d[m])).trim()) &&
              (u[b++] = C);
        return q(e, t, n, 0 === o ? N : c, u, s, l);
      }
      function er(e, t, n, r) {
        return q(e, t, n, $, R(e, 0, r), R(e, r + 1, -1), r);
      }
      function eo(e, t) {
        for (var n = '', r = e.length, o = 0; o < r; o++)
          n += t(e[o], o, e, t) || '';
        return n;
      }
      function ea(e, t, n, r) {
        switch (e.type) {
          case '@import':
          case $:
            return (e.return = e.return || e.value);
          case P:
            return '';
          case L:
            return (e.return = e.value + '{' + eo(e.children, r) + '}');
          case N:
            e.value = e.props.join(',');
        }
        return K((n = eo(e.children, r)))
          ? (e.return = e.value + '{' + n + '}')
          : '';
      }
      function ei(e) {
        var t = e.length;
        return function (n, r, o, a) {
          for (var i = '', c = 0; c < t; c++) i += e[c](n, r, o, a) || '';
          return i;
        };
      }
      function ec(e) {
        var t = Object.create(null);
        return function (n) {
          return void 0 === t[n] && (t[n] = e(n)), t[n];
        };
      }
      var eu = function (e, t, n) {
          for (
            var r = 0, o = 0;
            (r = o), (o = Y()), 38 === r && 12 === o && (t[n] = 1), !Z(o);

          )
            X();
          return R(B, e, U);
        },
        es = function (e, t) {
          var n = -1,
            r = 44;
          do
            switch (Z(r)) {
              case 0:
                38 === r && 12 === Y() && (t[n] = 1), (e[n] += eu(U - 1, t, n));
                break;
              case 2:
                e[n] += ee(r);
                break;
              case 4:
                if (44 === r) {
                  (e[++n] = 58 === Y() ? '&\f' : ''), (t[n] = e[n].length);
                  break;
                }
              default:
                e[n] += T(r);
            }
          while ((r = X()));
          return e;
        },
        el = function (e, t) {
          var n;
          return (n = es(Q(e), t)), (B = ''), n;
        },
        ef = new WeakMap(),
        ed = function (e) {
          if ('rule' === e.type && e.parent && !(e.length < 1)) {
            for (
              var t = e.value,
                n = e.parent,
                r = e.column === n.column && e.line === n.line;
              'rule' !== n.type;

            )
              if (!(n = n.parent)) return;
            if (
              (1 !== e.props.length || 58 === t.charCodeAt(0) || ef.get(n)) &&
              !r
            ) {
              ef.set(e, !0);
              for (
                var o = [], a = el(t, o), i = n.props, c = 0, u = 0;
                c < a.length;
                c++
              )
                for (var s = 0; s < i.length; s++, u++)
                  e.props[u] = o[c]
                    ? a[c].replace(/&\f/g, i[s])
                    : i[s] + ' ' + a[c];
            }
          }
        },
        ep = function (e) {
          if ('decl' === e.type) {
            var t = e.value;
            108 === t.charCodeAt(0) &&
              98 === t.charCodeAt(2) &&
              ((e.return = ''), (e.value = ''));
          }
        },
        ey = 'undefined' != typeof document,
        ev = ey
          ? void 0
          : ((r = new WeakMap()),
            function (e) {
              if (r.has(e)) return r.get(e);
              var t = ec(function () {
                var e = {};
                return function (t) {
                  return e[t];
                };
              });
              return r.set(e, t), t;
            }),
        eh = [
          function (e, t, n, r) {
            if (e.length > -1 && !e.return)
              switch (e.type) {
                case $:
                  e.return = (function e(t, n) {
                    switch (
                      45 ^ z(t, 0)
                        ? (((((((n << 2) ^ z(t, 0)) << 2) ^ z(t, 1)) << 2) ^
                            z(t, 2)) <<
                            2) ^
                          z(t, 3)
                        : 0
                    ) {
                      case 5103:
                        return E + 'print-' + t + t;
                      case 5737:
                      case 4201:
                      case 3177:
                      case 3433:
                      case 1641:
                      case 4457:
                      case 2921:
                      case 5572:
                      case 6356:
                      case 5844:
                      case 3191:
                      case 6645:
                      case 3005:
                      case 6391:
                      case 5879:
                      case 5623:
                      case 6135:
                      case 4599:
                      case 4855:
                      case 4215:
                      case 6389:
                      case 5109:
                      case 5365:
                      case 5621:
                      case 3829:
                        return E + t + t;
                      case 5349:
                      case 4246:
                      case 4810:
                      case 6968:
                      case 2756:
                        return E + t + A + t + O + t + t;
                      case 6828:
                      case 4268:
                        return E + t + O + t + t;
                      case 6165:
                        return E + t + O + 'flex-' + t + t;
                      case 5187:
                        return (
                          E +
                          t +
                          _(
                            t,
                            /(\w+).+(:[^]+)/,
                            E + 'box-$1$2' + O + 'flex-$1$2'
                          ) +
                          t
                        );
                      case 5443:
                        return (
                          E + t + O + 'flex-item-' + _(t, /flex-|-self/, '') + t
                        );
                      case 4675:
                        return (
                          E +
                          t +
                          O +
                          'flex-line-pack' +
                          _(t, /align-content|flex-|-self/, '') +
                          t
                        );
                      case 5548:
                        return E + t + O + _(t, 'shrink', 'negative') + t;
                      case 5292:
                        return E + t + O + _(t, 'basis', 'preferred-size') + t;
                      case 6060:
                        return (
                          E +
                          'box-' +
                          _(t, '-grow', '') +
                          E +
                          t +
                          O +
                          _(t, 'grow', 'positive') +
                          t
                        );
                      case 4554:
                        return (
                          E + _(t, /([^-])(transform)/g, '$1' + E + '$2') + t
                        );
                      case 6187:
                        return (
                          _(
                            _(
                              _(t, /(zoom-|grab)/, E + '$1'),
                              /(image-set)/,
                              E + '$1'
                            ),
                            t,
                            ''
                          ) + t
                        );
                      case 5495:
                      case 3959:
                        return _(t, /(image-set\([^]*)/, E + '$1$`$1');
                      case 4968:
                        return (
                          _(
                            _(
                              t,
                              /(.+:)(flex-)?(.*)/,
                              E + 'box-pack:$3' + O + 'flex-pack:$3'
                            ),
                            /s.+-b[^;]+/,
                            'justify'
                          ) +
                          E +
                          t +
                          t
                        );
                      case 4095:
                      case 3583:
                      case 4068:
                      case 2532:
                        return _(t, /(.+)-inline(.+)/, E + '$1$2') + t;
                      case 8116:
                      case 7059:
                      case 5753:
                      case 5535:
                      case 5445:
                      case 5701:
                      case 4933:
                      case 4677:
                      case 5533:
                      case 5789:
                      case 5021:
                      case 4765:
                        if (K(t) - 1 - n > 6)
                          switch (z(t, n + 1)) {
                            case 109:
                              if (45 !== z(t, n + 4)) break;
                            case 102:
                              return (
                                _(
                                  t,
                                  /(.+:)(.+)-([^]+)/,
                                  '$1' +
                                    E +
                                    '$2-$3$1' +
                                    A +
                                    (108 == z(t, n + 3) ? '$3' : '$2-$3')
                                ) + t
                              );
                            case 115:
                              return ~I(t, 'stretch')
                                ? e(_(t, 'stretch', 'fill-available'), n) + t
                                : t;
                          }
                        break;
                      case 4949:
                        if (115 !== z(t, n + 1)) break;
                      case 6444:
                        switch (z(t, K(t) - 3 - (~I(t, '!important') && 10))) {
                          case 107:
                            return _(t, ':', ':' + E) + t;
                          case 101:
                            return (
                              _(
                                t,
                                /(.+:)([^;!]+)(;|!.+)?/,
                                '$1' +
                                  E +
                                  (45 === z(t, 14) ? 'inline-' : '') +
                                  'box$3$1' +
                                  E +
                                  '$2$3$1' +
                                  O +
                                  '$2box$3'
                              ) + t
                            );
                        }
                        break;
                      case 5936:
                        switch (z(t, n + 11)) {
                          case 114:
                            return (
                              E + t + O + _(t, /[svh]\w+-[tblr]{2}/, 'tb') + t
                            );
                          case 108:
                            return (
                              E +
                              t +
                              O +
                              _(t, /[svh]\w+-[tblr]{2}/, 'tb-rl') +
                              t
                            );
                          case 45:
                            return (
                              E + t + O + _(t, /[svh]\w+-[tblr]{2}/, 'lr') + t
                            );
                        }
                        return E + t + O + t + t;
                    }
                    return t;
                  })(e.value, e.length);
                  break;
                case L:
                  return eo([J(e, { value: _(e.value, '@', '@' + E) })], r);
                case N:
                  if (e.length)
                    return e.props
                      .map(function (t) {
                        var n;
                        switch (
                          ((n = t),
                          (n = /(::plac\w+|:read-\w+)/.exec(n)) ? n[0] : n)
                        ) {
                          case ':read-only':
                          case ':read-write':
                            return eo(
                              [
                                J(e, {
                                  props: [_(t, /:(read-\w+)/, ':' + A + '$1')],
                                }),
                              ],
                              r
                            );
                          case '::placeholder':
                            return eo(
                              [
                                J(e, {
                                  props: [
                                    _(t, /:(plac\w+)/, ':' + E + 'input-$1'),
                                  ],
                                }),
                                J(e, {
                                  props: [_(t, /:(plac\w+)/, ':' + A + '$1')],
                                }),
                                J(e, {
                                  props: [_(t, /:(plac\w+)/, O + 'input-$1')],
                                }),
                              ],
                              r
                            );
                        }
                        return '';
                      })
                      .join('');
              }
          },
        ],
        eb = function (e) {
          var t = e.key;
          if (ey && 'css' === t) {
            var n = document.querySelectorAll(
              'style[data-emotion]:not([data-s])'
            );
            Array.prototype.forEach.call(n, function (e) {
              -1 !== e.getAttribute('data-emotion').indexOf(' ') &&
                (document.head.appendChild(e), e.setAttribute('data-s', ''));
            });
          }
          var r = e.stylisPlugins || eh,
            o = {},
            a = [];
          ey &&
            ((u = e.container || document.head),
            Array.prototype.forEach.call(
              document.querySelectorAll('style[data-emotion^="' + t + ' "]'),
              function (e) {
                for (
                  var t = e.getAttribute('data-emotion').split(' '), n = 1;
                  n < t.length;
                  n++
                )
                  o[t[n]] = !0;
                a.push(e);
              }
            ));
          var i = [ed, ep];
          if (ey) {
            var c,
              u,
              s,
              l,
              f = [
                ea,
                ((c = function (e) {
                  l.insert(e);
                }),
                function (e) {
                  !e.root && (e = e.return) && c(e);
                }),
              ],
              d = ei(i.concat(r, f));
            s = function (e, t, n, r) {
              (l = n),
                eo(et(e ? e + '{' + t.styles + '}' : t.styles), d),
                r && (b.inserted[t.name] = !0);
            };
          } else {
            var p = ei(i.concat(r, [ea])),
              y = ev(r)(t),
              h = function (e, t) {
                var n = t.name;
                return (
                  void 0 === y[n] &&
                    (y[n] = eo(et(e ? e + '{' + t.styles + '}' : t.styles), p)),
                  y[n]
                );
              };
            s = function (e, t, n, r) {
              var o = t.name,
                a = h(e, t);
              return void 0 === b.compat
                ? (r && (b.inserted[o] = !0), a)
                : r
                ? void (b.inserted[o] = a)
                : a;
            };
          }
          var b = {
            key: t,
            sheet: new j({
              key: t,
              container: u,
              nonce: e.nonce,
              speedy: e.speedy,
              prepend: e.prepend,
              insertionPoint: e.insertionPoint,
            }),
            nonce: e.nonce,
            inserted: o,
            registered: {},
            insert: s,
          };
          return b.sheet.hydrate(a), b;
        },
        em = {},
        eg = {
          get exports() {
            return em;
          },
          set exports(v) {
            em = v;
          },
        },
        eC = {};
      eg.exports = (function () {
        if (o) return eC;
        o = 1;
        var e = 'function' == typeof Symbol && Symbol.for,
          t = e ? Symbol.for('react.element') : 60103,
          n = e ? Symbol.for('react.portal') : 60106,
          r = e ? Symbol.for('react.fragment') : 60107,
          a = e ? Symbol.for('react.strict_mode') : 60108,
          i = e ? Symbol.for('react.profiler') : 60114,
          c = e ? Symbol.for('react.provider') : 60109,
          u = e ? Symbol.for('react.context') : 60110,
          s = e ? Symbol.for('react.async_mode') : 60111,
          l = e ? Symbol.for('react.concurrent_mode') : 60111,
          f = e ? Symbol.for('react.forward_ref') : 60112,
          d = e ? Symbol.for('react.suspense') : 60113,
          p = e ? Symbol.for('react.suspense_list') : 60120,
          y = e ? Symbol.for('react.memo') : 60115,
          h = e ? Symbol.for('react.lazy') : 60116,
          b = e ? Symbol.for('react.block') : 60121,
          m = e ? Symbol.for('react.fundamental') : 60117,
          g = e ? Symbol.for('react.responder') : 60118,
          C = e ? Symbol.for('react.scope') : 60119;
        function S(e) {
          if ('object' == typeof e && null !== e) {
            var o = e.$$typeof;
            switch (o) {
              case t:
                switch ((e = e.type)) {
                  case s:
                  case l:
                  case r:
                  case i:
                  case a:
                  case d:
                    return e;
                  default:
                    switch ((e = e && e.$$typeof)) {
                      case u:
                      case f:
                      case h:
                      case y:
                      case c:
                        return e;
                      default:
                        return o;
                    }
                }
              case n:
                return o;
            }
          }
        }
        function w(e) {
          return S(e) === l;
        }
        return (
          (eC.AsyncMode = s),
          (eC.ConcurrentMode = l),
          (eC.ContextConsumer = u),
          (eC.ContextProvider = c),
          (eC.Element = t),
          (eC.ForwardRef = f),
          (eC.Fragment = r),
          (eC.Lazy = h),
          (eC.Memo = y),
          (eC.Portal = n),
          (eC.Profiler = i),
          (eC.StrictMode = a),
          (eC.Suspense = d),
          (eC.isAsyncMode = function (e) {
            return w(e) || S(e) === s;
          }),
          (eC.isConcurrentMode = w),
          (eC.isContextConsumer = function (e) {
            return S(e) === u;
          }),
          (eC.isContextProvider = function (e) {
            return S(e) === c;
          }),
          (eC.isElement = function (e) {
            return 'object' == typeof e && null !== e && e.$$typeof === t;
          }),
          (eC.isForwardRef = function (e) {
            return S(e) === f;
          }),
          (eC.isFragment = function (e) {
            return S(e) === r;
          }),
          (eC.isLazy = function (e) {
            return S(e) === h;
          }),
          (eC.isMemo = function (e) {
            return S(e) === y;
          }),
          (eC.isPortal = function (e) {
            return S(e) === n;
          }),
          (eC.isProfiler = function (e) {
            return S(e) === i;
          }),
          (eC.isStrictMode = function (e) {
            return S(e) === a;
          }),
          (eC.isSuspense = function (e) {
            return S(e) === d;
          }),
          (eC.isValidElementType = function (e) {
            return (
              'string' == typeof e ||
              'function' == typeof e ||
              e === r ||
              e === l ||
              e === i ||
              e === a ||
              e === d ||
              e === p ||
              ('object' == typeof e &&
                null !== e &&
                (e.$$typeof === h ||
                  e.$$typeof === y ||
                  e.$$typeof === c ||
                  e.$$typeof === u ||
                  e.$$typeof === f ||
                  e.$$typeof === m ||
                  e.$$typeof === g ||
                  e.$$typeof === C ||
                  e.$$typeof === b))
            );
          }),
          (eC.typeOf = S),
          eC
        );
      })();
      var eS = em,
        ew = {};
      (ew[eS.ForwardRef] = {
        $$typeof: !0,
        render: !0,
        defaultProps: !0,
        displayName: !0,
        propTypes: !0,
      }),
        (ew[eS.Memo] = {
          $$typeof: !0,
          compare: !0,
          defaultProps: !0,
          displayName: !0,
          propTypes: !0,
          type: !0,
        });
      var ex = 'undefined' != typeof document,
        ek = function (e, t, n) {
          var r = e.key + '-' + t.name;
          (!1 === n || (!1 === ex && void 0 !== e.compat)) &&
            void 0 === e.registered[r] &&
            (e.registered[r] = t.styles);
        },
        ej = function (e, t, n) {
          ek(e, t, n);
          var r = e.key + '-' + t.name;
          if (void 0 === e.inserted[t.name]) {
            var o = '',
              a = t;
            do {
              var i = e.insert(t === a ? '.' + r : '', a, e.sheet, !0);
              ex || void 0 === i || (o += i), (a = a.next);
            } while (void 0 !== a);
            if (!ex && 0 !== o.length) return o;
          }
        },
        eO = {
          animationIterationCount: 1,
          borderImageOutset: 1,
          borderImageSlice: 1,
          borderImageWidth: 1,
          boxFlex: 1,
          boxFlexGroup: 1,
          boxOrdinalGroup: 1,
          columnCount: 1,
          columns: 1,
          flex: 1,
          flexGrow: 1,
          flexPositive: 1,
          flexShrink: 1,
          flexNegative: 1,
          flexOrder: 1,
          gridRow: 1,
          gridRowEnd: 1,
          gridRowSpan: 1,
          gridRowStart: 1,
          gridColumn: 1,
          gridColumnEnd: 1,
          gridColumnSpan: 1,
          gridColumnStart: 1,
          msGridRow: 1,
          msGridRowSpan: 1,
          msGridColumn: 1,
          msGridColumnSpan: 1,
          fontWeight: 1,
          lineHeight: 1,
          opacity: 1,
          order: 1,
          orphans: 1,
          tabSize: 1,
          widows: 1,
          zIndex: 1,
          zoom: 1,
          WebkitLineClamp: 1,
          fillOpacity: 1,
          floodOpacity: 1,
          stopOpacity: 1,
          strokeDasharray: 1,
          strokeDashoffset: 1,
          strokeMiterlimit: 1,
          strokeOpacity: 1,
          strokeWidth: 1,
        },
        eA = /[A-Z]|^ms/g,
        eE = /_EMO_([^_]+?)_([^]*?)_EMO_/g,
        eP = function (e) {
          return 45 === e.charCodeAt(1);
        },
        eN = function (e) {
          return null != e && 'boolean' != typeof e;
        },
        e$ = ec(function (e) {
          return eP(e) ? e : e.replace(eA, '-$&').toLowerCase();
        }),
        eL = function (e, t) {
          switch (e) {
            case 'animation':
            case 'animationName':
              if ('string' == typeof t)
                return t.replace(eE, function (e, t, n) {
                  return (a = { name: t, styles: n, next: a }), t;
                });
          }
          return 1 === eO[e] || eP(e) || 'number' != typeof t || 0 === t
            ? t
            : t + 'px';
        };
      function eM(e, t, n) {
        if (null == n) return '';
        if (void 0 !== n.__emotion_styles) return n;
        switch (typeof n) {
          case 'boolean':
            return '';
          case 'object':
            if (1 === n.anim)
              return (a = { name: n.name, styles: n.styles, next: a }), n.name;
            if (void 0 !== n.styles) {
              var r = n.next;
              if (void 0 !== r)
                for (; void 0 !== r; )
                  (a = { name: r.name, styles: r.styles, next: a }),
                    (r = r.next);
              return n.styles + ';';
            }
            return (function (e, t, n) {
              var r = '';
              if (Array.isArray(n))
                for (var o = 0; o < n.length; o++) r += eM(e, t, n[o]) + ';';
              else
                for (var a in n) {
                  var i = n[a];
                  if ('object' != typeof i)
                    null != t && void 0 !== t[i]
                      ? (r += a + '{' + t[i] + '}')
                      : eN(i) && (r += e$(a) + ':' + eL(a, i) + ';');
                  else if (
                    Array.isArray(i) &&
                    'string' == typeof i[0] &&
                    (null == t || void 0 === t[i[0]])
                  )
                    for (var c = 0; c < i.length; c++)
                      eN(i[c]) && (r += e$(a) + ':' + eL(a, i[c]) + ';');
                  else {
                    var u = eM(e, t, i);
                    switch (a) {
                      case 'animation':
                      case 'animationName':
                        r += e$(a) + ':' + u + ';';
                        break;
                      default:
                        r += a + '{' + u + '}';
                    }
                  }
                }
              return r;
            })(e, t, n);
          case 'function':
            if (void 0 !== e) {
              var o = a,
                i = n(e);
              return (a = o), eM(e, t, i);
            }
        }
        if (null == t) return n;
        var c = t[n];
        return void 0 !== c ? c : n;
      }
      var eT = /label:\s*([^\s;\n{]+)\s*(;|$)/g,
        eD = function (e, t, n) {
          if (
            1 === e.length &&
            'object' == typeof e[0] &&
            null !== e[0] &&
            void 0 !== e[0].styles
          )
            return e[0];
          var r,
            o = !0,
            i = '';
          a = void 0;
          var c = e[0];
          null == c || void 0 === c.raw
            ? ((o = !1), (i += eM(n, t, c)))
            : (i += c[0]);
          for (var u = 1; u < e.length; u++)
            (i += eM(n, t, e[u])), o && (i += c[u]);
          eT.lastIndex = 0;
          for (var s = ''; null !== (r = eT.exec(i)); ) s += '-' + r[1];
          return {
            name:
              (function (e) {
                for (var t, n = 0, r = 0, o = e.length; o >= 4; ++r, o -= 4)
                  (t =
                    (65535 &
                      (t =
                        (255 & e.charCodeAt(r)) |
                        ((255 & e.charCodeAt(++r)) << 8) |
                        ((255 & e.charCodeAt(++r)) << 16) |
                        ((255 & e.charCodeAt(++r)) << 24))) *
                      1540483477 +
                    (((t >>> 16) * 59797) << 16)),
                    (t ^= t >>> 24),
                    (n =
                      ((65535 & t) * 1540483477 +
                        (((t >>> 16) * 59797) << 16)) ^
                      ((65535 & n) * 1540483477 +
                        (((n >>> 16) * 59797) << 16)));
                switch (o) {
                  case 3:
                    n ^= (255 & e.charCodeAt(r + 2)) << 16;
                  case 2:
                    n ^= (255 & e.charCodeAt(r + 1)) << 8;
                  case 1:
                    (n ^= 255 & e.charCodeAt(r)),
                      (n =
                        (65535 & n) * 1540483477 +
                        (((n >>> 16) * 59797) << 16));
                }
                return (
                  (n ^= n >>> 13),
                  (
                    ((n =
                      (65535 & n) * 1540483477 + (((n >>> 16) * 59797) << 16)) ^
                      (n >>> 15)) >>>
                    0
                  ).toString(36)
                );
              })(i) + s,
            styles: i,
            next: a,
          };
        },
        e_ = !!c.useInsertionEffect && c.useInsertionEffect,
        eI =
          ('undefined' != typeof document && e_) ||
          function (e) {
            return e();
          },
        ez = 'undefined' != typeof document,
        eR = {}.hasOwnProperty,
        eK = (0, i.createContext)(
          'undefined' != typeof HTMLElement ? eb({ key: 'css' }) : null
        );
      eK.Provider;
      var eV = function (e) {
        return (0, i.forwardRef)(function (t, n) {
          return e(t, (0, i.useContext)(eK), n);
        });
      };
      ez ||
        (eV = function (e) {
          return function (t) {
            var n = (0, i.useContext)(eK);
            return null === n
              ? ((n = eb({ key: 'css' })),
                (0, i.createElement)(eK.Provider, { value: n }, e(t, n)))
              : e(t, n);
          };
        });
      var eF = (0, i.createContext)({}),
        eW = '__EMOTION_TYPE_PLEASE_DO_NOT_USE__',
        eH = function (e, t) {
          var n = {};
          for (var r in t) eR.call(t, r) && (n[r] = t[r]);
          return (n[eW] = e), n;
        },
        eU = function (e) {
          var t = e.cache,
            n = e.serialized,
            r = e.isStringTag;
          ek(t, n, r);
          var o = eI(function () {
            return ej(t, n, r);
          });
          if (!ez && void 0 !== o) {
            for (var a, c = n.name, u = n.next; void 0 !== u; )
              (c += ' ' + u.name), (u = u.next);
            return (0, i.createElement)(
              'style',
              (((a = {})['data-emotion'] = t.key + ' ' + c),
              (a.dangerouslySetInnerHTML = { __html: o }),
              (a.nonce = t.sheet.nonce),
              a)
            );
          }
          return null;
        },
        eG = eV(function (e, t, n) {
          var r,
            o,
            a,
            c = e.css;
          'string' == typeof c &&
            void 0 !== t.registered[c] &&
            (c = t.registered[c]);
          var u = e[eW],
            s = [c],
            l = '';
          'string' == typeof e.className
            ? ((r = t.registered),
              (o = e.className),
              (a = ''),
              o.split(' ').forEach(function (e) {
                void 0 !== r[e] ? s.push(r[e] + ';') : (a += e + ' ');
              }),
              (l = a))
            : null != e.className && (l = e.className + ' ');
          var f = eD(s, void 0, (0, i.useContext)(eF));
          l += t.key + '-' + f.name;
          var d = {};
          for (var p in e)
            eR.call(e, p) && 'css' !== p && p !== eW && (d[p] = e[p]);
          return (
            (d.ref = n),
            (d.className = l),
            (0, i.createElement)(
              i.Fragment,
              null,
              (0, i.createElement)(eU, {
                cache: t,
                serialized: f,
                isStringTag: 'string' == typeof u,
              }),
              (0, i.createElement)(u, d)
            )
          );
        }),
        eB = u.Fragment;
      function eq(e, t, n) {
        return eR.call(t, 'css')
          ? (0, u.jsx)(eG, eH(e, t), n)
          : (0, u.jsx)(e, t, n);
      }
      function eJ(e, t, n) {
        return eR.call(t, 'css')
          ? (0, u.jsxs)(eG, eH(e, t), n)
          : (0, u.jsxs)(e, t, n);
      }
      function eX(e, t) {
        return (
          (function (e) {
            if (Array.isArray(e)) return e;
          })(e) ||
          w(e) ||
          x(e, t) ||
          (function () {
            throw TypeError(
              'Invalid attempt to destructure non-iterable instance.\\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.'
            );
          })()
        );
      }
      function eY() {
        for (var e, t, n = 0, r = ''; n < arguments.length; )
          (e = arguments[n++]) &&
            (t = (function e(t) {
              var n,
                r,
                o = '';
              if ('string' == typeof t || 'number' == typeof t) o += t;
              else if ('object' == typeof t) {
                if (Array.isArray(t))
                  for (n = 0; n < t.length; n++)
                    t[n] && (r = e(t[n])) && (o && (o += ' '), (o += r));
                else for (n in t) t[n] && (o && (o += ' '), (o += n));
              }
              return o;
            })(e)) &&
            (r && (r += ' '), (r += t));
        return r;
      }
      var eZ = {
          scheme: 'Light Theme',
          author: 'mac gainor (https://github.com/mac-s-g)',
          base00: 'rgba(0, 0, 0, 0)',
          base01: 'rgb(245, 245, 245)',
          base02: 'rgb(235, 235, 235)',
          base03: '#93a1a1',
          base04: 'rgba(0, 0, 0, 0.3)',
          base05: '#586e75',
          base06: '#073642',
          base07: '#002b36',
          base08: '#d33682',
          base09: '#cb4b16',
          base0A: '#dc322f',
          base0B: '#859900',
          base0C: '#6c71c4',
          base0D: '#586e75',
          base0E: '#2aa198',
          base0F: '#268bd2',
        },
        eQ = {
          scheme: 'Dark Theme',
          author: 'Chris Kempson (http://chriskempson.com)',
          base00: '#181818',
          base01: '#282828',
          base02: '#383838',
          base03: '#585858',
          base04: '#b8b8b8',
          base05: '#d8d8d8',
          base06: '#e8e8e8',
          base07: '#f8f8f8',
          base08: '#ab4642',
          base09: '#dc9656',
          base0A: '#f7ca88',
          base0B: '#a1b56c',
          base0C: '#86c1b9',
          base0D: '#7cafc2',
          base0E: '#ba8baf',
          base0F: '#a16946',
        },
        e0 = function () {
          return null;
        };
      e0.when = function () {
        return !1;
      };
      var e1 = function (e) {
          var t, n, r, o, a, i, c, u, s, l, f, d, p, y, b, S;
          return h()(function (h, w) {
            return {
              enableClipboard:
                null === (t = e.enableClipboard) || void 0 === t || t,
              indentWidth: null !== (n = e.indentWidth) && void 0 !== n ? n : 3,
              groupArraysAfterLength:
                null !== (r = e.groupArraysAfterLength) && void 0 !== r
                  ? r
                  : 100,
              collapseStringsAfterLength:
                !1 === e.collapseStringsAfterLength
                  ? Number.MAX_VALUE
                  : null !== (o = e.collapseStringsAfterLength) && void 0 !== o
                  ? o
                  : 50,
              maxDisplayLength:
                null !== (a = e.maxDisplayLength) && void 0 !== a ? a : 30,
              rootName: null !== (i = e.rootName) && void 0 !== i ? i : 'root',
              onChange:
                null !== (c = e.onChange) && void 0 !== c ? c : function () {},
              onCopy: null !== (u = e.onCopy) && void 0 !== u ? u : void 0,
              onSelect: null !== (s = e.onSelect) && void 0 !== s ? s : void 0,
              keyRenderer:
                null !== (l = e.keyRenderer) && void 0 !== l ? l : e0,
              editable: null !== (f = e.editable) && void 0 !== f && f,
              defaultInspectDepth:
                null !== (d = e.defaultInspectDepth) && void 0 !== d ? d : 5,
              objectSortKeys:
                null !== (p = e.objectSortKeys) && void 0 !== p && p,
              quotesOnKeys: null === (y = e.quotesOnKeys) || void 0 === y || y,
              displayDataTypes:
                null === (b = e.displayDataTypes) || void 0 === b || b,
              inspectCache: {},
              hoverPath: null,
              colorspace: eZ,
              value: e.value,
              displayObjectSize:
                null === (S = e.displayObjectSize) || void 0 === S || S,
              getInspectCache: function (e, t) {
                var n =
                  void 0 !== t
                    ? e.join('.') + '['.concat(t, ']nt')
                    : e.join('.');
                return w().inspectCache[n];
              },
              setInspectCache: function (e, t, n) {
                var r =
                  void 0 !== n
                    ? e.join('.') + '['.concat(n, ']nt')
                    : e.join('.');
                h(function (e) {
                  return {
                    inspectCache: C(
                      g({}, e.inspectCache),
                      m(
                        {},
                        r,
                        'function' == typeof t ? t(e.inspectCache[r]) : t
                      )
                    ),
                  };
                });
              },
              setHover: function (e, t) {
                h({ hoverPath: e ? { path: e, nestedIndex: t } : null });
              },
            };
          });
        },
        e2 = (0, i.createContext)(void 0);
      e2.Provider;
      var e5 = function (e, t) {
          return p((0, i.useContext)(e2), e, t);
        },
        e3 = function () {
          return e5(function (e) {
            return e.colorspace.base07;
          });
        };
      function e4(e, t, n, r, o, a, i) {
        try {
          var c = e[a](i),
            u = c.value;
        } catch (e) {
          n(e);
          return;
        }
        c.done ? t(u) : Promise.resolve(u).then(r, o);
      }
      function e6(e) {
        return function () {
          var t = this,
            n = arguments;
          return new Promise(function (r, o) {
            var a = e.apply(t, n);
            function i(e) {
              e4(a, r, o, i, c, 'next', e);
            }
            function c(e) {
              e4(a, r, o, i, c, 'throw', e);
            }
            i(void 0);
          });
        };
      }
      function e8(e, t) {
        return null != t &&
          'undefined' != typeof Symbol &&
          t[Symbol.hasInstance]
          ? !!t[Symbol.hasInstance](e)
          : e instanceof t;
      }
      function e9(e, t) {
        var n,
          r,
          o,
          a,
          i = {
            label: 0,
            sent: function () {
              if (1 & o[0]) throw o[1];
              return o[1];
            },
            trys: [],
            ops: [],
          };
        return (
          (a = { next: c(0), throw: c(1), return: c(2) }),
          'function' == typeof Symbol &&
            (a[Symbol.iterator] = function () {
              return this;
            }),
          a
        );
        function c(a) {
          return function (c) {
            return (function (a) {
              if (n) throw TypeError('Generator is already executing.');
              for (; i; )
                try {
                  if (
                    ((n = 1),
                    r &&
                      (o =
                        2 & a[0]
                          ? r.return
                          : a[0]
                          ? r.throw || ((o = r.return) && o.call(r), 0)
                          : r.next) &&
                      !(o = o.call(r, a[1])).done)
                  )
                    return o;
                  switch (((r = 0), o && (a = [2 & a[0], o.value]), a[0])) {
                    case 0:
                    case 1:
                      o = a;
                      break;
                    case 4:
                      return i.label++, { value: a[1], done: !1 };
                    case 5:
                      i.label++, (r = a[1]), (a = [0]);
                      continue;
                    case 7:
                      (a = i.ops.pop()), i.trys.pop();
                      continue;
                    default:
                      if (
                        !(o = (o = i.trys).length > 0 && o[o.length - 1]) &&
                        (6 === a[0] || 2 === a[0])
                      ) {
                        i = 0;
                        continue;
                      }
                      if (3 === a[0] && (!o || (a[1] > o[0] && a[1] < o[3]))) {
                        i.label = a[1];
                        break;
                      }
                      if (6 === a[0] && i.label < o[1]) {
                        (i.label = o[1]), (o = a);
                        break;
                      }
                      if (o && i.label < o[2]) {
                        (i.label = o[2]), i.ops.push(a);
                        break;
                      }
                      o[2] && i.ops.pop(), i.trys.pop();
                      continue;
                  }
                  a = t.call(e, i);
                } catch (e) {
                  (a = [6, e]), (r = 0);
                } finally {
                  n = o = 0;
                }
              if (5 & a[0]) throw a[1];
              return { value: a[0] ? a[1] : void 0, done: !0 };
            })([a, c]);
          };
        }
      }
      var e7 = function (e, t, n) {
        if ('object' != typeof e || null === e) {
          if (0 !== t.length) throw Error('path is incorrect');
          return n;
        }
        var r,
          o = k(t);
        if (t.length > 0) {
          if ('__proto__' === (r = o[0]))
            throw TypeError("don't modify __proto__!!!");
          o.length > 1 ? (o.shift(), (e[r] = e7(e[r], o, n))) : (e[r] = n);
        }
        return e;
      };
      function te(e, t, n, r, o) {
        return {
          is: e,
          Component: t,
          Editor: n,
          PreComponent: r,
          PostComponent: o,
        };
      }
      var tt = function (e, t, n) {
        if (
          null === e ||
          null === n ||
          'object' != typeof e ||
          'object' != typeof n
        )
          return !1;
        if (Object.is(e, n) && 0 !== t.length) return '';
        for (
          var r = [], o = k(t), a = e;
          (a !== n || 0 !== o.length) && 'object' == typeof a && null !== a;

        ) {
          if (Object.is(a, n))
            return r.reduce(function (e, t, n) {
              return 'number' == typeof t
                ? e + '['.concat(t, ']')
                : e + ''.concat(0 === n ? '' : '.').concat(t);
            }, '');
          var i = o.shift();
          r.push(i), (a = a[i]);
        }
        return !1;
      };
      function tn(e) {
        if (null == e) return 0;
        if (Array.isArray(e)) return e.length;
        if (e8(e, Map) || e8(e, Set)) return e.size;
        if (e8(e, Date));
        else if ('object' == typeof e) return Object.keys(e).length;
        else if ('string' == typeof e) return e.length;
        return 1;
      }
      function tr(e, t) {
        var n = e5(function (e) {
          return e.value;
        });
        return (0, i.useMemo)(
          function () {
            return tt(n, e, t);
          },
          [e, t, n]
        );
      }
      var to = function (e) {
          return eq(
            'div',
            C(g({}, e), { className: eY('data-box', e.className) })
          );
        },
        ta = function (e) {
          var t = e.dataType,
            n = e.enable;
          return void 0 === n || n
            ? eq(to, {
                className: 'data-type-label data-viewer-data-type-label',
                children: t,
              })
            : null;
        };
      function ti(e, t, n) {
        var r = n.fromString,
          o = n.colorKey,
          a = n.displayTypeLabel,
          c = void 0 === a || a,
          u = (0, i.memo)(t),
          s = function (t) {
            var n = e5(function (e) {
                return e.displayDataTypes;
              }),
              r = e5(function (e) {
                return e.colorspace[o];
              }),
              a = e5(function (e) {
                return e.onSelect;
              });
            return eJ(to, {
              onClick: function () {
                return null == a ? void 0 : a(t.path, t.value);
              },
              style: { color: r },
              children: [
                c && n && eq(ta, { dataType: e }),
                eq(to, {
                  className: ''.concat(e, '-value'),
                  children: eq(u, { value: t.value }),
                }),
              ],
            });
          };
        if (((s.displayName = 'easy-'.concat(e, '-type')), !r))
          return { Component: s };
        var l = function (e) {
          var t = e.value,
            n = e.setValue,
            a = e5(function (e) {
              return e.colorspace[o];
            });
          return eq('textarea', {
            value: ''.concat(t),
            onChange: (0, i.useCallback)(
              function (e) {
                n(r(e.target.value));
              },
              [n]
            ),
            style: {
              color: a,
              padding: 0.5,
              borderStyle: 'solid',
              borderColor: 'black',
              borderWidth: 1,
              fontSize: '0.8rem',
              fontFamily: 'monospace',
              display: 'inline-flex',
            },
          });
        };
        return (
          (l.displayName = 'easy-'.concat(e, '-type-editor')),
          { Component: s, Editor: l }
        );
      }
      var tc = function (e) {
          var t = eX(i.useState(!1), 2),
            n = t[0],
            r = t[1];
          return (i.useEffect(function () {
            r(!0);
          }, []),
          n)
            ? eq(eB, { children: e.children })
            : null;
        },
        tu = function (e) {
          var t = e.toString(),
            n = !0,
            r = t.indexOf(')'),
            o = t.indexOf('=>');
          return (-1 !== o && o > r && (n = !1), n)
            ? t.substring(t.indexOf('{', r) + 1, t.lastIndexOf('}'))
            : t.substring(t.indexOf('=>') + 2);
        },
        ts = function (e) {
          var t = e.toString();
          return -1 !== t.indexOf('function')
            ? t.substring(8, t.indexOf('{')).trim()
            : t.substring(0, t.indexOf('=>') + 2).trim();
        },
        tl = function (e) {
          return eJ(tc, {
            children: [
              eq(ta, { dataType: 'function' }),
              eJ('span', {
                className: 'data-function-start',
                style: { letterSpacing: 0.5 },
                children: [ts(e.value), ' ', '{'],
              }),
            ],
          });
        },
        tf = function () {
          return eq(tc, {
            children: eq('span', {
              className: 'data-function-end',
              children: '}',
            }),
          });
        },
        td = function (e) {
          var t = e5(function (e) {
            return e.colorspace.base05;
          });
          return eq(tc, {
            children: eq('div', {
              className: 'data-function',
              style: {
                display: e.inspect ? 'block' : 'inline-block',
                paddingLeft: e.inspect ? 2 : 0,
                color: t,
              },
              children: e.inspect
                ? tu(e.value)
                : eq('span', {
                    className: 'data-function-body',
                    onClick: function () {
                      return e.setInspect(!0);
                    },
                    children: '…',
                  }),
            }),
          });
        },
        tp = function (e) {
          var t = e.d,
            n = (function (e, t) {
              if (null == e) return {};
              var n,
                r,
                o = (function (e, t) {
                  if (null == e) return {};
                  var n,
                    r,
                    o = {},
                    a = Object.keys(e);
                  for (r = 0; r < a.length; r++)
                    (n = a[r]), t.indexOf(n) >= 0 || (o[n] = e[n]);
                  return o;
                })(e, t);
              if (Object.getOwnPropertySymbols) {
                var a = Object.getOwnPropertySymbols(e);
                for (r = 0; r < a.length; r++)
                  (n = a[r]),
                    !(t.indexOf(n) >= 0) &&
                      Object.prototype.propertyIsEnumerable.call(e, n) &&
                      (o[n] = e[n]);
              }
              return o;
            })(e, ['d']);
          return eq(
            'svg',
            C(g({ 'data-testid': 'base-icon', viewBox: '0 0 24 24' }, n), {
              className: eY(n.className, 'data-viewer-base-icon'),
              children: eq('path', { d: t }),
            })
          );
        },
        ty = function (e) {
          return eq(
            tp,
            g({ d: 'M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z' }, e)
          );
        },
        tv = function (e) {
          return eq(
            tp,
            g(
              {
                'data-testid': 'chevron-right-icon',
                d: 'M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z',
              },
              e
            )
          );
        },
        th = function (e) {
          return eq(
            tp,
            g(
              {
                d: 'M 12 2 C 10.615 1.998 9.214625 2.2867656 7.890625 2.8847656 L 8.9003906 4.6328125 C 9.9043906 4.2098125 10.957 3.998 12 4 C 15.080783 4 17.738521 5.7633175 19.074219 8.3222656 L 17.125 9 L 21.25 11 L 22.875 7 L 20.998047 7.6523438 C 19.377701 4.3110398 15.95585 2 12 2 z M 6.5097656 4.4882812 L 2.2324219 5.0820312 L 3.734375 6.3808594 C 1.6515335 9.4550558 1.3615962 13.574578 3.3398438 17 C 4.0308437 18.201 4.9801562 19.268234 6.1601562 20.115234 L 7.1699219 18.367188 C 6.3019219 17.710187 5.5922656 16.904 5.0722656 16 C 3.5320014 13.332354 3.729203 10.148679 5.2773438 7.7128906 L 6.8398438 9.0625 L 6.5097656 4.4882812 z M 19.929688 13 C 19.794687 14.08 19.450734 15.098 18.927734 16 C 17.386985 18.668487 14.531361 20.090637 11.646484 19.966797 L 12.035156 17.9375 L 8.2402344 20.511719 L 10.892578 23.917969 L 11.265625 21.966797 C 14.968963 22.233766 18.681899 20.426323 20.660156 17 C 21.355156 15.801 21.805219 14.445 21.949219 13 L 19.929688 13 z',
              },
              e
            )
          );
        },
        tb = function (e) {
          return eq(
            tp,
            g(
              {
                d: 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z',
              },
              e
            )
          );
        },
        tm = function (e) {
          return eq(
            tp,
            g(
              {
                d: 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z',
              },
              e
            )
          );
        },
        tg = function (e) {
          return eq(
            tp,
            g(
              {
                d: 'M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z',
              },
              e
            )
          );
        },
        tC = function (e) {
          return eq(
            tp,
            g(
              {
                'data-testid': 'expand-more-icon',
                d: 'M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z',
              },
              e
            )
          );
        },
        tS = (0, i.lazy)(
          e6(function () {
            return e9(this, function (e) {
              return [
                2,
                Promise.resolve()
                  .then(function () {
                    return tE;
                  })
                  .then(function (e) {
                    return { default: e.DataKeyPair };
                  }),
              ];
            });
          })
        );
      function tw(e) {
        var t = tn(e),
          n = '';
        return (
          (e8(e, Map) || e8(e, Set)) && (n = e[Symbol.toStringTag]),
          Object.prototype.hasOwnProperty.call(e, Symbol.toStringTag) &&
            (n = e[Symbol.toStringTag]),
          ''.concat(t, ' Items').concat(n ? ' ('.concat(n, ')') : '')
        );
      }
      var tx = (0, i.createContext)(void 0);
      tx.Provider;
      var tk = function (e, t) {
          return p((0, i.useContext)(tx), e, t);
        },
        tj = {
          is: function (e) {
            return 'object' == typeof e;
          },
          Component: function (e) {
            var t = e3(),
              n = e5(function (e) {
                return e.colorspace.base02;
              }),
              r = e5(function (e) {
                return e.groupArraysAfterLength;
              }),
              o = tr(e.path, e.value),
              a = eX(
                (0, i.useState)(
                  e5(function (e) {
                    return e.maxDisplayLength;
                  })
                ),
                2
              ),
              c = a[0],
              u = a[1],
              s = e5(function (e) {
                return e.objectSortKeys;
              }),
              l = (0, i.useMemo)(
                function () {
                  if (!e.inspect) return null;
                  var n = e.value;
                  if (
                    'function' ==
                      typeof (null == n ? void 0 : n[Symbol.iterator]) &&
                    !Array.isArray(n)
                  ) {
                    var o = [];
                    if (e8(n, Map)) {
                      var a = !0,
                        i = !1,
                        l = void 0;
                      try {
                        for (
                          var f, d = n[Symbol.iterator]();
                          !(a = (f = d.next()).done);
                          a = !0
                        ) {
                          var p = f.value,
                            y = eX(p, 2),
                            h = y[0],
                            b = y[1],
                            m = ''.concat(h);
                          o.push(
                            eq(
                              tS,
                              {
                                path: k(e.path).concat([m]),
                                value: b,
                                editable: !1,
                              },
                              m
                            )
                          );
                        }
                      } catch (e) {
                        (i = !0), (l = e);
                      } finally {
                        try {
                          a || null == d.return || d.return();
                        } finally {
                          if (i) throw l;
                        }
                      }
                    } else {
                      var g = 0,
                        C = !0,
                        S = !1,
                        w = void 0;
                      try {
                        for (
                          var x, j = n[Symbol.iterator]();
                          !(C = (x = j.next()).done);
                          C = !0
                        ) {
                          var O = x.value;
                          o.push(
                            eq(
                              tS,
                              {
                                path: k(e.path).concat(['iterator:'.concat(g)]),
                                value: O,
                                nestedIndex: g,
                                editable: !1,
                              },
                              g
                            )
                          ),
                            g++;
                        }
                      } catch (e) {
                        (S = !0), (w = e);
                      } finally {
                        try {
                          C || null == j.return || j.return();
                        } finally {
                          if (S) throw w;
                        }
                      }
                    }
                    return o;
                  }
                  if (Array.isArray(n)) {
                    if (n.length <= r) {
                      var A = n.slice(0, c).map(function (t, n) {
                        return eq(
                          tS,
                          { path: k(e.path).concat([n]), value: t },
                          n
                        );
                      });
                      if (n.length > c) {
                        var E = n.length - c;
                        A.push(
                          eJ(
                            to,
                            {
                              className: 'data-viewer-object-item',
                              style: { color: t },
                              onClick: function () {
                                return u(function (e) {
                                  return 2 * e;
                                });
                              },
                              children: ['hidden ', E, ' items…'],
                            },
                            'last'
                          )
                        );
                      }
                      return A;
                    }
                    return (function (e, t) {
                      for (var n = [], r = 0; r < e.length; )
                        n.push(e.slice(r, r + t)), (r += t);
                      return n;
                    })(n, r).map(function (t, n) {
                      return eq(
                        tS,
                        { path: k(e.path), value: t, nestedIndex: n },
                        n
                      );
                    });
                  }
                  var P = Object.entries(n);
                  s &&
                    (P =
                      !0 === s
                        ? P.sort(function (e, t) {
                            var n = eX(e, 1)[0],
                              r = eX(t, 1)[0];
                            return n.localeCompare(r);
                          })
                        : P.sort(function (e, t) {
                            return s(eX(e, 1)[0], eX(t, 1)[0]);
                          }));
                  var N = P.slice(0, c).map(function (t) {
                    var n = eX(t, 2),
                      r = n[0],
                      o = n[1];
                    return eq(tS, { path: k(e.path).concat([r]), value: o }, r);
                  });
                  if (P.length > c) {
                    var $ = P.length - c;
                    N.push(
                      eJ(
                        to,
                        {
                          className: 'data-viewer-object-item',
                          style: { color: t },
                          onClick: function () {
                            return u(function (e) {
                              return 2 * e;
                            });
                          },
                          children: ['hidden ', $, ' items…'],
                        },
                        'last'
                      )
                    );
                  }
                  return N;
                },
                [e.inspect, e.value, e.path, r, c, t, s]
              ),
              f = e.inspect ? 0.6 : 0,
              d = e5(function (e) {
                return e.indentWidth;
              }),
              p = e.inspect ? d - f : d;
            return (0, i.useMemo)(
              function () {
                return 0 === tn(e.value);
              },
              [e.value]
            )
              ? null
              : eq('span', {
                  className: 'data-object',
                  style: {
                    display: e.inspect ? 'block' : 'inline-block',
                    paddingLeft: e.inspect ? p - 0.6 : 0,
                    marginLeft: f,
                    color: t,
                    borderLeft: e.inspect ? '1px solid '.concat(n) : 'none',
                  },
                  children: e.inspect
                    ? l
                    : o
                    ? null
                    : eq('span', {
                        className: 'data-object-body',
                        onClick: function () {
                          return e.setInspect(!0);
                        },
                        style: { padding: 0.5, userSelect: 'none' },
                        children: '…',
                      }),
                });
          },
          PreComponent: function (e) {
            var t = e5(function (e) {
                return e.colorspace.base04;
              }),
              n = e3(),
              r = (0, i.useMemo)(
                function () {
                  return Array.isArray(e.value);
                },
                [e.value]
              ),
              o = (0, i.useMemo)(
                function () {
                  return 0 === tn(e.value);
                },
                [e.value]
              ),
              a = (0, i.useMemo)(
                function () {
                  return tw(e.value);
                },
                [e.value]
              ),
              c = e5(function (e) {
                return e.displayObjectSize;
              }),
              u = tr(e.path, e.value);
            return eJ('span', {
              className: 'data-object-start',
              style: { letterSpacing: 0.5 },
              children: [
                r ? '[' : '{',
                c &&
                  e.inspect &&
                  !o &&
                  eq('span', {
                    style: {
                      paddingLeft: 0.5,
                      fontStyle: 'italic',
                      color: t,
                      userSelect: 'none',
                    },
                    children: a,
                  }),
                u && !e.inspect
                  ? eJ(eB, {
                      children: [
                        eq(th, {
                          style: {
                            fontSize: 12,
                            color: n,
                            marginLeft: 0.5,
                            marginRight: 0.5,
                          },
                        }),
                        u,
                      ],
                    })
                  : null,
              ],
            });
          },
          PostComponent: function (e) {
            var t = e5(function (e) {
                return e.colorspace.base04;
              }),
              n = (0, i.useMemo)(
                function () {
                  return Array.isArray(e.value);
                },
                [e.value]
              ),
              r = e5(function (e) {
                return e.displayObjectSize;
              }),
              o = (0, i.useMemo)(
                function () {
                  return 0 === tn(e.value);
                },
                [e.value]
              ),
              a = (0, i.useMemo)(
                function () {
                  return tw(e.value);
                },
                [e.value]
              );
            return eJ('span', {
              className: 'data-object-end',
              children: [
                n ? ']' : '}',
                r && (o || !e.inspect)
                  ? eq('span', {
                      style: {
                        paddingLeft: 0.5,
                        fontStyle: 'italic',
                        color: t,
                        userSelect: 'none',
                      },
                      children: a,
                    })
                  : null,
              ],
            });
          },
        },
        tO = function (e) {
          return eq(
            'span',
            C(g({}, e), { className: eY(e.className, 'data-viewer-icon-box') })
          );
        },
        tA = function (e) {
          var t,
            n,
            r,
            o,
            a,
            c,
            u,
            s,
            l,
            f,
            d,
            p = e.value,
            y = e.path,
            h = e.nestedIndex,
            m = null !== (d = e.editable) && void 0 !== d ? d : void 0,
            C = e5(function (e) {
              return e.editable;
            }),
            S = (0, i.useMemo)(
              function () {
                return (
                  !1 !== C &&
                  !1 !== m &&
                  ('function' == typeof C ? !!C(y, p) : C)
                );
              },
              [y, m, C, p]
            ),
            w = eX(
              (0, i.useState)(
                'function' == typeof p
                  ? function () {
                      return p;
                    }
                  : p
              ),
              2
            ),
            x = w[0],
            k = w[1],
            j = y.length,
            O = y[j - 1],
            A = e5(function (e) {
              return e.hoverPath;
            }),
            E = (0, i.useMemo)(
              function () {
                return (
                  A &&
                  y.every(function (e, t) {
                    return e === A.path[t] && h === A.nestedIndex;
                  })
                );
              },
              [A, y, h]
            ),
            P = e5(function (e) {
              return e.setHover;
            }),
            N = e5(function (e) {
              return e.value;
            }),
            $ = eX(
              ((t = y.length),
              (n = tr(y, p)),
              (r = e5(function (e) {
                return e.getInspectCache;
              })),
              (o = e5(function (e) {
                return e.setInspectCache;
              })),
              (a = e5(function (e) {
                return e.defaultInspectDepth;
              })),
              (0, i.useEffect)(
                function () {
                  void 0 === r(y, h) &&
                    (void 0 !== h ? o(y, !1, h) : o(y, !n && t < a));
                },
                [a, t, r, n, h, y, o]
              ),
              (u = (c = eX(
                (0, i.useState)(function () {
                  var e = r(y, h);
                  return void 0 !== e ? e : void 0 === h && !n && t < a;
                }),
                2
              ))[0]),
              (s = c[1]),
              (l = (0, i.useCallback)(
                function (e) {
                  var t = 'boolean' == typeof e ? e : e(u);
                  o(y, t, h), s(t);
                },
                [u, h, y, o]
              )),
              [u, l]),
              2
            ),
            L = $[0],
            M = $[1],
            T = eX((0, i.useState)(!1), 2),
            D = T[0],
            _ = T[1],
            I = e5(function (e) {
              return e.onChange;
            }),
            z = e3(),
            R = e5(function (e) {
              return e.colorspace.base0C;
            }),
            K =
              ((f = tk(function (e) {
                return e.registry;
              })),
              (0, i.useMemo)(
                function () {
                  return (function (e, t, n) {
                    var r = !0,
                      o = !1,
                      a = void 0;
                    try {
                      for (
                        var i, c, u = n[Symbol.iterator]();
                        !(r = (c = u.next()).done);
                        r = !0
                      ) {
                        var s = c.value;
                        if (s.is(e, t) && ((i = s), 'object' == typeof e))
                          return s;
                      }
                    } catch (e) {
                      (o = !0), (a = e);
                    } finally {
                      try {
                        r || null == u.return || u.return();
                      } finally {
                        if (o) throw a;
                      }
                    }
                    if (void 0 === i) {
                      if ('object' == typeof e) return tj;
                      throw Error('this is not possible');
                    }
                    return i;
                  })(p, y, f);
                },
                [p, y, f]
              )),
            V = K.Component,
            F = K.PreComponent,
            W = K.PostComponent,
            H = K.Editor,
            U = e5(function (e) {
              return e.quotesOnKeys;
            }),
            G = e5(function (e) {
              return e.rootName;
            }),
            B = N === p,
            q = Number.isInteger(Number(O)),
            J = e5(function (e) {
              return e.enableClipboard;
            }),
            X = (function () {
              var e,
                t =
                  arguments.length > 0 && void 0 !== arguments[0]
                    ? arguments[0]
                    : {},
                n = t.timeout,
                r = void 0 === n ? 2e3 : n,
                o = eX((0, i.useState)(!1), 2),
                a = o[0],
                c = o[1],
                u = (0, i.useRef)(null),
                s = (0, i.useCallback)(
                  function (e) {
                    var t = u.current;
                    t && window.clearTimeout(t),
                      (u.current = window.setTimeout(function () {
                        return c(!1);
                      }, r)),
                      c(e);
                  },
                  [r]
                ),
                l = e5(function (e) {
                  return e.onCopy;
                });
              return {
                copy: (0, i.useCallback)(
                  ((e = e6(function (e, t) {
                    var n, r;
                    return e9(this, function (o) {
                      if ('function' == typeof l)
                        try {
                          if (((n = l(e, t)), e8(n, Promise)))
                            return [
                              2,
                              n
                                .then(function () {
                                  s(!0);
                                })
                                .catch(function (t) {
                                  console.error(
                                    'error when copy '.concat(
                                      0 === e.length
                                        ? 'src'
                                        : 'src['.concat(e.join('.')),
                                      ']'
                                    ),
                                    t
                                  );
                                }),
                            ];
                          s(!0);
                        } catch (t) {
                          console.error(
                            'error when copy '.concat(
                              0 === e.length
                                ? 'src'
                                : 'src['.concat(e.join('.')),
                              ']'
                            ),
                            t
                          );
                        }
                      else {
                        var a;
                        return ((a =
                          'function' == typeof t ? t.toString() : t) &&
                          'object' == typeof a &&
                          (a = (function e(t, n) {
                            var r = {};
                            return (
                              Object.keys(n).forEach(function (o) {
                                var a = n[o];
                                a && 'object' == typeof a
                                  ? 0 > t.indexOf(a)
                                    ? (t.push(a), (r[o] = e(t, a)), t.pop())
                                    : (r[o] = '###_Circular_###')
                                  : 'function' != typeof a && (r[o] = a);
                              }),
                              r
                            );
                          })([a], a)),
                        (r = JSON.stringify(a)),
                        'clipboard' in navigator)
                          ? [
                              2,
                              navigator.clipboard
                                .writeText(r)
                                .then(function () {
                                  return s(!0);
                                })
                                .catch(function () {
                                  return b(r);
                                }),
                            ]
                          : [2, b(r)];
                      }
                      return [2];
                    });
                  })),
                  function (t, n) {
                    return e.apply(this, arguments);
                  }),
                  [s, l]
                ),
                reset: (0, i.useCallback)(function () {
                  c(!1), u.current && clearTimeout(u.current);
                }, []),
                copied: a,
              };
            })(),
            Y = X.copy,
            Z = X.copied,
            Q = (0, i.useMemo)(
              function () {
                return D
                  ? eJ(eB, {
                      children: [
                        eq(tO, {
                          children: eq(tb, {
                            onClick: function () {
                              _(!1), k(p);
                            },
                          }),
                        }),
                        eq(tO, {
                          children: eq(ty, {
                            onClick: function () {
                              _(!1), I(y, p, x);
                            },
                          }),
                        }),
                      ],
                    })
                  : eJ(eB, {
                      children: [
                        J &&
                          eq(tO, {
                            onClick: function (e) {
                              e.preventDefault();
                              try {
                                Y(y, p);
                              } catch (e) {
                                console.error(e);
                              }
                            },
                            children: Z ? eq(ty, {}) : eq(tm, {}),
                          }),
                        H &&
                          S &&
                          eq(tO, {
                            onClick: function (e) {
                              e.preventDefault(), _(!0);
                            },
                            children: eq(tg, {}),
                          }),
                      ],
                    });
              },
              [H, Z, Y, S, D, J, I, y, x, p]
            ),
            ee = (0, i.useMemo)(
              function () {
                return 0 === tn(p);
              },
              [p]
            ),
            et = !ee && !!(F && W),
            en = e5(function (e) {
              return e.keyRenderer;
            }),
            er = (0, i.useMemo)(
              function () {
                return { path: y, inspect: L, setInspect: M, value: p };
              },
              [L, y, M, p]
            );
          return eJ('div', {
            className: 'data-key-pair',
            'data-testid': 'data-key-pair' + y.join('.'),
            style: { userSelect: 'text' },
            onMouseEnter: (0, i.useCallback)(
              function () {
                return P(y, h);
              },
              [P, y, h]
            ),
            children: [
              eJ('span', {
                className: 'data-key data-viewer-expand-box',
                style: { color: z },
                onClick: (0, i.useCallback)(
                  function (e) {
                    !e.isDefaultPrevented() &&
                      (ee ||
                        M(function (e) {
                          return !e;
                        }));
                  },
                  [ee, M]
                ),
                children: [
                  et
                    ? L
                      ? eq(tC, { className: 'data-viewer-cursor-icon' })
                      : eq(tv, { className: 'data-viewer-cursor-icon' })
                    : null,
                  B
                    ? !1 !== G
                      ? U
                        ? eJ(eB, { children: ['"', G, '"'] })
                        : eq(eB, { children: G })
                      : null
                    : en.when(er)
                    ? eq(en, g({}, er))
                    : void 0 === h &&
                      (q
                        ? eq('span', { style: { color: R }, children: O })
                        : U
                        ? eJ(eB, { children: ['"', O, '"'] })
                        : eq(eB, { children: O })),
                  B
                    ? !1 !== G
                      ? eq(to, { children: ':' })
                      : null
                    : void 0 === h && eq(to, { children: ':' }),
                  F && eq(F, g({}, er)),
                  E && et && L && Q,
                ],
              }),
              D && S
                ? H && eq(H, { value: x, setValue: k })
                : V
                ? eq(V, g({}, er))
                : eq('span', {
                    className: 'data-value-fallback',
                    children: 'fallback: '.concat(p),
                  }),
              W && eq(W, g({}, er)),
              E && et && !L && Q,
              E && !et && Q,
            ],
          });
        },
        tE = Object.freeze({ __proto__: null, DataKeyPair: tA }),
        tP = '(prefers-color-scheme: dark)';
      function tN(e, t) {
        var n = (0, i.useContext)(e2).setState;
        (0, i.useEffect)(
          function () {
            void 0 !== t && n(m({}, e, t));
          },
          [e, t, n]
        );
      }
      var t$ = function (e) {
          var t,
            n = (0, i.useContext)(e2).setState;
          tN('value', e.value),
            tN('editable', e.editable),
            tN('indentWidth', e.indentWidth),
            tN('onChange', e.onChange),
            tN('groupArraysAfterLength', e.groupArraysAfterLength),
            tN('keyRenderer', e.keyRenderer),
            tN('maxDisplayLength', e.maxDisplayLength),
            tN('enableClipboard', e.enableClipboard),
            tN('rootName', e.rootName),
            tN('displayDataTypes', e.displayDataTypes),
            tN('displayObjectSize', e.displayObjectSize),
            tN('onCopy', e.onCopy),
            tN('onSelect', e.onSelect),
            (0, i.useEffect)(
              function () {
                'light' === e.theme
                  ? n({ colorspace: eZ })
                  : 'dark' === e.theme
                  ? n({ colorspace: eQ })
                  : 'object' == typeof e.theme && n({ colorspace: e.theme });
              },
              [n, e.theme]
            );
          var r = (0, i.useRef)(!0),
            o = (0, i.useMemo)(function () {
              var e, t, n, r;
              return (
                (e = function (e) {
                  function n(e, t) {
                    var n, r;
                    return (
                      Object.is(e.value, t.value) &&
                      e.inspect &&
                      t.inspect &&
                      (null === (n = e.path) || void 0 === n
                        ? void 0
                        : n.join('.')) ===
                        (null === (r = t.path) || void 0 === r
                          ? void 0
                          : r.join('.'))
                    );
                  }
                  (e.Component = (0, i.memo)(e.Component, n)),
                    e.Editor &&
                      (e.Editor = (0, i.memo)(e.Editor, function (e, t) {
                        return Object.is(e.value, t.value);
                      })),
                    e.PreComponent &&
                      (e.PreComponent = (0, i.memo)(e.PreComponent, n)),
                    e.PostComponent &&
                      (e.PostComponent = (0, i.memo)(e.PostComponent, n)),
                    t.push(e);
                }),
                (t = []),
                e(
                  g(
                    {
                      is: function (e) {
                        return 'boolean' == typeof e;
                      },
                    },
                    ti(
                      'bool',
                      function (e) {
                        return eq(eB, { children: e.value ? 'true' : 'false' });
                      },
                      {
                        colorKey: 'base0E',
                        fromString: function (e) {
                          return !!e;
                        },
                      }
                    )
                  )
                ),
                (n = {
                  weekday: 'short',
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
                e(
                  g(
                    {
                      is: function (e) {
                        return e8(e, Date);
                      },
                    },
                    ti(
                      'date',
                      function (e) {
                        return eq(eB, {
                          children: e.value.toLocaleTimeString('en-us', n),
                        });
                      },
                      { colorKey: 'base0D' }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return null === e;
                      },
                    },
                    ti(
                      'null',
                      function () {
                        return eq('div', {
                          style: {
                            fontSize: '0.8rem',
                            backgroundColor: e5(function (e) {
                              return e.colorspace.base02;
                            }),
                            fontWeight: 'bold',
                            borderRadius: '3px',
                            padding: '0.5px 2px',
                          },
                          children: 'NULL',
                        });
                      },
                      { colorKey: 'base08', displayTypeLabel: !1 }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return void 0 === e;
                      },
                    },
                    ti(
                      'undefined',
                      function () {
                        return eq('div', {
                          style: {
                            fontSize: '0.7rem',
                            backgroundColor: e5(function (e) {
                              return e.colorspace.base02;
                            }),
                            borderRadius: '3px',
                            padding: '0.5px 2px',
                          },
                          children: 'undefined',
                        });
                      },
                      { colorKey: 'base05', displayTypeLabel: !1 }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return 'string' == typeof e;
                      },
                    },
                    ti(
                      'string',
                      function (e) {
                        var t = eX((0, i.useState)(!1), 2),
                          n = t[0],
                          r = t[1],
                          o = e5(function (e) {
                            return e.collapseStringsAfterLength;
                          }),
                          a = n ? e.value : e.value.slice(0, o),
                          c = e.value.length > o;
                        return eJ('span', {
                          style: {
                            overflowWrap: 'anywhere',
                            cursor: c ? 'pointer' : 'inherit',
                          },
                          onClick: function () {
                            c &&
                              r(function (e) {
                                return !e;
                              });
                          },
                          children: [
                            '"',
                            a,
                            c &&
                              !n &&
                              eq('span', {
                                style: { padding: 0.5 },
                                children: '…',
                              }),
                            '"',
                          ],
                        });
                      },
                      {
                        colorKey: 'base09',
                        fromString: function (e) {
                          return e;
                        },
                      }
                    )
                  )
                ),
                e({
                  is: function (e) {
                    return 'function' == typeof e;
                  },
                  Component: td,
                  PreComponent: tl,
                  PostComponent: tf,
                }),
                (r = function (e) {
                  return e % 1 == 0;
                }),
                e(
                  g(
                    {
                      is: function (e) {
                        return 'number' == typeof e && isNaN(e);
                      },
                    },
                    ti(
                      'NaN',
                      function () {
                        return eq('div', {
                          style: {
                            backgroundColor: e5(function (e) {
                              return e.colorspace.base02;
                            }),
                            fontSize: '0.8rem',
                            fontWeight: 'bold',
                            borderRadius: '3px',
                          },
                          children: 'NaN',
                        });
                      },
                      { colorKey: 'base08', displayTypeLabel: !1 }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return 'number' == typeof e && !r(e);
                      },
                    },
                    ti(
                      'float',
                      function (e) {
                        return eq(eB, { children: e.value });
                      },
                      {
                        colorKey: 'base0B',
                        fromString: function (e) {
                          return parseFloat(e);
                        },
                      }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return 'number' == typeof e && r(e);
                      },
                    },
                    ti(
                      'int',
                      function (e) {
                        return eq(eB, { children: e.value });
                      },
                      {
                        colorKey: 'base0F',
                        fromString: function (e) {
                          return e ? parseInt(e) : 0;
                        },
                      }
                    )
                  )
                ),
                e(
                  g(
                    {
                      is: function (e) {
                        return (
                          (void 0 === e
                            ? 'undefined'
                            : e && e.constructor === Symbol
                            ? 'symbol'
                            : typeof e) == 'bigint'
                        );
                      },
                    },
                    ti(
                      'bigint',
                      function (e) {
                        var t = e.value;
                        return eq(eB, { children: ''.concat(t, 'n') });
                      },
                      {
                        colorKey: 'base0F',
                        fromString: function (e) {
                          return BigInt(e.replace(/\D/g, ''));
                        },
                      }
                    )
                  )
                ),
                t
              );
            }, []),
            a = tk(function (e) {
              return e.registerTypes;
            });
          r.current &&
            (a(e.valueTypes ? k(o).concat(k(e.valueTypes)) : k(o)),
            (r.current = !1)),
            (0, i.useEffect)(
              function () {
                a(e.valueTypes ? k(o).concat(k(e.valueTypes)) : k(o));
              },
              [e.valueTypes, o, a]
            );
          var c = e5(function (e) {
              return e.value;
            }),
            u = e5(function (e) {
              return e.setHover;
            }),
            s = (0, i.useCallback)(
              function () {
                return u(null);
              },
              [u]
            );
          return eq('div', {
            className: e.className,
            style: g(
              {
                fontFamily: 'monospace',
                userSelect: 'none',
                contentVisibility: 'auto',
              },
              null !== (t = e.style) && void 0 !== t ? t : {}
            ),
            onMouseLeave: s,
            children: eq(tA, {
              value: c,
              path: (0, i.useMemo)(function () {
                return [];
              }, []),
            }),
          });
        },
        tL = function (e) {
          var t,
            n,
            r,
            o,
            a =
              ((n = (t = eX((0, i.useState)(!1), 2))[0]),
              (r = t[1]),
              (0, i.useEffect)(function () {
                var e = function (e) {
                  r(e.matches);
                };
                r(window.matchMedia(tP).matches);
                var t = window.matchMedia(tP);
                return (
                  t.addEventListener('change', e),
                  function () {
                    return t.removeEventListener('change', e);
                  }
                );
              }, []),
              n),
            c = (0, i.useMemo)(
              function () {
                return 'auto' === e.theme
                  ? a
                    ? 'light'
                    : 'dark'
                  : null !== (o = e.theme) && void 0 !== o
                  ? o
                  : 'light';
              },
              [a, e.theme]
            ),
            u = C(g({}, e), { theme: c }),
            s = (0, i.useMemo)(function () {
              return e1(e);
            }, []),
            f = (0, i.useMemo)(function () {
              return l()(function (e) {
                return {
                  registry: [],
                  registerTypes: function (t) {
                    e(function (e) {
                      return {
                        registry: 'function' == typeof t ? t(e.registry) : t,
                      };
                    });
                  },
                };
              });
            }, []);
          return eq(tx.Provider, {
            value: f,
            children: eq(e2.Provider, { value: s, children: eq(t$, g({}, u)) }),
          });
        };
    },
  },
]);
//# sourceMappingURL=8870.03e083c7d0412e77.js.map
