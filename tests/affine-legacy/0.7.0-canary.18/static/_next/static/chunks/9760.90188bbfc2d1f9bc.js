(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [9760],
  {
    40899: function (e, t, l) {
      'use strict';
      l.r(t),
        l.d(t, {
          ImagePreviewModal: function () {
            return b;
          },
        });
      var n = l(52903);
      l(59799);
      var a = l(31054),
        o = l(31921),
        i = l(6277),
        r = l(752),
        c = l(2784),
        s = l(3255),
        d = l(36405);
      let u = e => {
        let { zoomRef: t, imageRef: l } = e,
          [n, a] = (0, c.useState)(1),
          [o, i] = (0, c.useState)(!1),
          [r, s] = (0, c.useState)(!1),
          [d, u] = (0, c.useState)(0),
          [g, f] = (0, c.useState)(0),
          [k, p] = (0, c.useState)(0),
          [m, w] = (0, c.useState)(0),
          [h, b] = (0, c.useState)({ x: 0, y: 0 }),
          v = (0, c.useCallback)(() => {
            let e = l.current;
            if (e && n < 2) {
              let t = n + 0.1;
              a(t),
                (e.style.width = ''.concat(e.naturalWidth * t, 'px')),
                (e.style.height = ''.concat(e.naturalHeight * t, 'px'));
            }
          }, [l, n]),
          y = (0, c.useCallback)(() => {
            let e = l.current;
            if (e && n > 0.2) {
              let t = n - 0.1;
              a(t),
                (e.style.width = ''.concat(e.naturalWidth * t, 'px')),
                (e.style.height = ''.concat(e.naturalHeight * t, 'px'));
              let l = e.naturalWidth * t,
                o = e.naturalHeight * t,
                i = window.innerWidth,
                r = window.innerHeight;
              (l > i || o > r) &&
                ((e.style.transform = 'translate(0px, 0px)'),
                b({ x: 0, y: 0 }));
            }
          }, [l, n]),
          C = (0, c.useCallback)(() => {
            let { current: e } = t;
            if (e) {
              let t = e.querySelector('img');
              if (t) {
                let e = t.naturalWidth * n,
                  l = t.naturalHeight * n,
                  a = window.innerWidth,
                  o = window.innerHeight;
                i(e > a || l > o);
              }
            }
          }, [n, t]),
          L = (0, c.useCallback)(() => {
            let e = l.current;
            if (e) {
              let t = window.innerWidth,
                l = window.innerHeight,
                n = (0.8 * t) / e.naturalWidth,
                o = (0.8 * l) / e.naturalHeight,
                i = Math.min(n, o);
              a(i),
                (e.style.width = ''.concat(e.naturalWidth * i, 'px')),
                (e.style.height = ''.concat(e.naturalHeight * i, 'px')),
                (e.style.transform = 'translate(0px, 0px)'),
                b({ x: 0, y: 0 }),
                C();
            }
          }, [C, l]),
          Z = (0, c.useCallback)(
            e => {
              null == e || e.preventDefault(), s(!0);
              let t = l.current;
              if (t && o) {
                t.style.cursor = 'grab';
                let l = t.getBoundingClientRect();
                p(l.left), w(l.top), u(e.clientX), f(e.clientY);
              }
            },
            [l, o]
          ),
          P = (0, c.useCallback)(
            e => {
              null == e || e.preventDefault();
              let t = l.current;
              if (r && t && o) {
                t.style.cursor = 'grabbing';
                let l = h.x,
                  n = h.y,
                  a = l + e.clientX - d,
                  o = n + e.clientY - g;
                t.style.transform = 'translate('
                  .concat(a, 'px, ')
                  .concat(o, 'px)');
              }
            },
            [h.x, h.y, l, r, o, d, g]
          ),
          B = (0, c.useCallback)(() => {
            s(!1);
            let e = l.current;
            if (e && o && r) {
              e.style.cursor = 'pointer';
              let t = e.getBoundingClientRect(),
                l = { x: t.left, y: t.top },
                n = h.x,
                a = h.y,
                o = n + l.x - k,
                i = a + l.y - m;
              b({ x: o, y: i });
            }
          }, [k, m, h.x, h.y, l, r, o]),
          I = (0, c.useCallback)(
            e => {
              e.preventDefault(), B();
            },
            [B]
          ),
          j = (0, c.useCallback)(() => {
            r && B();
          }, [r, B]);
        return (
          (0, c.useEffect)(() => {
            let e = e => {
                let { deltaY: t } = e;
                t > 0 ? y() : t < 0 && v();
              },
              t = () => {
                C();
              };
            return (
              C(),
              window.addEventListener('wheel', e, { passive: !1 }),
              window.addEventListener('resize', t),
              window.addEventListener('mouseup', j),
              () => {
                window.removeEventListener('wheel', e),
                  window.removeEventListener('resize', t),
                  window.removeEventListener('mouseup', j);
              }
            );
          }, [v, y, C, j]),
          {
            zoomIn: v,
            zoomOut: y,
            resetZoom: L,
            isZoomedBigger: o,
            currentScale: n,
            handleDragStart: Z,
            handleDrag: P,
            handleDragEnd: I,
          }
        );
      };
      l(40539);
      var g = 'jdctjc9',
        f = 'jdctjc8',
        k = 'jdctjc2',
        p = 'jdctjc0',
        m = l(65058);
      let w = (0, m.cn)(null);
      w.onMount = e => {
        {
          let t = t => {
            e(t.detail.blockId);
          };
          return (
            window.addEventListener('affine.embed-block-db-click', t),
            () => {
              window.removeEventListener('affine.embed-block-db-click', t);
            }
          );
        }
      };
      let h = e => {
          let t;
          let [l, m] = (0, r.KO)(w),
            [h, b] = (0, c.useState)(!1),
            [v, y] = (0, c.useState)(() => {
              let t = e.workspace.getPage(e.pageId);
              (0, a.kP)(t);
              let l = t.getBlockById(e.blockId);
              return (0, a.kP)(l), null == l ? void 0 : l.caption;
            });
          (0, c.useEffect)(() => {
            let t = e.workspace.getPage(e.pageId);
            (0, a.kP)(t);
            let l = t.getBlockById(e.blockId);
            (0, a.kP)(l), y(null == l ? void 0 : l.caption);
          }, [e.blockId, e.pageId, e.workspace]);
          let { data: C } = (0, s.ZP)(
              ['workspace', 'embed', e.pageId, e.blockId],
              {
                fetcher: t => {
                  let [l, n, o, i] = t,
                    r = e.workspace.getPage(o);
                  (0, a.kP)(r);
                  let c = r.getBlockById(i);
                  return (
                    (0, a.kP)(c),
                    e.workspace.blobs.get(null == c ? void 0 : c.sourceId)
                  );
                },
                suspense: !0,
              }
            ),
            L = (0, c.useRef)(null),
            Z = (0, c.useRef)(null),
            {
              zoomIn: P,
              zoomOut: B,
              isZoomedBigger: I,
              handleDrag: j,
              handleDragStart: x,
              handleDragEnd: N,
              resetZoom: R,
              currentScale: S,
            } = u({ zoomRef: L, imageRef: Z }),
            [E, U] = (0, c.useState)(() => C),
            [M, H] = (0, c.useState)(null);
          if (
            (E !== C
              ? (M && URL.revokeObjectURL(M), H(URL.createObjectURL(C)), U(C))
              : M || H(URL.createObjectURL(C)),
            !M)
          )
            return null;
          let O = t => {
              (0, a.kP)(t);
              let l = e.workspace,
                n = l.getPage(e.pageId);
              (0, a.kP)(n);
              let o = n.getBlockById(t);
              (0, a.kP)(o);
              let i = n
                .getNextSiblings(o)
                .find(e => 'affine:embed' === e.flavour);
              i && m(i.id);
            },
            W = t => {
              (0, a.kP)(t);
              let l = e.workspace,
                n = l.getPage(e.pageId);
              (0, a.kP)(n);
              let o = n.getBlockById(t);
              (0, a.kP)(o);
              let i = n
                .getPreviousSiblings(o)
                .findLast(e => 'affine:embed' === e.flavour);
              i && m(i.id);
            },
            X = t => {
              let l = e.workspace,
                n = l.getPage(e.pageId);
              (0, a.kP)(n);
              let o = n.getBlockById(t);
              if (
                ((0, a.kP)(o),
                n
                  .getPreviousSiblings(o)
                  .findLast(e => 'affine:embed' === e.flavour))
              ) {
                let e = n
                  .getPreviousSiblings(o)
                  .findLast(e => 'affine:embed' === e.flavour);
                e && m(e.id);
              } else if (
                n.getNextSiblings(o).find(e => 'affine:embed' === e.flavour)
              ) {
                let e = n
                  .getNextSiblings(o)
                  .find(e => 'affine:embed' === e.flavour);
                if (e) {
                  let t = Z.current;
                  R(),
                    t && ((t.style.width = '100%'), (t.style.height = 'auto')),
                    m(e.id);
                }
              } else e.onClose();
              n.deleteBlock(o);
            },
            D = async t => {
              let l = e.workspace,
                n = l.getPage(e.pageId);
              if (((0, a.kP)(n), 'string' == typeof t)) {
                let e;
                let l = n.getBlockById(t);
                (0, a.kP)(l);
                let o = await l.page.blobs,
                  i = null == o ? void 0 : o.get(l.sourceId),
                  r = await i;
                if (!r) return;
                let c = await r.arrayBuffer(),
                  s = new Uint8Array(c);
                71 === s[0] && 73 === s[1] && 70 === s[2] && 56 === s[3]
                  ? (e = 'image/gif')
                  : 137 === s[0] && 80 === s[1] && 78 === s[2] && 71 === s[3]
                  ? (e = 'image/png')
                  : 255 === s[0] && 216 === s[1] && 255 === s[2] && 224 === s[3]
                  ? (e = 'image/jpeg')
                  : (console.error('unknown image type'), (e = 'image/png'));
                let d = URL.createObjectURL(new Blob([c], { type: e })),
                  u = document.createElement('a'),
                  g = new MouseEvent('click');
                (u.download = l.id),
                  (u.href = d),
                  u.dispatchEvent(g),
                  u.remove(),
                  URL.revokeObjectURL(d);
              }
            },
            A = () => {
              clearTimeout(t), b(!0);
            },
            z = () => {
              t = setTimeout(() => {
                b(!1);
              }, 3e3);
            };
          return (0, n.BX)('div', {
            'data-testid': 'image-preview-modal',
            className: p,
            onClick: t => (t.target === t.currentTarget ? e.onClose() : null),
            children: [
              I
                ? (0, n.tZ)(n.HY, {})
                : (0, n.BX)('div', {
                    className: 'jdctjc3',
                    children: [
                      (0, n.tZ)('span', {
                        className: k,
                        style: { left: 0 },
                        onClick: () => {
                          (0, a.kP)(l), W(l);
                        },
                        children: '❮',
                      }),
                      (0, n.tZ)('span', {
                        className: k,
                        style: { right: 0 },
                        onClick: () => {
                          (0, a.kP)(l), O(l);
                        },
                        children: '❯',
                      }),
                    ],
                  }),
              (0, n.tZ)('div', {
                className: 'jdctjc4',
                children: (0, n.tZ)('div', {
                  className: (0, i.Z)('zoom-area', { 'zoomed-bigger': I }),
                  ref: L,
                  children: (0, n.BX)('div', {
                    className: 'jdctjc5',
                    children: [
                      (0, n.tZ)('img', {
                        'data-blob-id': e.blockId,
                        src: M,
                        alt: v,
                        ref: Z,
                        draggable: I,
                        onMouseDown: x,
                        onMouseMove: j,
                        onMouseUp: N,
                        onMouseEnter: A,
                        onMouseLeave: z,
                        onLoad: R,
                      }),
                      I
                        ? null
                        : (0, n.tZ)('p', { className: 'jdctjc6', children: v }),
                    ],
                  }),
                }),
              }),
              (0, n.tZ)('button', {
                onClick: () => {
                  e.onClose();
                },
                className: 'jdctjc1',
                children: (0, n.tZ)('svg', {
                  width: '10',
                  height: '10',
                  viewBox: '0 0 10 10',
                  fill: 'none',
                  xmlns: 'http://www.w3.org/2000/svg',
                  children: (0, n.tZ)('path', {
                    fillRule: 'evenodd',
                    clipRule: 'evenodd',
                    d: 'M0.286086 0.285964C0.530163 0.0418858 0.925891 0.0418858 1.16997 0.285964L5.00013 4.11613L8.83029 0.285964C9.07437 0.0418858 9.4701 0.0418858 9.71418 0.285964C9.95825 0.530041 9.95825 0.925769 9.71418 1.16985L5.88401 5.00001L9.71418 8.83017C9.95825 9.07425 9.95825 9.46998 9.71418 9.71405C9.4701 9.95813 9.07437 9.95813 8.83029 9.71405L5.00013 5.88389L1.16997 9.71405C0.925891 9.95813 0.530163 9.95813 0.286086 9.71405C0.0420079 9.46998 0.0420079 9.07425 0.286086 8.83017L4.11625 5.00001L0.286086 1.16985C0.0420079 0.925769 0.0420079 0.530041 0.286086 0.285964Z',
                    fill: '#77757D',
                  }),
                }),
              }),
              h
                ? (0, n.BX)('div', {
                    className: 'jdctjcb',
                    onMouseEnter: A,
                    onMouseLeave: z,
                    onClick: e => e.stopPropagation(),
                    children: [
                      I && '' !== v
                        ? (0, n.tZ)('p', { className: 'jdctjcc', children: v })
                        : null,
                      (0, n.BX)('div', {
                        className: 'jdctjc7',
                        children: [
                          (0, n.BX)('div', {
                            children: [
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.ArrowLeftSmallIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => {
                                  (0, a.kP)(l), W(l);
                                },
                              }),
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.ArrowRightSmallIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => {
                                  (0, a.kP)(l), O(l);
                                },
                              }),
                            ],
                          }),
                          (0, n.BX)('div', {
                            className: f,
                            children: [
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.ViewBarIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => R(),
                              }),
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.MinusIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: B,
                              }),
                              (0, n.tZ)('span', {
                                className: 'jdctjca',
                                children: ''.concat((100 * S).toFixed(0), '%'),
                              }),
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.PlusIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => P(),
                              }),
                            ],
                          }),
                          (0, n.BX)('div', {
                            className: f,
                            children: [
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.DownloadIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => {
                                  (0, a.kP)(l),
                                    D(l).catch(e => {
                                      console.error(
                                        'Could not download image',
                                        e
                                      );
                                    });
                                },
                              }),
                              (0, n.tZ)(d.Z, {
                                icon: (0, n.tZ)(o.CopyIcon, {}),
                                noBorder: !0,
                                className: g,
                                onClick: () => {
                                  if (!Z.current) return;
                                  let e = document.createElement('canvas');
                                  (e.width = Z.current.naturalWidth),
                                    (e.height = Z.current.naturalHeight);
                                  let t = e.getContext('2d');
                                  if (!t) {
                                    console.warn(
                                      'Could not get canvas context'
                                    );
                                    return;
                                  }
                                  t.drawImage(Z.current, 0, 0),
                                    e.toBlob(e => {
                                      if (!e) {
                                        console.warn('Could not get blob');
                                        return;
                                      }
                                      let t = URL.createObjectURL(e);
                                      navigator.clipboard
                                        .write([
                                          new ClipboardItem({ 'image/png': e }),
                                        ])
                                        .then(() => {
                                          console.log(
                                            'Image copied to clipboard'
                                          ),
                                            URL.revokeObjectURL(t);
                                        })
                                        .catch(e => {
                                          console.error(
                                            'Error copying image to clipboard',
                                            e
                                          ),
                                            URL.revokeObjectURL(t);
                                        });
                                    }, 'image/png');
                                },
                              }),
                            ],
                          }),
                          (0, n.tZ)('div', {
                            className: f,
                            children: (0, n.tZ)(d.Z, {
                              icon: (0, n.tZ)(o.DeleteIcon, {}),
                              noBorder: !0,
                              className: g,
                              onClick: () => l && X(l),
                            }),
                          }),
                        ],
                      }),
                    ],
                  })
                : null,
            ],
          });
        },
        b = e => {
          let [t, l] = (0, r.KO)(w),
            o = (0, c.useCallback)(
              n => {
                if ('Escape' === n.key) {
                  n.preventDefault(), n.stopPropagation(), l(null);
                  return;
                }
                if (!t) return;
                let o = e.workspace,
                  i = o.getPage(e.pageId);
                (0, a.kP)(i);
                let r = i.getBlockById(t);
                if (((0, a.kP)(r), 'ArrowLeft' === n.key)) {
                  let e = i
                    .getPreviousSiblings(r)
                    .findLast(e => 'affine:embed' === e.flavour);
                  e && l(e.id);
                } else {
                  if ('ArrowRight' !== n.key) return;
                  let e = i
                    .getNextSiblings(r)
                    .find(e => 'affine:embed' === e.flavour);
                  e && l(e.id);
                }
                n.preventDefault(), n.stopPropagation();
              },
              [t, l, e.workspace, e.pageId]
            );
          return ((0, c.useEffect)(
            () => (
              document.addEventListener('keyup', o),
              () => {
                document.removeEventListener('keyup', o);
              }
            ),
            [o]
          ),
          t)
            ? (0, n.tZ)(c.Suspense, {
                fallback: (0, n.tZ)('div', { className: p }),
                children: (0, n.tZ)(h, {
                  ...e,
                  blockId: t,
                  onClose: () => l(null),
                }),
              })
            : null;
        };
    },
    40539: function () {},
    81323: function () {},
    29686: function () {},
  },
]);
//# sourceMappingURL=9760.90188bbfc2d1f9bc.js.map
