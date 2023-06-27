(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [8421],
  {
    87051: function (e, t, i) {
      'use strict';
      Object.defineProperty(t, '__esModule', { value: !0 }),
        Object.defineProperty(t, 'default', {
          enumerable: !0,
          get: function () {
            return S;
          },
        });
      let n = i(43219),
        r = i(16794),
        l = r._(i(2784)),
        o = n._(i(49021)),
        a = i(55140),
        s = i(46396),
        d = i(7117);
      i(55493);
      let u = i(37627);
      function c(e) {
        return '/' === e[0] ? e.slice(1) : e;
      }
      let f = {
          deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
          imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
          path: '/_next/image',
          loader: 'default',
          dangerouslyAllowSVG: !1,
          unoptimized: !0,
        },
        g = new Set(),
        m =
          'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        h = new Map([
          [
            'default',
            function (e) {
              let { config: t, src: i, width: n, quality: r } = e;
              return i.endsWith('.svg') && !t.dangerouslyAllowSVG
                ? i
                : (0, u.normalizePathTrailingSlash)(t.path) +
                    '?url=' +
                    encodeURIComponent(i) +
                    '&w=' +
                    n +
                    '&q=' +
                    (r || 75);
            },
          ],
          [
            'imgix',
            function (e) {
              let { config: t, src: i, width: n, quality: r } = e,
                l = new URL('' + t.path + c(i)),
                o = l.searchParams;
              return (
                o.set('auto', o.getAll('auto').join(',') || 'format'),
                o.set('fit', o.get('fit') || 'max'),
                o.set('w', o.get('w') || n.toString()),
                r && o.set('q', r.toString()),
                l.href
              );
            },
          ],
          [
            'cloudinary',
            function (e) {
              let { config: t, src: i, width: n, quality: r } = e,
                l =
                  ['f_auto', 'c_limit', 'w_' + n, 'q_' + (r || 'auto')].join(
                    ','
                  ) + '/';
              return '' + t.path + l + c(i);
            },
          ],
          [
            'akamai',
            function (e) {
              let { config: t, src: i, width: n } = e;
              return '' + t.path + c(i) + '?imwidth=' + n;
            },
          ],
          [
            'custom',
            function (e) {
              let { src: t } = e;
              throw Error(
                'Image with src "' +
                  t +
                  '" is missing "loader" prop.\nRead more: https://nextjs.org/docs/messages/next-image-missing-loader'
              );
            },
          ],
        ]);
      function p(e) {
        return void 0 !== e.default;
      }
      function b(e) {
        let {
          config: t,
          src: i,
          unoptimized: n,
          layout: r,
          width: l,
          quality: o,
          sizes: a,
          loader: s,
        } = e;
        if (n) return { src: i, srcSet: void 0, sizes: void 0 };
        let { widths: d, kind: u } = (function (e, t, i, n) {
            let { deviceSizes: r, allSizes: l } = e;
            if (n && ('fill' === i || 'responsive' === i)) {
              let e = /(^|\s)(1?\d?\d)vw/g,
                t = [];
              for (let i; (i = e.exec(n)); i) t.push(parseInt(i[2]));
              if (t.length) {
                let e = 0.01 * Math.min(...t);
                return { widths: l.filter(t => t >= r[0] * e), kind: 'w' };
              }
              return { widths: l, kind: 'w' };
            }
            if ('number' != typeof t || 'fill' === i || 'responsive' === i)
              return { widths: r, kind: 'w' };
            let o = [
              ...new Set(
                [t, 2 * t].map(e => l.find(t => t >= e) || l[l.length - 1])
              ),
            ];
            return { widths: o, kind: 'x' };
          })(t, l, r, a),
          c = d.length - 1;
        return {
          sizes: a || 'w' !== u ? a : '100vw',
          srcSet: d
            .map(
              (e, n) =>
                s({ config: t, src: i, quality: o, width: e }) +
                ' ' +
                ('w' === u ? e : n + 1) +
                u
            )
            .join(', '),
          src: s({ config: t, src: i, quality: o, width: d[c] }),
        };
      }
      function w(e) {
        return 'number' == typeof e
          ? e
          : 'string' == typeof e
          ? parseInt(e, 10)
          : void 0;
      }
      function y(e) {
        var t;
        let i = (null == (t = e.config) ? void 0 : t.loader) || 'default',
          n = h.get(i);
        if (n) return n(e);
        throw Error(
          'Unknown "loader" found in "next.config.js". Expected: ' +
            a.VALID_LOADERS.join(', ') +
            '. Received: ' +
            i
        );
      }
      function v(e, t, i, n, r, l) {
        if (!e || e.src === m || e['data-loaded-src'] === t) return;
        e['data-loaded-src'] = t;
        let o = 'decode' in e ? e.decode() : Promise.resolve();
        o.catch(() => {}).then(() => {
          if (
            e.parentNode &&
            (g.add(t), 'blur' === n && l(!0), null == r ? void 0 : r.current)
          ) {
            let { naturalWidth: t, naturalHeight: i } = e;
            r.current({ naturalWidth: t, naturalHeight: i });
          }
        });
      }
      let A = e => {
        let {
          imgAttributes: t,
          heightInt: i,
          widthInt: n,
          qualityInt: r,
          layout: o,
          className: a,
          imgStyle: s,
          blurStyle: d,
          isLazy: u,
          placeholder: c,
          loading: f,
          srcString: g,
          config: m,
          unoptimized: h,
          loader: p,
          onLoadingCompleteRef: w,
          setBlurComplete: y,
          setIntersection: A,
          onLoad: S,
          onError: x,
          isVisible: k,
          noscriptSizes: E,
          ...z
        } = e;
        return (
          (f = u ? 'lazy' : f),
          l.default.createElement(
            l.default.Fragment,
            null,
            l.default.createElement('img', {
              ...z,
              ...t,
              decoding: 'async',
              'data-nimg': o,
              className: a,
              style: { ...s, ...d },
              ref: (0, l.useCallback)(
                e => {
                  A(e),
                    (null == e ? void 0 : e.complete) && v(e, g, o, c, w, y);
                },
                [A, g, o, c, w, y]
              ),
              onLoad: e => {
                let t = e.currentTarget;
                v(t, g, o, c, w, y), S && S(e);
              },
              onError: e => {
                'blur' === c && y(!0), x && x(e);
              },
            }),
            (u || 'blur' === c) &&
              l.default.createElement(
                'noscript',
                null,
                l.default.createElement('img', {
                  ...z,
                  loading: f,
                  decoding: 'async',
                  'data-nimg': o,
                  style: s,
                  className: a,
                  ...b({
                    config: m,
                    src: g,
                    unoptimized: h,
                    layout: o,
                    width: n,
                    quality: r,
                    sizes: E,
                    loader: p,
                  }),
                })
              )
          )
        );
      };
      function S(e) {
        var t;
        let i,
          {
            src: n,
            sizes: r,
            unoptimized: u = !1,
            priority: c = !1,
            loading: h,
            lazyRoot: v = null,
            lazyBoundary: S,
            className: x,
            quality: k,
            width: E,
            height: z,
            style: _,
            objectFit: j,
            objectPosition: R,
            onLoadingComplete: I,
            placeholder: O = 'empty',
            blurDataURL: N,
            ...C
          } = e,
          P = (0, l.useContext)(d.ImageConfigContext),
          W = (0, l.useMemo)(() => {
            let e = f || P || a.imageConfigDefault,
              t = [...e.deviceSizes, ...e.imageSizes].sort((e, t) => e - t),
              i = e.deviceSizes.sort((e, t) => e - t);
            return { ...e, allSizes: t, deviceSizes: i };
          }, [P]),
          L = r ? 'responsive' : 'intrinsic';
        'layout' in C && (C.layout && (L = C.layout), delete C.layout);
        let M = y;
        if ('loader' in C) {
          if (C.loader) {
            let e = C.loader;
            M = t => {
              let { config: i, ...n } = t;
              return e(n);
            };
          }
          delete C.loader;
        }
        let q = '';
        if ('object' == typeof (t = n) && (p(t) || void 0 !== t.src)) {
          let e = p(n) ? n.default : n;
          if (!e.src)
            throw Error(
              'An object should only be passed to the image component src parameter if it comes from a static image import. It must include src. Received ' +
                JSON.stringify(e)
            );
          if (
            ((N = N || e.blurDataURL),
            (q = e.src),
            (!L || 'fill' !== L) &&
              ((z = z || e.height), (E = E || e.width), !e.height || !e.width))
          )
            throw Error(
              'An object should only be passed to the image component src parameter if it comes from a static image import. It must include height and width. Received ' +
                JSON.stringify(e)
            );
        }
        let D = !c && ('lazy' === h || void 0 === h);
        ((n = 'string' == typeof n ? n : q).startsWith('data:') ||
          n.startsWith('blob:')) &&
          ((u = !0), (D = !1)),
          g.has(n) && (D = !1),
          W.unoptimized && (u = !0);
        let [B, U] = (0, l.useState)(!1),
          [G, H, T] = (0, s.useIntersection)({
            rootRef: v,
            rootMargin: S || '200px',
            disabled: !D,
          }),
          V = !D || H,
          F = {
            boxSizing: 'border-box',
            display: 'block',
            overflow: 'hidden',
            width: 'initial',
            height: 'initial',
            background: 'none',
            opacity: 1,
            border: 0,
            margin: 0,
            padding: 0,
          },
          J = {
            boxSizing: 'border-box',
            display: 'block',
            width: 'initial',
            height: 'initial',
            background: 'none',
            opacity: 1,
            border: 0,
            margin: 0,
            padding: 0,
          },
          Q = !1,
          K = w(E),
          X = w(z),
          Y = w(k),
          Z = Object.assign({}, _, {
            position: 'absolute',
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            boxSizing: 'border-box',
            padding: 0,
            border: 'none',
            margin: 'auto',
            display: 'block',
            width: 0,
            height: 0,
            minWidth: '100%',
            maxWidth: '100%',
            minHeight: '100%',
            maxHeight: '100%',
            objectFit: j,
            objectPosition: R,
          }),
          $ =
            'blur' !== O || B
              ? {}
              : {
                  backgroundSize: j || 'cover',
                  backgroundPosition: R || '0% 0%',
                  filter: 'blur(20px)',
                  backgroundImage: 'url("' + N + '")',
                };
        if ('fill' === L)
          (F.display = 'block'),
            (F.position = 'absolute'),
            (F.top = 0),
            (F.left = 0),
            (F.bottom = 0),
            (F.right = 0);
        else if (void 0 !== K && void 0 !== X) {
          let e = X / K,
            t = isNaN(e) ? '100%' : '' + 100 * e + '%';
          'responsive' === L
            ? ((F.display = 'block'),
              (F.position = 'relative'),
              (Q = !0),
              (J.paddingTop = t))
            : 'intrinsic' === L
            ? ((F.display = 'inline-block'),
              (F.position = 'relative'),
              (F.maxWidth = '100%'),
              (Q = !0),
              (J.maxWidth = '100%'),
              (i =
                'data:image/svg+xml,%3csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20version=%271.1%27%20width=%27' +
                K +
                '%27%20height=%27' +
                X +
                '%27/%3e'))
            : 'fixed' === L &&
              ((F.display = 'inline-block'),
              (F.position = 'relative'),
              (F.width = K),
              (F.height = X));
        }
        let ee = { src: m, srcSet: void 0, sizes: void 0 };
        V &&
          (ee = b({
            config: W,
            src: n,
            unoptimized: u,
            layout: L,
            width: K,
            quality: Y,
            sizes: r,
            loader: M,
          }));
        let et = n,
          ei = {
            imageSrcSet: ee.srcSet,
            imageSizes: ee.sizes,
            crossOrigin: C.crossOrigin,
          },
          en = l.default.useLayoutEffect,
          er = (0, l.useRef)(I),
          el = (0, l.useRef)(n);
        (0, l.useEffect)(() => {
          er.current = I;
        }, [I]),
          en(() => {
            el.current !== n && (T(), (el.current = n));
          }, [T, n]);
        let eo = {
          isLazy: D,
          imgAttributes: ee,
          heightInt: X,
          widthInt: K,
          qualityInt: Y,
          layout: L,
          className: x,
          imgStyle: Z,
          blurStyle: $,
          loading: h,
          config: W,
          unoptimized: u,
          placeholder: O,
          loader: M,
          srcString: et,
          onLoadingCompleteRef: er,
          setBlurComplete: U,
          setIntersection: G,
          isVisible: V,
          noscriptSizes: r,
          ...C,
        };
        return l.default.createElement(
          l.default.Fragment,
          null,
          l.default.createElement(
            'span',
            { style: F },
            Q
              ? l.default.createElement(
                  'span',
                  { style: J },
                  i
                    ? l.default.createElement('img', {
                        style: {
                          display: 'block',
                          maxWidth: '100%',
                          width: 'initial',
                          height: 'initial',
                          background: 'none',
                          opacity: 1,
                          border: 0,
                          margin: 0,
                          padding: 0,
                        },
                        alt: '',
                        'aria-hidden': !0,
                        src: i,
                      })
                    : null
                )
              : null,
            l.default.createElement(A, eo)
          ),
          c
            ? l.default.createElement(
                o.default,
                null,
                l.default.createElement('link', {
                  key: '__nimg-' + ee.src + ee.srcSet + ee.sizes,
                  rel: 'preload',
                  as: 'image',
                  href: ee.srcSet ? void 0 : ee.src,
                  ...ei,
                })
              )
            : null
        );
      }
      ('function' == typeof t.default ||
        ('object' == typeof t.default && null !== t.default)) &&
        void 0 === t.default.__esModule &&
        (Object.defineProperty(t.default, '__esModule', { value: !0 }),
        Object.assign(t.default, t),
        (e.exports = t.default));
    },
    38421: function (e, t, i) {
      e.exports = i(87051);
    },
  },
]);
//# sourceMappingURL=8421-5a36dd601e6cf31f.js.map
