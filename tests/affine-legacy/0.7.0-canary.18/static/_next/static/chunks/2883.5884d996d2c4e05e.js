'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2883],
  {
    2883: function (e, i, n) {
      n.r(i),
        n.d(i, {
          TmpDisableAffineCloudModal: function () {
            return g;
          },
        });
      var t = n(52903),
        o = n(37565),
        r = n(44502),
        l = n(72013),
        a = n(31921);
      let d = (0, o.zo)('div')({
          height: '44px',
          display: 'flex',
          flexDirection: 'row-reverse',
          paddingRight: '10px',
          paddingTop: '10px',
          flexShrink: 0,
        }),
        c = (0, o.zo)('div')({ padding: '0 40px' }),
        h = (0, o.zo)('h1')(() => ({
          fontSize: 'var(--affine-font-h6)',
          lineHeight: '28px',
          fontWeight: 600,
        })),
        p = (0, o.zo)('div')(() => ({
          userSelect: 'none',
          margin: '20px 0',
          a: { color: 'var(--affine-primary-color)' },
        })),
        f = (0, o.zo)(o.zx)(() => ({
          textAlign: 'center',
          margin: '20px 0',
          borderRadius: '8px',
          backgroundColor: 'var(--affine-primary-color)',
          span: { margin: '0' },
        })),
        s = (0, o.zo)('div')(() => ({
          width: '100%',
          ...(0, o.j2)('flex-end', 'center'),
        })),
        u = (0, o.zo)('div')(() => ({ width: '100%' })),
        g = e => {
          let { open: i, onClose: n } = e,
            g = (0, l.X)();
          return (0, t.tZ)(o.u_, {
            'data-testid': 'disable-affine-cloud-modal',
            open: i,
            onClose: n,
            children: (0, t.BX)(o.AB, {
              width: 480,
              children: [
                (0, t.tZ)(d, {
                  children: (0, t.tZ)(o.hU, {
                    onClick: n,
                    children: (0, t.tZ)(a.CloseIcon, {}),
                  }),
                }),
                (0, t.BX)(c, {
                  children: [
                    (0, t.tZ)(h, {
                      children: g['com.affine.cloudTempDisable.title'](),
                    }),
                    (0, t.tZ)(p, {
                      children: (0, t.BX)(r.cC, {
                        i18nKey: 'com.affine.cloudTempDisable.description',
                        children: [
                          'We are upgrading the AFFiNE Cloud service and it is temporarily unavailable on the client side. If you wish to stay updated on the progress and be notified on availability, you can fill out the',
                          (0, t.tZ)('a', {
                            href: 'https://6dxre9ihosp.typeform.com/to/B8IHwuyy',
                            target: '_blank',
                            style: { color: 'var(--affine-link-color)' },
                            children: 'AFFiNE Cloud Signup',
                          }),
                          '.',
                        ],
                      }),
                    }),
                    (0, t.tZ)(u, {
                      children: (0, t.tZ)(o.HY, {
                        containerStyle: { width: '200px', height: '112px' },
                      }),
                    }),
                    (0, t.tZ)(s, {
                      children: (0, t.tZ)(f, {
                        shape: 'round',
                        type: 'primary',
                        onClick: n,
                        children: g['Got it'](),
                      }),
                    }),
                  ],
                }),
              ],
            }),
          });
        };
    },
  },
]);
//# sourceMappingURL=2883.5884d996d2c4e05e.js.map
