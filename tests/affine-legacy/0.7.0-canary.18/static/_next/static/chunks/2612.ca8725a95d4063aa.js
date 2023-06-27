(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2612],
  {
    32612: function (e, t, a) {
      'use strict';
      a.r(t),
        a.d(t, {
          CreateWorkspaceModal: function () {
            return Z;
          },
        });
      var n = a(52903),
        o = a(37565),
        i = a(5587),
        c = a(96893),
        r = a(72013),
        l = a(31921),
        s = a(752),
        d = a(2784),
        u = a(74090),
        p = a(87175);
      a(15873);
      var h = '_76jok73',
        k = '_76jok71',
        m = '_76jok72',
        w = '_76jok75';
      let f = new i.b('CreateWorkspaceModal'),
        v = e => {
          let { onConfirmName: t, onClose: a } = e,
            [i, c] = (0, d.useState)(''),
            l = (0, d.useRef)(!1),
            s = (0, d.useCallback)(() => {
              t(i);
            }, [t, i]),
            u = (0, d.useCallback)(
              e => {
                'Enter' === e.key && i && !l.current && s();
              },
              [s, i]
            ),
            p = (0, r.X)();
          return (0, n.BX)('div', {
            className: k,
            children: [
              (0, n.tZ)('div', {
                className: m,
                children: p['Name Your Workspace'](),
              }),
              (0, n.tZ)('p', { children: p['Workspace description']() }),
              (0, n.tZ)(o.II, {
                ref: e => {
                  e && setTimeout(() => e.focus(), 0);
                },
                'data-testid': 'create-workspace-input',
                onKeyDown: u,
                placeholder: p['Set a Workspace name'](),
                maxLength: 64,
                minLength: 0,
                onChange: c,
                onCompositionStart: () => {
                  l.current = !0;
                },
                onCompositionEnd: () => {
                  l.current = !1;
                },
              }),
              (0, n.BX)('div', {
                className: h,
                children: [
                  (0, n.tZ)(o.zx, {
                    'data-testid': 'create-workspace-close-button',
                    type: 'light',
                    onClick: a,
                    children: p.Cancel(),
                  }),
                  (0, n.tZ)(o.zx, {
                    'data-testid': 'create-workspace-create-button',
                    disabled: !i,
                    style: { opacity: i ? 1 : 0.5 },
                    type: 'primary',
                    onClick: s,
                    children: p.Create(),
                  }),
                ],
              }),
            ],
          });
        },
        C = () => {
          let [e, t] = (0, d.useState)('');
          return (
            (0, d.useEffect)(() => {
              var e;
              null === (e = window.apis) ||
                void 0 === e ||
                e.db
                  .getDefaultStorageLocation()
                  .then(e => {
                    t(e);
                  })
                  .catch(e => {
                    console.error(e);
                  });
            }, []),
            e
          );
        },
        y = e => {
          let { onConfirmLocation: t } = e,
            a = (0, r.X)(),
            i = C(),
            [c, s] = (0, d.useState)(!1),
            u = (0, d.useCallback)(() => {
              c ||
                (s(!0),
                (async function () {
                  var e;
                  let n = await (null === (e = window.apis) || void 0 === e
                    ? void 0
                    : e.dialog.selectDBFileLocation());
                  s(!1),
                    (null == n ? void 0 : n.filePath)
                      ? t(n.filePath)
                      : (null == n ? void 0 : n.error) &&
                        (0, o.Am)(a[n.error]());
                })().catch(e => {
                  f.error(e);
                }));
            }, [t, c, a]);
          return (0, n.BX)('div', {
            className: k,
            children: [
              (0, n.tZ)('div', {
                className: m,
                children: a['Set database location'](),
              }),
              (0, n.tZ)('p', {
                children: a['Workspace database storage description'](),
              }),
              (0, n.BX)('div', {
                className: h,
                children: [
                  (0, n.tZ)(o.zx, {
                    disabled: c,
                    'data-testid': 'create-workspace-customize-button',
                    type: 'light',
                    onClick: u,
                    children: a.Customize(),
                  }),
                  (0, n.tZ)(o.u, {
                    zIndex: 1e3,
                    content: a['Default db location hint']({ location: i }),
                    placement: 'top-start',
                    children: (0, n.tZ)(o.zx, {
                      'data-testid': 'create-workspace-default-location-button',
                      type: 'primary',
                      onClick: () => {
                        t();
                      },
                      icon: (0, n.tZ)(l.HelpIcon, {}),
                      iconPosition: 'end',
                      children: a['Default Location'](),
                    }),
                  }),
                ],
              }),
            ],
          });
        },
        b = e => {
          let { mode: t, onConfirmMode: a } = e,
            i = (0, r.X)(),
            [c, l] = (0, d.useState)(!1);
          return (0, n.BX)('div', {
            className: k,
            children: [
              (0, n.tZ)('div', {
                className: m,
                children:
                  i[
                    'new' === t ? 'Created Successfully' : 'Added Successfully'
                  ](),
              }),
              (0, n.BX)('div', {
                className: '_76jok74',
                children: [
                  (0, n.BX)('label', {
                    onClick: () => l(!1),
                    children: [
                      (0, n.tZ)('input', {
                        className: w,
                        type: 'radio',
                        readOnly: !0,
                        checked: !c,
                      }),
                      i['Use on current device only'](),
                    ],
                  }),
                  (0, n.BX)('label', {
                    onClick: () => l(!0),
                    children: [
                      (0, n.tZ)('input', {
                        className: w,
                        type: 'radio',
                        readOnly: !0,
                        checked: c,
                      }),
                      i['Sync across devices with AFFiNE Cloud'](),
                    ],
                  }),
                ],
              }),
              (0, n.tZ)('div', {
                className: h,
                children: (0, n.tZ)(o.zx, {
                  'data-testid': 'create-workspace-continue-button',
                  type: 'primary',
                  onClick: () => {
                    a(c);
                  },
                  children: i.Continue(),
                }),
              }),
            ],
          });
        },
        Z = e => {
          let { mode: t, onClose: a, onCreate: i } = e,
            { createLocalWorkspace: l, addLocalWorkspace: h } = (0, p.z)(),
            [k, m] = (0, d.useState)(),
            [w, C] = (0, d.useState)(),
            [Z, N] = (0, d.useState)(),
            [g, S] = (0, d.useState)(),
            B = (0, s.b9)(u.Qe),
            X = (0, r.X)();
          (0, d.useLayoutEffect)(() => {
            let e = !1;
            return (
              'add' === t
                ? (async () => {
                    if (!window.apis) return;
                    f.info('load db file'), m(void 0);
                    let t = await window.apis.dialog.loadDBFile();
                    t.workspaceId && !e
                      ? (C(t.workspaceId), m('set-syncing-mode'))
                      : (t.error || t.canceled) &&
                        (t.error && (0, o.Am)(X[t.error]()), a());
                  })().catch(e => {
                    console.error(e);
                  })
                : 'new' === t
                ? m(
                    environment.isDesktop ? 'set-db-location' : 'name-workspace'
                  )
                : m(void 0),
              () => {
                e = !0;
              }
            );
          }, [t, a, X]);
          let _ = (0, d.useCallback)(
              e => {
                (async function () {
                  if (!c.vc.enableLegacyCloud && e) B(!0);
                  else {
                    let e = w;
                    if (w && 'add' === t) await h(w);
                    else if ('new' === t && Z) {
                      if (((e = await l(Z)), g)) {
                        var a;
                        await (null === (a = window.apis) || void 0 === a
                          ? void 0
                          : a.dialog.moveDBFile(e, g));
                      }
                    } else {
                      f.error('invalid state');
                      return;
                    }
                    e && i(e);
                  }
                })().catch(e => {
                  f.error(e);
                });
              },
              [h, w, l, g, t, i, B, Z]
            ),
            z = (0, d.useCallback)(
              e => {
                N(e),
                  environment.isDesktop
                    ? m('set-syncing-mode')
                    : l(e)
                        .then(e => {
                          i(e);
                        })
                        .catch(e => {
                          f.error(e);
                        });
              },
              [l, i]
            ),
            D =
              'name-workspace' === k
                ? (0, n.tZ)(v, { onClose: a, onConfirmName: z })
                : null,
            x =
              'set-db-location' === k
                ? (0, n.tZ)(y, {
                    onConfirmLocation: e => {
                      S(e), m('name-workspace');
                    },
                  })
                : null,
            L =
              'set-syncing-mode' === k
                ? (0, n.tZ)(b, { mode: t, onConfirmMode: _ })
                : null;
          return (0, n.tZ)(o.u_, {
            open: !1 !== t && !!k,
            onClose: a,
            children: (0, n.BX)(o.AB, {
              width: 560,
              style: { padding: '10px' },
              children: [
                (0, n.tZ)('div', {
                  className: '_76jok70',
                  children: (0, n.tZ)(o.ol, { top: 6, right: 6, onClick: a }),
                }),
                D,
                x,
                L,
              ],
            }),
          });
        };
    },
    15873: function () {},
  },
]);
//# sourceMappingURL=2612.ca8725a95d4063aa.js.map
