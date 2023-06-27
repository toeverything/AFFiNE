(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [939, 2883],
  {
    2883: function (e, t, i) {
      'use strict';
      i.r(t),
        i.d(t, {
          TmpDisableAffineCloudModal: function () {
            return m;
          },
        });
      var n = i(52903),
        a = i(37565),
        r = i(44502),
        l = i(72013),
        o = i(31921);
      let c = (0, a.zo)('div')({
          height: '44px',
          display: 'flex',
          flexDirection: 'row-reverse',
          paddingRight: '10px',
          paddingTop: '10px',
          flexShrink: 0,
        }),
        d = (0, a.zo)('div')({ padding: '0 40px' }),
        s = (0, a.zo)('h1')(() => ({
          fontSize: 'var(--affine-font-h6)',
          lineHeight: '28px',
          fontWeight: 600,
        })),
        p = (0, a.zo)('div')(() => ({
          userSelect: 'none',
          margin: '20px 0',
          a: { color: 'var(--affine-primary-color)' },
        })),
        h = (0, a.zo)(a.zx)(() => ({
          textAlign: 'center',
          margin: '20px 0',
          borderRadius: '8px',
          backgroundColor: 'var(--affine-primary-color)',
          span: { margin: '0' },
        })),
        u = (0, a.zo)('div')(() => ({
          width: '100%',
          ...(0, a.j2)('flex-end', 'center'),
        })),
        f = (0, a.zo)('div')(() => ({ width: '100%' })),
        m = e => {
          let { open: t, onClose: i } = e,
            m = (0, l.X)();
          return (0, n.tZ)(a.u_, {
            'data-testid': 'disable-affine-cloud-modal',
            open: t,
            onClose: i,
            children: (0, n.BX)(a.AB, {
              width: 480,
              children: [
                (0, n.tZ)(c, {
                  children: (0, n.tZ)(a.hU, {
                    onClick: i,
                    children: (0, n.tZ)(o.CloseIcon, {}),
                  }),
                }),
                (0, n.BX)(d, {
                  children: [
                    (0, n.tZ)(s, {
                      children: m['com.affine.cloudTempDisable.title'](),
                    }),
                    (0, n.tZ)(p, {
                      children: (0, n.BX)(r.cC, {
                        i18nKey: 'com.affine.cloudTempDisable.description',
                        children: [
                          'We are upgrading the AFFiNE Cloud service and it is temporarily unavailable on the client side. If you wish to stay updated on the progress and be notified on availability, you can fill out the',
                          (0, n.tZ)('a', {
                            href: 'https://6dxre9ihosp.typeform.com/to/B8IHwuyy',
                            target: '_blank',
                            style: { color: 'var(--affine-link-color)' },
                            children: 'AFFiNE Cloud Signup',
                          }),
                          '.',
                        ],
                      }),
                    }),
                    (0, n.tZ)(f, {
                      children: (0, n.tZ)(a.HY, {
                        containerStyle: { width: '200px', height: '112px' },
                      }),
                    }),
                    (0, n.tZ)(u, {
                      children: (0, n.tZ)(h, {
                        shape: 'round',
                        type: 'primary',
                        onClick: i,
                        children: m['Got it'](),
                      }),
                    }),
                  ],
                }),
              ],
            }),
          });
        };
    },
    53113: function (e, t, i) {
      'use strict';
      i.d(t, {
        A: function () {
          return u;
        },
      });
      var n = i(52903),
        a = i(37565),
        r = i(72013),
        l = i(31921),
        o = i(76641);
      let c = (0, a.zo)('div')({
          height: '44px',
          display: 'flex',
          flexDirection: 'row-reverse',
          paddingRight: '10px',
          paddingTop: '10px',
          flexShrink: 0,
        }),
        d = (0, a.zo)('div')({ textAlign: 'center' }),
        s = (0, a.zo)('h1')({
          fontSize: '20px',
          lineHeight: '28px',
          fontWeight: 600,
          textAlign: 'center',
        }),
        p = (0, a.zo)('div')(() => ({
          userSelect: 'none',
          width: '400px',
          margin: 'auto',
          marginBottom: '32px',
          marginTop: '12px',
        })),
        h = (0, a.zo)(a.zx)(() => ({
          width: '284px',
          display: 'block',
          margin: 'auto',
          marginTop: '16px',
        })),
        u = e => {
          let { open: t, onClose: i, onConform: u } = e,
            f = (0, r.X)(),
            m = (0, o.x)();
          return (0, n.tZ)(a.u_, {
            open: t,
            onClose: i,
            'data-testid': 'enable-affine-cloud-modal',
            children: (0, n.BX)(a.AB, {
              width: 560,
              height: 292,
              children: [
                (0, n.tZ)(c, {
                  children: (0, n.tZ)(a.hU, {
                    onClick: i,
                    children: (0, n.tZ)(l.CloseIcon, {}),
                  }),
                }),
                (0, n.BX)(d, {
                  children: [
                    (0, n.BX)(s, {
                      children: [f['Enable AFFiNE Cloud'](), '?'],
                    }),
                    (0, n.tZ)(p, {
                      children: f['Enable AFFiNE Cloud Description'](),
                    }),
                    (0, n.BX)('div', {
                      children: [
                        (0, n.tZ)(h, {
                          'data-testid': 'confirm-enable-cloud-button',
                          shape: 'round',
                          type: 'primary',
                          onClick: u,
                          children: m ? f.Enable() : f['Sign in and Enable'](),
                        }),
                        (0, n.tZ)(h, {
                          shape: 'round',
                          onClick: () => {
                            i();
                          },
                          children: f['Not now'](),
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          });
        };
    },
    10939: function (e, t, i) {
      'use strict';
      i.r(t),
        i.d(t, {
          WorkspaceSettingDetail: function () {
            return e3;
          },
        });
      var n = i(52903),
        a = i(28165),
        r = i(91337),
        l = i(72013),
        o = i(2784),
        c = i(3255),
        d = i(75489),
        s = i(49889);
      function p(e) {
        return (
          e.flavour === r.b8.LOCAL ||
          (e.flavour !== r.b8.PUBLIC && e.permission === s.vH.Owner)
        );
      }
      i(11173);
      var h = {
          disabled: '_101css44 _101css43',
          enabled: '_101css45 _101css43',
        },
        u = '_101css4e',
        f = '_101css4d',
        m = '_101css4a',
        v = '_101css4b',
        g = '_101css4k',
        x = '_101css4l',
        b = '_101css4j',
        C = '_101css4i',
        w = { active: '_101css47 _101css46', inactive: '_101css48 _101css46' },
        Z = i(37565),
        k = i(96893),
        y = i(57670),
        z = i(31921),
        B = i(78981);
      function S(e) {
        let { data: t, mutate: i } = (0, c.ZP)([d.S.getMembers, e], {
            fallbackData: [],
          }),
          n = (0, o.useCallback)(
            async t => (await B._.inviteMember({ id: e, email: t }), i()),
            [i, e]
          ),
          a = (0, o.useCallback)(
            async e => (await B._.removeMember({ permissionId: e }), i()),
            [i]
          );
        return {
          members: null != t ? t : [],
          inviteMember: n,
          removeMember: a,
        };
      }
      var A = i(53137),
        F = i(2883),
        N = i(53113);
      let X = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(gmail|example)\.(com|org)$/,
        E = e => {
          var t;
          let { workspaceId: i, queryEmail: a } = e,
            r = (function (e, t) {
              let { data: i } = (0, c.ZP)([d.S.getUserByEmail, e, t], {
                fallbackData: null,
              });
              return null != i ? i : null;
            })(i, a),
            l =
              null !== (t = null == r ? void 0 : r.at(0)) && void 0 !== t
                ? t
                : null;
          return l && l.email
            ? (0, n.tZ)(R, {
                children: (0, n.BX)(M, {
                  children: [
                    l.avatar_url
                      ? (0, n.tZ)(Z.Te, { src: l.avatar_url })
                      : (0, n.tZ)(j, { children: (0, n.tZ)(z.EmailIcon, {}) }),
                    (0, n.tZ)(T, { children: l.email }),
                  ],
                }),
              })
            : null;
        },
        _ = e => {
          let { open: t, onClose: i, onInviteSuccess: a, workspaceId: r } = e,
            { inviteMember: c } = S(r),
            [d, s] = (0, o.useState)(''),
            [p, h] = (0, o.useState)(!1),
            u = (0, l.X)(),
            f = (0, o.useCallback)(e => {
              s(e);
            }, []);
          return (0, n.tZ)('div', {
            children: (0, n.tZ)(Z.u_, {
              open: t,
              onClose: i,
              children: (0, n.BX)(Z.AB, {
                width: 460,
                height: 236,
                children: [
                  (0, n.tZ)(W, {
                    children: (0, n.tZ)(Z.ol, {
                      onClick: () => {
                        i(), s('');
                      },
                    }),
                  }),
                  (0, n.BX)(I, {
                    children: [
                      (0, n.tZ)(D, { children: u['Invite Members']() }),
                      (0, n.BX)(L, {
                        children: [
                          (0, n.tZ)(Z.II, {
                            'data-testid': 'invite-member-input',
                            width: 360,
                            value: d,
                            onChange: f,
                            onFocus: (0, o.useCallback)(() => {
                              h(!0);
                            }, []),
                            onBlur: (0, o.useCallback)(() => {
                              h(!1);
                            }, []),
                            placeholder: u['Invite placeholder'](),
                          }),
                          p &&
                            X.test(d) &&
                            (0, n.tZ)(o.Suspense, {
                              fallback: 'loading...',
                              children: (0, n.tZ)(E, {
                                workspaceId: r,
                                queryEmail: d,
                              }),
                            }),
                        ],
                      }),
                    ],
                  }),
                  (0, n.tZ)(H, {
                    children: (0, n.tZ)(Z.zx, {
                      'data-testid': 'invite-member-button',
                      disabled: !X.test(d),
                      shape: 'circle',
                      type: 'primary',
                      style: {
                        width: '364px',
                        height: '38px',
                        borderRadius: '40px',
                      },
                      onClick: async () => {
                        await c(d), s(''), a();
                      },
                      children: u.Invite(),
                    }),
                  }),
                ],
              }),
            }),
          });
        },
        W = (0, Z.zo)('div')({ position: 'relative', height: '44px' }),
        I = (0, Z.zo)('div')({
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }),
        D = (0, Z.zo)('h1')({
          fontSize: '20px',
          lineHeight: '28px',
          fontWeight: 600,
          textAlign: 'center',
          paddingBottom: '16px',
        }),
        H = (0, Z.zo)('div')({
          height: '102px',
          margin: '32px 0',
          textAlign: 'center',
        }),
        L = (0, Z.zo)('div')({ position: 'relative' }),
        R = (0, Z.zo)('div')(() => ({
          position: 'absolute',
          width: '100%',
          background: 'var(--affine-background-primary-color)',
          textAlign: 'left',
          zIndex: 1,
          borderRadius: '0px 10px 10px 10px',
          height: '56px',
          padding: '8px 12px',
          input: {
            '&::placeholder': { color: 'var(--affine-placeholder-color)' },
          },
        })),
        M = (0, Z.zo)('div')(() => ({
          color: 'var(--affine-icon-color)',
          fontSize: 'var(--affine-font-sm)',
          lineHeight: '40px',
          userSelect: 'none',
          display: 'flex',
        })),
        j = (0, Z.zo)('div')(() => ({
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          color: 'var(--affine-primary-color)',
          background: '#F5F5F5',
          textAlign: 'center',
          lineHeight: '45px',
          fontSize: '20px',
          overflow: 'hidden',
          img: { width: '100%', height: '100%' },
        })),
        T = (0, Z.zo)('div')(() => ({
          flex: '1',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginLeft: '8px',
        }));
      var P = i(73235);
      function Y() {
        let e = (0, P._)(['']);
        return (
          (Y = function () {
            return e;
          }),
          e
        );
      }
      let O = (0, Z.zo)('li')(() => ({
          display: 'flex',
          fontWeight: '500',
          marginBottom: '42px',
          flex: 1,
        })),
        U = (0, Z.zo)('div')(() => ({
          display: 'flex',
          height: '100%',
          flexDirection: 'column',
          overflow: 'hidden',
        })),
        V = (0, Z.zo)(Z.Te)(() => ({ height: '40px', width: '40px' })),
        K = (0, Z.zo)('div')(() => ({
          display: 'flex',
          alignItems: 'center',
          flex: '2 0 402px',
        })),
        G = (0, Z.zo)('div')(() => ({
          display: 'flex',
          alignItems: 'center',
          flex: '1 0 222px',
        })),
        q = (0, Z.zo)('ul')(() => ({
          overflowY: 'scroll',
          flexGrow: 1,
          paddingBottom: '58px',
        })),
        $ = (0, Z.zo)('li')(() => ({
          display: 'flex',
          alignItems: 'center',
          height: '72px',
          width: '100%',
        })),
        Q = (0, Z.zo)('div')(() => ({ paddingLeft: '12px' })),
        J = (0, Z.zo)('div')(() => ({
          fontWeight: '400',
          fontSize: '18px',
          lineHeight: '26px',
          color: 'var(--affine-text-primary-color)',
        })),
        ee = (0, Z.zo)('div')(() => ({
          fontWeight: '400',
          fontSize: '16px',
          lineHeight: '22px',
          color: 'var(--affine-icon-color)',
        })),
        et = (0, Z.zo)('div')(() => ({ position: 'fixed', bottom: '20px' })),
        ei = (0, Z.zo)('div')(() => ({
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          width: '24px',
          height: '24px',
          cursor: 'pointer',
          paddingRight: '48px',
        })),
        en = (0, Z.zo)(ei)(Y()),
        ea = e => {
          let { workspace: t } = e,
            [i, a] = (0, o.useState)(!1),
            r = (0, l.X)(),
            { members: c, removeMember: d } = S(t.id);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.BX)(U, {
                children: [
                  (0, n.tZ)('ul', {
                    children: (0, n.BX)(O, {
                      children: [
                        (0, n.BX)(K, {
                          children: [
                            r.Users(),
                            ' (',
                            (0, n.tZ)('span', {
                              'data-testid': 'member-length',
                              children: c.length,
                            }),
                            ')',
                          ],
                        }),
                        (0, n.tZ)(G, { children: r['Access level']() }),
                        (0, n.tZ)('div', {
                          style: { width: '24px', paddingRight: '48px' },
                        }),
                      ],
                    }),
                  }),
                  (0, n.tZ)(q, {
                    children:
                      c.length > 0 &&
                      (0, n.tZ)(n.HY, {
                        children: c
                          .sort((e, t) => t.type - e.type)
                          .map((e, t) => {
                            let i = {
                              avatar_url: '',
                              id: '',
                              name: '',
                              ...e.user,
                            };
                            return (0, n.BX)(
                              $,
                              {
                                children: [
                                  (0, n.BX)(K, {
                                    children: [
                                      (0, n.tZ)(V, {
                                        alt: 'member avatar',
                                        src: i.avatar_url,
                                        children: (0, n.tZ)(z.EmailIcon, {}),
                                      }),
                                      (0, n.BX)(Q, {
                                        children: [
                                          (0, n.tZ)(J, { children: i.name }),
                                          (0, n.tZ)(ee, {
                                            children: e.user.email,
                                          }),
                                        ],
                                      }),
                                    ],
                                  }),
                                  (0, n.tZ)(G, {
                                    children: e.accepted
                                      ? e.type !== s.vH.Owner
                                        ? r.Member()
                                        : r.Owner()
                                      : r.Pending(),
                                  }),
                                  e.type === s.vH.Owner
                                    ? (0, n.tZ)(ei, {})
                                    : (0, n.tZ)(en, {
                                        children: (0, n.tZ)(Z.v2, {
                                          content: (0, n.tZ)(n.HY, {
                                            children: (0, n.tZ)(Z.sN, {
                                              onClick: async () => {
                                                await d(Number(e.id)),
                                                  (0, A.A)(
                                                    r[
                                                      'Member has been removed'
                                                    ]({ name: i.name })
                                                  );
                                              },
                                              icon: (0, n.tZ)(
                                                z.DeleteTemporarilyIcon,
                                                {}
                                              ),
                                              children:
                                                r['Remove from workspace'](),
                                            }),
                                          }),
                                          placement: 'bottom',
                                          disablePortal: !0,
                                          trigger: 'click',
                                          children: (0, n.tZ)(Z.hU, {
                                            children: (0, n.tZ)(
                                              z.MoreVerticalIcon,
                                              {}
                                            ),
                                          }),
                                        }),
                                      }),
                                ],
                              },
                              t
                            );
                          }),
                      }),
                  }),
                  (0, n.tZ)(et, {
                    children: (0, n.tZ)(Z.zx, {
                      onClick: () => {
                        a(!0);
                      },
                      type: 'primary',
                      'data-testid': 'invite-members',
                      shape: 'circle',
                      children: r['Invite Members'](),
                    }),
                  }),
                ],
              }),
              (0, n.tZ)(_, {
                onClose: (0, o.useCallback)(() => {
                  a(!1);
                }, []),
                onInviteSuccess: (0, o.useCallback)(() => {
                  a(!1);
                }, []),
                workspaceId: t.id,
                open: i,
              }),
            ],
          });
        },
        er = e => {
          let { workspace: t, onTransferWorkspace: i } = e,
            a = (0, l.X)(),
            [c, d] = (0, o.useState)(!1);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.tZ)(Z.im, {
                marginBottom: '42px',
                children: a['Collaboration Description'](),
              }),
              (0, n.tZ)(Z.zx, {
                'data-testid': 'local-workspace-enable-cloud-button',
                type: 'light',
                shape: 'circle',
                onClick: () => {
                  d(!0);
                },
                children: a['Enable AFFiNE Cloud'](),
              }),
              k.vc.enableLegacyCloud
                ? (0, n.tZ)(N.A, {
                    open: c,
                    onClose: () => {
                      d(!1);
                    },
                    onConform: () => {
                      i(r.b8.LOCAL, r.b8.AFFINE, t), d(!1);
                    },
                  })
                : (0, n.tZ)(F.TmpDisableAffineCloudModal, {
                    open: c,
                    onClose: () => {
                      d(!1);
                    },
                  }),
            ],
          });
        },
        el = e => {
          switch (e.workspace.flavour) {
            case r.b8.AFFINE: {
              let t = e.workspace;
              return (0, n.tZ)(ea, { ...e, workspace: t });
            }
            case r.b8.LOCAL: {
              let t = e.workspace;
              return (0, n.tZ)(er, { ...e, workspace: t });
            }
          }
          throw new y.Ym();
        };
      var eo = i(14192),
        ec = i(752);
      let ed = () => {
        let e = (0, ec.Dv)(eo.At),
          t = (0, l.X)();
        return (0, n.BX)(n.HY, {
          children: [
            (0, n.BX)(Z.im, {
              marginBottom: '42px',
              children: [' ', t['Export Description']()],
            }),
            (0, n.tZ)(Z.zx, {
              type: 'light',
              shape: 'circle',
              disabled: !environment.isDesktop || !e,
              'data-testid': 'export-affine-backup',
              onClick: async () => {
                if (e) {
                  var i;
                  let n = await (null === (i = window.apis) || void 0 === i
                    ? void 0
                    : i.dialog.saveDBFileAs(e));
                  (null == n ? void 0 : n.error)
                    ? (0, Z.Am)(t[n.error]())
                    : (null == n ? void 0 : n.canceled) ||
                      (0, Z.Am)(t['Export success']());
                }
              },
              children: t['Export AFFiNE backup file'](),
            }),
          ],
        });
      };
      var es = i(5329),
        ep = i(77352),
        eh = i(78365),
        eu = i(6277);
      let ef = e => {
          let { fileChange: t, accept: i, children: a, ...r } = e,
            c = (0, l.X)(),
            d = (0, o.useRef)(null),
            s = () => {
              d.current && d.current.click();
            },
            p = e => {
              let i = e.target.files;
              if (!i) return;
              let n = i[0];
              t(n), d.current && (d.current.value = '');
            };
          return (0, n.BX)(em, {
            onClick: s,
            children: [
              null != a ? a : (0, n.tZ)(Z.zx, { children: c.Upload() }),
              (0, n.tZ)('input', {
                ref: d,
                type: 'file',
                style: { display: 'none' },
                onChange: p,
                accept: i,
                ...r,
              }),
            ],
          });
        },
        em = (0, Z.zo)('div')(() => ({ display: 'inline-block' }));
      var ev = i(44502);
      let eg = (0, Z.zo)('div')(() => ({
          position: 'relative',
          padding: '0px',
          width: '560px',
          background: 'var(--affine-white)',
          borderRadius: '12px',
        })),
        ex = (0, Z.zo)('div')(() => ({
          margin: '44px 0px 12px 0px',
          width: '560px',
          fontWeight: '600',
          fontSize: '20px;',
          textAlign: 'center',
        })),
        eb = (0, Z.zo)('div')(() => ({
          margin: 'auto',
          width: '425px',
          fontFamily: 'Avenir Next',
          fontStyle: 'normal',
          fontWeight: '400',
          fontSize: '18px',
          lineHeight: '26px',
          textAlign: 'left',
        })),
        eC = (0, Z.zo)('div')(() => ({
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          margin: '24px 0',
          fontSize: 'var(--affine-font-base)',
        })),
        ew = (0, Z.zo)('div')(() => ({
          marginBottom: '42px',
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
        })),
        eZ = (0, Z.zo)('span')(() => ({ fontWeight: '600' })),
        ek = e => {
          var t;
          let { open: i, onClose: a, workspace: c, onDeleteWorkspace: d } = e,
            [s] = (0, eh.H)(
              null !== (t = c.blockSuiteWorkspace) && void 0 !== t ? t : null
            ),
            [p, h] = (0, o.useState)(''),
            u = (0, l.X)(),
            f = (0, o.useCallback)(() => {
              d()
                .then(() => {
                  (0, A.A)(u['Successfully deleted'](), {
                    portal: document.body,
                  });
                })
                .catch(() => {});
            }, [d, u]);
          return (0, n.tZ)(Z.u_, {
            open: i,
            onClose: a,
            children: (0, n.BX)(eg, {
              children: [
                (0, n.tZ)(Z.ol, { onClick: a }),
                (0, n.BX)(ex, { children: [u['Delete Workspace'](), '?'] }),
                c.flavour === r.b8.LOCAL
                  ? (0, n.tZ)(eb, {
                      children: (0, n.BX)(ev.cC, {
                        i18nKey: 'Delete Workspace Description',
                        children: [
                          'Deleting (',
                          (0, n.tZ)(eZ, { children: { workspace: s } }),
                          ') cannot be undone, please proceed with caution. All contents will be lost.',
                        ],
                      }),
                    })
                  : (0, n.tZ)(eb, {
                      children: (0, n.BX)(ev.cC, {
                        i18nKey: 'Delete Workspace Description2',
                        children: [
                          'Deleting (',
                          (0, n.tZ)(eZ, { children: { workspace: s } }),
                          ') will delete both local and cloud data, this operation cannot be undone, please proceed with caution.',
                        ],
                      }),
                    }),
                (0, n.tZ)(eC, {
                  children: (0, n.tZ)(Z.II, {
                    ref: e => {
                      e && setTimeout(() => e.focus(), 0);
                    },
                    onChange: h,
                    'data-testid': 'delete-workspace-input',
                    placeholder: u['Placeholder of delete workspace'](),
                    value: p,
                    width: 315,
                    height: 42,
                  }),
                }),
                (0, n.BX)(ew, {
                  children: [
                    (0, n.tZ)(Z.zx, {
                      shape: 'circle',
                      onClick: a,
                      children: u.Cancel(),
                    }),
                    (0, n.tZ)(Z.zx, {
                      'data-testid': 'delete-workspace-confirm-button',
                      disabled: p !== s,
                      onClick: f,
                      type: 'danger',
                      shape: 'circle',
                      style: { marginLeft: '24px' },
                      children: u.Delete(),
                    }),
                  ],
                }),
              ],
            }),
          });
        },
        ey = () =>
          (0, n.tZ)('svg', {
            width: '24',
            height: '24',
            viewBox: '0 0 24 24',
            fill: 'none',
            xmlns: 'http://www.w3.org/2000/svg',
            children: (0, n.tZ)('path', {
              fillRule: 'evenodd',
              clipRule: 'evenodd',
              d: 'M10.6236 4.25001C10.635 4.25001 10.6467 4.25002 10.6584 4.25002H13.3416C13.3533 4.25002 13.365 4.25001 13.3764 4.25001C13.5609 4.24995 13.7105 4.2499 13.8543 4.26611C14.5981 4.34997 15.2693 4.75627 15.6826 5.38026C15.7624 5.50084 15.83 5.63398 15.9121 5.79586C15.9173 5.80613 15.9226 5.81652 15.9279 5.82703C15.9538 5.87792 15.9679 5.90562 15.9789 5.9261C15.9832 5.9341 15.9857 5.93861 15.9869 5.94065C16.0076 5.97069 16.0435 5.99406 16.0878 5.99905L16.0849 5.99877C16.0849 5.99877 16.0907 5.99918 16.1047 5.99947C16.1286 5.99998 16.1604 6.00002 16.2181 6.00002L17.185 6.00001C17.6577 6 18.0566 5.99999 18.3833 6.02627C18.7252 6.05377 19.0531 6.11364 19.3656 6.27035C19.8402 6.50842 20.2283 6.88944 20.4723 7.36077C20.6336 7.67233 20.6951 7.99944 20.7232 8.33858C20.75 8.66166 20.75 9.05554 20.75 9.51992V16.2301C20.75 16.6945 20.75 17.0884 20.7232 17.4114C20.6951 17.7506 20.6336 18.0777 20.4723 18.3893C20.2283 18.8606 19.8402 19.2416 19.3656 19.4797C19.0531 19.6364 18.7252 19.6963 18.3833 19.7238C18.0566 19.75 17.6578 19.75 17.185 19.75H6.81497C6.34225 19.75 5.9434 19.75 5.61668 19.7238C5.27477 19.6963 4.94688 19.6364 4.63444 19.4797C4.15978 19.2416 3.77167 18.8606 3.52771 18.3893C3.36644 18.0777 3.30494 17.7506 3.27679 17.4114C3.24998 17.0884 3.24999 16.6945 3.25 16.2302V9.51987C3.24999 9.05551 3.24998 8.66164 3.27679 8.33858C3.30494 7.99944 3.36644 7.67233 3.52771 7.36077C3.77167 6.88944 4.15978 6.50842 4.63444 6.27035C4.94688 6.11364 5.27477 6.05377 5.61668 6.02627C5.9434 5.99999 6.34225 6 6.81498 6.00001L7.78191 6.00002C7.83959 6.00002 7.87142 5.99998 7.8953 5.99947C7.90607 5.99924 7.91176 5.99897 7.91398 5.99884C7.95747 5.99343 7.99267 5.9703 8.01312 5.94066C8.01429 5.93863 8.01684 5.93412 8.02113 5.9261C8.0321 5.90561 8.04622 5.87791 8.07206 5.82703C8.07739 5.81653 8.08266 5.80615 8.08787 5.79588C8.17004 5.63397 8.23759 5.50086 8.31745 5.38026C8.73067 4.75627 9.40192 4.34997 10.1457 4.26611C10.2895 4.2499 10.4391 4.24995 10.6236 4.25001ZM10.6584 5.75002C10.422 5.75002 10.3627 5.75114 10.3138 5.75666C10.0055 5.79142 9.73316 5.95919 9.56809 6.20845C9.54218 6.24758 9.51544 6.29761 9.40943 6.50633C9.40611 6.51287 9.40274 6.5195 9.39934 6.52622C9.36115 6.60161 9.31758 6.68761 9.26505 6.76694C8.9964 7.17261 8.56105 7.4354 8.08026 7.48961C7.98625 7.50021 7.89021 7.50011 7.80434 7.50003C7.79678 7.50002 7.7893 7.50002 7.78191 7.50002H6.84445C6.33444 7.50002 5.99634 7.50058 5.73693 7.52144C5.48594 7.54163 5.37478 7.57713 5.30693 7.61115C5.11257 7.70864 4.95675 7.86306 4.85983 8.05029C4.82733 8.11308 4.79194 8.21816 4.77165 8.46266C4.7506 8.71626 4.75 9.0474 4.75 9.55001V16.2C4.75 16.7026 4.7506 17.0338 4.77165 17.2874C4.79194 17.5319 4.82733 17.6369 4.85983 17.6997C4.95675 17.887 5.11257 18.0414 5.30693 18.1389C5.37478 18.1729 5.48594 18.2084 5.73693 18.2286C5.99634 18.2494 6.33444 18.25 6.84445 18.25H17.1556C17.6656 18.25 18.0037 18.2494 18.2631 18.2286C18.5141 18.2084 18.6252 18.1729 18.6931 18.1389C18.8874 18.0414 19.0433 17.887 19.1402 17.6997C19.1727 17.6369 19.2081 17.5319 19.2283 17.2874C19.2494 17.0338 19.25 16.7026 19.25 16.2V9.55001C19.25 9.0474 19.2494 8.71626 19.2283 8.46266C19.2081 8.21816 19.1727 8.11308 19.1402 8.05029C19.0433 7.86306 18.8874 7.70864 18.6931 7.61115C18.6252 7.57713 18.5141 7.54163 18.2631 7.52144C18.0037 7.50058 17.6656 7.50002 17.1556 7.50002H16.2181C16.2107 7.50002 16.2032 7.50002 16.1957 7.50003C16.1098 7.50011 16.0138 7.50021 15.9197 7.48961C15.4389 7.4354 15.0036 7.17261 14.735 6.76694C14.6824 6.68761 14.6389 6.60163 14.6007 6.52622C14.5973 6.5195 14.5939 6.51287 14.5906 6.50633C14.4846 6.29763 14.4578 6.24758 14.4319 6.20846C14.2668 5.95919 13.9945 5.79142 13.6862 5.75666C13.6373 5.75114 13.578 5.75002 13.3416 5.75002H10.6584ZM12 11C10.9303 11 10.0833 11.8506 10.0833 12.875C10.0833 13.8995 10.9303 14.75 12 14.75C13.0697 14.75 13.9167 13.8995 13.9167 12.875C13.9167 11.8506 13.0697 11 12 11ZM8.58333 12.875C8.58333 11 10.1242 9.50002 12 9.50002C13.8758 9.50002 15.4167 11 15.4167 12.875C15.4167 14.7501 13.8758 16.25 12 16.25C10.1242 16.25 8.58333 14.7501 8.58333 12.875Z',
              fill: 'white',
            }),
          }),
        ez = (0, Z.zo)('div')(() => ({
          position: 'relative',
          padding: '0px',
          width: '460px',
          background: 'var(--affine-white)',
          borderRadius: '12px',
        })),
        eB = (0, Z.zo)('div')(() => ({
          margin: '44px 0px 12px 0px',
          width: '460px',
          fontWeight: '600',
          fontSize: '20px;',
          textAlign: 'center',
        })),
        eS = (0, Z.zo)('div')(() => ({
          margin: 'auto',
          width: '425px',
          fontFamily: 'Avenir Next',
          fontStyle: 'normal',
          fontWeight: '400',
          fontSize: '18px',
          lineHeight: '26px',
          textAlign: 'center',
        })),
        eA = (0, Z.zo)('div')(() => ({
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'center',
          margin: '0px 0 32px 0',
        })),
        eF = e => {
          let { open: t, onClose: i } = e,
            a = (0, l.X)(),
            r = async () => {
              i();
            };
          return (0, n.tZ)(Z.u_, {
            open: t,
            onClose: i,
            children: (0, n.BX)(ez, {
              children: [
                (0, n.tZ)(Z.ol, { onClick: i }),
                (0, n.tZ)(eB, { children: a['Leave Workspace']() }),
                (0, n.tZ)(eS, { children: a['Leave Workspace Description']() }),
                (0, n.BX)(eA, {
                  children: [
                    (0, n.tZ)(Z.zx, {
                      shape: 'circle',
                      onClick: i,
                      children: a.Cancel(),
                    }),
                    (0, n.tZ)(Z.zx, {
                      onClick: r,
                      type: 'danger',
                      shape: 'circle',
                      style: { marginLeft: '24px' },
                      children: a.Leave(),
                    }),
                  ],
                }),
              ],
            }),
          });
        },
        eN = Z.II;
      (0, Z.zo)('div')(() => ({
        ...(0, Z.j2)('flex-start', 'center'),
        fontSize: '20px',
        span: { fontSize: 'var(--affine-font-base)', marginLeft: '15px' },
      })),
        (0, Z.zo)('div')(e => {
          let { disabled: t } = e;
          return {
            position: 'relative',
            marginRight: '20px',
            cursor: t ? 'default' : 'pointer',
            ':hover': { '.camera-icon': { display: 'flex' } },
            '.camera-icon': {
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'none',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              backgroundColor: 'rgba(60, 61, 63, 0.5)',
              justifyContent: 'center',
              alignItems: 'center',
              zIndex: 10,
            },
          };
        }),
        (0, Z.zo)('div')(() => ({
          color: 'var(--affine-primary-color)',
          cursor: 'pointer',
          marginLeft: '36px',
        }));
      let eX = e => {
          let [t, i] = (0, o.useState)(!1);
          return (
            (0, o.useEffect)(() => {
              if (window.apis && window.events && environment.isDesktop)
                return (
                  window.apis.workspace
                    .getMeta(e)
                    .then(e => {
                      i(!!e.secondaryDBPath);
                    })
                    .catch(e => {
                      console.error(e);
                    }),
                  window.events.workspace.onMetaChange(t => {
                    if (t.workspaceId === e) {
                      let e = t.meta;
                      i(!!e.secondaryDBPath);
                    }
                  })
                );
            }, [e]),
            t
          );
        },
        eE = e => {
          let { workspace: t, onDeleteWorkspace: i } = e,
            [a, r] = (0, o.useState)(!1),
            [c, d] = (0, o.useState)(!1),
            [s, g] = (0, eh.H)(t.blockSuiteWorkspace),
            [x, b] = (0, o.useState)(s),
            C = p(t),
            w = (0, l.X)(),
            k = e => {
              g(e), (0, Z.Am)(w['Update workspace name success']());
            },
            [, y] = (0, ep.r)(t.blockSuiteWorkspace);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.BX)('div', {
                'data-testid': 'avatar-row',
                className: f,
                children: [
                  (0, n.BX)('div', {
                    className: u,
                    children: [
                      (0, n.tZ)('div', {
                        className: m,
                        children: w['Workspace Avatar'](),
                      }),
                      (0, n.tZ)('div', {
                        className: v,
                        children: w['Change avatar hint'](),
                      }),
                    ],
                  }),
                  (0, n.tZ)('div', {
                    className: (0, eu.Z)(u),
                    children: (0, n.tZ)('div', {
                      className: h[C ? 'enabled' : 'disabled'],
                      children: C
                        ? (0, n.tZ)(ef, {
                            accept:
                              'image/gif,image/jpeg,image/jpg,image/png,image/svg',
                            fileChange: y,
                            'data-testid': 'upload-avatar',
                            children: (0, n.BX)(n.HY, {
                              children: [
                                (0, n.tZ)('div', {
                                  className: 'camera-icon',
                                  children: (0, n.tZ)(ey, {}),
                                }),
                                (0, n.tZ)(es.z, { size: 72, workspace: t }),
                              ],
                            }),
                          })
                        : (0, n.tZ)(es.z, { size: 72, workspace: t }),
                    }),
                  }),
                  (0, n.tZ)('div', { className: (0, eu.Z)(u) }),
                ],
              }),
              (0, n.BX)('div', {
                'data-testid': 'workspace-name-row',
                className: f,
                children: [
                  (0, n.BX)('div', {
                    className: u,
                    children: [
                      (0, n.tZ)('div', {
                        className: m,
                        children: w['Workspace Name'](),
                      }),
                      (0, n.tZ)('div', {
                        className: v,
                        children: w['Change workspace name hint'](),
                      }),
                    ],
                  }),
                  (0, n.tZ)('div', {
                    className: u,
                    children: (0, n.tZ)(eN, {
                      height: 38,
                      value: x,
                      'data-testid': 'workspace-name-input',
                      placeholder: w['Workspace Name'](),
                      maxLength: 64,
                      minLength: 0,
                      onChange: b,
                    }),
                  }),
                  (0, n.tZ)('div', {
                    className: u,
                    children: (0, n.tZ)(Z.zx, {
                      type: 'light',
                      size: 'middle',
                      'data-testid': 'save-workspace-name',
                      icon: (0, n.tZ)(z.SaveIcon, {}),
                      disabled: x === t.blockSuiteWorkspace.meta.name,
                      onClick: () => {
                        k(x);
                      },
                      children: w.Save(),
                    }),
                  }),
                ],
              }),
              (0, n.tZ)(e_, { workspaceId: t.id }),
              (0, n.BX)('div', {
                className: f,
                children: [
                  (0, n.BX)('div', {
                    className: u,
                    children: [
                      (0, n.tZ)('div', {
                        className: m,
                        children: w['Delete Workspace'](),
                      }),
                      (0, n.tZ)('div', {
                        className: v,
                        children: w['Delete Workspace Label Hint'](),
                      }),
                    ],
                  }),
                  (0, n.tZ)('div', { className: u }),
                  (0, n.tZ)('div', {
                    className: u,
                    children: C
                      ? (0, n.BX)(n.HY, {
                          children: [
                            (0, n.tZ)(Z.zx, {
                              type: 'warning',
                              'data-testid': 'delete-workspace-button',
                              size: 'middle',
                              icon: (0, n.tZ)(z.DeleteIcon, {}),
                              onClick: () => {
                                r(!0);
                              },
                              children: w.Delete(),
                            }),
                            (0, n.tZ)(ek, {
                              onDeleteWorkspace: i,
                              open: a,
                              onClose: () => {
                                r(!1);
                              },
                              workspace: t,
                            }),
                          ],
                        })
                      : (0, n.BX)(n.HY, {
                          children: [
                            (0, n.tZ)(Z.zx, {
                              type: 'warning',
                              size: 'middle',
                              onClick: () => {
                                d(!0);
                              },
                              children: w.Leave(),
                            }),
                            (0, n.tZ)(eF, {
                              open: c,
                              onClose: () => {
                                d(!1);
                              },
                            }),
                          ],
                        }),
                  }),
                ],
              }),
            ],
          });
        };
      function e_(e) {
        let { workspaceId: t } = e,
          i = (0, l.X)(),
          a = eX(t),
          r = (0, o.useCallback)(() => {
            if (environment.isDesktop) {
              var e;
              null === (e = window.apis) ||
                void 0 === e ||
                e.dialog.revealDBFile(t).catch(e => {
                  console.error(e);
                });
            }
          }, [t]),
          [c, d] = (0, o.useState)(!1),
          s = (0, o.useCallback)(() => {
            var e;
            c ||
              (d(!0),
              null === (e = window.apis) ||
                void 0 === e ||
                e.dialog
                  .moveDBFile(t)
                  .then(e => {
                    (null == e ? void 0 : e.error) ||
                    (null == e ? void 0 : e.canceled)
                      ? (null == e ? void 0 : e.error) &&
                        (0, Z.Am)(i[e.error]())
                      : (0, Z.Am)(i['Move folder success']());
                  })
                  .catch(() => {
                    (0, Z.Am)(i.UNKNOWN_ERROR());
                  })
                  .finally(() => {
                    d(!1);
                  }));
          }, [c, i, t]),
          p = a
            ? (0, n.BX)('div', {
                className: C,
                onClick: r,
                children: [
                  (0, n.tZ)(z.FolderIcon, {
                    color: 'var(--affine-primary-color)',
                  }),
                  (0, n.BX)('div', {
                    className: b,
                    children: [
                      (0, n.tZ)('div', {
                        className: g,
                        children: i['Open folder'](),
                      }),
                      (0, n.tZ)('div', {
                        className: x,
                        children: i['Open folder hint'](),
                      }),
                    ],
                  }),
                  (0, n.tZ)(z.ArrowRightSmallIcon, {
                    color: 'var(--affine-primary-color)',
                  }),
                ],
              })
            : null;
        return (0, n.BX)('div', {
          className: f,
          children: [
            (0, n.BX)('div', {
              className: u,
              children: [
                (0, n.tZ)('div', {
                  className: m,
                  children: i['Storage Folder'](),
                }),
                (0, n.tZ)('div', {
                  className: v,
                  children: i['Storage Folder Hint'](),
                }),
              ],
            }),
            (0, n.BX)('div', {
              className: u,
              children: [
                p,
                (0, n.BX)('div', {
                  'data-testid': 'move-folder',
                  'data-disabled': c,
                  className: C,
                  onClick: s,
                  children: [
                    (0, n.tZ)(z.MoveToIcon, {
                      color: 'var(--affine-primary-color)',
                    }),
                    (0, n.BX)('div', {
                      className: b,
                      children: [
                        (0, n.tZ)('div', {
                          className: g,
                          children: i['Move folder'](),
                        }),
                        (0, n.tZ)('div', {
                          className: x,
                          children: i['Move folder hint'](),
                        }),
                      ],
                    }),
                    (0, n.tZ)(z.ArrowRightSmallIcon, {
                      color: 'var(--affine-primary-color)',
                    }),
                  ],
                }),
              ],
            }),
            (0, n.tZ)('div', { className: u }),
          ],
        });
      }
      var eW = i(7896),
        eI = i(31461),
        eD = i(25165),
        eH = i(37450),
        eL = i(89836),
        eR = i(16933),
        eM = i(52322);
      let ej = ['className', 'component'];
      var eT = i(68542),
        eP = i(38646),
        eY = i(16912);
      let eO = (0, eP.Z)(),
        eU = (function (e = {}) {
          let {
              themeId: t,
              defaultTheme: i,
              defaultClassName: n = 'MuiBox-root',
              generateClassName: a,
            } = e,
            r = (0, eD.ZP)('div', {
              shouldForwardProp: e => 'theme' !== e && 'sx' !== e && 'as' !== e,
            })(eH.Z),
            l = o.forwardRef(function (e, l) {
              let o = (0, eR.Z)(i),
                c = (0, eL.Z)(e),
                { className: d, component: s = 'div' } = c,
                p = (0, eI.Z)(c, ej);
              return (0,
              eM.jsx)(r, (0, eW.Z)({ as: s, ref: l, className: (0, eu.Z)(d, a ? a(n) : n), theme: (t && o[t]) || o }, p));
            });
          return l;
        })({
          themeId: eY.Z,
          defaultTheme: eO,
          defaultClassName: 'MuiBox-root',
          generateClassName: eT.Z.generate,
        });
      var eV = i(67544),
        eK = i(76641);
      let eG = (0, Z.zo)('div')({
          height: '44px',
          display: 'flex',
          flexDirection: 'row-reverse',
          paddingRight: '10px',
          paddingTop: '10px',
          flexShrink: 0,
        }),
        eq = (0, Z.zo)('div')({ textAlign: 'center' }),
        e$ = (0, Z.zo)('h1')({
          fontSize: '20px',
          lineHeight: '28px',
          fontWeight: 600,
          textAlign: 'center',
        }),
        eQ = (0, Z.zo)('div')(() => ({
          userSelect: 'none',
          width: '400px',
          margin: 'auto',
          marginBottom: '32px',
          marginTop: '12px',
        })),
        eJ = (0, Z.zo)(Z.zx)(() => ({
          width: '284px',
          display: 'block',
          margin: 'auto',
          marginTop: '16px',
        })),
        e0 = e => {
          let { onConfirm: t, open: i, onClose: a } = e,
            r = (0, l.X)(),
            o = (0, eK.x)();
          return (0, n.tZ)(Z.u_, {
            open: i,
            onClose: a,
            'data-testid': 'logout-modal',
            children: (0, n.BX)(Z.AB, {
              width: 560,
              height: 292,
              children: [
                (0, n.tZ)(eG, {
                  children: (0, n.tZ)(Z.hU, {
                    onClick: a,
                    children: (0, n.tZ)(z.CloseIcon, {}),
                  }),
                }),
                (0, n.BX)(eq, {
                  children: [
                    (0, n.BX)(e$, {
                      children: [r['Enable AFFiNE Cloud'](), '?'],
                    }),
                    (0, n.tZ)(eQ, {
                      children: r['Enable AFFiNE Cloud Description'](),
                    }),
                    (0, n.BX)('div', {
                      children: [
                        (0, n.tZ)(eJ, {
                          'data-testid': 'confirm-enable-affine-cloud-button',
                          shape: 'round',
                          type: 'primary',
                          onClick: t,
                          children: o ? r.Enable() : r['Sign in and Enable'](),
                        }),
                        (0, n.tZ)(eJ, {
                          shape: 'round',
                          onClick: a,
                          children: r['Not now'](),
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          });
        },
        e1 = e => {
          let { workspace: t } = e,
            [i, a] = (0, o.useState)('');
          (0, o.useEffect)(() => {
            a(window.location.origin ? window.location.origin : '');
          }, []);
          let r = i + '/public-workspace/' + t.id,
            c = (0, l.X)(),
            d = (0, eV.b)(t),
            s = (0, o.useCallback)(async () => {
              await navigator.clipboard.writeText(r),
                (0, A.A)(c['Copied link to clipboard']());
            }, [r, c]);
          return t.public
            ? (0, n.BX)(n.HY, {
                children: [
                  (0, n.tZ)(Z.im, {
                    marginBottom: '42px',
                    children: c['Published Description'](),
                  }),
                  (0, n.tZ)(Z.im, {
                    marginBottom: '12px',
                    children: (0, n.tZ)(Z.VY, {
                      weight: '500',
                      children: c['Share with link'](),
                    }),
                  }),
                  (0, n.BX)(Z.A0, {
                    children: [
                      (0, n.tZ)(Z.II, {
                        'data-testid': 'share-url',
                        width: 582,
                        value: r,
                        disabled: !0,
                      }),
                      (0, n.tZ)(Z.zx, {
                        onClick: s,
                        type: 'light',
                        shape: 'circle',
                        style: { marginLeft: '24px' },
                        children: c['Copy Link'](),
                      }),
                    ],
                  }),
                  (0, n.tZ)(Z.zx, {
                    onClick: async () => {
                      await d(!1);
                    },
                    loading: !1,
                    type: 'danger',
                    shape: 'circle',
                    style: { marginTop: '38px' },
                    children: c['Stop publishing'](),
                  }),
                ],
              })
            : (0, n.BX)(n.HY, {
                children: [
                  (0, n.tZ)(Z.im, {
                    marginBottom: '42px',
                    children: c['Publishing Description'](),
                  }),
                  (0, n.tZ)(Z.zx, {
                    'data-testid': 'publish-to-web-button',
                    onClick: async () => {
                      await d(!0);
                    },
                    type: 'light',
                    shape: 'circle',
                    children: c['Publish to web'](),
                  }),
                ],
              });
        },
        e5 = e => {
          let { workspace: t, onTransferWorkspace: i } = e,
            a = (0, l.X)(),
            [c, d] = (0, o.useState)(!1);
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.tZ)(eU, {
                sx: { marginBottom: '42px' },
                children: a.Publishing(),
              }),
              (0, n.tZ)(Z.zx, {
                'data-testid': 'publish-enable-affine-cloud-button',
                type: 'light',
                shape: 'circle',
                onClick: () => {
                  d(!0);
                },
                children: a['Enable AFFiNE Cloud'](),
              }),
              k.vc.enableLegacyCloud
                ? (0, n.tZ)(e0, {
                    open: c,
                    onClose: () => {
                      d(!1);
                    },
                    onConfirm: () => {
                      i(r.b8.LOCAL, r.b8.AFFINE, t), d(!1);
                    },
                  })
                : (0, n.tZ)(F.TmpDisableAffineCloudModal, {
                    open: c,
                    onClose: () => {
                      d(!1);
                    },
                  }),
            ],
          });
        },
        e6 = e => {
          if (e.workspace.flavour === r.b8.AFFINE)
            return (0, n.tZ)(e1, { ...e, workspace: e.workspace });
          if (e.workspace.flavour === r.b8.LOCAL)
            return (0, n.tZ)(e5, { ...e, workspace: e.workspace });
          throw new y.Ym();
        };
      var e2 = i(9532);
      let e7 = (0, Z.zo)('span')(() => ({
          fontWeight: '400',
          fontSize: 'var(--affine-font-h6)',
        })),
        e4 = e => {
          let { workspace: t } = e;
          if (t.flavour !== r.b8.AFFINE)
            throw TypeError('SyncPanel can only be used with Affine workspace');
          let [i] = (0, eh.H)(t.blockSuiteWorkspace),
            [a] = (0, ep.r)(t.blockSuiteWorkspace),
            o = (0, eK.x)(),
            c = (0, l.X)();
          return (0, n.BX)(n.HY, {
            children: [
              (0, n.BX)(Z.A0, {
                alignItems: 'center',
                style: { marginBottom: '12px' },
                children: [
                  (0, n.tZ)(e2.z, {
                    size: 32,
                    name: i,
                    avatar: a,
                    style: { marginRight: '12px' },
                  }),
                  (0, n.tZ)(e7, { children: i }),
                  '\xa0',
                  (0, n.tZ)(Z.VY, {
                    weight: 500,
                    children: c['is a Cloud Workspace'](),
                  }),
                ],
              }),
              (0, n.BX)(ev.cC, {
                i18nKey: 'Cloud Workspace Description',
                children: [
                  'All data will be synchronised and saved to the AFFiNE account',
                  { email: null == o ? void 0 : o.email },
                ],
              }),
            ],
          });
        },
        e9 = {
          [r.ey.General]: { name: 'General', ui: eE },
          [r.ey.Sync]: { name: 'Sync', enable: e => e === r.b8.AFFINE, ui: e4 },
          [r.ey.Collaboration]: { name: 'Collaboration', ui: el },
          [r.ey.Publish]: { name: 'Publish', ui: e6 },
          [r.ey.Export]: { name: 'Export', ui: ed },
        };
      function e8(e, t) {
        if (!(e instanceof t)) throw Error('Object is not instance of type');
      }
      let e3 = e => {
        let { workspace: t, currentTab: i, onChangeTab: r } = e,
          s = 'affine' === t.flavour,
          h = p(t);
        if (!('affine' === t.flavour || 'local' === t.flavour))
          throw Error('Unsupported workspace flavour');
        if (!(i in e9)) throw Error('Invalid activeTab: ' + i);
        let u = (0, l.X)(),
          f = t.id;
        (0, o.useEffect)(() => {
          s && h && (0, c.MA)([d.S.getMembers, f], d._).catch(console.error);
        }, [s, h, f]);
        let m = (0, o.useRef)(null),
          v = (0, o.useRef)(null),
          g = (0, o.useCallback)(() => {
            if (v.current && m.current) {
              let e = v.current,
                t = m.current.querySelector('[data-tab-key="'.concat(i, '"]'));
              e8(t, HTMLElement),
                requestAnimationFrame(() => {
                  (e.style.left = ''.concat(t.offsetLeft, 'px')),
                    (e.style.width = ''.concat(t.offsetWidth, 'px'));
                });
            }
          }, [i]),
          x = (0, o.useCallback)(
            e => {
              e8(e.target, HTMLElement);
              let t = e.target.getAttribute('data-tab-key');
              if (!t || !(t in e9))
                throw Error('data-tab-key is invalid: ' + t);
              r(t), g();
            },
            [r, g]
          ),
          b = (0, o.useMemo)(() => e9[i].ui, [i]);
        return (0, n.BX)('div', {
          className: '_101css40',
          'aria-label': 'workspace-setting-detail',
          ref: m,
          children: [
            (0, n.BX)('div', {
              className: '_101css4h',
              children: [
                Object.entries(e9).map(e => {
                  let [a, r] = e;
                  return 'enable' in r && !r.enable(t.flavour)
                    ? null
                    : (0, n.tZ)(
                        'div',
                        {
                          className: w[i === a ? 'active' : 'inactive'],
                          'data-tab-key': a,
                          onClick: x,
                          children: u[r.name](),
                        },
                        a
                      );
                }),
                (0, n.tZ)('div', {
                  className: '_101css4g',
                  ref: e => {
                    (v.current = e), g();
                  },
                }),
              ],
            }),
            (0, n.tZ)('div', {
              className: '_101css42',
              children: (0, n.tZ)(o.Suspense, {
                fallback: 'loading panel...',
                children: (0, a.az)(b, { ...e, key: i, 'data-tab-ui': i }),
              }),
            }),
          ],
        });
      };
    },
    9532: function (e, t, i) {
      'use strict';
      i.d(t, {
        $: function () {
          return m;
        },
        z: function () {
          return v;
        },
      });
      var n = i(52903),
        a = i(37565),
        r = i(96893),
        l = i(72013),
        o = i(31921),
        c = i(752),
        d = i(2784),
        s = i(74090),
        p = i(53137);
      (0, a.zo)('div')(() => ({
        width: '1px',
        height: '20px',
        background: 'var(--affine-border-color)',
        marginRight: '24px',
      })),
        (0, a.zo)('div')(() => ({
          marginLeft: '15px',
          width: '202px',
          p: {
            height: '20px',
            fontSize: 'var(--affine-font-sm)',
            ...(0, a.j2)('flex-start', 'center'),
          },
          svg: { marginRight: '10px', fontSize: '16px', flexShrink: 0 },
          span: { flexGrow: 1, ...(0, a.vS)(1) },
        })),
        (0, a.zo)('div')(() => ({
          fontSize: 'var(--affine-font-base)',
          fontWeight: 600,
          lineHeight: '24px',
          marginBottom: '10px',
          maxWidth: '200px',
          ...(0, a.vS)(1),
        }));
      let h = (0, a.zo)('div')({
          height: '84px',
          padding: '0 40px',
          flexShrink: 0,
          ...(0, a.j2)('space-between', 'center'),
        }),
        u = (0, a.zo)('div')(() => ({
          textAlign: 'left',
          marginLeft: '16px',
          flex: 1,
          p: { lineHeight: '24px', color: 'var(--affine-icon-color)' },
          'p:first-of-type': {
            color: 'var(--affine-text-primary-color)',
            fontWeight: 600,
          },
        }));
      (0, a.zo)('div')(() => ({ ...(0, a.j2)('flex-start', 'center') })),
        (0, a.zo)('div')(() => ({
          fontWeight: 600,
          fontSize: 'var(--affine-font-h6)',
        })),
        (0, a.zo)('div')(() => ({
          color: 'var(--affine-icon-color)',
          marginLeft: '15px',
          fontWeight: 400,
          fontSize: 'var(--affine-font-h6)',
          ...(0, a.j2)('center', 'center'),
        })),
        (0, a.zo)('div')({
          height: '534px',
          padding: '8px 40px',
          marginTop: '72px',
          overflow: 'auto',
          ...(0, a.j2)('space-between', 'flex-start', 'flex-start'),
          flexWrap: 'wrap',
        }),
        (0, a.zo)('div')(() => ({ ...(0, a.j2)('flex-end', 'center') })),
        (0, a.zo)('div')(() => ({
          width: '58px',
          height: '58px',
          borderRadius: '100%',
          background: '#f4f5fa',
          border: '1.5px dashed #f4f5fa',
          transition: 'background .2s',
          ...(0, a.j2)('center', 'center'),
        })),
        (0, a.zo)('div')(() => ({
          width: '100%',
          height: '72px',
          position: 'absolute',
          left: 0,
          top: 0,
          borderRadius: '24px 24px 0 0',
          padding: '0 40px',
          ...(0, a.j2)('space-between', 'center'),
        }));
      let f = (0, a.zo)(a.zx)(() => ({
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
            ...(0, a.Qj)('center', 'center'),
          },
        })),
        m = e => {
          let { user: t, onLogin: i, onLogout: d } = e,
            p = (0, l.X)(),
            m = (0, c.b9)(s.Qe);
          return (0, n.BX)(h, {
            'data-testid': 'workspace-list-modal-footer',
            children: [
              t &&
                (0, n.BX)(n.HY, {
                  children: [
                    (0, n.BX)(a.A0, {
                      children: [
                        (0, n.tZ)(v, {
                          size: 40,
                          name: t.name,
                          avatar: t.avatar_url,
                        }),
                        (0, n.BX)(u, {
                          children: [
                            (0, n.tZ)('p', { children: t.name }),
                            (0, n.tZ)('p', { children: t.email }),
                          ],
                        }),
                      ],
                    }),
                    (0, n.tZ)(a.u, {
                      content: p['Sign out'](),
                      disablePortal: !0,
                      children: (0, n.tZ)(a.hU, {
                        'data-testid': 'workspace-list-modal-sign-out',
                        onClick: () => {
                          d();
                        },
                        children: (0, n.tZ)(o.SignOutIcon, {}),
                      }),
                    }),
                  ],
                }),
              !t &&
                (0, n.tZ)(f, {
                  'data-testid': 'sign-in-button',
                  noBorder: !0,
                  bold: !0,
                  icon: (0, n.tZ)('div', {
                    className: 'circle',
                    children: (0, n.tZ)(o.CloudWorkspaceIcon, {}),
                  }),
                  onClick: async () => {
                    r.vc.enableLegacyCloud ? i() : m(!0);
                  },
                  children: p['Sign in'](),
                }),
            ],
          });
        },
        v = (0, d.forwardRef)(function (e, t) {
          let i = e.size || 20,
            a = i + 'px';
          return (0,
          n.tZ)(n.HY, { children: e.avatar ? (0, n.tZ)('div', { style: { ...e.style, width: a, height: a, color: '#fff', borderRadius: '50%', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (0, n.tZ)('picture', { children: (0, n.tZ)('img', { style: { width: a, height: a }, src: e.avatar, alt: '', referrerPolicy: 'no-referrer' }) }) }) : (0, n.tZ)('div', { style: { ...e.style, width: a, height: a, border: '1px solid #fff', color: '#fff', fontSize: Math.ceil(0.5 * i) + 'px', background: (0, p.W)(e.name || 'AFFiNE'), borderRadius: '50%', textAlign: 'center', lineHeight: i + 'px', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (e.name || 'AFFiNE').substring(0, 1) }) });
        });
    },
    67544: function (e, t, i) {
      'use strict';
      i.d(t, {
        b: function () {
          return d;
        },
      });
      var n = i(78981),
        a = i(14192),
        r = i(1347),
        l = i(2784),
        o = i(3255),
        c = i(75489);
      function d(e) {
        let { mutate: t } = (0, o.ZP)(c.S.getWorkspaces);
        return (0, l.useCallback)(
          async i => {
            await n._.updateWorkspace({ id: e.id, public: i }),
              await t(c.S.getWorkspaces),
              r.Ux.set(a.nn, e => [...e]);
          },
          [t, e.id]
        );
      }
    },
    76641: function (e, t, i) {
      'use strict';
      i.d(t, {
        x: function () {
          return r;
        },
      });
      var n = i(42049),
        a = i(752);
      function r() {
        return (0, a.Dv)(n.j);
      }
    },
    5329: function (e, t, i) {
      'use strict';
      i.d(t, {
        z: function () {
          return u;
        },
      });
      var n = i(52903),
        a = i(98036),
        r = i(77352),
        l = i(78365),
        o = i(6277),
        c = i(2784);
      i(24717);
      var d = '_1fm79vi0';
      let s = [
          ['#FF0000', '#FF00E5', '#FFAE73'],
          ['#FF5C00', '#FFC700', '#FFE073'],
          ['#FFDA16', '#FFFBA6', '#FFBE73'],
          ['#8CD317', '#FCFF5C', '#67CAE9'],
          ['#28E19F', '#89FFC6', '#39A880'],
          ['#35B7E0', '#77FFCE', '#5076FF'],
          ['#3D39FF', '#77BEFF', '#3502FF'],
          ['#BD08EB', '#755FFF', '#6967E4'],
        ],
        p = e => {
          let { name: t } = e,
            i = t || 'A',
            a = (0, c.useMemo)(() => {
              let e = i[0].toUpperCase().charCodeAt(0);
              return s[e % s.length];
            }, [i]),
            r = (0, c.useRef)(),
            [l, d, p] = a,
            [h, u] = (0, c.useState)(!1);
          return (0, n.BX)('div', {
            className: '_1fm79vi4',
            onMouseEnter: () => {
              r.current = setTimeout(() => {
                u(!0);
              }, 300);
            },
            onMouseLeave: () => {
              clearTimeout(r.current), u(!1);
            },
            children: [
              (0, n.tZ)('div', {
                className: '_1fm79vi9',
                style: { background: p },
              }),
              (0, n.tZ)('div', {
                className: (0, o.Z)('_1fm79vi5', { _1fm79vi6: h }),
                style: { background: d },
              }),
              (0, n.tZ)('div', {
                className: (0, o.Z)('_1fm79vi7', { _1fm79vi8: h }),
                style: { background: l },
              }),
            ],
          });
        },
        h = e => {
          let { size: t, workspace: i, ...c } = e,
            [s] = (0, r.r)(i),
            [h] = (0, l.H)(i);
          return (0, n.BX)(a.fC, {
            ...c,
            className: (0, o.Z)(d, c.className),
            style: { height: t, width: t },
            children: [
              (0, n.tZ)(a.Ee, { className: '_1fm79vi1', src: s, alt: h }),
              (0, n.tZ)(a.NY, { children: (0, n.tZ)(p, { name: h }) }),
            ],
          });
        },
        u = e => {
          let { size: t = 20, workspace: i, ...r } = e;
          return i && 'blockSuiteWorkspace' in i
            ? (0, n.tZ)(h, { ...r, size: t, workspace: i.blockSuiteWorkspace })
            : (0, n.tZ)(a.fC, {
                ...r,
                className: (0, o.Z)(d, r.className),
                style: { height: t, width: t },
                children: (0, n.tZ)(a.NY, {
                  children: (0, n.tZ)(p, { name: 'A' }),
                }),
              });
        };
    },
    49889: function (e, t, i) {
      'use strict';
      i.d(t, {
        TN: function () {
          return d;
        },
        ib: function () {
          return s;
        },
        vH: function () {
          return l;
        },
      });
      var n,
        a,
        r,
        l,
        o = i(30195);
      o.z.object({
        blob_usage: o.z.object({
          usage: o.z.number(),
          max_usage: o.z.number(),
        }),
      }),
        ((n = r || (r = {}))[(n.Private = 0)] = 'Private'),
        (n[(n.Normal = 1)] = 'Normal'),
        ((a = l || (l = {}))[(a.Read = 0)] = 'Read'),
        (a[(a.Write = 1)] = 'Write'),
        (a[(a.Admin = 10)] = 'Admin'),
        (a[(a.Owner = 99)] = 'Owner');
      let c = o.z.object({
          id: o.z.string(),
          name: o.z.string(),
          email: o.z.string(),
          avatar_url: o.z.string(),
          created_at: o.z.number(),
        }),
        d = o.z.object({
          id: o.z.string(),
          type: o.z.nativeEnum(r),
          public: o.z.boolean(),
          permission: o.z.nativeEnum(l),
        }),
        s = o.z.object({
          ...d.shape,
          permission: o.z.undefined(),
          owner: c,
          member_count: o.z.number(),
        });
      o.z.object({
        id: o.z.string(),
        public: o.z.boolean(),
        type: o.z.nativeEnum(r),
        created_at: o.z.number(),
      });
    },
    77352: function (e, t, i) {
      'use strict';
      i.d(t, {
        r: function () {
          return l;
        },
      });
      var n = i(13246),
        a = i(2784),
        r = i(3255);
      function l(e) {
        let [t, i] = (0, a.useState)(() => e.meta.avatar);
        t !== e.meta.avatar && i(e.meta.avatar);
        let { data: l, mutate: o } = (0, r.ZP)(t, {
            fetcher: async t => {
              (0, n.kP)(e);
              let i = await e.blobs,
                a = await i.get(t);
              return a ? URL.createObjectURL(a) : null;
            },
            suspense: !0,
            fallbackData: null,
          }),
          c = (0, a.useCallback)(
            async t => {
              (0, n.kP)(e);
              let i = new Blob([t], { type: t.type }),
                a = await e.blobs,
                r = await a.set(i);
              e.meta.setAvatar(r), await o(r);
            },
            [e, o]
          );
        return (
          (0, a.useEffect)(() => {
            if (e) {
              let t = e.meta.commonFieldsUpdated.on(() => {
                i(e.meta.avatar);
              });
              return () => {
                t.dispose();
              };
            }
          }, [e]),
          [null != l ? l : null, c]
        );
      }
    },
    78365: function (e, t, i) {
      'use strict';
      i.d(t, {
        H: function () {
          return d;
        },
      });
      var n = i(96893),
        a = i(13246),
        r = i(65058),
        l = i(752);
      let o = new WeakMap(),
        c = (0, r.cn)(n.e6, () => {
          console.warn('you cannot set the name of an null workspace.'),
            console.warn('this is a bug in the code.');
        });
      function d(e) {
        let t;
        if (e) {
          if (o.has(e)) (t = o.get(e)), (0, a.kP)(t);
          else {
            var i;
            let a = (0, r.cn)(
                null !== (i = e.meta.name) && void 0 !== i ? i : n.e6
              ),
              l = (0, r.cn)(
                e => e(a),
                (t, i, n) => {
                  e.meta.setName(n), i(a, n);
                }
              );
            (a.onMount = t => {
              let i = e.meta.commonFieldsUpdated.on(() => {
                var i;
                t(null !== (i = e.meta.name) && void 0 !== i ? i : '');
              });
              return () => {
                i.dispose();
              };
            }),
              o.set(e, l),
              (t = l);
          }
        } else t = c;
        return (0, l.KO)(t);
      }
    },
    24717: function () {},
    11173: function () {},
    98036: function (e, t, i) {
      'use strict';
      i.d(t, {
        Ee: function () {
          return x;
        },
        NY: function () {
          return b;
        },
        fC: function () {
          return g;
        },
      });
      var n = i(7896),
        a = i(2784),
        r = i(92211),
        l = i(27757),
        o = i(61644),
        c = i(72714);
      let d = 'Avatar',
        [s, p] = (0, r.b)(d),
        [h, u] = s(d),
        f = (0, a.forwardRef)((e, t) => {
          let { __scopeAvatar: i, ...r } = e,
            [l, o] = (0, a.useState)('idle');
          return (0, a.createElement)(
            h,
            { scope: i, imageLoadingStatus: l, onImageLoadingStatusChange: o },
            (0, a.createElement)(c.WV.span, (0, n.Z)({}, r, { ref: t }))
          );
        }),
        m = (0, a.forwardRef)((e, t) => {
          let {
              __scopeAvatar: i,
              src: r,
              onLoadingStatusChange: d = () => {},
              ...s
            } = e,
            p = u('AvatarImage', i),
            h = (function (e) {
              let [t, i] = (0, a.useState)('idle');
              return (
                (0, a.useEffect)(() => {
                  if (!e) {
                    i('error');
                    return;
                  }
                  let t = !0,
                    n = new window.Image(),
                    a = e => () => {
                      t && i(e);
                    };
                  return (
                    i('loading'),
                    (n.onload = a('loaded')),
                    (n.onerror = a('error')),
                    (n.src = e),
                    () => {
                      t = !1;
                    }
                  );
                }, [e]),
                t
              );
            })(r),
            f = (0, l.W)(e => {
              d(e), p.onImageLoadingStatusChange(e);
            });
          return (
            (0, o.b)(() => {
              'idle' !== h && f(h);
            }, [h, f]),
            'loaded' === h
              ? (0, a.createElement)(
                  c.WV.img,
                  (0, n.Z)({}, s, { ref: t, src: r })
                )
              : null
          );
        }),
        v = (0, a.forwardRef)((e, t) => {
          let { __scopeAvatar: i, delayMs: r, ...l } = e,
            o = u('AvatarFallback', i),
            [d, s] = (0, a.useState)(void 0 === r);
          return (
            (0, a.useEffect)(() => {
              if (void 0 !== r) {
                let e = window.setTimeout(() => s(!0), r);
                return () => window.clearTimeout(e);
              }
            }, [r]),
            d && 'loaded' !== o.imageLoadingStatus
              ? (0, a.createElement)(c.WV.span, (0, n.Z)({}, l, { ref: t }))
              : null
          );
        }),
        g = f,
        x = m,
        b = v;
    },
  },
]);
//# sourceMappingURL=939.a28c43788e870da0.js.map
