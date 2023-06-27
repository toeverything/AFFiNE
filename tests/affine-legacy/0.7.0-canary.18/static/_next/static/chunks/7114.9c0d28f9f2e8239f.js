'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [7114, 2513],
  {
    32513: function (e, t, r) {
      r.r(t),
        r.d(t, {
          QuickSearchModal: function () {
            return q;
          },
          default: function () {
            return A;
          },
        });
      var n = r(52903),
        i = r(37565),
        o = r(96893),
        a = r(72013),
        l = r(26546),
        c = r(2784),
        s = r(33027),
        d = r(31921),
        h = r(13246),
        p = r(36054),
        u = r(31747);
      let f = (0, i.zo)('div')(() => ({
        minHeight: '290px',
        maxHeight: '70vh',
        width: '100%',
        overflow: 'auto',
        marginBottom: '10px',
        ...(0, i.j2)('flex-start', 'flex-start'),
        flexDirection: 'column',
        color: 'var(--affine-text-primary-color)',
        transition: 'all 0.15s',
        letterSpacing: '0.06em',
        '[cmdk-group]': { width: '100%' },
        '[cmdk-group-heading]': {
          ...(0, i.j2)('start', 'center'),
          margin: '0 16px',
          height: '36px',
          lineHeight: '22px',
          fontSize: 'var(--affine-font-sm)',
          color: 'var(--affine-text-secondary-color)',
        },
        '[cmdk-item]': { margin: '0 4px' },
        '[aria-selected="true"]': {
          transition: 'all 0.15s',
          borderRadius: '4px',
          color: 'var(--affine-primary-color)',
          backgroundColor: 'var(--affine-hover-color)',
          padding: '0 2px',
        },
      }));
      (0, i.zo)('div')(() => ({
        ...(0, i.j2)('center', 'start'),
        flexDirection: 'column',
        padding: '10px 10px 10px 0',
        fontSize: 'var(--affine-font-base)',
        strong: { fontWeight: '500', marginBottom: '10px' },
      }));
      let g = (0, i.zo)('div')(() => ({
          width: '612px',
          ...(0, i.j2)('center', 'center'),
          flexDirection: 'column',
          padding: '0 16px',
          fontSize: 'var(--affine-font-sm)',
          lineHeight: '22px',
          color: 'var(--affine-text-secondary-color)',
          span: {
            ...(0, i.j2)('flex-start', 'center'),
            width: '100%',
            fontWeight: '400',
            height: '36px',
          },
          img: { marginTop: '10px' },
        })),
        m = (0, i.zo)('div')(() => ({
          ...(0, i.j2)('space-between', 'center'),
          input: {
            width: '492px',
            height: '22px',
            padding: '0 12px',
            fontSize: 'var(--affine-font-base)',
            ...(0, i.j2)('space-between', 'center'),
            letterSpacing: '0.06em',
            color: 'var(--affine-text-primary-color)',
            '::placeholder': { color: 'var(--affine-placeholder-color)' },
          },
        })),
        x = (0, i.zo)('div')(() => ({
          color: 'var(--affine-placeholder-color)',
          fontSize: 'var(--affine-font-sm)',
          whiteSpace: 'nowrap',
        })),
        v = (0, i.zo)('label')(() => ({
          width: '20px',
          height: '20px',
          color: 'var(--affine-icon-color)',
          fontSize: '20px',
        })),
        k = (0, i.zo)('div')(() => ({
          height: '36px',
          margin: '12px 16px 0px 16px',
          ...(0, i.j2)('space-between', 'center'),
        })),
        w = (0, i.zo)('div')(() => ({
          width: 'auto',
          height: '0',
          margin: '6px 16px',
          borderTop: '0.5px solid var(--affine-border-color)',
        })),
        Z = (0, i.zo)('div')(() => ({
          fontSize: 'inherit',
          lineHeight: '22px',
          marginBottom: '8px',
          textAlign: 'center',
          color: 'var(--affine-text-primary-color)',
          ...(0, i.j2)('center', 'center'),
          transition: 'all .15s',
          '[cmdk-item]': { margin: '0 4px' },
          '[aria-selected="true"]': {
            transition: 'all 0.15s',
            borderRadius: '4px',
            color: 'var(--affine-primary-color)',
            backgroundColor: 'var(--affine-hover-color)',
            'span,svg': { transition: 'all 0.15s', transform: 'scale(1.02)' },
          },
        })),
        S = (0, i.zo)('button')(() => ({
          width: '600px',
          height: '32px',
          fontSize: 'var(--affine-font-base)',
          lineHeight: '22px',
          textAlign: 'center',
          ...(0, i.j2)('center', 'center'),
          color: 'inherit',
          borderRadius: '4px',
          transition: 'background .15s, color .15s',
          '>svg': { fontSize: '20px', marginRight: '12px' },
        })),
        y = (0, i.zo)('button')(() => ({
          width: '100%',
          height: '32px',
          fontSize: 'inherit',
          color: 'inherit',
          padding: '0 12px',
          borderRadius: '4px',
          transition: 'all .15s',
          ...(0, i.j2)('flex-start', 'center'),
          span: { ...(0, i.vS)(1) },
          '> svg': { fontSize: '20px', marginRight: '12px' },
        })),
        b = e => {
          let { query: t, onClose: r, blockSuiteWorkspace: i, router: o } = e,
            { createPage: f } = (0, p.S)(i),
            g = (0, a.X)(),
            { jumpToPage: m } = (0, u.$)(o),
            x = t.length > 20 ? t.slice(0, 20) + '...' : t;
          return (0, n.tZ)(l.mY.Item, {
            'data-testid': 'quick-search-add-new-page',
            onSelect: (0, c.useCallback)(() => {
              let e = (0, h.x0)(),
                n = f(e);
              (0, h.Y8)(n.id, e), (0, s.E)(n);
              let o = n.getBlockByFlavour('affine:page')[0];
              o ? o.title.insert(t, 0) : console.warn('No page block found'),
                i.setPageMeta(n.id, { title: t }),
                r(),
                m(i.id, n.id).catch(e => {
                  console.error(e);
                });
            }, [i, f, m, r, t]),
            children: (0, n.BX)(S, {
              children: [
                (0, n.tZ)(d.PlusIcon, {}),
                t
                  ? (0, n.tZ)('span', {
                      children: g['New Keyword Page']({ query: x }),
                    })
                  : (0, n.tZ)('span', { children: g['New Page']() }),
              ],
            }),
          });
        };
      var z = r(91013),
        B = r(38421),
        P = r.n(B),
        I = r(5632);
      let X = e => {
        let { query: t, loading: r, onClose: i, blockSuiteWorkspace: o } = e,
          [s, h] = (0, c.useState)(new Map()),
          p = (0, I.useRouter)(),
          u = (0, z.r)(o),
          f = (0, a.X)();
        (0, c.useEffect)(() => {
          h(o.search(t));
        }, [o, t, h]);
        let m = (0, c.useMemo)(() => [...s.values()], [s]),
          x = (0, c.useMemo)(
            () => u.filter(e => m.indexOf(e.id) > -1 && !e.trash),
            [m, u]
          );
        return r
          ? null
          : (0, n.tZ)(n.HY, {
              children: t
                ? x.length
                  ? (0, n.tZ)(l.mY.Group, {
                      heading: f['Find results']({
                        number: ''.concat(x.length),
                      }),
                      children: x.map(e =>
                        (0, n.tZ)(
                          l.mY.Item,
                          {
                            onSelect: () => {
                              p
                                .push(
                                  '/public-workspace/'
                                    .concat(p.query.workspaceId, '/')
                                    .concat(e.id)
                                )
                                .catch(e => console.error(e)),
                                i();
                            },
                            value: e.id,
                            children: (0, n.BX)(y, {
                              children: [
                                'edgeless' === e.mode
                                  ? (0, n.tZ)(d.EdgelessIcon, {})
                                  : (0, n.tZ)(d.PageIcon, {}),
                                (0, n.tZ)('span', { children: e.title }),
                              ],
                            }),
                          },
                          e.id
                        )
                      ),
                    })
                  : (0, n.BX)(g, {
                      children: [
                        (0, n.tZ)('span', { children: f['Find 0 result']() }),
                        (0, n.tZ)(P(), {
                          src: '/imgs/no-result.svg',
                          alt: 'no result',
                          width: 200,
                          height: 200,
                        }),
                      ],
                    })
                : (0, n.tZ)(n.HY, {}),
            });
      };
      var Y = r(752),
        C = r(74090),
        E = r(84610);
      let M = e => {
          let t = (0, a.X)();
          return (0, c.useMemo)(
            () => [
              {
                title: t['All pages'](),
                href: E.d5.all(e),
                icon: d.FolderIcon,
              },
              {
                title: t['Workspace Settings'](),
                href: E.d5.setting(e),
                icon: d.SettingsIcon,
              },
              {
                title: t.Trash(),
                href: E.d5.trash(e),
                icon: d.DeleteTemporarilyIcon,
              },
            ],
            [e, t]
          );
        },
        H = e => {
          let {
            query: t,
            blockSuiteWorkspace: r,
            setShowCreatePage: i,
            router: s,
            onClose: f,
          } = e;
          (0, p.S)(r);
          let m = (0, z.r)(r);
          (0, h.kP)(r.id);
          let x = M(r.id),
            v = (0, Y.Dv)(C.qJ),
            k = (0, a.X)(),
            { jumpToPage: w } = (0, u.$)(s),
            Z = r.search(t),
            S = [...Z.values()],
            b = m.filter(e => S.indexOf(e.id) > -1 && !e.trash),
            B = v.filter(e => {
              let t = m.find(t => e.id === t.id);
              return !!t && !0 !== t.trash;
            });
          return ((0, c.useEffect)(() => {
            i(!b.length);
          }, [b.length, i]),
          t)
            ? b.length
              ? (0, n.tZ)(l.mY.Group, {
                  heading: k['Find results']({ number: ''.concat(b.length) }),
                  children: b.map(e =>
                    (0, n.tZ)(
                      l.mY.Item,
                      {
                        onSelect: () => {
                          f(),
                            (0, h.kP)(r.id),
                            w(r.id, e.id).catch(e => console.error(e));
                        },
                        value: e.id,
                        children: (0, n.BX)(y, {
                          children: [
                            'edgeless' === e.mode
                              ? (0, n.tZ)(d.EdgelessIcon, {})
                              : (0, n.tZ)(d.PageIcon, {}),
                            (0, n.tZ)('span', { children: e.title || o.e6 }),
                          ],
                        }),
                      },
                      e.id
                    )
                  ),
                })
              : (0, n.BX)(g, {
                  children: [
                    (0, n.tZ)('span', { children: k['Find 0 result']() }),
                    (0, n.tZ)(P(), {
                      src: '/imgs/no-result.svg',
                      alt: 'no result',
                      width: 200,
                      height: 200,
                    }),
                  ],
                })
            : (0, n.BX)(n.HY, {
                children: [
                  B.length > 0 &&
                    (0, n.tZ)(l.mY.Group, {
                      heading: k.Recent(),
                      children: B.map(e => {
                        let t = m.find(t => e.id === t.id);
                        return (
                          (0, h.kP)(t),
                          (0, n.tZ)(
                            l.mY.Item,
                            {
                              value: t.id,
                              onSelect: () => {
                                f(), w(r.id, t.id).catch(console.error);
                              },
                              children: (0, n.BX)(y, {
                                children: [
                                  'edgeless' === e.mode
                                    ? (0, n.tZ)(d.EdgelessIcon, {})
                                    : (0, n.tZ)(d.PageIcon, {}),
                                  (0, n.tZ)('span', {
                                    children: t.title || o.e6,
                                  }),
                                ],
                              }),
                            },
                            t.id
                          )
                        );
                      }),
                    }),
                  (0, n.tZ)(l.mY.Group, {
                    heading: k['Jump to'](),
                    children: x.map(e =>
                      (0, n.tZ)(
                        l.mY.Item,
                        {
                          value: e.title,
                          onSelect: () => {
                            f(), s.push(e.href).catch(console.error);
                          },
                          children: (0, n.BX)(y, {
                            children: [
                              (0, n.tZ)(e.icon, {}),
                              (0, n.tZ)('span', { children: e.title }),
                            ],
                          }),
                        },
                        e.title
                      )
                    ),
                  }),
                ],
              });
        },
        j = (0, c.forwardRef)((e, t) =>
          (0, n.BX)(m, {
            children: [
              (0, n.tZ)(v, {
                htmlFor: ':r5:',
                children: (0, n.tZ)(d.SearchIcon, {}),
              }),
              (0, n.tZ)(l.mY.Input, { ref: t, ...e }),
            ],
          })
        );
      j.displayName = 'SearchInput';
      let R = () => o.OB.isBrowser && o.OB.isMacOs,
        q = e => {
          let { open: t, setOpen: r, router: o, blockSuiteWorkspace: s } = e,
            d = (0, a.X)(),
            h = (0, c.useRef)(null),
            [p, u] = (0, c.useTransition)(),
            [g, m] = (0, c.useState)(''),
            v = (0, c.useCallback)(e => {
              u(() => {
                m(e);
              });
            }, []),
            S = (0, c.useMemo)(
              () => o.pathname.startsWith('/public-workspace'),
              [o]
            ),
            [y, z] = (0, c.useState)(''),
            [B, P] = (0, c.useState)(!0),
            I = (0, c.useCallback)(() => S && 0 === g.length, [S, g.length]),
            Y = (0, c.useCallback)(() => {
              r(!1);
            }, [r]);
          return (
            (0, c.useEffect)(() => {
              let e = e => {
                if (
                  ('k' === e.key && e.metaKey) ||
                  ('k' === e.key && e.ctrlKey)
                ) {
                  let n = window.getSelection();
                  if (
                    (e.preventDefault(),
                    v(''),
                    null == n ? void 0 : n.toString())
                  ) {
                    r(!1);
                    return;
                  }
                  r(!t);
                }
              };
              return (
                document.addEventListener('keydown', e, { capture: !0 }),
                () =>
                  document.removeEventListener('keydown', e, { capture: !0 })
              );
            }, [t, o, r, v]),
            (0, c.useEffect)(() => {
              t &&
                requestAnimationFrame(() => {
                  let e = h.current;
                  null == e || e.focus();
                });
            }, [t]),
            (0, n.tZ)(i.u_, {
              open: t,
              onClose: Y,
              wrapperPosition: ['top', 'center'],
              'data-testid': 'quickSearch',
              children: (0, n.tZ)(i.AB, {
                width: 608,
                style: {
                  maxHeight: '80vh',
                  minHeight: I() ? '72px' : '412px',
                  top: '80px',
                  overflow: 'hidden',
                },
                children: (0, n.BX)(l.mY, {
                  shouldFilter: !1,
                  onKeyDown: e => {
                    ('ArrowDown' === e.key ||
                      'ArrowUp' === e.key ||
                      'ArrowLeft' === e.key ||
                      'ArrowRight' === e.key) &&
                      e.stopPropagation();
                  },
                  children: [
                    (0, n.BX)(k, {
                      children: [
                        (0, n.tZ)(j, {
                          ref: h,
                          onValueChange: e => {
                            v(e);
                          },
                          onKeyDown: e => {
                            if (e.nativeEvent.isComposing) {
                              e.stopPropagation();
                              return;
                            }
                          },
                          placeholder: S
                            ? d['Quick search placeholder2']({ workspace: y })
                            : d['Quick search placeholder'](),
                        }),
                        (0, n.tZ)(x, { children: R() ? '⌘ + K' : 'Ctrl + K' }),
                      ],
                    }),
                    (0, n.tZ)(w, { style: { display: I() ? 'none' : '' } }),
                    (0, n.BX)(l.mY.List, {
                      children: [
                        (0, n.tZ)(f, {
                          style: { display: I() ? 'none' : '' },
                          children: S
                            ? (0, n.tZ)(X, {
                                blockSuiteWorkspace: s,
                                query: g,
                                loading: p,
                                onClose: Y,
                                setPublishWorkspaceName: z,
                                'data-testid': 'published-search-results',
                              })
                            : (0, n.tZ)(H, {
                                query: g,
                                onClose: Y,
                                router: o,
                                blockSuiteWorkspace: s,
                                setShowCreatePage: P,
                              }),
                        }),
                        S
                          ? null
                          : B
                          ? (0, n.BX)(n.HY, {
                              children: [
                                (0, n.tZ)(w, {}),
                                (0, n.tZ)(Z, {
                                  children: (0, n.tZ)(b, {
                                    query: g,
                                    onClose: Y,
                                    blockSuiteWorkspace: s,
                                    router: o,
                                  }),
                                }),
                              ],
                            })
                          : null,
                      ],
                    }),
                  ],
                }),
              }),
            })
          );
        };
      var A = q;
    },
    36054: function (e, t, r) {
      r.d(t, {
        S: function () {
          return a;
        },
      });
      var n = r(13246),
        i = r(61222),
        o = r(2784);
      function a(e) {
        return (0, o.useMemo)(
          () => ({
            createPage: t => ((0, n.kP)(e), e.createPage({ id: t })),
            markMilestone: async t => {
              (0, n.kP)(e);
              let r = e.doc;
              await (0, i.J6)(e.id, r, t);
            },
            revertMilestone: async t => {
              (0, n.kP)(e);
              let r = e.doc,
                o = await (0, i.gu)(e.id);
              if (!o) throw Error('no milestone');
              let a = o[t];
              a && (0, i.dE)(r, a, () => 'Map');
            },
            listMilestone: async () => ((0, n.kP)(e), await (0, i.gu)(e.id)),
          }),
          [e]
        );
      }
    },
  },
]);
//# sourceMappingURL=7114.9c0d28f9f2e8239f.js.map
