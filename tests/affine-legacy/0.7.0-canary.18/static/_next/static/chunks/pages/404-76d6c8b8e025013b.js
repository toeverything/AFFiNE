(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2197],
  {
    99133: function (n, t, e) {
      (window.__NEXT_P = window.__NEXT_P || []).push([
        '/404',
        function () {
          return e(67919);
        },
      ]);
    },
    67919: function (n, t, e) {
      'use strict';
      e.r(t),
        e.d(t, {
          NotfoundPage: function () {
            return s;
          },
          StyledContainer: function () {
            return f;
          },
          default: function () {
            return a;
          },
        });
      var i = e(52903),
        r = e(37565),
        o = e(72013),
        u = e(97729),
        c = e.n(u),
        h = e(38421),
        d = e.n(h),
        l = e(5632);
      e(2784);
      let f = (0, r.zo)('div')(() => ({
          ...(0, r.j2)('center', 'center'),
          flexDirection: 'column',
          height: '100vh',
          img: { width: '360px', height: '270px' },
          p: { fontSize: '22px', fontWeight: 600, margin: '24px 0' },
        })),
        s = () => {
          let n = (0, o.X)(),
            t = (0, l.useRouter)();
          return (0, i.BX)(f, {
            'data-testid': 'notFound',
            children: [
              (0, i.tZ)(d(), {
                alt: '404',
                src: '/imgs/invite-error.svg',
                width: 360,
                height: 270,
              }),
              (0, i.tZ)('p', { children: n['404 - Page Not Found']() }),
              (0, i.tZ)(r.zx, {
                shape: 'round',
                onClick: () => {
                  t.push('/').catch(n => console.error(n));
                },
                children: n['Back Home'](),
              }),
            ],
          });
        };
      function a() {
        return (0, i.BX)(i.HY, {
          children: [
            (0, i.tZ)(c(), {
              children: (0, i.tZ)('title', { children: '404 - AFFiNE' }),
            }),
            (0, i.tZ)(s, {}),
          ],
        });
      }
    },
  },
  function (n) {
    n.O(0, [8421, 9774, 2888, 179], function () {
      return n((n.s = 99133));
    }),
      (_N_E = n.O());
  },
]);
//# sourceMappingURL=404-76d6c8b8e025013b.js.map
