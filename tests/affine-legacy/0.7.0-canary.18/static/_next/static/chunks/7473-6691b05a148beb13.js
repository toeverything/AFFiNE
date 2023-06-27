(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [7473],
  {
    54734: function (e, t, n) {
      'use strict';
      n.d(t, {
        Cd: function () {
          return k;
        },
        FJ: function () {
          return m;
        },
        Fs: function () {
          return i;
        },
        Lt: function () {
          return p;
        },
        Mj: function () {
          return u;
        },
        SI: function () {
          return r;
        },
        Sl: function () {
          return o;
        },
        TN: function () {
          return h;
        },
        ZC: function () {
          return s;
        },
        jW: function () {
          return f;
        },
        ko: function () {
          return l;
        },
        oT: function () {
          return c;
        },
        rc: function () {
          return x;
        },
        s1: function () {
          return a;
        },
        y7: function () {
          return d;
        },
      }),
        n(90293);
      var r = 'y008zfb',
        i = 'y008zf1',
        o = 'y008zf0',
        a = 'y008zf5',
        l = 'y008zff',
        c = 'y008zfg',
        s = 'y008zfc',
        d = 'y008zfa',
        u = 'y008zf9',
        p = 'y008zf8',
        h = 'y008zf3',
        f = 'y008zf2',
        m = 'y008zf4',
        x = 'y008zfi',
        k = 'y008zfh';
    },
    6359: function (e, t, n) {
      'use strict';
      n.d(t, {
        Iw: function () {
          return c;
        },
        oC: function () {
          return l;
        },
      });
      var r = n(90301),
        i = n(65058),
        o = n(87809);
      let a = (0, o.O4)('helper-guide', {
        quickSearchTips: !0,
        changeLog: !0,
        onBoarding: !0,
        downloadClientTip: !0,
      });
      (0, i.cn)(
        e => {
          let t = e(r.Hw),
            n = e(a);
          return n.quickSearchTips && !1 === t;
        },
        (e, t, n) => {
          t(a, e => ({ ...e, quickSearchTips: n }));
        }
      ),
        (0, i.cn)(
          e => e(a).changeLog,
          (e, t, n) => {
            t(a, e => ({ ...e, changeLog: n }));
          }
        );
      let l = (0, i.cn)(
          e => e(a).onBoarding,
          (e, t, n) => {
            t(a, e => ({ ...e, onBoarding: n }));
          }
        ),
        c = (0, i.cn)(
          e => e(a).downloadClientTip,
          (e, t, n) => {
            t(a, e => ({ ...e, downloadClientTip: n }));
          }
        );
    },
    30530: function (e, t, n) {
      'use strict';
      n.d(t, {
        C: function () {
          return o;
        },
      });
      var r = n(65058);
      let i = (0, r.cn)('editor'),
        o = (0, r.cn)(
          e => e(i),
          (e, t, n) => {
            t(i, e => {
              let t = ('function' != typeof n ? () => n : n)(e);
              if ('editor' === t) return t;
              if ('editor' !== t.first)
                throw Error(
                  'The first element of the layout should be editor.'
                );
              if (t.splitPercentage && t.splitPercentage < 70)
                throw Error('The split percentage should be greater than 70.');
              return t;
            });
          }
        );
    },
    53113: function (e, t, n) {
      'use strict';
      n.d(t, {
        A: function () {
          return h;
        },
      });
      var r = n(52903),
        i = n(37565),
        o = n(72013),
        a = n(31921),
        l = n(76641);
      let c = (0, i.zo)('div')({
          height: '44px',
          display: 'flex',
          flexDirection: 'row-reverse',
          paddingRight: '10px',
          paddingTop: '10px',
          flexShrink: 0,
        }),
        s = (0, i.zo)('div')({ textAlign: 'center' }),
        d = (0, i.zo)('h1')({
          fontSize: '20px',
          lineHeight: '28px',
          fontWeight: 600,
          textAlign: 'center',
        }),
        u = (0, i.zo)('div')(() => ({
          userSelect: 'none',
          width: '400px',
          margin: 'auto',
          marginBottom: '32px',
          marginTop: '12px',
        })),
        p = (0, i.zo)(i.zx)(() => ({
          width: '284px',
          display: 'block',
          margin: 'auto',
          marginTop: '16px',
        })),
        h = e => {
          let { open: t, onClose: n, onConform: h } = e,
            f = (0, o.X)(),
            m = (0, l.x)();
          return (0, r.tZ)(i.u_, {
            open: t,
            onClose: n,
            'data-testid': 'enable-affine-cloud-modal',
            children: (0, r.BX)(i.AB, {
              width: 560,
              height: 292,
              children: [
                (0, r.tZ)(c, {
                  children: (0, r.tZ)(i.hU, {
                    onClick: n,
                    children: (0, r.tZ)(a.CloseIcon, {}),
                  }),
                }),
                (0, r.BX)(s, {
                  children: [
                    (0, r.BX)(d, {
                      children: [f['Enable AFFiNE Cloud'](), '?'],
                    }),
                    (0, r.tZ)(u, {
                      children: f['Enable AFFiNE Cloud Description'](),
                    }),
                    (0, r.BX)('div', {
                      children: [
                        (0, r.tZ)(p, {
                          'data-testid': 'confirm-enable-cloud-button',
                          shape: 'round',
                          type: 'primary',
                          onClick: h,
                          children: m ? f.Enable() : f['Sign in and Enable'](),
                        }),
                        (0, r.tZ)(p, {
                          shape: 'round',
                          onClick: () => {
                            n();
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
    44087: function (e, t, n) {
      'use strict';
      n.d(t, {
        h: function () {
          return eT;
        },
      });
      var r,
        i,
        o = n(52903),
        a = n(31921);
      n(58331);
      var l = 'o7g8v26';
      let c = e => {
        let { show: t, onClose: n, message: r } = e;
        return t
          ? (0, o.BX)('div', {
              className: 'o7g8v21',
              children: [
                r,
                (0, o.tZ)('div', {
                  className: 'o7g8v22',
                  onClick: n,
                  children: (0, o.tZ)(a.CloseIcon, { className: 'o7g8v23' }),
                }),
              ],
            })
          : null;
      };
      var s = n(44502);
      let d = e => {
        let { onClose: t } = e;
        return (0, o.BX)('div', {
          className: 'o7g8v24',
          'data-testid': 'download-client-tip',
          children: [
            (0, o.BX)('div', {
              className: 'o7g8v25',
              children: [
                (0, o.tZ)(a.AffineLogoSimCBlue1_1Icon, { className: l }),
                (0, o.tZ)('div', {
                  className: 'o7g8v28',
                  children: (0, o.BX)(s.cC, {
                    i18nKey: 'com.affine.banner.content',
                    children: [
                      'Enjoying the demo?',
                      (0, o.tZ)('a', {
                        className: 'o7g8v29',
                        href: 'https://affine.pro/download',
                        target: '_blank',
                        rel: 'noreferrer',
                        children: 'Download the AFFiNE Client',
                      }),
                      'for the full experience.',
                    ],
                  }),
                }),
              ],
            }),
            (0, o.tZ)('div', {
              className: 'o7g8v27',
              onClick: t,
              'data-testid': 'download-client-tip-close-button',
              children: (0, o.tZ)(a.CloseIcon, { className: l }),
            }),
          ],
        });
      };
      var u = n(90301),
        p = n(87244),
        h = n(91337),
        f = n(1347),
        m = n(752),
        x = n(2784),
        k = n(6359),
        g = n(30530),
        v = n(14762),
        b = n(96893);
      let y = () => {
        let [e, t] = (0, m.KO)(k.Iw),
          n = (0, x.useCallback)(() => {
            t(!1);
          }, [t]);
        return !e || b.OB.isDesktop
          ? (0, o.tZ)(o.HY, {})
          : (0, o.tZ)(d, { onClose: n });
      };
      var w = n(37565),
        Z = n(5632),
        C = n(31747);
      let A = () => {
          let e = (0, Z.useRouter)(),
            t = e.query.pageId,
            n = e.query.workspaceId,
            { jumpToPage: r } = (0, C.$)(e),
            i = (0, x.useCallback)(() => {
              n &&
                t &&
                r(n, t).catch(e => {
                  console.error(e);
                });
            }, [r, t, n]);
          return (0, o.tZ)('div', {
            children: (0, o.tZ)(B, {
              onClick: () => i(),
              children: 'Edit Page',
            }),
          });
        },
        B = (0, w.zo)(
          w.Av,
          {}
        )(() => ({
          border: '1px solid var(--affine-primary-color)',
          color: 'var(--affine-primary-color)',
          width: '100%',
          borderRadius: '8px',
          whiteSpace: 'nowrap',
          padding: '0 16px',
          ...(0, w.j2)('center', 'center'),
        }));
      var S = n(8183),
        E = n(72013),
        P = n(13246),
        z = n(91013),
        D = n(74090),
        I = n(64813),
        F = n(14192);
      function G() {
        return (0, m.KO)(F.dv);
      }
      var N = n(96450),
        T = n(53137),
        M = n(38617),
        O = n(73235),
        L = n(64372),
        R = n.n(L);
      function V() {
        let e = (0, O._)(['', '']);
        return (
          (V = function () {
            return e;
          }),
          e
        );
      }
      function X() {
        let e = (0, O._)(['\n          ', ' ', 'ms forwards\n        ']);
        return (
          (X = function () {
            return e;
          }),
          e
        );
      }
      function W() {
        let e = (0, O._)(['', '']);
        return (
          (W = function () {
            return e;
          }),
          e
        );
      }
      function j() {
        let e = (0, O._)(['\n          ', ' ', 'ms forwards\n        ']);
        return (
          (j = function () {
            return e;
          }),
          e
        );
      }
      function Y() {
        let e = (0, O._)([
          '\n    ',
          '\n    width:',
          ' ;\n    height: ',
          ' ;\n    position: absolute;\n    left: 0;\n    cursor: pointer;\n    color: ',
          '\n    top: ',
          ';\n    background-color: ',
          ';\n    animation: ',
          ';\n    animation-direction: ',
          ';\n    //svg {\n    //  width: 24px;\n    //  height: 24px;\n    //},\n  ',
        ]);
        return (
          (Y = function () {
            return e;
          }),
          e
        );
      }
      let _ = (0, w.zo)('div')(() => ({
          width: '100%',
          height: '48px',
          borderRadius: '6px',
          backgroundColor: 'transparent',
          color: 'var(--affine-icon-color)',
          fontSize: '16px',
          ...(0, w.j2)('flex-start', 'center'),
          padding: '0 14px',
        })),
        U = (0, w.zo)('div')(() => ({
          height: '32px',
          border: '1px solid var(--affine-border-color)',
          borderRadius: '4px',
          cursor: 'pointer',
          ...(0, w.j2)('space-evenly', 'center'),
          flexGrow: 1,
          marginLeft: '12px',
        })),
        H = (0, w.zo)('button')(e => {
          let { active: t } = e;
          return {
            padding: '0 8px',
            height: '100%',
            flex: 1,
            cursor: 'pointer',
            color: t
              ? 'var(--affine-primary-color)'
              : 'var(--affine-icon-color)',
            whiteSpace: 'nowrap',
          };
        }),
        q = (0, w.zo)('div')(() => ({
          width: '1px',
          height: '100%',
          borderLeft: '1px solid var(--affine-border-color)',
        })),
        K = (0, w.zo)('button')(e => {
          let { inMenu: t } = e;
          return {
            width: t ? '20px' : '32px',
            height: t ? '20px' : '32px',
            borderRadius: '6px',
            overflow: 'hidden',
            WebkitAppRegion: 'no-drag',
            backgroundColor: 'transparent',
            position: 'relative',
            color: 'var(--affine-icon-color)',
            fontSize: t ? '20px' : '24px',
          };
        }),
        $ = (0, w.zo)('div')(e => {
          let { active: t, isHover: n, inMenu: r } = e,
            i = (0, L.toString)(
              R()({ top: '0' }, { top: '-100%' }, { preset: 'gentle' })
            ),
            o = (0, L.toString)(
              R()({ top: '100%' }, { top: '0' }, { preset: 'gentle' })
            ),
            a = (0, L.toString)(
              R()({ top: '-100%' }, { top: '0' }, { preset: 'gentle' })
            ),
            l = (0, L.toString)(
              R()({ top: '0' }, { top: '100%' }, { preset: 'gentle' })
            ),
            c = t
              ? {
                  color: 'var(--affine-icon-color)',
                  top: '0',
                  animation: (0, w.iv)(X(), (0, w.F4)(V(), n ? i : a), 400),
                  animationDirection: n ? 'normal' : 'alternate',
                }
              : {
                  top: '100%',
                  color: 'var(--affine-primary-color)',
                  backgroundColor: 'var(--affine-hover-color)',
                  animation: (0, w.iv)(j(), (0, w.F4)(W(), n ? o : l), 400),
                  animationDirection: n ? 'normal' : 'alternate',
                };
          return (0, w.iv)(
            Y(),
            (0, w.iv)((0, w.j2)('center', 'center')),
            r ? '20px' : '32px',
            r ? '20px' : '32px',
            c.color,
            c.top,
            c.backgroundColor,
            c.animation,
            c.animationDirection
          );
        }),
        J = () => {
          let { setTheme: e, resolvedTheme: t, theme: n } = (0, M.F)(),
            r = (0, E.X)();
          return (0, o.BX)(_, {
            children: [
              (0, o.BX)(K, {
                'data-testid': 'change-theme-container',
                inMenu: !0,
                children: [
                  (0, o.tZ)($, {
                    active: 'light' === t,
                    inMenu: !0,
                    children: (0, o.tZ)(a.LightModeIcon, {}),
                  }),
                  (0, o.tZ)($, {
                    active: 'dark' === t,
                    inMenu: !0,
                    children: (0, o.tZ)(a.DarkModeIcon, {}),
                  }),
                ],
              }),
              (0, o.BX)(U, {
                children: [
                  (0, o.tZ)(H, {
                    'data-testid': 'change-theme-light',
                    active: 'light' === n,
                    onClick: () => {
                      e('light');
                    },
                    children: r.light(),
                  }),
                  (0, o.tZ)(q, {}),
                  (0, o.tZ)(H, {
                    'data-testid': 'change-theme-dark',
                    active: 'dark' === n,
                    onClick: () => {
                      e('dark');
                    },
                    children: r.dark(),
                  }),
                  (0, o.tZ)(q, {}),
                  (0, o.tZ)(H, {
                    active: 'system' === n,
                    onClick: () => {
                      e('system');
                    },
                    children: r.system(),
                  }),
                ],
              }),
            ],
          });
        };
      var Q = n(54734);
      let ee = () => {
          let e = (0, s.M1)(),
            t = (0, x.useCallback)(
              t => {
                e.changeLanguage(t).catch(e => {
                  console.error(e);
                });
              },
              [e]
            );
          return (0, o.tZ)(o.HY, {
            children: s.lE.map(e =>
              (0, o.tZ)(
                en,
                {
                  title: e.name,
                  onClick: () => {
                    t(e.tag);
                  },
                  children: e.originalName,
                },
                e.name
              )
            ),
          });
        },
        et = () => {
          let e = (0, s.M1)(),
            t = s.lE.find(t => t.tag === e.language);
          return (0, o.BX)(er, {
            children: [
              (0, o.tZ)(ei, { children: (0, o.tZ)(a.LanguageIcon, {}) }),
              (0, o.tZ)(eo, {
                children: (0, o.tZ)(w.v2, {
                  content: (0, o.tZ)(ee, {}),
                  placement: 'bottom',
                  trigger: 'click',
                  disablePortal: !0,
                  children: (0, o.tZ)(ea, {
                    icon: (0, o.tZ)(el, {
                      children: (0, o.tZ)(a.ArrowDownSmallIcon, {}),
                    }),
                    iconPosition: 'end',
                    noBorder: !0,
                    'data-testid': 'language-menu-button',
                    children: (0, o.tZ)(ec, {
                      children: null == t ? void 0 : t.originalName,
                    }),
                  }),
                }),
              }),
            ],
          });
        },
        en = (0, w.zo)(w.sN)(() => ({
          width: '132px',
          height: '38px',
          fontSize: 'var(--affine-font-base)',
          textTransform: 'capitalize',
        })),
        er = (0, w.zo)('div')(() => ({
          width: '100%',
          height: '48px',
          backgroundColor: 'transparent',
          ...(0, w.j2)('flex-start', 'center'),
          padding: '0 14px',
        })),
        ei = (0, w.zo)('div')(() => ({
          width: '20px',
          height: '20px',
          color: 'var(--affine-icon-color)',
          fontSize: '20px',
          ...(0, w.j2)('flex-start', 'center'),
        })),
        eo = (0, w.zo)('div')(() => ({
          width: '100%',
          height: '32px',
          borderRadius: '4px',
          border: '1px solid var(--affine-border-color)',
          backgroundColor: 'transparent',
          ...(0, w.j2)('flex-start', 'center'),
          marginLeft: '12px',
        })),
        ea = (0, w.zo)(w.zx)(() => ({
          width: '100%',
          height: '32px',
          borderRadius: '4px',
          backgroundColor: 'transparent',
          ...(0, w.j2)('space-between', 'center'),
          textTransform: 'capitalize',
          padding: '0',
        })),
        el = (0, w.zo)('div')(() => ({
          height: '32px',
          borderLeft: '1px solid var(--affine-border-color)',
          backgroundColor: 'transparent',
          ...(0, w.j2)('flex-start', 'center'),
          padding: '4px 6px',
          fontSize: '24px',
        })),
        ec = (0, w.zo)('div')(() => ({
          marginLeft: '12px',
          color: 'var(--affine-text-color)',
        })),
        es = () => {
          let e = (0, o.BX)('div', {
            onClick: e => {
              e.stopPropagation();
            },
            children: [(0, o.tZ)(J, {}), (0, o.tZ)(et, {})],
          });
          return (0, o.tZ)(w.A0, {
            alignItems: 'center',
            justifyContent: 'center',
            children: (0, o.tZ)(w.v2, {
              content: e,
              placement: 'bottom',
              disablePortal: !0,
              trigger: 'click',
              children: (0, o.tZ)(w.hU, {
                'data-testid': 'editor-option-menu',
                iconSize: [24, 24],
                children: (0, o.tZ)(a.MoreVerticalIcon, {}),
              }),
            }),
          });
        },
        ed = () => {
          var e, t;
          let n = (0, E.X)(),
            [r] = (0, N.$)(),
            [i] = G();
          (0, P.kP)(r), (0, P.kP)(i);
          let l = r.blockSuiteWorkspace,
            c = (0, z.r)(l).find(e => e.id === i);
          (0, P.kP)(c);
          let [s, d] = (0, m.KO)((0, D.G9)(i)),
            u =
              null !== (e = null == s ? void 0 : s.mode) && void 0 !== e
                ? e
                : 'page',
            p = null !== (t = c.favorite) && void 0 !== t && t,
            { setPageMeta: h } = (0, z.J)(l),
            [f, k] = (0, x.useState)(!1),
            { removeToTrash: g } = (0, I.a)(l),
            v = (0, o.BX)(o.HY, {
              children: [
                (0, o.BX)(o.HY, {
                  children: [
                    (0, o.tZ)(w.sN, {
                      'data-testid': 'editor-option-menu-favorite',
                      onClick: () => {
                        h(i, { favorite: !p }),
                          (0, T.A)(
                            p
                              ? n['Removed from Favorites']()
                              : n['Added to Favorites']()
                          );
                      },
                      icon: p
                        ? (0, o.tZ)(a.FavoritedIcon, {
                            style: { color: 'var(--affine-primary-color)' },
                          })
                        : (0, o.tZ)(a.FavoriteIcon, {}),
                      children: p
                        ? n['Remove from favorites']()
                        : n['Add to Favorites'](),
                    }),
                    (0, o.BX)(w.sN, {
                      icon:
                        'page' === u
                          ? (0, o.tZ)(a.EdgelessIcon, {})
                          : (0, o.tZ)(a.PageIcon, {}),
                      'data-testid': 'editor-option-menu-edgeless',
                      onClick: () => {
                        d(e => ({
                          mode:
                            (null == e ? void 0 : e.mode) === 'page'
                              ? 'edgeless'
                              : 'page',
                        }));
                      },
                      children: [
                        n['Convert to '](),
                        'page' === u ? n.Edgeless() : n.Page(),
                      ],
                    }),
                    (0, o.tZ)(S.D7, {}),
                    (0, o.tZ)(S.Rf, {
                      'data-testid': 'editor-option-menu-delete',
                      onItemClick: () => {
                        k(!0);
                      },
                    }),
                    (0, o.tZ)('div', {
                      className: Q.oT,
                      children: (0, o.tZ)('div', { className: Q.ko }),
                    }),
                  ],
                }),
                (0, o.BX)('div', {
                  onClick: e => {
                    e.stopPropagation();
                  },
                  children: [(0, o.tZ)(J, {}), (0, o.tZ)(et, {})],
                }),
              ],
            });
          return (0, o.tZ)(o.HY, {
            children: (0, o.BX)(w.A0, {
              alignItems: 'center',
              justifyContent: 'center',
              children: [
                (0, o.tZ)(w.v2, {
                  content: v,
                  placement: 'bottom-end',
                  disablePortal: !0,
                  trigger: 'click',
                  children: (0, o.tZ)(w.hU, {
                    'data-testid': 'editor-option-menu',
                    iconSize: [24, 24],
                    children: (0, o.tZ)(a.MoreVerticalIcon, {}),
                  }),
                }),
                (0, o.tZ)(S.Rf.ConfirmModal, {
                  open: f,
                  title: c.title,
                  onConfirm: () => {
                    g(c.id), (0, T.A)(n['Moved to Trash']()), k(!1);
                  },
                  onCancel: () => {
                    k(!1);
                  },
                }),
              ],
            }),
          });
        },
        eu = () => {
          let e = (0, Z.useRouter)();
          return e.query.pageId ? (0, o.tZ)(ed, {}) : (0, o.tZ)(es, {});
        };
      var ep = n(94286),
        eh = n(57670),
        ef = n(67544),
        em = n(64581),
        ex = n(53113);
      let ek = e => {
          let t = (0, ef.b)(e.workspace),
            n = (0, C.$)((0, Z.useRouter)());
          return (0, o.tZ)(ep.ve, {
            workspace: e.workspace,
            currentPage: e.currentPage,
            onEnableAffineCloud: (0, x.useCallback)(async () => {
              throw new eh.Ym(
                'Affine workspace should not enable affine cloud again'
              );
            }, []),
            onOpenWorkspaceSettings: (0, x.useCallback)(
              async e => n.jumpToSubPath(e.id, h._0.SETTING),
              [n]
            ),
            togglePagePublic: (0, x.useCallback)(async (e, t) => {
              e.workspace.setPageMeta(e.id, { isPublic: t });
            }, []),
            toggleWorkspacePublish: (0, x.useCallback)(
              async (n, r) => {
                (0, P.Y8)(n.flavour, h.b8.AFFINE),
                  (0, P.Y8)(n.id, e.workspace.id),
                  await t(r);
              },
              [e.workspace.id, t]
            ),
          });
        },
        eg = e => {
          let t = (0, em.c)(),
            n = (0, C.$)((0, Z.useRouter)()),
            [r, i] = (0, x.useState)(!1);
          return (0, o.BX)(o.HY, {
            children: [
              (0, o.tZ)(ep.ve, {
                workspace: e.workspace,
                currentPage: e.currentPage,
                onEnableAffineCloud: (0, x.useCallback)(
                  async t => {
                    (0, P.Y8)(t.flavour, h.b8.LOCAL),
                      (0, P.Y8)(t.id, e.workspace.id),
                      i(!0);
                  },
                  [e.workspace.id]
                ),
                onOpenWorkspaceSettings: (0, x.useCallback)(
                  async e => {
                    await n.jumpToSubPath(e.id, h._0.SETTING);
                  },
                  [n]
                ),
                togglePagePublic: (0, x.useCallback)(async () => {
                  throw Error('unreachable');
                }, []),
                toggleWorkspacePublish: (0, x.useCallback)(
                  async t => {
                    (0, P.Y8)(t.flavour, h.b8.LOCAL),
                      (0, P.Y8)(t.id, e.workspace.id),
                      await n.jumpToSubPath(t.id, h._0.SETTING);
                  },
                  [n, e.workspace.id]
                ),
              }),
              (0, o.tZ)(ex.A, {
                open: r,
                onClose: () => {
                  i(!1);
                },
                onConform: async () => {
                  await t(h.b8.LOCAL, h.b8.AFFINE, e.workspace), i(!1);
                },
              }),
            ],
          });
        },
        ev = e => {
          if (!b.vc.enableLegacyCloud) return null;
          if (e.workspace.flavour === h.b8.AFFINE)
            return (0, o.tZ)(ek, { ...e });
          if (e.workspace.flavour === h.b8.LOCAL)
            return (0, o.tZ)(eg, { ...e });
          throw Error('unreachable');
        };
      var eb = n(22903),
        ey = n(78981),
        ew = n(72293);
      let eZ = (0, w.zo)('div')(() => ({
          width: '32px',
          height: '32px',
          marginRight: '12px',
          fontSize: '24px',
          color: 'var(--affine-icon-color)',
          WebkitAppRegion: 'no-drag',
          ...(0, w.j2)('center', 'center'),
        })),
        eC = e =>
          navigator.onLine
            ? 'local' === e.flavour
              ? 'local'
              : 'cloud'
            : 'offline',
        eA = () => {
          let [e] = (0, N.$)();
          (0, P.kP)(e);
          let t = (0, Z.useRouter)(),
            [n, r] = (0, x.useState)(eC(e)),
            [i, l] = (0, x.useState)(e);
          i !== e && (l(e), r(eC(e))),
            (0, x.useEffect)(() => {
              let t = () => {
                  r(eC(e));
                },
                n = () => {
                  r('offline');
                };
              return (
                window.addEventListener('online', t),
                window.addEventListener('offline', n),
                () => {
                  window.removeEventListener('online', t),
                    window.removeEventListener('offline', n);
                }
              );
            }, [e]);
          let [c, s] = (0, x.useState)(!1),
            d = (0, E.X)(),
            u = (0, ew.O)();
          return b.vc.enableLegacyCloud
            ? 'offline' === n
              ? (0, o.tZ)(w.u, {
                  content: d['Please make sure you are online'](),
                  placement: 'bottom-end',
                  children: (0, o.tZ)(eZ, {
                    children: (0, o.tZ)(a.NoNetworkIcon, {}),
                  }),
                })
              : 'local' === n
              ? (0, o.BX)(o.HY, {
                  children: [
                    (0, o.tZ)(w.u, {
                      content: d['Saved then enable AFFiNE Cloud'](),
                      placement: 'bottom-end',
                      children: (0, o.tZ)(w.hU, {
                        onClick: () => {
                          s(!0);
                        },
                        style: { marginRight: '12px' },
                        children: (0, o.tZ)(a.LocalWorkspaceIcon, {}),
                      }),
                    }),
                    (0, o.tZ)(ex.A, {
                      open: c,
                      onClose: () => {
                        s(!1);
                      },
                      onConform: async () => {
                        if (!(0, eb.Ut)()) {
                          let e = await ey.j.generateToken(eb.wD.Google);
                          e && (0, eb.rs)(e), t.reload();
                          return;
                        }
                        (0, P.Y8)(e.flavour, h.b8.LOCAL);
                        let n = await u(h.b8.LOCAL, h.b8.AFFINE, e);
                        await t.replace({
                          pathname: '/workspace/[workspaceId]/all',
                          query: { workspaceId: n },
                        }),
                          s(!1),
                          t.reload();
                      },
                    }),
                  ],
                })
              : (0, o.tZ)(w.u, {
                  content: d['Synced with AFFiNE Cloud'](),
                  placement: 'bottom-end',
                  children: (0, o.tZ)(eZ, {
                    children: (0, o.tZ)(a.CloudWorkspaceIcon, {}),
                  }),
                })
            : null;
        },
        eB = () => {
          let [e] = (0, N.$)(),
            [t] = G();
          (0, P.kP)(e), (0, P.kP)(t);
          let n = e.blockSuiteWorkspace,
            r = (0, z.r)(n).find(e => e.id === t);
          (0, P.kP)(r);
          let i = (0, E.X)(),
            a = (0, Z.useRouter)(),
            { restoreFromTrash: l } = (0, I.a)(n),
            [c, s] = (0, x.useState)(!1);
          return (0, o.BX)(o.HY, {
            children: [
              (0, o.tZ)(w.zx, {
                bold: !0,
                shape: 'round',
                style: { marginRight: '24px' },
                onClick: () => {
                  l(t);
                },
                children: i['Restore it'](),
              }),
              (0, o.tZ)(w.zx, {
                bold: !0,
                shape: 'round',
                type: 'danger',
                onClick: () => {
                  s(!0);
                },
                children: i['Delete permanently'](),
              }),
              (0, o.tZ)(w.I4, {
                title: i.TrashButtonGroupTitle(),
                content: i.TrashButtonGroupDescription(),
                confirmText: i.Delete(),
                confirmType: 'danger',
                open: c,
                onConfirm: () => {
                  a
                    .push({
                      pathname: '/workspace/[workspaceId]/all',
                      query: { workspaceId: e.id },
                    })
                    .catch(e => {
                      console.error(e);
                    }),
                    n.removePage(t);
                },
                onCancel: () => {
                  s(!1);
                },
                onClose: () => {
                  s(!1);
                },
              }),
            ],
          });
        };
      var eS = n(76641);
      let eE = (0, o.tZ)(w.sN, {
          'data-testid': 'editor-option-menu-favorite',
          icon: (0, o.tZ)(a.SignOutIcon, {}),
          children: 'Sign Out',
        }),
        eP = () => {
          let e = (0, eS.x)();
          return (0, o.tZ)(w.v2, {
            width: 276,
            content: eE,
            placement: 'bottom',
            disablePortal: !0,
            trigger: 'click',
            children: e
              ? (0, o.tZ)(ez, { size: 24, name: e.name, avatar: e.avatar_url })
              : (0, o.tZ)(ez, { size: 24 }),
          });
        },
        ez = (0, x.forwardRef)(function (e, t) {
          let n = e.size || 20,
            r = n + 'px';
          return (0,
          o.tZ)(o.HY, { children: e.avatar ? (0, o.tZ)('div', { style: { ...e.style, width: r, height: r, color: '#fff', borderRadius: '50%', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: (0, o.tZ)('picture', { children: (0, o.tZ)('img', { style: { width: r, height: r }, src: e.avatar, alt: '', referrerPolicy: 'no-referrer' }) }) }) : (0, o.tZ)('div', { style: { ...e.style, width: r, height: r, border: '1px solid #fff', color: '#fff', fontSize: Math.ceil(0.5 * n) + 'px', borderRadius: '50%', textAlign: 'center', lineHeight: n + 'px', display: 'inline-block', verticalAlign: 'middle' }, ref: t, children: e.name ? e.name.substring(0, 1) : (0, o.tZ)(a.AffineIcon, { fontSize: 24, color: '#5438FF' }) }) });
        }),
        eD = () =>
          !b.OB.isDesktop &&
          !!b.OB.isBrowser &&
          (b.OB.isChrome ? b.OB.chromeVersion < 102 : !b.OB.isMobile),
        eI = () => {
          let e = (0, E.X)(),
            [t, n] = (0, x.useState)(!1),
            [r, i] = (0, x.useState)(!1);
          return ((0, x.useEffect)(() => {
            n(b.OB.isBrowser && !b.OB.isChrome),
              i(b.OB.isBrowser && b.OB.isChrome && b.OB.chromeVersion < 102);
          }, []),
          t)
            ? (0, o.tZ)('span', {
                children: (0, o.BX)(s.cC, {
                  i18nKey: 'recommendBrowser',
                  children: [
                    'We recommend the ',
                    (0, o.tZ)('strong', { children: 'Chrome' }),
                    ' browser for optimal experience.',
                  ],
                }),
              })
            : r
            ? (0, o.tZ)('span', { children: e.upgradeBrowser() })
            : null;
        };
      ((r = i || (i = {})).EditorOptionMenu = 'editorOptionMenu'),
        (r.TrashButtonGroup = 'trashButtonGroup'),
        (r.SyncUser = 'syncUser'),
        (r.ShareMenu = 'shareMenu'),
        (r.EditPage = 'editPage'),
        (r.UserAvatar = 'userAvatar'),
        (r.WindowsAppControls = 'windowsAppControls');
      let eF = {
          [i.TrashButtonGroup]: {
            Component: eB,
            availableWhen: (e, t) => (null == t ? void 0 : t.meta.trash) === !0,
          },
          [i.SyncUser]: {
            Component: eA,
            availableWhen: (e, t, n) => {
              let { isPublic: r } = n;
              return !r;
            },
          },
          [i.ShareMenu]: {
            Component: ev,
            availableWhen: (e, t) => e.flavour !== h.b8.PUBLIC && !!t,
          },
          [i.EditPage]: {
            Component: A,
            availableWhen: (e, t, n) => {
              let { isPublic: r } = n;
              return r;
            },
          },
          [i.UserAvatar]: {
            Component: eP,
            availableWhen: (e, t, n) => {
              let { isPublic: r } = n;
              return r;
            },
          },
          [i.EditorOptionMenu]: {
            Component: eu,
            availableWhen: (e, t, n) => {
              let { isPublic: r } = n;
              return !r;
            },
          },
          [i.WindowsAppControls]: {
            Component: () => {
              let e = (0, x.useCallback)(() => {
                  var e;
                  null === (e = window.apis) ||
                    void 0 === e ||
                    e.ui.handleMinimizeApp().catch(e => {
                      console.error(e);
                    });
                }, []),
                t = (0, x.useCallback)(() => {
                  var e;
                  null === (e = window.apis) ||
                    void 0 === e ||
                    e.ui.handleMaximizeApp().catch(e => {
                      console.error(e);
                    });
                }, []),
                n = (0, x.useCallback)(() => {
                  var e;
                  null === (e = window.apis) ||
                    void 0 === e ||
                    e.ui.handleCloseApp().catch(e => {
                      console.error(e);
                    });
                }, []);
              return (0, o.BX)('div', {
                className: Q.Cd,
                children: [
                  (0, o.tZ)('button', {
                    'data-type': 'minimize',
                    className: Q.rc,
                    onClick: e,
                    children: (0, o.tZ)(a.MinusIcon, {}),
                  }),
                  (0, o.tZ)('button', {
                    'data-type': 'maximize',
                    className: Q.rc,
                    onClick: t,
                    children: (0, o.tZ)(a.RoundedRectangleIcon, {}),
                  }),
                  (0, o.tZ)('button', {
                    'data-type': 'close',
                    className: Q.rc,
                    onClick: n,
                    children: (0, o.tZ)(a.CloseIcon, {}),
                  }),
                ],
              });
            },
            availableWhen: () => environment.isDesktop && environment.isWindows,
          },
        },
        eG = (0, x.memo)(function (e) {
          let { headerItem: t } = e;
          return (0, o.tZ)('div', { children: t({ contentLayoutAtom: g.C }) });
        }),
        eN = () => {
          let e = (0, m.Dv)(f.an),
            t = (0, x.useMemo)(() => Object.values(e), [e]);
          return (0, o.tZ)('div', {
            children: t
              .filter(e => null != e.uiAdapter.headerItem)
              .map(e => {
                let t = e.uiAdapter.headerItem;
                return (0, o.tZ)(eG, { headerItem: t }, e.definition.id);
              }),
          });
        },
        eT = (0, x.forwardRef)((e, t) => {
          let [n, r] = (0, x.useState)(!1),
            [i, a] = (0, x.useState)(!1),
            [l] = (0, m.KO)(k.Iw);
          (0, x.useEffect)(() => {
            r(eD()), a(l);
          }, [l]);
          let s = (0, m.Dv)(u.Hw),
            d = (0, m.Dv)(u.Ne),
            h = (0, v.D)();
          return (0, o.BX)('div', {
            className: Q.Sl,
            ref: t,
            'data-has-warning': n,
            'data-open': s,
            'data-sidebar-floating': d,
            children: [
              i
                ? (0, o.tZ)(y, {})
                : (0, o.tZ)(c, {
                    show: n,
                    message: (0, o.tZ)(eI, {}),
                    onClose: () => {
                      r(!1);
                    },
                  }),
              (0, o.BX)('div', {
                className: Q.Fs,
                'data-has-warning': n,
                'data-testid': 'editor-header-items',
                'data-is-edgeless': 'edgeless' === h,
                children: [
                  (0, o.BX)('div', {
                    style: { display: 'flex', alignItems: 'center' },
                    children: [!s && (0, o.tZ)(p.q, {}), e.leftSlot],
                  }),
                  e.children,
                  (0, o.BX)('div', {
                    className: Q.s1,
                    children: [
                      (0, o.tZ)(eN, {}),
                      (0, x.useMemo)(
                        () =>
                          Object.entries(eF).map(t => {
                            let [n, { availableWhen: r, Component: i }] = t;
                            return r(e.workspace, e.currentPage, {
                              isPublic: e.isPublic,
                            })
                              ? (0, o.tZ)(
                                  i,
                                  {
                                    workspace: e.workspace,
                                    currentPage: e.currentPage,
                                    isPublic: e.isPublic,
                                  },
                                  n
                                )
                              : null;
                          }),
                        [e]
                      ),
                    ],
                  }),
                ],
              }),
            ],
          });
        });
      eT.displayName = 'Header';
    },
    67473: function (e, t, n) {
      'use strict';
      n.d(t, {
        R: function () {
          return w;
        },
      });
      var r = n(52903),
        i = n(13246),
        o = n(91013),
        a = n(752),
        l = n(2784),
        c = n(74090),
        s = n(29294),
        d = n(72013),
        u = n(53137),
        p = n(37565);
      let h = (0, p.zo)('div')(e => {
          let { switchLeft: t, showAlone: n } = e;
          return {
            width: n ? '40px' : '78px',
            height: '32px',
            background: n
              ? 'transparent'
              : 'var(--affine-background-secondary-color)',
            borderRadius: '12px',
            ...(0, p.j2)('space-between', 'center'),
            padding: '0 8px',
            position: 'relative',
            '::after': {
              content: '""',
              display: n ? 'none' : 'block',
              width: '24px',
              height: '24px',
              background: 'var(--affine-background-primary-color)',
              boxShadow: 'var(--affine-shadow-1)',
              borderRadius: '8px',
              zIndex: 1,
              position: 'absolute',
              transform: 'translateX('.concat(t ? '0' : '38px', ')'),
              transition: 'all .15s',
            },
          };
        }),
        f = (0, p.zo)('button')(e => {
          let { active: t = !1, hide: n = !1 } = e;
          return {
            width: '24px',
            height: '24px',
            borderRadius: '8px',
            WebkitAppRegion: 'no-drag',
            boxShadow: t ? 'var(--affine-shadow-1)' : 'none',
            color: t
              ? 'var(--affine-primary-color)'
              : 'var(--affine-icon-color)',
            display: n ? 'none' : 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            zIndex: 2,
            fontSize: '20px',
            path: { fill: 'currentColor' },
          };
        });
      var m = n(39686);
      let x = e => {
          let { active: t, hide: n, children: i, ...o } = e,
            [a, c] = (0, l.useState)(!1);
          return (0, r.tZ)(f, {
            hide: n,
            active: t,
            onMouseEnter: () => {
              c(!0);
            },
            onMouseLeave: () => {
              c(!1);
            },
            ...o,
            children: (0, l.cloneElement)(i, {
              isStopped: !a,
              speed: 5,
              width: 20,
              height: 20,
            }),
          });
        },
        k = e =>
          (0, r.tZ)(x, {
            ...e,
            children: (0, r.tZ)(m.a, {
              options: {
                loop: !1,
                autoplay: !1,
                animationData: n(23896),
                rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
              },
            }),
          }),
        g = e =>
          (0, r.tZ)(x, {
            ...e,
            children: (0, r.tZ)(m.a, {
              options: {
                loop: !1,
                autoplay: !1,
                animationData: n(38681),
                rendererSettings: { preserveAspectRatio: 'xMidYMid slice' },
              },
            }),
          }),
        v = e => {
          var t;
          let { style: n, blockSuiteWorkspace: l, pageId: s } = e,
            [p, f] = (0, a.KO)((0, c.G9)(s)),
            m =
              null !== (t = null == p ? void 0 : p.mode) && void 0 !== t
                ? t
                : 'page',
            x = (0, o.r)(l).find(e => e.id === s),
            v = (0, d.X)();
          (0, i.kP)(x);
          let { trash: b } = x;
          return (0, r.BX)(h, {
            style: n,
            switchLeft: 'page' === m,
            showAlone: b,
            children: [
              (0, r.tZ)(k, {
                'data-testid': 'switch-page-mode-button',
                active: 'page' === m,
                hide: b && 'page' !== m,
                onClick: () => {
                  f(
                    e => (
                      (null == e ? void 0 : e.mode) !== 'page' &&
                        (0, u.A)(v['com.affine.pageMode']()),
                      { ...e, mode: 'page' }
                    )
                  );
                },
              }),
              (0, r.tZ)(g, {
                'data-testid': 'switch-edgeless-mode-button',
                active: 'edgeless' === m,
                hide: b && 'edgeless' !== m,
                onClick: () => {
                  f(
                    e => (
                      (null == e ? void 0 : e.mode) !== 'edgeless' &&
                        (0, u.A)(v['com.affine.pageMode']()),
                      { ...e, mode: 'edgeless' }
                    )
                  );
                },
              }),
            ],
          });
        };
      var b = n(44087),
        y = n(54734);
      let w = e => {
        let { workspace: t, currentPage: n, children: d, isPublic: u } = e,
          p = (0, a.b9)(c.A8),
          h = (0, o.r)(t.blockSuiteWorkspace).find(
            e => e.id === (null == n ? void 0 : n.id)
          ),
          f = (0, l.useRef)(null);
        (0, i.kP)(h);
        let m = h.title;
        return (0, r.BX)(b.h, {
          ref: f,
          ...e,
          children: [
            d,
            !u &&
              n &&
              (0, r.tZ)('div', {
                className: y.jW,
                children: (0, r.BX)('div', {
                  className: y.FJ,
                  children: [
                    (0, r.tZ)('div', {
                      className: y.Lt,
                      children: (0, r.tZ)(v, {
                        blockSuiteWorkspace: t.blockSuiteWorkspace,
                        pageId: n.id,
                        style: { marginRight: '12px' },
                      }),
                    }),
                    (0, r.tZ)('div', {
                      className: y.TN,
                      children: m || 'Untitled',
                    }),
                    (0, r.tZ)('div', {
                      className: y.Mj,
                      children: (0, r.tZ)(s.G, {
                        onClick: () => {
                          p(!0);
                        },
                      }),
                    }),
                  ],
                }),
              }),
          ],
        });
      };
      w.displayName = 'BlockSuiteEditorHeader';
    },
    29294: function (e, t, n) {
      'use strict';
      n.d(t, {
        G: function () {
          return l;
        },
      });
      var r = n(52903),
        i = n(37565),
        o = n(31921);
      let a = (0, i.zo)(i.hU)(() => ({
          svg: { transition: 'transform 0.15s ease-in-out' },
          ':hover': {
            svg: { transform: 'translateY(3px)' },
            '::after': { background: 'var(--affine-background-primary-color)' },
          },
        })),
        l = e => {
          let { onClick: t, ...n } = e;
          return (0, r.tZ)(a, {
            'data-testid': 'header-quickSearchButton',
            ...n,
            onClick: e => {
              null == t || t(e);
            },
            children: (0, r.tZ)(o.ArrowDownSmallIcon, {}),
          });
        };
    },
    67544: function (e, t, n) {
      'use strict';
      n.d(t, {
        b: function () {
          return s;
        },
      });
      var r = n(78981),
        i = n(14192),
        o = n(1347),
        a = n(2784),
        l = n(3255),
        c = n(75489);
      function s(e) {
        let { mutate: t } = (0, l.ZP)(c.S.getWorkspaces);
        return (0, a.useCallback)(
          async n => {
            await r._.updateWorkspace({ id: e.id, public: n }),
              await t(c.S.getWorkspaces),
              o.Ux.set(i.nn, e => [...e]);
          },
          [t, e.id]
        );
      }
    },
    14762: function (e, t, n) {
      'use strict';
      n.d(t, {
        D: function () {
          return c;
        },
      });
      var r = n(14192),
        i = n(65058),
        o = n(752),
        a = n(74090);
      let l = (0, i.cn)(e => {
          var t, n;
          let i = e(r.dv);
          return i &&
            null !==
              (n =
                null === (t = e((0, a.G9)(i))) || void 0 === t
                  ? void 0
                  : t.mode) &&
            void 0 !== n
            ? n
            : 'page';
        }),
        c = () => (0, o.Dv)(l);
    },
    76641: function (e, t, n) {
      'use strict';
      n.d(t, {
        x: function () {
          return o;
        },
      });
      var r = n(42049),
        i = n(752);
      function o() {
        return (0, i.Dv)(r.j);
      }
    },
    96450: function (e, t, n) {
      'use strict';
      n.d(t, {
        $: function () {
          return l;
        },
      });
      var r = n(14192),
        i = n(752),
        o = n(2784),
        a = n(37956);
      function l() {
        let e = (0, i.Dv)(a.x),
          [, t] = (0, i.KO)(r.At),
          [, n] = (0, i.KO)(r.dv);
        return [
          e,
          (0, o.useCallback)(
            e => {
              e && localStorage.setItem('last_workspace_id', e), n(null), t(e);
            },
            [t, n]
          ),
        ];
      }
    },
    64581: function (e, t, n) {
      'use strict';
      n.d(t, {
        c: function () {
          return u;
        },
      });
      var r = n(91337),
        i = n(42049),
        o = n(22903),
        a = n(78981),
        l = n(14192),
        c = n(752),
        s = n(2784),
        d = n(72293);
      function u() {
        let e = (0, d.O)(),
          t = (0, c.b9)(i.j),
          n = (0, c.b9)(l.At);
        return (0, s.useCallback)(
          async (i, l, c) => {
            let s = l === r.b8.AFFINE && !(0, o.Ut)();
            if (s) {
              let e = await a.j.generateToken(o.wD.Google);
              e && ((0, o.rs)(e), t((0, o.X4)(e.token)), o.vJ.emit());
            }
            let d = await e(i, l, c);
            window.dispatchEvent(
              new CustomEvent('affine-workspace:transform', {
                detail: { from: i, to: l, oldId: c.id, newId: d },
              })
            ),
              n(d);
          },
          [t, n, e]
        );
      }
    },
    72293: function (e, t, n) {
      'use strict';
      n.d(t, {
        O: function () {
          return l;
        },
      });
      var r = n(14192),
        i = n(752),
        o = n(2784),
        a = n(66844);
      function l() {
        let e = (0, i.b9)(r.nn);
        return (0, o.useCallback)(
          async (t, n, r) => {
            let i = await a.WorkspaceAdapters[n].CRUD.create(
              r.blockSuiteWorkspace
            );
            return (
              await a.WorkspaceAdapters[t].CRUD.delete(r),
              e(e => {
                let t = e.findIndex(e => e.id === r.id);
                return e.splice(t, 1, { id: i, flavour: n }), [...e];
              }),
              i
            );
          },
          [e]
        );
      }
    },
    58331: function () {},
    90293: function () {},
    38681: function (e) {
      'use strict';
      e.exports = JSON.parse(
        '{"v":"5.9.0","fr":29.9700012207031,"ip":0,"op":60.0000024438501,"w":500,"h":500,"nm":"edgeless-hover","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Layer 3/paper-edgeless-icons Outlines","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[250,250,0],"ix":2,"l":2},"a":{"a":0,"k":[183.5,183.5,0],"ix":1,"l":2},"s":{"a":0,"k":[100,100,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,-5.604],[0,0],[-5.614,0],[0,0],[0,5.605],[0,0],[5.615,0]],"o":[[-5.614,0],[0,0],[0,5.605],[0,0],[5.615,0],[0,0],[0,-5.604],[0,0]],"v":[[-30.525,-40.7],[-40.699,-30.525],[-40.699,30.524],[-30.525,40.699],[30.525,40.699],[40.699,30.524],[40.699,-30.525],[30.525,-40.7]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ind":1,"ty":"sh","ix":2,"ks":{"a":0,"k":{"i":[[22.447,0],[0,0],[0,22.437],[0,0],[-22.446,0],[0,0],[0,-22.437],[0,0]],"o":[[0,0],[-22.446,0],[0,0],[0,-22.437],[0,0],[22.447,0],[0,0],[0,22.437]],"v":[[30.525,71.224],[-30.525,71.224],[-71.225,30.524],[-71.225,-30.525],[-30.525,-71.225],[30.525,-71.225],[71.224,-30.525],[71.224,30.524]],"c":true},"ix":2},"nm":"Path 2","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"mm","mm":1,"nm":"Merge Paths 1","mn":"ADBE Vector Filter - Merge","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[295.322,295.323],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[315.322,315.323],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[295.322,295.323]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 1","np":4,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[8.426,0],[0,8.426],[0,0],[-8.426,0],[0,-8.426],[0,0]],"o":[[-8.426,0],[0,0],[0,-8.426],[8.426,0],[0,0],[0,8.426]],"v":[[0,30.525],[-15.262,15.263],[-15.262,-15.262],[0,-30.525],[15.262,-15.262],[15.262,15.263]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[76.561,183.399],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[56.561,183.399],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[76.561,183.399]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 2","np":2,"cix":2,"bm":0,"ix":2,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[8.426,0],[0,8.426],[5.395,13.057],[9.956,9.956],[13.037,5.406],[14.1,0],[0,8.426],[-8.426,0],[-16.753,-6.955],[-12.808,-12.818],[-6.955,-16.773],[0,-18.105]],"o":[[-8.426,0],[0,-14.09],[-5.416,-13.016],[-9.957,-9.956],[-13.026,-5.385],[-8.426,0],[0,-8.426],[18.134,0],[16.763,6.936],[12.788,12.778],[6.936,16.773],[0,8.426]],"v":[[61.049,76.312],[45.788,61.05],[37.66,20.151],[14.497,-14.487],[-20.161,-37.659],[-61.049,-45.787],[-76.311,-61.049],[-61.049,-76.312],[-8.475,-65.839],[36.09,-36.069],[65.858,8.486],[76.311,61.05]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[254.447,112.349],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[274.447,92.349],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[254.447,112.349]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 3","np":2,"cix":2,"bm":0,"ix":3,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[22.446,0],[0,-22.437],[-22.446,0],[0,22.436]],"o":[[-22.446,0],[0,22.436],[22.446,0],[0,-22.437]],"v":[[0,-40.7],[-40.7,0],[0,40.699],[40.7,0]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ind":1,"ty":"sh","ix":2,"ks":{"a":0,"k":{"i":[[39.269,0],[0,39.268],[-39.269,0],[0,-39.269]],"o":[[-39.269,0],[0,-39.269],[39.269,0],[0,39.268]],"v":[[0,71.224],[-71.224,0],[0,-71.225],[71.224,0]],"c":true},"ix":2},"nm":"Path 2","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"mm","mm":1,"nm":"Merge Paths 1","mn":"ADBE Vector Filter - Merge","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[71.474,295.323],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[51.474,315.323],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[71.474,295.323]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 4","np":4,"cix":2,"bm":0,"ix":4,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[22.446,0],[0,-22.437],[-22.446,0],[0,22.436]],"o":[[-22.446,0],[0,22.436],[22.446,0],[0,-22.437]],"v":[[0,-40.7],[-40.7,0.001],[0,40.7],[40.7,0.001]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ind":1,"ty":"sh","ix":2,"ks":{"a":0,"k":{"i":[[39.269,0],[0,39.268],[-39.269,0],[0,-39.269]],"o":[[-39.269,0],[0,-39.269],[39.269,0],[0,39.268]],"v":[[0,71.225],[-71.224,0.001],[0,-71.225],[71.224,0.001]],"c":true},"ix":2},"nm":"Path 2","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"mm","mm":1,"nm":"Merge Paths 1","mn":"ADBE Vector Filter - Merge","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[71.474,71.475],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[51.474,51.475],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[71.474,71.475]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 5","np":4,"cix":2,"bm":0,"ix":5,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":60.0000024438501,"st":0,"bm":0}],"markers":[]}'
      );
    },
    23896: function (e) {
      'use strict';
      e.exports = JSON.parse(
        '{"v":"5.9.0","fr":29.9700012207031,"ip":0,"op":60.0000024438501,"w":500,"h":500,"nm":"page-hover","ddd":0,"assets":[],"layers":[{"ddd":0,"ind":1,"ty":4,"nm":"Layer 1/paper-edgeless-icons Outlines","sr":1,"ks":{"o":{"a":0,"k":100,"ix":11},"r":{"a":0,"k":0,"ix":10},"p":{"a":0,"k":[250,250,0],"ix":2,"l":2},"a":{"a":0,"k":[183,183,0],"ix":1,"l":2},"s":{"a":0,"k":[100,100,100],"ix":6,"l":2}},"ao":0,"shapes":[{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[22.557,0],[0,0],[0,8.639],[-8.64,0],[0,0],[-2.201,1.651],[0,9.536],[0,0],[-8.64,0],[0,-8.64],[0,0],[16.892,-16.892]],"o":[[0,0],[-8.64,0],[0,-8.64],[0,0],[17.442,0],[10.412,-10.453],[0,0],[0,-8.64],[8.639,0],[0,0],[0,18.155],[-9.027,8.987]],"v":[[46.947,182.579],[-109.545,182.579],[-125.194,166.93],[-109.545,151.281],[46.947,151.281],[78.001,145.086],[93.895,114.766],[93.895,-166.93],[109.545,-182.579],[125.194,-166.93],[125.194,114.766],[99.743,167.561]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[240.204,182.829],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[260.204,202.829],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[240.204,182.829]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 1","np":2,"cix":2,"bm":0,"ix":1,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[8.64,0],[0,8.639],[0,0],[-16.892,16.882],[-22.598,0],[0,0],[0,-8.64],[8.639,0],[0,0],[2.171,-1.65],[0,-9.546],[0,0]],"o":[[-8.64,0],[0,0],[0,-18.145],[8.976,-8.986],[0,0],[8.639,0],[0,8.64],[0,0],[-17.453,0],[-10.443,10.484],[0,0],[0,8.639]],"v":[[-109.545,182.579],[-125.194,166.93],[-125.194,-114.766],[-99.743,-167.562],[-46.948,-182.579],[109.545,-182.579],[125.194,-166.93],[109.545,-151.281],[-46.948,-151.281],[-77.972,-145.107],[-93.896,-114.766],[-93.896,166.93]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[125.443,182.829],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[105.443,162.829],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[125.443,182.829]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 2","np":2,"cix":2,"bm":0,"ix":2,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[8.64,0],[0,0],[0,8.639],[-8.64,0],[0,0],[0,-8.64]],"o":[[0,0],[-8.64,0],[0,-8.64],[0,0],[8.64,0],[0,8.639]],"v":[[67.813,15.649],[-67.813,15.649],[-83.463,0],[-67.813,-15.649],[67.813,-15.649],[83.462,0]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[182.824,271.513],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[212.824,281.513],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[182.824,271.513]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 3","np":2,"cix":2,"bm":0,"ix":3,"mn":"ADBE Vector Group","hd":false},{"ty":"gr","it":[{"ind":0,"ty":"sh","ix":1,"ks":{"a":0,"k":{"i":[[0,0],[0,-5.757],[0,0],[-5.756,0],[0,0],[0,5.756],[0,0],[5.747,0]],"o":[[-5.756,0],[0,0],[0,5.756],[0,0],[5.747,0],[0,0],[0,-5.757],[0,0]],"v":[[-41.732,-31.294],[-52.165,-20.86],[-52.165,20.87],[-41.732,31.303],[41.73,31.303],[52.163,20.87],[52.163,-20.86],[41.73,-31.294]],"c":true},"ix":2},"nm":"Path 1","mn":"ADBE Vector Shape - Group","hd":false},{"ind":1,"ty":"sh","ix":2,"ks":{"a":0,"k":{"i":[[23.006,0],[0,0],[0,23.015],[0,0],[-23.015,0],[0,0],[0,-23.016],[0,0]],"o":[[0,0],[-23.015,0],[0,0],[0,-23.016],[0,0],[23.006,0],[0,0],[0,23.015]],"v":[[41.73,62.592],[-41.732,62.592],[-83.463,20.87],[-83.463,-20.86],[-41.732,-62.592],[41.73,-62.592],[83.463,-20.86],[83.463,20.87]],"c":true},"ix":2},"nm":"Path 2","mn":"ADBE Vector Shape - Group","hd":false},{"ty":"mm","mm":1,"nm":"Merge Paths 1","mn":"ADBE Vector Filter - Merge","hd":false},{"ty":"fl","c":{"a":0,"k":[0.466666696586,0.458823559331,0.490196108351,1],"ix":4},"o":{"a":0,"k":100,"ix":5},"r":1,"bm":0,"nm":"Fill 1","mn":"ADBE Vector Graphic - Fill","hd":false},{"ty":"tr","p":{"a":1,"k":[{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":0,"s":[182.824,141.088],"to":[0,0],"ti":[0,0]},{"i":{"x":0.833,"y":0.833},"o":{"x":0.167,"y":0.167},"t":30,"s":[152.824,131.088],"to":[0,0],"ti":[0,0]},{"t":58.0000023623884,"s":[182.824,141.088]}],"ix":2},"a":{"a":0,"k":[0,0],"ix":1},"s":{"a":0,"k":[100,100],"ix":3},"r":{"a":0,"k":0,"ix":6},"o":{"a":0,"k":100,"ix":7},"sk":{"a":0,"k":0,"ix":4},"sa":{"a":0,"k":0,"ix":5},"nm":"Transform"}],"nm":"Group 4","np":4,"cix":2,"bm":0,"ix":4,"mn":"ADBE Vector Group","hd":false}],"ip":0,"op":60.0000024438501,"st":0,"bm":0}],"markers":[]}'
      );
    },
  },
]);
//# sourceMappingURL=7473-6691b05a148beb13.js.map
