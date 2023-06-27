'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2509],
  {
    12509: function (e, t, n) {
      n.r(t),
        n.d(t, {
          default: function () {
            return k;
          },
        });
      var r = n(52903);
      let l = () => {};
      var u = n(2784),
        i = n(17029),
        o = n(37565),
        a = n(29045),
        d = n(13246);
      let c = [
          { id: 'dismiss', label: 'Dismiss' },
          { id: 'bookmark', label: 'Create bookmark' },
        ],
        s = e => {
          var t, n;
          let { page: r, selectedOption: l, callback: u } = e;
          if ('dismiss' === l) return u();
          let i = (0, a.zE)(r),
            o = (0, a.gj)(i.models[0]),
            c =
              null == o
                ? void 0
                : o
                    .getDeltasByVRange({ index: i.startOffset, length: 0 })
                    .find(e => {
                      var t, n;
                      return null === (t = e[0]) || void 0 === t
                        ? void 0
                        : null === (n = t.attributes) || void 0 === n
                        ? void 0
                        : n.link;
                    });
          if (!c) return;
          let [, { index: s, length: f }] = c,
            v =
              null === (t = c[0]) || void 0 === t
                ? void 0
                : null === (n = t.attributes) || void 0 === n
                ? void 0
                : n.link,
            k = i.models[0],
            m = r.getParent(k);
          (0, d.kP)(m);
          let p = m.children.indexOf(k);
          return (
            r.addBlock('affine:bookmark', { url: v }, m, p + 1),
            null == o || o.deleteText({ index: s, length: f }),
            k.isEmpty() && r.deleteBlock(k),
            u()
          );
        },
        f = e => {
          var t;
          if (!e.length || e.length > 1) return;
          let [n] = e;
          if (n.text && n.text.length && !(n.text.length > 1))
            return !!(null === (t = n.text[0].attributes) || void 0 === t
              ? void 0
              : t.link);
        },
        v = e => {
          let { page: t } = e,
            [n, l] = (0, u.useState)(null),
            [i, d] = (0, u.useState)(c[0].id),
            v = (0, u.useMemo)(
              () => ({
                ArrowUp: () => {
                  let e = c.findIndex(e => {
                    let { id: t } = e;
                    return t === i;
                  });
                  c[e - 1]
                    ? d(c[e - 1].id)
                    : -1 === e
                    ? d(c[0].id)
                    : d(c[c.length - 1].id);
                },
                ArrowDown: () => {
                  let e = c.findIndex(e => {
                    let { id: t } = e;
                    return t === i;
                  });
                  -1 !== e && c[e + 1] ? d(c[e + 1].id) : d(c[0].id);
                },
                Enter: () =>
                  s({
                    page: t,
                    selectedOption: i,
                    callback: () => {
                      l(null);
                    },
                  }),
                Escape: () => {
                  l(null);
                },
              }),
              [t, i]
            ),
            k = (0, u.useCallback)(
              e => {
                let n = v[e.key];
                n
                  ? (e.stopPropagation(), e.preventDefault(), n(e, t))
                  : l(null);
              },
              [t, v]
            );
          return (
            (0, u.useEffect)(() => {
              let e = t.slots.pasted.on(e => {
                f(e) &&
                  setTimeout(() => {
                    l((0, a.bR)());
                  }, 100);
              });
              return () => {
                e.dispose();
              };
            }, [k, t, v]),
            (0, u.useEffect)(
              () => (
                n
                  ? document.addEventListener('keydown', k, { capture: !0 })
                  : (d(c[0].id),
                    document.removeEventListener('keydown', k, {
                      capture: !0,
                    })),
                () => {
                  document.removeEventListener('keydown', k, { capture: !0 });
                }
              ),
              [n, k]
            ),
            n
              ? (0, r.tZ)(o.$Q, {
                  onClickAway: () => {
                    l(null), d('');
                  },
                  children: (0, r.tZ)('div', {
                    children: (0, r.tZ)(o.gb, {
                      open: !!n,
                      anchorEl: n,
                      placement: 'bottom-start',
                      children: c.map(e => {
                        let { id: n, label: u } = e;
                        return (0, r.tZ)(
                          o.sN,
                          {
                            active: i === n,
                            onClick: () => {
                              s({
                                page: t,
                                selectedOption: n,
                                callback: () => {
                                  l(null);
                                },
                              });
                            },
                            disableHover: !0,
                            onMouseEnter: () => {
                              d(n);
                            },
                            children: u,
                          },
                          n
                        );
                      }),
                    }),
                  }),
                })
              : null
          );
        };
      var k = {
        uiDecorator: e => {
          if (
            !(
              e.parentElement &&
              e.page.awarenessStore.getFlag('enable_bookmark_operation')
            )
          )
            return l;
          {
            let t = document.createElement('div');
            e.parentElement.appendChild(t);
            let n = (0, i.createRoot)(t);
            return (
              n.render(
                (0, r.tZ)(u.StrictMode, {
                  children: (0, r.tZ)(v, { page: e.page }),
                })
              ),
              () => {
                n.unmount(), t.remove();
              }
            );
          }
        },
      };
    },
    29045: function (e, t, n) {
      n.d(t, {
        E9: function () {
          return r.E9;
        },
        FV: function () {
          return r.FV;
        },
        UL: function () {
          return r.UL;
        },
        YK: function () {
          return r.YK;
        },
        a6: function () {
          return r.a6;
        },
        bR: function () {
          return r.bR;
        },
        cS: function () {
          return r.cS;
        },
        ev: function () {
          return r.ev;
        },
        gj: function () {
          return r.gj;
        },
        lK: function () {
          return r.lK;
        },
        uZ: function () {
          return r.uZ;
        },
        xT: function () {
          return r.xT;
        },
        zE: function () {
          return r.zE;
        },
      });
      var r = n(65024);
    },
  },
]);
//# sourceMappingURL=2509.70ab252d45c2db3f.js.map
