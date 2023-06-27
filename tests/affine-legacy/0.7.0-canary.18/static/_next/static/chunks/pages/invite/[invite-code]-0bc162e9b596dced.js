(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [364],
  {
    74697: function (e, t, n) {
      'use strict';
      var r = n(2784),
        c = n(21399),
        i = n(52322);
      t.Z = function (e) {
        let { children: t, defer: n = !1, fallback: o = null } = e,
          [u, a] = r.useState(!1);
        return (
          (0, c.Z)(() => {
            n || a(!0);
          }, [n]),
          r.useEffect(() => {
            n && a(!0);
          }, [n]),
          (0, i.jsx)(r.Fragment, { children: u ? t : o })
        );
      };
    },
    35362: function (e, t, n) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/invite/[invite-code]',
        function () {
          return n(54702);
        },
      ]);
    },
    31747: function (e, t, n) {
      'use strict';
      n.d(t, {
        $: function () {
          return o;
        },
        t: function () {
          return c;
        },
      });
      var r,
        c,
        i = n(2784);
      function o(e) {
        let t = (0, i.useCallback)(
            function (t, n) {
              let r =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : c.PUSH;
              return e[r]({
                pathname: '/workspace/[workspaceId]/[pageId]',
                query: { workspaceId: t, pageId: n },
              });
            },
            [e]
          ),
          n = (0, i.useCallback)(
            function (t, n) {
              let r =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : c.PUSH;
              return e[r]({
                pathname: '/public-workspace/[workspaceId]/[pageId]',
                query: { workspaceId: t, pageId: n },
              });
            },
            [e]
          ),
          r = (0, i.useCallback)(
            function (t, n) {
              let r =
                arguments.length > 2 && void 0 !== arguments[2]
                  ? arguments[2]
                  : c.PUSH;
              return e[r]({
                pathname: '/workspace/[workspaceId]/'.concat(n),
                query: { workspaceId: t },
              });
            },
            [e]
          ),
          o = (0, i.useCallback)(
            (r, c) => {
              let i = 'public-workspace' === e.pathname.split('/')[1];
              return i ? n(r, c) : t(r, c);
            },
            [t, n, e.pathname]
          );
        return {
          jumpToPage: t,
          jumpToPublicWorkspacePage: n,
          jumpToSubPath: r,
          openPage: o,
        };
      }
      ((r = c || (c = {})).REPLACE = 'replace'), (r.PUSH = 'push');
    },
    54702: function (e, t, n) {
      'use strict';
      n.r(t);
      var r = n(52903),
        c = n(37565),
        i = n(91337),
        o = n(31921),
        u = n(74697),
        a = n(38421),
        l = n.n(a),
        s = n(5632),
        p = n(2784),
        d = n(3255),
        h = n(75489),
        f = n(41142),
        k = n(31747);
      let v = () => {
        let e = (0, s.useRouter)(),
          { jumpToSubPath: t } = (0, k.$)(e),
          { data: n } = (0, d.ZP)(
            'string' == typeof e.query.invite_code
              ? [h.S.acceptInvite, e.query.invite_code]
              : null
          );
        if (null == n ? void 0 : n.accepted)
          return (0, r.BX)(g, {
            children: [
              (0, r.tZ)(l(), {
                src: '/imgs/invite-success.svg',
                alt: '',
                layout: 'fill',
                width: 300,
                height: 300,
              }),
              (0, r.tZ)(c.zx, {
                type: 'primary',
                shape: 'round',
                onClick: () => {
                  t(n.workspace_id, i._0.ALL, k.t.REPLACE).catch(e =>
                    console.error(e)
                  );
                },
                children: 'Go to Workspace',
              }),
              (0, r.BX)('p', {
                children: [
                  (0, r.tZ)(o.SucessfulDuotoneIcon, {}),
                  'Successfully joined',
                ],
              }),
            ],
          });
        if ((null == n ? void 0 : n.accepted) === !1)
          return (0, r.BX)(g, {
            children: [
              (0, r.tZ)(l(), { src: '/imgs/invite-error.svg', alt: '' }),
              (0, r.tZ)(c.zx, {
                shape: 'round',
                onClick: () => {
                  e.replace('/').catch(e => console.error(e));
                },
                children: 'Back to Home',
              }),
              (0, r.BX)('p', {
                children: [
                  (0, r.tZ)(o.UnsucessfulDuotoneIcon, {}),
                  'The link has expired',
                ],
              }),
            ],
          });
        throw Error('Invalid invite code');
      };
      (t.default = v),
        (v.getLayout = e =>
          (0, r.tZ)(p.Suspense, {
            fallback: (0, r.tZ)(f.SX, {}),
            children: (0, r.tZ)(u.Z, { children: e }),
          }));
      let g = (0, c.zo)('div')(() => ({
        height: '100vh',
        ...(0, c.j2)('center', 'center'),
        flexDirection: 'column',
        backgroundColor: 'var(--affine-background-primary-color)',
        img: { width: '300px', height: '300px' },
        p: {
          ...(0, c.j2)('center', 'center'),
          marginTop: '24px',
          svg: {
            color: 'var(--affine-primary-color)',
            fontSize: '24px',
            marginRight: '12px',
          },
        },
      }));
    },
  },
  function (e) {
    e.O(0, [8421, 9774, 2888, 179], function () {
      return e((e.s = 35362));
    }),
      (_N_E = e.O());
  },
]);
//# sourceMappingURL=[invite-code]-0bc162e9b596dced.js.map
