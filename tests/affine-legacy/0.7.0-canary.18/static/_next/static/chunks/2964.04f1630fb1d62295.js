(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [2964],
  {
    6359: function (e, i, n) {
      'use strict';
      n.d(i, {
        Iw: function () {
          return c;
        },
        oC: function () {
          return l;
        },
      });
      var o = n(90301),
        t = n(65058),
        a = n(87809);
      let d = (0, a.O4)('helper-guide', {
        quickSearchTips: !0,
        changeLog: !0,
        onBoarding: !0,
        downloadClientTip: !0,
      });
      (0, t.cn)(
        e => {
          let i = e(o.Hw),
            n = e(d);
          return n.quickSearchTips && !1 === i;
        },
        (e, i, n) => {
          i(d, e => ({ ...e, quickSearchTips: n }));
        }
      ),
        (0, t.cn)(
          e => e(d).changeLog,
          (e, i, n) => {
            i(d, e => ({ ...e, changeLog: n }));
          }
        );
      let l = (0, t.cn)(
          e => e(d).onBoarding,
          (e, i, n) => {
            i(d, e => ({ ...e, onBoarding: n }));
          }
        ),
        c = (0, t.cn)(
          e => e(d).downloadClientTip,
          (e, i, n) => {
            i(d, e => ({ ...e, downloadClientTip: n }));
          }
        );
    },
    92964: function (e, i, n) {
      'use strict';
      n.r(i),
        n.d(i, {
          OnboardingModal: function () {
            return B;
          },
          default: function () {
            return C;
          },
        });
      var o = n(52903),
        t = n(72013),
        a = n(31921),
        d = n(6277),
        l = n(2784),
        c = n(37565);
      n(71978);
      var r = 'u1x0j6h',
        s = 'u1x0j6n',
        u = 'u1x0j6j',
        m = 'u1x0j67',
        h = 'u1x0j68',
        p = 'u1x0j69',
        g = 'u1x0j6a',
        v = 'u1x0j6l',
        Z = 'u1x0j6k',
        b = 'u1x0j62',
        f = 'u1x0j6e';
      let x = e => {
        let { open: i, onClose: n } = e,
          x = (0, t.X)(),
          [N, j] = (0, l.useState)(-1),
          w = () => {
            j(-1), n();
          };
        return (0, o.tZ)(c.u_, {
          open: i,
          onClose: w,
          wrapperPosition: ['center', 'center'],
          hideBackdrop: !0,
          children: (0, o.BX)(c.AB, {
            width: 545,
            style: { minHeight: '480px' },
            'data-testid': 'onboarding-modal',
            children: [
              (0, o.tZ)(c.ol, {
                top: 6,
                right: 10,
                onClick: w,
                'data-testid': 'onboarding-modal-close-button',
              }),
              (0, o.BX)('div', {
                className: 'u1x0j60',
                children: [
                  (0, o.BX)('div', {
                    className: 'u1x0j61',
                    children: [
                      -1 !== N &&
                        (0, o.tZ)('div', {
                          className: (0, d.Z)(b, {
                            [p]: 0 === N,
                            [h]: 1 === N,
                          }),
                          children: x['com.affine.onboarding.title2'](),
                        }),
                      (0, o.tZ)('div', {
                        className: (0, d.Z)(b, { [g]: 1 === N, [m]: 0 === N }),
                        children: x['com.affine.onboarding.title1'](),
                      }),
                    ],
                  }),
                  (0, o.BX)('div', {
                    className: 'u1x0j6b',
                    children: [
                      (0, o.tZ)('div', {
                        className: (0, d.Z)(r, { [s]: 1 !== N }),
                        onClick: () => 1 === N && j(0),
                        'data-testid': 'onboarding-modal-pre-button',
                        children: (0, o.tZ)(a.ArrowLeftSmallIcon, {}),
                      }),
                      (0, o.tZ)('div', {
                        className: 'u1x0j6c',
                        children: (0, o.BX)('div', {
                          className: 'u1x0j6d',
                          children: [
                            -1 !== N &&
                              (0, o.BX)('video', {
                                autoPlay: !0,
                                muted: !0,
                                loop: !0,
                                className: (0, d.Z)(f, {
                                  [p]: 0 === N,
                                  [h]: 1 === N,
                                }),
                                'data-testid': 'onboarding-modal-editing-video',
                                children: [
                                  (0, o.tZ)('source', {
                                    src: '/editingVideo.mp4',
                                    type: 'video/mp4',
                                  }),
                                  (0, o.tZ)('source', {
                                    src: '/editingVideo.webm',
                                    type: 'video/webm',
                                  }),
                                ],
                              }),
                            (0, o.BX)('video', {
                              autoPlay: !0,
                              muted: !0,
                              loop: !0,
                              className: (0, d.Z)(f, {
                                [g]: 1 === N,
                                [m]: 0 === N,
                              }),
                              'data-testid': 'onboarding-modal-switch-video',
                              children: [
                                (0, o.tZ)('source', {
                                  src: '/switchVideo.mp4',
                                  type: 'video/mp4',
                                }),
                                (0, o.tZ)('source', {
                                  src: '/switchVideo.webm',
                                  type: 'video/webm',
                                }),
                              ],
                            }),
                          ],
                        }),
                      }),
                      (0, o.tZ)('div', {
                        className: (0, d.Z)(r, { [s]: 1 === N }),
                        onClick: () => j(1),
                        'data-testid': 'onboarding-modal-next-button',
                        children: (0, o.tZ)(a.ArrowRightSmallIcon, {}),
                      }),
                    ],
                  }),
                  (0, o.BX)('ul', {
                    className: 'u1x0j6m',
                    children: [
                      (0, o.tZ)('li', {
                        className: (0, d.Z)(Z, { [v]: 1 !== N }),
                        onClick: () => j(0),
                      }),
                      (0, o.tZ)('li', {
                        className: (0, d.Z)(Z, { [v]: 1 === N }),
                        onClick: () => j(1),
                      }),
                    ],
                  }),
                  (0, o.BX)('div', {
                    className: 'u1x0j6i',
                    children: [
                      -1 !== N &&
                        (0, o.tZ)('div', {
                          className: (0, d.Z)(u, {
                            [p]: 0 === N,
                            [h]: 1 === N,
                          }),
                          children:
                            x['com.affine.onboarding.videoDescription2'](),
                        }),
                      (0, o.tZ)('div', {
                        className: (0, d.Z)(u, { [g]: 1 === N, [m]: 0 === N }),
                        children:
                          x['com.affine.onboarding.videoDescription1'](),
                      }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        });
      };
      var N = n(752),
        j = n(74090),
        w = n(6359);
      let k = () => {
          let e = localStorage.getItem('helper-guide');
          return e ? JSON.parse(e) : null;
        },
        B = e => {
          let { open: i, onClose: n } = e,
            [, t] = (0, N.KO)(w.oC),
            [, a] = (0, N.KO)(j.Yt),
            d = (0, l.useCallback)(() => {
              t(!1), n();
            }, [n, t]),
            c = (0, l.useMemo)(() => {
              var e;
              let i = k();
              return (
                null === (e = null == i ? void 0 : i.onBoarding) ||
                void 0 === e ||
                e
              );
            }, []);
          return (
            (0, l.useEffect)(() => {
              c && a(!0);
            }, [c, a]),
            (0, o.tZ)(x, { open: i, onClose: d })
          );
        };
      var C = B;
    },
    71978: function () {},
  },
]);
//# sourceMappingURL=2964.04f1630fb1d62295.js.map
