'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [5860],
  {
    35860: function (e, t, r) {
      r.r(t),
        r.d(t, {
          DevTools: function () {
            return h;
          },
          useAtomDevtools: function () {
            return p;
          },
          useAtomsDebugValue: function () {
            return d;
          },
          useAtomsDevtools: function () {
            return y;
          },
          useAtomsSnapshot: function () {
            return a;
          },
          useGotoAtomsSnapshot: function () {
            return i;
          },
        });
      var n = r(2784),
        o = r(752),
        u = (e, t) =>
          e.size === t.size &&
          Array.from(e).every(e => {
            let [r, n] = e;
            return Object.is(t.get(r), n);
          }),
        l = (e, t) =>
          e.size === t.size &&
          Array.from(e).every(e => {
            let [r, n] = e,
              o = t.get(r);
            return o && n.size === o.size && Array.from(n).every(e => o.has(e));
          });
      function a(e) {
        let t = (0, o.oR)(e),
          [r, a] = (0, n.useState)(() => ({
            values: new Map(),
            dependents: new Map(),
          }));
        return (
          (0, n.useEffect)(() => {
            let e =
              (null == t ? void 0 : t.dev_subscribe_store) ||
              (null == t ? void 0 : t.dev_subscribe_state);
            if (!e) return;
            let r = new Map(),
              n = new Map();
            'dev_subscribe_store' in t ||
              console.warn(
                "[DEPRECATION-WARNING] Jotai version you're using contains deprecated dev-only properties that will be removed soon. Please update to the latest version of Jotai."
              );
            let o = () => {
                var e, o, i;
                let s = new Map(),
                  c = new Map();
                for (let r of (null === (e = t.dev_get_mounted_atoms) ||
                void 0 === e
                  ? void 0
                  : e.call(t)) || []) {
                  let e =
                    null === (o = t.dev_get_atom_state) || void 0 === o
                      ? void 0
                      : o.call(t, r);
                  e && 'v' in e && s.set(r, e.v);
                  let n =
                    null === (i = t.dev_get_mounted) || void 0 === i
                      ? void 0
                      : i.call(t, r);
                  n && c.set(r, n.t);
                }
                (u(r, s) && l(n, c)) ||
                  ((r = s), (n = c), a({ values: s, dependents: c }));
              },
              i = null == e ? void 0 : e(o);
            return o(), i;
          }, [t]),
          r
        );
      }
      function i(e) {
        let t = (0, o.oR)(e);
        return (0, n.useCallback)(
          e => {
            t.dev_restore_atoms && t.dev_restore_atoms(e.values);
          },
          [t]
        );
      }
      var s = e => e.debugLabel || e.toString(),
        c = e => {
          let [t, r] = e;
          return Object.fromEntries(
            r.flatMap(e => {
              var r, n;
              let o =
                null === (r = t.dev_get_mounted) || void 0 === r
                  ? void 0
                  : r.call(t, e);
              if (!o) return [];
              let u = o.t,
                l =
                  (null === (n = t.dev_get_atom_state) || void 0 === n
                    ? void 0
                    : n.call(t, e)) || {};
              return [
                [
                  s(e),
                  {
                    ...('e' in l && { error: l.e }),
                    ...('v' in l && { value: l.v }),
                    dependents: Array.from(u).map(s),
                  },
                ],
              ];
            })
          );
        },
        d = e => {
          var t;
          let r =
              null !== (t = null == e ? void 0 : e.enabled) &&
              void 0 !== t &&
              t,
            u = (0, o.oR)(e),
            [l, a] = (0, n.useState)([]);
          (0, n.useEffect)(() => {
            let e =
              (null == u ? void 0 : u.dev_subscribe_store) ||
              (null == u ? void 0 : u.dev_subscribe_state);
            if (!r || !e) return;
            let t = () => {
              var e;
              a(
                Array.from(
                  (null === (e = u.dev_get_mounted_atoms) || void 0 === e
                    ? void 0
                    : e.call(u)) || []
                )
              );
            };
            'dev_subscribe_store' in u ||
              console.warn(
                "[DEPRECATION-WARNING] Jotai version you're using contains deprecated dev-only properties that will be removed soon. Please update to the latest version of Jotai."
              );
            let n = null == e ? void 0 : e(t);
            return t(), n;
          }, [r, u]),
            (0, n.useDebugValue)([u, l], c);
        },
        v = (e, t) => {
          if (!e) return;
          let r = e.connect({ name: t });
          return Object.assign(r, { shouldInit: !0 });
        },
        f = function () {
          let e =
            arguments.length > 0 && void 0 !== arguments[0] && arguments[0];
          if (!e) return;
          let t = window.__REDUX_DEVTOOLS_EXTENSION__;
          return t;
        };
      function p(e, t) {
        let { enabled: r, name: u } = t || {},
          l = f(r),
          [a, i] = (0, o.KO)(e, t),
          s = (0, n.useRef)(a),
          c = (0, n.useRef)(!1),
          d = (0, n.useRef)(),
          p = u || e.debugLabel || e.toString();
        (0, n.useEffect)(() => {
          var t;
          if (!l) return;
          let r = t => {
            if ('function' == typeof i) {
              i(t);
              return;
            }
            console.warn(
              '[Warn] you cannot do write operations (Time-travelling, etc) in read-only atoms\n',
              e
            );
          };
          d.current = v(l, p);
          let n =
            null === (t = d.current) || void 0 === t
              ? void 0
              : t.subscribe(e => {
                  var t, n, o, u, l, a;
                  if ('ACTION' === e.type && e.payload)
                    try {
                      r(JSON.parse(e.payload));
                    } catch (e) {
                      console.error(
                        'please dispatch a serializable value that JSON.parse() support\n',
                        e
                      );
                    }
                  else if ('DISPATCH' === e.type && e.state)
                    ((null === (o = e.payload) || void 0 === o
                      ? void 0
                      : o.type) === 'JUMP_TO_ACTION' ||
                      (null === (u = e.payload) || void 0 === u
                        ? void 0
                        : u.type) === 'JUMP_TO_STATE') &&
                      ((c.current = !0), r(JSON.parse(e.state)));
                  else if (
                    'DISPATCH' === e.type &&
                    (null === (t = e.payload) || void 0 === t
                      ? void 0
                      : t.type) === 'COMMIT'
                  )
                    null === (l = d.current) ||
                      void 0 === l ||
                      l.init(s.current);
                  else if (
                    'DISPATCH' === e.type &&
                    (null === (n = e.payload) || void 0 === n
                      ? void 0
                      : n.type) === 'IMPORT_STATE'
                  ) {
                    let t =
                      (null === (a = e.payload.nextLiftedState) || void 0 === a
                        ? void 0
                        : a.computedStates) || [];
                    t.forEach((e, t) => {
                      let { state: n } = e;
                      if (0 === t) {
                        var o;
                        null === (o = d.current) || void 0 === o || o.init(n);
                      } else r(n);
                    });
                  }
                });
          return n;
        }, [e, l, p, i]),
          (0, n.useEffect)(() => {
            d.current &&
              ((s.current = a),
              d.current.shouldInit
                ? (d.current.init(a), (d.current.shouldInit = !1))
                : c.current
                ? (c.current = !1)
                : d.current.send(
                    ''.concat(p, ' - ').concat(new Date().toLocaleString()),
                    a
                  ));
          }, [e, l, p, a]);
      }
      var _ = e =>
          e.debugLabel ? ''.concat(e, ':').concat(e.debugLabel) : ''.concat(e),
        b = e => {
          let t = {};
          e.values.forEach((e, r) => {
            t[_(r)] = e;
          });
          let r = {};
          return (
            e.dependents.forEach((e, t) => {
              r[_(t)] = Array.from(e).map(_);
            }),
            { values: t, dependents: r }
          );
        };
      function y(e, t) {
        let { enabled: r } = t || {},
          o = f(r),
          u = a(t),
          l = i(t),
          s = (0, n.useRef)(!1),
          c = (0, n.useRef)(!0),
          d = (0, n.useRef)(),
          p = (0, n.useRef)([]);
        (0, n.useEffect)(() => {
          var t;
          if (!o) return;
          let r = function () {
            let e =
                arguments.length > 0 && void 0 !== arguments[0]
                  ? arguments[0]
                  : p.current.length - 1,
              t = p.current[e >= 0 ? e : 0];
            if (!t) throw Error('snaphost index out of bounds');
            return t;
          };
          d.current = v(o, e);
          let n =
            null === (t = d.current) || void 0 === t
              ? void 0
              : t.subscribe(e => {
                  if ('DISPATCH' === e.type) {
                    var t, n;
                    switch (
                      null === (t = e.payload) || void 0 === t ? void 0 : t.type
                    ) {
                      case 'RESET':
                        break;
                      case 'COMMIT':
                        null === (n = d.current) ||
                          void 0 === n ||
                          n.init(b(r())),
                          (p.current = []);
                        break;
                      case 'JUMP_TO_ACTION':
                      case 'JUMP_TO_STATE':
                        (s.current = !0), l(r(e.payload.actionId - 1));
                        break;
                      case 'PAUSE_RECORDING':
                        c.current = !c.current;
                    }
                  }
                });
          return () => {
            var e;
            null == o ||
              null === (e = o.disconnect) ||
              void 0 === e ||
              e.call(o),
              null == n || n();
          };
        }, [o, l, e]),
          (0, n.useEffect)(() => {
            if (d.current) {
              if (d.current.shouldInit) {
                d.current.init(void 0), (d.current.shouldInit = !1);
                return;
              }
              s.current
                ? (s.current = !1)
                : c.current &&
                  (p.current.push(u),
                  d.current.send(
                    {
                      type: ''.concat(p.current.length),
                      updatedAt: new Date().toLocaleString(),
                    },
                    b(u)
                  ));
            }
          }, [u]);
      }
      var h = () => null;
    },
  },
]);
//# sourceMappingURL=5860.21d337b9b04437f6.js.map
