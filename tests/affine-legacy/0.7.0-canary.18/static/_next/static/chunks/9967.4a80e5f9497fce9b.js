(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [9967],
  {
    9532: function (e, t, i) {
      'use strict';
      i.d(t, {
        $: function () {
          return v;
        },
        z: function () {
          return g;
        },
      });
      var r = i(52903),
        o = i(37565),
        n = i(96893),
        a = i(72013),
        d = i(31921),
        l = i(752),
        c = i(2784),
        p = i(74090),
        s = i(53137);
      (0, o.zo)('div')(() => ({
        width: '1px',
        height: '20px',
        background: 'var(--affine-border-color)',
        marginRight: '24px',
      })),
        (0, o.zo)('div')(() => ({
          marginLeft: '15px',
          width: '202px',
          p: {
            height: '20px',
            fontSize: 'var(--affine-font-sm)',
            ...(0, o.j2)('flex-start', 'center'),
          },
          svg: { marginRight: '10px', fontSize: '16px', flexShrink: 0 },
          span: { flexGrow: 1, ...(0, o.vS)(1) },
        })),
        (0, o.zo)('div')(() => ({
          fontSize: 'var(--affine-font-base)',
          fontWeight: 600,
          lineHeight: '24px',
          marginBottom: '10px',
          maxWidth: '200px',
          ...(0, o.vS)(1),
        }));
      let f = (0, o.zo)('div')({
          height: '84px',
          padding: '0 40px',
          flexShrink: 0,
          ...(0, o.j2)('space-between', 'center'),
        }),
        h = (0, o.zo)('div')(() => ({
          textAlign: 'left',
          marginLeft: '16px',
          flex: 1,
          p: { lineHeight: '24px', color: 'var(--affine-icon-color)' },
          'p:first-of-type': {
            color: 'var(--affine-text-primary-color)',
            fontWeight: 600,
          },
        }));
      (0, o.zo)('div')(() => ({ ...(0, o.j2)('flex-start', 'center') })),
        (0, o.zo)('div')(() => ({
          fontWeight: 600,
          fontSize: 'var(--affine-font-h6)',
        })),
        (0, o.zo)('div')(() => ({
          color: 'var(--affine-icon-color)',
          marginLeft: '15px',
          fontWeight: 400,
          fontSize: 'var(--affine-font-h6)',
          ...(0, o.j2)('center', 'center'),
        })),
        (0, o.zo)('div')({
          height: '534px',
          padding: '8px 40px',
          marginTop: '72px',
          overflow: 'auto',
          ...(0, o.j2)('space-between', 'flex-start', 'flex-start'),
          flexWrap: 'wrap',
        }),
        (0, o.zo)('div')(() => ({ ...(0, o.j2)('flex-end', 'center') })),
        (0, o.zo)('div')(() => ({
          width: '58px',
          height: '58px',
          borderRadius: '100%',
          background: '#f4f5fa',
          border: '1.5px dashed #f4f5fa',
          transition: 'background .2s',
          ...(0, o.j2)('center', 'center'),
        })),
        (0, o.zo)('div')(() => ({
          width: '100%',
          height: '72px',
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: '24px 24px 0 0',
          padding: '0 40px',
          ...(0, o.j2)('space-between', 'center'),
        }));
      let x = (0, o.zo)(o.zx)(() => ({
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
            ...(0, o.Qj)('center', 'center'),
          },
        })),
        v = e => {
          let { user: t, onLogin: i, onLogout: c } = e,
            s = (0, a.X)(),
            v = (0, l.b9)(p.Qe);
          return (0, r.BX)(f, {
            'data-testid': 'workspace-list-modal-footer',
            children: [
              t &&
                (0, r.BX)(r.HY, {
                  children: [
                    (0, r.BX)(o.A0, {
                      children: [
                        (0, r.tZ)(g, {
                          size: 40,
                          name: t.name,
                          avatar: t.avatar_url,
                        }),
                        (0, r.BX)(h, {
                          children: [
                            (0, r.tZ)('p', { children: t.name }),
                            (0, r.tZ)('p', { children: t.email }),
                          ],
                        }),
                      ],
                    }),
                    (0, r.tZ)(o.u, {
                      content: s['Sign out'](),
                      disablePortal: !0,
                      children: (0, r.tZ)(o.hU, {
                        'data-testid': 'workspace-list-modal-sign-out',
                        onClick: () => {
                          c();
                        },
                        children: (0, r.tZ)(d.SignOutIcon, {}),
                      }),
                    }),
                  ],
                }),
              !t &&
                (0, r.tZ)(x, {
                  'data-testid': 'sign-in-button',
                  noBorder: !0,
                  bold: !0,
                  icon: (0, r.tZ)('div', {
                    className: 'circle',
                    children: (0, r.tZ)(d.CloudWorkspaceIcon, {}),
                  }),
                  onClick: async () => {
                    n.vc.enableLegacyCloud ? i() : v(!0);
                  },
                  children: s['Sign in'](),
                }),
            ],
          });
        },
        g = (0, c.forwardRef)(function (e, t) {
          let i = e.size || 20,
            o = i + 'px';
          return (0,
          r.tZ)(r.HY, { children: e.avatar ? (0, r.tZ)('div', { style: { ...e.style, width: o, height: o, color: '#fff', borderRadius: '50%', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (0, r.tZ)('picture', { children: (0, r.tZ)('img', { style: { width: o, height: o }, src: e.avatar, alt: '', referrerPolicy: 'no-referrer' }) }) }) : (0, r.tZ)('div', { style: { ...e.style, width: o, height: o, border: '1px solid #fff', color: '#fff', fontSize: Math.ceil(0.5 * i) + 'px', background: (0, s.W)(e.name || 'AFFiNE'), borderRadius: '50%', textAlign: 'center', lineHeight: i + 'px', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (e.name || 'AFFiNE').substring(0, 1) }) });
        });
    },
    29967: function (e, t, i) {
      'use strict';
      i.r(t),
        i.d(t, {
          WorkspaceListModal: function () {
            return J;
          },
        });
      var r = i(52903),
        o = i(37565),
        n = i(28165),
        a = i(23094),
        d = i(66548),
        l = i(91337),
        c = i(49889),
        p = i(72013),
        s = i(31921),
        f = i(78365),
        h = i(2784),
        x = i(5329),
        v = i(45997),
        g = i(43034);
      let u = (0, v.zo)('div')(() => ({
          marginLeft: '15px',
          width: '202px',
          p: {
            height: '20px',
            fontSize: 'var(--affine-font-sm)',
            ...(0, v.j2)('flex-start', 'center'),
          },
          svg: { marginRight: '10px', fontSize: '16px', flexShrink: 0 },
          span: { flexGrow: 1, ...(0, v.vS)(1) },
        })),
        b = (0, v.zo)('div')(() => ({
          fontSize: 'var(--affine-font-base)',
          fontWeight: 600,
          lineHeight: '24px',
          marginBottom: '10px',
          maxWidth: '200px',
          ...(0, v.vS)(1),
        })),
        m = (0, v.zo)('div')(e => {
          let { active: t } = e;
          return {
            width: '310px',
            height: '124px',
            cursor: 'pointer',
            padding: '16px',
            boxShadow: 'var(--affine-shadow-1)',
            borderRadius: '12px',
            border: '1px solid '.concat(
              t ? 'var(--affine-primary-color)' : 'transparent'
            ),
            ...(0, v.j2)('flex-start', 'flex-start'),
            marginBottom: '24px',
            transition: 'background .2s',
            background: 'var(--affine-white-80)',
            position: 'relative',
            ':hover': {
              background: 'var(--affine-hover-color)',
              '.add-icon': {
                borderColor: 'var(--affine-primary-color)',
                color: 'var(--affine-primary-color)',
              },
              '.setting-entry': { opacity: 1, pointerEvents: 'auto' },
            },
            '@media (max-width: 720px)': { width: '100%' },
          };
        });
      (0, v.zo)('div')(() => ({
        width: '100%',
        height: '72px',
        position: 'absolute',
        left: 0,
        top: 0,
        borderRadius: '24px 24px 0 0',
        padding: '0 40px',
        ...(0, v.j2)('space-between', 'center'),
      }));
      let k = (0, v.zo)(g.h)(() => ({
          position: 'absolute',
          right: '6px',
          bottom: '6px',
          opacity: 0,
          borderRadius: '4px',
          color: 'var(--affine-primary-color)',
          pointerEvents: 'none',
          transition: 'all .15s',
          ':hover': { background: 'var(--affine-hover-color)' },
        })),
        w = () =>
          (0, r.tZ)(s.CollaborationIcon, { style: { color: '#FF646B' } }),
        Z = () =>
          (0, r.tZ)(s.LocalWorkspaceIcon, { style: { color: '#FDBD32' } }),
        z = () =>
          (0, r.tZ)(s.CloudWorkspaceIcon, { style: { color: '#60A5FA' } }),
        y = () => (0, r.tZ)(s.LocalDataIcon, { style: { color: '#62CD80' } }),
        S = () => (0, r.tZ)(s.PublishIcon, { style: { color: '#8699FF' } }),
        C = e => {
          let { workspace: t } = e,
            i = (0, p.X)(),
            o = !0;
          return (t.flavour === l.b8.AFFINE
            ? (o = t.permission === c.vH.Owner)
            : t.flavour === l.b8.LOCAL && (o = !0),
          t.flavour === l.b8.LOCAL)
            ? (0, r.BX)('p', {
                title: i['Local Workspace'](),
                children: [
                  (0, r.tZ)(Z, {}),
                  (0, r.tZ)('span', { children: i['Local Workspace']() }),
                ],
              })
            : o
            ? (0, r.BX)('p', {
                title: i['Cloud Workspace'](),
                children: [
                  (0, r.tZ)(z, {}),
                  (0, r.tZ)('span', { children: i['Cloud Workspace']() }),
                ],
              })
            : (0, r.BX)('p', {
                title: i['Joined Workspace'](),
                children: [
                  (0, r.tZ)(w, {}),
                  (0, r.tZ)('span', { children: i['Joined Workspace']() }),
                ],
              });
        },
        W = e => {
          let {
              workspace: t,
              onClick: i,
              onSettingClick: o,
              currentWorkspaceId: n,
            } = e,
            a = (0, p.X)(),
            [d] = (0, f.H)(t.blockSuiteWorkspace);
          return (0, r.BX)(m, {
            'data-testid': 'workspace-card',
            onClick: (0, h.useCallback)(() => {
              i(t);
            }, [i, t]),
            active: t.id === n,
            children: [
              (0, r.tZ)(x.z, { size: 58, workspace: t }),
              (0, r.BX)(u, {
                children: [
                  (0, r.tZ)(b, { children: d }),
                  (0, r.tZ)(C, { workspace: t }),
                  t.flavour === l.b8.LOCAL &&
                    (0, r.BX)('p', {
                      title: a['Available Offline'](),
                      children: [
                        (0, r.tZ)(y, {}),
                        (0, r.tZ)('span', {
                          children: a['Available Offline'](),
                        }),
                      ],
                    }),
                  t.flavour === l.b8.AFFINE &&
                    t.public &&
                    (0, r.BX)('p', {
                      title: a['Published to Web'](),
                      children: [
                        (0, r.tZ)(S, {}),
                        (0, r.tZ)('span', {
                          children: a['Published to Web'](),
                        }),
                      ],
                    }),
                ],
              }),
              (0, r.tZ)(k, {
                className: 'setting-entry',
                onClick: e => {
                  e.stopPropagation(), o(t);
                },
                children: (0, r.tZ)(s.SettingsIcon, {}),
              }),
            ],
          });
        };
      i(85012);
      let B = e => {
          let {
              setNodeRef: t,
              attributes: i,
              listeners: o,
              transform: n,
            } = (0, d.nB)({ id: e.item.id }),
            a = {
              transform: n
                ? 'translate3d('.concat(n.x, 'px, ').concat(n.y, 'px, 0)')
                : void 0,
              pointerEvents: e.disabled ? 'none' : void 0,
              opacity: e.disabled ? 0.6 : void 0,
            };
          return (0, r.tZ)('div', {
            className: '_1v5s20r0',
            'data-testid': 'draggable-item',
            style: a,
            ref: t,
            ...i,
            ...o,
            children: (0, r.tZ)(W, {
              currentWorkspaceId: e.currentWorkspaceId,
              workspace: e.item,
              onClick: e.onClick,
              onSettingClick: e.onSettingClick,
            }),
          });
        },
        X = e => {
          let t = (0, a.Dy)(
            (0, a.VT)(a.we, { activationConstraint: { distance: 8 } })
          );
          return (0, r.tZ)(a.LB, {
            sensors: t,
            onDragEnd: e.onDragEnd,
            children: (0, r.tZ)(d.Fo, {
              items: e.items,
              children: e.items.map(t =>
                (0, n.az)(B, { ...e, item: t, key: t.id })
              ),
            }),
          });
        };
      var I = i(9532);
      (0, o.zo)('div')(() => ({
        width: '1px',
        height: '20px',
        background: 'var(--affine-border-color)',
        marginRight: '12px',
      }));
      let L = (0, o.zo)('div')(() => ({
          marginLeft: '15px',
          width: '202px',
          p: {
            height: '20px',
            fontSize: 'var(--affine-font-sm)',
            ...(0, o.j2)('flex-start', 'center'),
          },
          svg: { marginRight: '10px', fontSize: '16px', flexShrink: 0 },
          span: { flexGrow: 1, ...(0, o.vS)(1) },
        })),
        j = (0, o.zo)('div')(() => ({
          fontSize: 'var(--affine-font-base)',
          fontWeight: 600,
          lineHeight: '24px',
          marginBottom: '10px',
          maxWidth: '200px',
          ...(0, o.vS)(1),
        })),
        R = (0, o.zo)('div')(() => ({
          width: '310px',
          height: '124px',
          cursor: 'pointer',
          padding: '16px',
          boxShadow: 'var(--affine-shadow-1)',
          borderRadius: '12px',
          transition: 'all .1s',
          background: 'var(--affine-white-80)',
          ...(0, o.j2)('flex-start', 'flex-start'),
          color: 'var(--affine-text-secondary-color)',
          ':hover': {
            background: 'var(--affine-hover-color)',
            color: 'var(--affine-text-primary-color)',
            '.add-icon': {
              borderColor: 'var(--affine-white)',
              color: 'var(--affine-primary-color)',
            },
          },
          '@media (max-width: 720px)': { width: '100%' },
        })),
        A = (0, o.zo)('div')(() => ({
          padding: '12px',
          borderRadius: '10px',
          display: 'flex',
          margin: '-8px -4px',
          flexFlow: 'column',
          gap: '12px',
          background: 'var(--affine-background-overlay-panel-color)',
        })),
        F = (0, o.zo)('div')(() => ({
          borderRadius: '5px',
          display: 'flex',
          boxShadow: '0px 0px 6px 0px rgba(0, 0, 0, 0.1)',
          background: 'var(--affine-background-primary-color)',
        })),
        N = (0, o.zo)('div')(() => ({
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          justifyContent: 'space-between',
        })),
        D = (0, o.zo)('div')(() => ({
          fontSize: '20px',
          width: '1em',
          height: '1em',
        })),
        E = (0, o.zo)('div')(() => ({
          fontSize: '12px',
          color: 'var(--affine-text-secondary-color)',
        })),
        H = (0, o.zo)('div')(() => ({ ...(0, o.j2)('flex-start', 'center') })),
        P = (0, o.zo)('div')(() => ({
          fontWeight: 600,
          fontSize: 'var(--affine-font-h6)',
        })),
        O = (0, o.zo)('div')(() => ({
          color: 'var(--affine-icon-color)',
          marginLeft: '15px',
          fontWeight: 400,
          fontSize: 'var(--affine-font-h6)',
          ...(0, o.j2)('center', 'center'),
        })),
        _ = (0, o.zo)('div')({
          height: '534px',
          padding: '8px 40px',
          marginTop: '72px',
          overflow: 'auto',
          ...(0, o.j2)('space-between', 'flex-start', 'flex-start'),
          flexWrap: 'wrap',
        }),
        G = (0, o.zo)('div')(() => ({ ...(0, o.j2)('flex-end', 'center') })),
        M = (0, o.zo)('div')(() => ({
          width: '58px',
          height: '58px',
          borderRadius: '100%',
          background: 'var(--affine-white-80)',
          border: '1.5px dashed #f4f5fa',
          transition: 'background .2s',
          fontSize: '24px',
          ...(0, o.j2)('center', 'center'),
          borderColor: 'var(--affine-white)',
          color: 'var(--affine-primary-color)',
        })),
        T = (0, o.zo)('div')(() => ({
          width: '100%',
          height: '72px',
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: '24px 24px 0 0',
          padding: '0 40px',
          ...(0, o.j2)('space-between', 'center'),
        })),
        J = e => {
          let {
              disabled: t,
              open: i,
              onClose: n,
              workspaces: a,
              user: d,
              onClickLogin: c,
              onClickLogout: f,
              onClickWorkspace: x,
              onClickWorkspaceSetting: v,
              onNewWorkspace: g,
              onAddWorkspace: u,
              currentWorkspaceId: b,
              onMoveWorkspace: m,
            } = e,
            k = (0, p.X)(),
            w = (0, h.useRef)(null);
          return (0, r.tZ)(o.u_, {
            open: i,
            onClose: n,
            children: (0, r.BX)(o.AB, {
              width: 720,
              height: 690,
              style: { display: 'flex', flexDirection: 'column' },
              children: [
                (0, r.BX)(T, {
                  children: [
                    (0, r.BX)(H, {
                      children: [
                        (0, r.tZ)(P, { children: k['My Workspaces']() }),
                        (0, r.tZ)(o.u, {
                          content: k['Workspace description'](),
                          placement: 'top-start',
                          disablePortal: !0,
                          children: (0, r.tZ)(O, {
                            children: (0, r.tZ)(s.HelpIcon, {}),
                          }),
                        }),
                      ],
                    }),
                    (0, r.tZ)(G, {
                      children: (0, r.tZ)(o.ol, {
                        'data-testid': 'close-workspace-modal',
                        onClick: () => {
                          n();
                        },
                        absolute: !1,
                      }),
                    }),
                  ],
                }),
                (0, r.BX)(_, {
                  children: [
                    (0, r.tZ)(X, {
                      disabled: t,
                      items: a.filter(e => {
                        let { flavour: t } = e;
                        return t !== l.b8.PUBLIC;
                      }),
                      currentWorkspaceId: b,
                      onClick: x,
                      onSettingClick: v,
                      onDragEnd: (0, h.useCallback)(
                        e => {
                          let { active: t, over: i } = e;
                          t.id !== (null == i ? void 0 : i.id) &&
                            m(t.id, null == i ? void 0 : i.id);
                        },
                        [m]
                      ),
                    }),
                    !environment.isDesktop &&
                      (0, r.BX)(R, {
                        onClick: g,
                        'data-testid': 'new-workspace',
                        children: [
                          (0, r.tZ)(M, {
                            className: 'add-icon',
                            children: (0, r.tZ)(s.PlusIcon, {}),
                          }),
                          (0, r.BX)(L, {
                            children: [
                              (0, r.tZ)(j, { children: k['New Workspace']() }),
                              (0, r.tZ)('p', {
                                children: k['Create Or Import'](),
                              }),
                            ],
                          }),
                        ],
                      }),
                    environment.isDesktop &&
                      (0, r.tZ)(o.v2, {
                        placement: 'auto',
                        trigger: ['click'],
                        zIndex: 1e3,
                        content: (0, r.BX)(A, {
                          children: [
                            (0, r.tZ)(F, {
                              children: (0, r.tZ)(o.sN, {
                                style: { height: 'auto', padding: '8px 12px' },
                                onClick: g,
                                'data-testid': 'new-workspace',
                                children: (0, r.BX)(N, {
                                  children: [
                                    (0, r.BX)('div', {
                                      children: [
                                        (0, r.tZ)('p', {
                                          children: k['New Workspace'](),
                                        }),
                                        (0, r.tZ)(E, {
                                          children: (0, r.tZ)('p', {
                                            children:
                                              k['Create your own workspace'](),
                                          }),
                                        }),
                                      ],
                                    }),
                                    (0, r.tZ)(D, {
                                      children: (0, r.tZ)(s.PlusIcon, {}),
                                    }),
                                  ],
                                }),
                              }),
                            }),
                            (0, r.tZ)(F, {
                              children: (0, r.tZ)(o.sN, {
                                disabled: !environment.isDesktop,
                                onClick: u,
                                'data-testid': 'add-workspace',
                                style: { height: 'auto', padding: '8px 12px' },
                                children: (0, r.BX)(N, {
                                  children: [
                                    (0, r.BX)('div', {
                                      children: [
                                        (0, r.tZ)('p', {
                                          children: k['Add Workspace'](),
                                        }),
                                        (0, r.tZ)(E, {
                                          children: (0, r.tZ)('p', {
                                            children: k['Add Workspace Hint'](),
                                          }),
                                        }),
                                      ],
                                    }),
                                    (0, r.tZ)(D, {
                                      children: (0, r.tZ)(s.ImportIcon, {}),
                                    }),
                                  ],
                                }),
                              }),
                            }),
                          ],
                        }),
                        children: (0, r.BX)(R, {
                          ref: w,
                          'data-testid': 'add-or-new-workspace',
                          children: [
                            (0, r.tZ)(M, {
                              className: 'add-icon',
                              children: (0, r.tZ)(s.PlusIcon, {}),
                            }),
                            (0, r.BX)(L, {
                              children: [
                                (0, r.tZ)(j, {
                                  children: k['New Workspace'](),
                                }),
                                (0, r.tZ)('p', {
                                  children: k['Create Or Import'](),
                                }),
                              ],
                            }),
                          ],
                        }),
                      }),
                  ],
                }),
                (0, r.tZ)(I.$, { user: d, onLogin: c, onLogout: f }),
              ],
            }),
          });
        };
    },
    85012: function () {},
  },
]);
//# sourceMappingURL=9967.4a80e5f9497fce9b.js.map
