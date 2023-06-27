(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [7642],
  {
    12039: function (module, exports, __webpack_require__) {
      'undefined' != typeof navigator &&
        (function (u, P) {
          module.exports = P();
        })(0, function () {
          'use strict';
          var svgNS = 'http://www.w3.org/2000/svg',
            locationHref = '',
            _useWebWorker = !1,
            initialDefaultFrame = -999999,
            setWebWorker = function (u) {
              _useWebWorker = !!u;
            },
            getWebWorker = function () {
              return _useWebWorker;
            },
            setLocationHref = function (u) {
              locationHref = u;
            },
            getLocationHref = function () {
              return locationHref;
            };
          function createTag(u) {
            return document.createElement(u);
          }
          function extendPrototype(u, P) {
            var S,
              D,
              T = u.length;
            for (S = 0; S < T; S += 1)
              for (var M in (D = u[S].prototype))
                Object.prototype.hasOwnProperty.call(D, M) &&
                  (P.prototype[M] = D[M]);
          }
          function getDescriptor(u, P) {
            return Object.getOwnPropertyDescriptor(u, P);
          }
          function createProxyFunction(u) {
            function P() {}
            return (P.prototype = u), P;
          }
          var audioControllerFactory = (function () {
              function u(u) {
                (this.audios = []),
                  (this.audioFactory = u),
                  (this._volume = 1),
                  (this._isMuted = !1);
              }
              return (
                (u.prototype = {
                  addAudio: function (u) {
                    this.audios.push(u);
                  },
                  pause: function () {
                    var u,
                      P = this.audios.length;
                    for (u = 0; u < P; u += 1) this.audios[u].pause();
                  },
                  resume: function () {
                    var u,
                      P = this.audios.length;
                    for (u = 0; u < P; u += 1) this.audios[u].resume();
                  },
                  setRate: function (u) {
                    var P,
                      S = this.audios.length;
                    for (P = 0; P < S; P += 1) this.audios[P].setRate(u);
                  },
                  createAudio: function (u) {
                    return this.audioFactory
                      ? this.audioFactory(u)
                      : window.Howl
                      ? new window.Howl({ src: [u] })
                      : {
                          isPlaying: !1,
                          play: function () {
                            this.isPlaying = !0;
                          },
                          seek: function () {
                            this.isPlaying = !1;
                          },
                          playing: function () {},
                          rate: function () {},
                          setVolume: function () {},
                        };
                  },
                  setAudioFactory: function (u) {
                    this.audioFactory = u;
                  },
                  setVolume: function (u) {
                    (this._volume = u), this._updateVolume();
                  },
                  mute: function () {
                    (this._isMuted = !0), this._updateVolume();
                  },
                  unmute: function () {
                    (this._isMuted = !1), this._updateVolume();
                  },
                  getVolume: function () {
                    return this._volume;
                  },
                  _updateVolume: function () {
                    var u,
                      P = this.audios.length;
                    for (u = 0; u < P; u += 1)
                      this.audios[u].volume(
                        this._volume * (this._isMuted ? 0 : 1)
                      );
                  },
                }),
                function () {
                  return new u();
                }
              );
            })(),
            createTypedArray = (function () {
              function u(u, P) {
                var S,
                  D = 0,
                  T = [];
                switch (u) {
                  case 'int16':
                  case 'uint8c':
                    S = 1;
                    break;
                  default:
                    S = 1.1;
                }
                for (D = 0; D < P; D += 1) T.push(S);
                return T;
              }
              function P(P, S) {
                return 'float32' === P
                  ? new Float32Array(S)
                  : 'int16' === P
                  ? new Int16Array(S)
                  : 'uint8c' === P
                  ? new Uint8ClampedArray(S)
                  : u(P, S);
              }
              return 'function' == typeof Uint8ClampedArray &&
                'function' == typeof Float32Array
                ? P
                : u;
            })();
          function createSizedArray(u) {
            return Array.apply(null, { length: u });
          }
          function _typeof$6(u) {
            return (_typeof$6 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var subframeEnabled = !0,
            expressionsPlugin = null,
            expressionsInterfaces = null,
            idPrefix$1 = '',
            isSafari = /^((?!chrome|android).)*safari/i.test(
              navigator.userAgent
            ),
            _shouldRoundValues = !1,
            bmPow = Math.pow,
            bmSqrt = Math.sqrt,
            bmFloor = Math.floor,
            bmMax = Math.max,
            bmMin = Math.min,
            BMMath = {};
          function ProjectInterface$1() {
            return {};
          }
          !(function () {
            var u,
              P = [
                'abs',
                'acos',
                'acosh',
                'asin',
                'asinh',
                'atan',
                'atanh',
                'atan2',
                'ceil',
                'cbrt',
                'expm1',
                'clz32',
                'cos',
                'cosh',
                'exp',
                'floor',
                'fround',
                'hypot',
                'imul',
                'log',
                'log1p',
                'log2',
                'log10',
                'max',
                'min',
                'pow',
                'random',
                'round',
                'sign',
                'sin',
                'sinh',
                'sqrt',
                'tan',
                'tanh',
                'trunc',
                'E',
                'LN10',
                'LN2',
                'LOG10E',
                'LOG2E',
                'PI',
                'SQRT1_2',
                'SQRT2',
              ],
              S = P.length;
            for (u = 0; u < S; u += 1) BMMath[P[u]] = Math[P[u]];
          })(),
            (BMMath.random = Math.random),
            (BMMath.abs = function (u) {
              if ('object' === _typeof$6(u) && u.length) {
                var P,
                  S = createSizedArray(u.length),
                  D = u.length;
                for (P = 0; P < D; P += 1) S[P] = Math.abs(u[P]);
                return S;
              }
              return Math.abs(u);
            });
          var defaultCurveSegments = 150,
            degToRads = Math.PI / 180,
            roundCorner = 0.5519;
          function roundValues(u) {
            _shouldRoundValues = !!u;
          }
          function bmRnd(u) {
            return _shouldRoundValues ? Math.round(u) : u;
          }
          function styleDiv(u) {
            (u.style.position = 'absolute'),
              (u.style.top = 0),
              (u.style.left = 0),
              (u.style.display = 'block'),
              (u.style.transformOrigin = '0 0'),
              (u.style.webkitTransformOrigin = '0 0'),
              (u.style.backfaceVisibility = 'visible'),
              (u.style.webkitBackfaceVisibility = 'visible'),
              (u.style.transformStyle = 'preserve-3d'),
              (u.style.webkitTransformStyle = 'preserve-3d'),
              (u.style.mozTransformStyle = 'preserve-3d');
          }
          function BMEnterFrameEvent(u, P, S, D) {
            (this.type = u),
              (this.currentTime = P),
              (this.totalTime = S),
              (this.direction = D < 0 ? -1 : 1);
          }
          function BMCompleteEvent(u, P) {
            (this.type = u), (this.direction = P < 0 ? -1 : 1);
          }
          function BMCompleteLoopEvent(u, P, S, D) {
            (this.type = u),
              (this.currentLoop = S),
              (this.totalLoops = P),
              (this.direction = D < 0 ? -1 : 1);
          }
          function BMSegmentStartEvent(u, P, S) {
            (this.type = u), (this.firstFrame = P), (this.totalFrames = S);
          }
          function BMDestroyEvent(u, P) {
            (this.type = u), (this.target = P);
          }
          function BMRenderFrameErrorEvent(u, P) {
            (this.type = 'renderFrameError'),
              (this.nativeError = u),
              (this.currentTime = P);
          }
          function BMConfigErrorEvent(u) {
            (this.type = 'configError'), (this.nativeError = u);
          }
          function BMAnimationConfigErrorEvent(u, P) {
            (this.type = u), (this.nativeError = P);
          }
          var createElementID = (function () {
            var u = 0;
            return function () {
              return idPrefix$1 + '__lottie_element_' + (u += 1);
            };
          })();
          function HSVtoRGB(u, P, S) {
            var D, T, M, E, F, I, L, R;
            switch (
              ((E = Math.floor(6 * u)),
              (F = 6 * u - E),
              (I = S * (1 - P)),
              (L = S * (1 - F * P)),
              (R = S * (1 - (1 - F) * P)),
              E % 6)
            ) {
              case 0:
                (D = S), (T = R), (M = I);
                break;
              case 1:
                (D = L), (T = S), (M = I);
                break;
              case 2:
                (D = I), (T = S), (M = R);
                break;
              case 3:
                (D = I), (T = L), (M = S);
                break;
              case 4:
                (D = R), (T = I), (M = S);
                break;
              case 5:
                (D = S), (T = I), (M = L);
            }
            return [D, T, M];
          }
          function RGBtoHSV(u, P, S) {
            var D,
              T = Math.max(u, P, S),
              M = Math.min(u, P, S),
              E = T - M,
              F = 0 === T ? 0 : E / T,
              I = T / 255;
            switch (T) {
              case M:
                D = 0;
                break;
              case u:
                D = (P - S + E * (P < S ? 6 : 0)) / (6 * E);
                break;
              case P:
                D = (S - u + 2 * E) / (6 * E);
                break;
              case S:
                D = (u - P + 4 * E) / (6 * E);
            }
            return [D, F, I];
          }
          function addSaturationToRGB(u, P) {
            var S = RGBtoHSV(255 * u[0], 255 * u[1], 255 * u[2]);
            return (
              (S[1] += P),
              S[1] > 1 ? (S[1] = 1) : S[1] <= 0 && (S[1] = 0),
              HSVtoRGB(S[0], S[1], S[2])
            );
          }
          function addBrightnessToRGB(u, P) {
            var S = RGBtoHSV(255 * u[0], 255 * u[1], 255 * u[2]);
            return (
              (S[2] += P),
              S[2] > 1 ? (S[2] = 1) : S[2] < 0 && (S[2] = 0),
              HSVtoRGB(S[0], S[1], S[2])
            );
          }
          function addHueToRGB(u, P) {
            var S = RGBtoHSV(255 * u[0], 255 * u[1], 255 * u[2]);
            return (
              (S[0] += P / 360),
              S[0] > 1 ? (S[0] -= 1) : S[0] < 0 && (S[0] += 1),
              HSVtoRGB(S[0], S[1], S[2])
            );
          }
          var rgbToHex = (function () {
              var u,
                P,
                S = [];
              for (u = 0; u < 256; u += 1)
                (P = u.toString(16)), (S[u] = 1 === P.length ? '0' + P : P);
              return function (u, P, D) {
                return (
                  u < 0 && (u = 0),
                  P < 0 && (P = 0),
                  D < 0 && (D = 0),
                  '#' + S[u] + S[P] + S[D]
                );
              };
            })(),
            setSubframeEnabled = function (u) {
              subframeEnabled = !!u;
            },
            getSubframeEnabled = function () {
              return subframeEnabled;
            },
            setExpressionsPlugin = function (u) {
              expressionsPlugin = u;
            },
            getExpressionsPlugin = function () {
              return expressionsPlugin;
            },
            setExpressionInterfaces = function (u) {
              expressionsInterfaces = u;
            },
            getExpressionInterfaces = function () {
              return expressionsInterfaces;
            },
            setDefaultCurveSegments = function (u) {
              defaultCurveSegments = u;
            },
            getDefaultCurveSegments = function () {
              return defaultCurveSegments;
            },
            setIdPrefix = function (u) {
              idPrefix$1 = u;
            },
            getIdPrefix = function () {
              return idPrefix$1;
            };
          function createNS(u) {
            return document.createElementNS(svgNS, u);
          }
          function _typeof$5(u) {
            return (_typeof$5 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var dataManager = (function () {
              var u,
                P,
                S = 1,
                D = [],
                T = {
                  onmessage: function () {},
                  postMessage: function (P) {
                    u({ data: P });
                  },
                },
                M = {
                  postMessage: function (u) {
                    T.onmessage({ data: u });
                  },
                };
              function E(P) {
                if (window.Worker && window.Blob && getWebWorker()) {
                  var S = new Blob(
                      [
                        'var _workerSelf = self; self.onmessage = ',
                        P.toString(),
                      ],
                      { type: 'text/javascript' }
                    ),
                    D = URL.createObjectURL(S);
                  return new Worker(D);
                }
                return (u = P), T;
              }
              function F() {
                P ||
                  ((P = E(function (u) {
                    function P() {
                      function u(P, S) {
                        var E,
                          F,
                          I,
                          L,
                          R,
                          V,
                          O = P.length;
                        for (F = 0; F < O; F += 1)
                          if ('ks' in (E = P[F]) && !E.completed) {
                            if (((E.completed = !0), E.hasMask)) {
                              var G = E.masksProperties;
                              for (I = 0, L = G.length; I < L; I += 1)
                                if (G[I].pt.k.i) M(G[I].pt.k);
                                else
                                  for (
                                    R = 0, V = G[I].pt.k.length;
                                    R < V;
                                    R += 1
                                  )
                                    G[I].pt.k[R].s && M(G[I].pt.k[R].s[0]),
                                      G[I].pt.k[R].e && M(G[I].pt.k[R].e[0]);
                            }
                            0 === E.ty
                              ? ((E.layers = D(E.refId, S)), u(E.layers, S))
                              : 4 === E.ty
                              ? T(E.shapes)
                              : 5 === E.ty && N(E);
                          }
                      }
                      function P(P, S) {
                        if (P) {
                          var T = 0,
                            M = P.length;
                          for (T = 0; T < M; T += 1)
                            1 === P[T].t &&
                              ((P[T].data.layers = D(P[T].data.refId, S)),
                              u(P[T].data.layers, S));
                        }
                      }
                      function S(u, P) {
                        for (var S = 0, D = P.length; S < D; ) {
                          if (P[S].id === u) return P[S];
                          S += 1;
                        }
                        return null;
                      }
                      function D(u, P) {
                        var D = S(u, P);
                        return D
                          ? D.layers.__used
                            ? JSON.parse(JSON.stringify(D.layers))
                            : ((D.layers.__used = !0), D.layers)
                          : null;
                      }
                      function T(u) {
                        var P, S, D;
                        for (P = u.length - 1; P >= 0; P -= 1)
                          if ('sh' === u[P].ty) {
                            if (u[P].ks.k.i) M(u[P].ks.k);
                            else
                              for (S = 0, D = u[P].ks.k.length; S < D; S += 1)
                                u[P].ks.k[S].s && M(u[P].ks.k[S].s[0]),
                                  u[P].ks.k[S].e && M(u[P].ks.k[S].e[0]);
                          } else 'gr' === u[P].ty && T(u[P].it);
                      }
                      function M(u) {
                        var P,
                          S = u.i.length;
                        for (P = 0; P < S; P += 1)
                          (u.i[P][0] += u.v[P][0]),
                            (u.i[P][1] += u.v[P][1]),
                            (u.o[P][0] += u.v[P][0]),
                            (u.o[P][1] += u.v[P][1]);
                      }
                      function E(u, P) {
                        var S = P ? P.split('.') : [100, 100, 100];
                        return (
                          u[0] > S[0] ||
                          (!(S[0] > u[0]) &&
                            (u[1] > S[1] ||
                              (!(S[1] > u[1]) &&
                                (u[2] > S[2] || (!(S[2] > u[2]) && null)))))
                        );
                      }
                      var F = (function () {
                          var u = [4, 4, 14];
                          function P(u) {
                            var P = u.t.d;
                            u.t.d = { k: [{ s: P, t: 0 }] };
                          }
                          function S(u) {
                            var S,
                              D = u.length;
                            for (S = 0; S < D; S += 1) 5 === u[S].ty && P(u[S]);
                          }
                          return function (P) {
                            if (E(u, P.v) && (S(P.layers), P.assets)) {
                              var D,
                                T = P.assets.length;
                              for (D = 0; D < T; D += 1)
                                P.assets[D].layers && S(P.assets[D].layers);
                            }
                          };
                        })(),
                        I = (function () {
                          var u = [4, 7, 99];
                          return function (P) {
                            if (P.chars && !E(u, P.v)) {
                              var S,
                                D = P.chars.length;
                              for (S = 0; S < D; S += 1) {
                                var M = P.chars[S];
                                M.data &&
                                  M.data.shapes &&
                                  (T(M.data.shapes),
                                  (M.data.ip = 0),
                                  (M.data.op = 99999),
                                  (M.data.st = 0),
                                  (M.data.sr = 1),
                                  (M.data.ks = {
                                    p: { k: [0, 0], a: 0 },
                                    s: { k: [100, 100], a: 0 },
                                    a: { k: [0, 0], a: 0 },
                                    r: { k: 0, a: 0 },
                                    o: { k: 100, a: 0 },
                                  }),
                                  P.chars[S].t ||
                                    (M.data.shapes.push({ ty: 'no' }),
                                    M.data.shapes[0].it.push({
                                      p: { k: [0, 0], a: 0 },
                                      s: { k: [100, 100], a: 0 },
                                      a: { k: [0, 0], a: 0 },
                                      r: { k: 0, a: 0 },
                                      o: { k: 100, a: 0 },
                                      sk: { k: 0, a: 0 },
                                      sa: { k: 0, a: 0 },
                                      ty: 'tr',
                                    })));
                              }
                            }
                          };
                        })(),
                        L = (function () {
                          var u = [5, 7, 15];
                          function P(u) {
                            var P = u.t.p;
                            'number' == typeof P.a && (P.a = { a: 0, k: P.a }),
                              'number' == typeof P.p &&
                                (P.p = { a: 0, k: P.p }),
                              'number' == typeof P.r &&
                                (P.r = { a: 0, k: P.r });
                          }
                          function S(u) {
                            var S,
                              D = u.length;
                            for (S = 0; S < D; S += 1) 5 === u[S].ty && P(u[S]);
                          }
                          return function (P) {
                            if (E(u, P.v) && (S(P.layers), P.assets)) {
                              var D,
                                T = P.assets.length;
                              for (D = 0; D < T; D += 1)
                                P.assets[D].layers && S(P.assets[D].layers);
                            }
                          };
                        })(),
                        R = (function () {
                          var u = [4, 1, 9];
                          function P(u) {
                            var S,
                              D,
                              T,
                              M = u.length;
                            for (S = 0; S < M; S += 1)
                              if ('gr' === u[S].ty) P(u[S].it);
                              else if ('fl' === u[S].ty || 'st' === u[S].ty) {
                                if (u[S].c.k && u[S].c.k[0].i)
                                  for (
                                    D = 0, T = u[S].c.k.length;
                                    D < T;
                                    D += 1
                                  )
                                    u[S].c.k[D].s &&
                                      ((u[S].c.k[D].s[0] /= 255),
                                      (u[S].c.k[D].s[1] /= 255),
                                      (u[S].c.k[D].s[2] /= 255),
                                      (u[S].c.k[D].s[3] /= 255)),
                                      u[S].c.k[D].e &&
                                        ((u[S].c.k[D].e[0] /= 255),
                                        (u[S].c.k[D].e[1] /= 255),
                                        (u[S].c.k[D].e[2] /= 255),
                                        (u[S].c.k[D].e[3] /= 255));
                                else
                                  (u[S].c.k[0] /= 255),
                                    (u[S].c.k[1] /= 255),
                                    (u[S].c.k[2] /= 255),
                                    (u[S].c.k[3] /= 255);
                              }
                          }
                          function S(u) {
                            var S,
                              D = u.length;
                            for (S = 0; S < D; S += 1)
                              4 === u[S].ty && P(u[S].shapes);
                          }
                          return function (P) {
                            if (E(u, P.v) && (S(P.layers), P.assets)) {
                              var D,
                                T = P.assets.length;
                              for (D = 0; D < T; D += 1)
                                P.assets[D].layers && S(P.assets[D].layers);
                            }
                          };
                        })(),
                        V = (function () {
                          var u = [4, 4, 18];
                          function P(u) {
                            var S, D, T;
                            for (S = u.length - 1; S >= 0; S -= 1)
                              if ('sh' === u[S].ty) {
                                if (u[S].ks.k.i) u[S].ks.k.c = u[S].closed;
                                else
                                  for (
                                    D = 0, T = u[S].ks.k.length;
                                    D < T;
                                    D += 1
                                  )
                                    u[S].ks.k[D].s &&
                                      (u[S].ks.k[D].s[0].c = u[S].closed),
                                      u[S].ks.k[D].e &&
                                        (u[S].ks.k[D].e[0].c = u[S].closed);
                              } else 'gr' === u[S].ty && P(u[S].it);
                          }
                          function S(u) {
                            var S,
                              D,
                              T,
                              M,
                              E,
                              F,
                              I = u.length;
                            for (D = 0; D < I; D += 1) {
                              if ((S = u[D]).hasMask) {
                                var L = S.masksProperties;
                                for (T = 0, M = L.length; T < M; T += 1)
                                  if (L[T].pt.k.i) L[T].pt.k.c = L[T].cl;
                                  else
                                    for (
                                      E = 0, F = L[T].pt.k.length;
                                      E < F;
                                      E += 1
                                    )
                                      L[T].pt.k[E].s &&
                                        (L[T].pt.k[E].s[0].c = L[T].cl),
                                        L[T].pt.k[E].e &&
                                          (L[T].pt.k[E].e[0].c = L[T].cl);
                              }
                              4 === S.ty && P(S.shapes);
                            }
                          }
                          return function (P) {
                            if (E(u, P.v) && (S(P.layers), P.assets)) {
                              var D,
                                T = P.assets.length;
                              for (D = 0; D < T; D += 1)
                                P.assets[D].layers && S(P.assets[D].layers);
                            }
                          };
                        })();
                      function O(S) {
                        S.__complete ||
                          (R(S),
                          F(S),
                          I(S),
                          L(S),
                          V(S),
                          u(S.layers, S.assets),
                          P(S.chars, S.assets),
                          (S.__complete = !0));
                      }
                      function N(u) {
                        0 === u.t.a.length && u.t.p;
                      }
                      var G = {};
                      return (
                        (G.completeData = O),
                        (G.checkColors = R),
                        (G.checkChars = I),
                        (G.checkPathProperties = L),
                        (G.checkShapes = V),
                        (G.completeLayers = u),
                        G
                      );
                    }
                    if (
                      (M.dataManager || (M.dataManager = P()),
                      M.assetLoader ||
                        (M.assetLoader = (function () {
                          function u(u) {
                            var P = u.getResponseHeader('content-type');
                            return (P &&
                              'json' === u.responseType &&
                              -1 !== P.indexOf('json')) ||
                              (u.response && 'object' === _typeof$5(u.response))
                              ? u.response
                              : u.response && 'string' == typeof u.response
                              ? JSON.parse(u.response)
                              : u.responseText
                              ? JSON.parse(u.responseText)
                              : null;
                          }
                          return {
                            load: function (P, S, D, T) {
                              var M,
                                E = new XMLHttpRequest();
                              try {
                                E.responseType = 'json';
                              } catch (u) {}
                              E.onreadystatechange = function () {
                                if (4 === E.readyState) {
                                  if (200 === E.status) D((M = u(E)));
                                  else
                                    try {
                                      (M = u(E)), D(M);
                                    } catch (u) {
                                      T && T(u);
                                    }
                                }
                              };
                              try {
                                E.open('GET', P, !0);
                              } catch (u) {
                                E.open('GET', S + '/' + P, !0);
                              }
                              E.send();
                            },
                          };
                        })()),
                      'loadAnimation' === u.data.type)
                    )
                      M.assetLoader.load(
                        u.data.path,
                        u.data.fullPath,
                        function (P) {
                          M.dataManager.completeData(P),
                            M.postMessage({
                              id: u.data.id,
                              payload: P,
                              status: 'success',
                            });
                        },
                        function () {
                          M.postMessage({ id: u.data.id, status: 'error' });
                        }
                      );
                    else if ('complete' === u.data.type) {
                      var S = u.data.animation;
                      M.dataManager.completeData(S),
                        M.postMessage({
                          id: u.data.id,
                          payload: S,
                          status: 'success',
                        });
                    } else
                      'loadData' === u.data.type &&
                        M.assetLoader.load(
                          u.data.path,
                          u.data.fullPath,
                          function (P) {
                            M.postMessage({
                              id: u.data.id,
                              payload: P,
                              status: 'success',
                            });
                          },
                          function () {
                            M.postMessage({ id: u.data.id, status: 'error' });
                          }
                        );
                  })).onmessage = function (u) {
                    var P = u.data,
                      S = P.id,
                      T = D[S];
                    (D[S] = null),
                      'success' === P.status
                        ? T.onComplete(P.payload)
                        : T.onError && T.onError();
                  });
              }
              function I(u, P) {
                var T = 'processId_' + (S += 1);
                return (D[T] = { onComplete: u, onError: P }), T;
              }
              return {
                loadAnimation: function (u, S, D) {
                  F();
                  var T = I(S, D);
                  P.postMessage({
                    type: 'loadAnimation',
                    path: u,
                    fullPath: window.location.origin + window.location.pathname,
                    id: T,
                  });
                },
                loadData: function (u, S, D) {
                  F();
                  var T = I(S, D);
                  P.postMessage({
                    type: 'loadData',
                    path: u,
                    fullPath: window.location.origin + window.location.pathname,
                    id: T,
                  });
                },
                completeAnimation: function (u, S, D) {
                  F();
                  var T = I(S, D);
                  P.postMessage({ type: 'complete', animation: u, id: T });
                },
              };
            })(),
            ImagePreloader = (function () {
              var u = (function () {
                var u = createTag('canvas');
                (u.width = 1), (u.height = 1);
                var P = u.getContext('2d');
                return (
                  (P.fillStyle = 'rgba(0,0,0,0)'), P.fillRect(0, 0, 1, 1), u
                );
              })();
              function P() {
                (this.loadedAssets += 1),
                  this.loadedAssets === this.totalImages &&
                    this.loadedFootagesCount === this.totalFootages &&
                    this.imagesLoadedCb &&
                    this.imagesLoadedCb(null);
              }
              function S() {
                (this.loadedFootagesCount += 1),
                  this.loadedAssets === this.totalImages &&
                    this.loadedFootagesCount === this.totalFootages &&
                    this.imagesLoadedCb &&
                    this.imagesLoadedCb(null);
              }
              function D(u, P, S) {
                var D = '';
                if (u.e) D = u.p;
                else if (P) {
                  var T = u.p;
                  -1 !== T.indexOf('images/') && (T = T.split('/')[1]),
                    (D = P + T);
                } else D = S + (u.u ? u.u : '') + u.p;
                return D;
              }
              function T(u) {
                var P = 0,
                  S = setInterval(
                    function () {
                      (u.getBBox().width || P > 500) &&
                        (this._imageLoaded(), clearInterval(S)),
                        (P += 1);
                    }.bind(this),
                    50
                  );
              }
              function M(P) {
                var S = D(P, this.assetsPath, this.path),
                  T = createNS('image');
                isSafari
                  ? this.testImageLoaded(T)
                  : T.addEventListener('load', this._imageLoaded, !1),
                  T.addEventListener(
                    'error',
                    function () {
                      (M.img = u), this._imageLoaded();
                    }.bind(this),
                    !1
                  ),
                  T.setAttributeNS('http://www.w3.org/1999/xlink', 'href', S),
                  this._elementHelper.append
                    ? this._elementHelper.append(T)
                    : this._elementHelper.appendChild(T);
                var M = { img: T, assetData: P };
                return M;
              }
              function E(P) {
                var S = D(P, this.assetsPath, this.path),
                  T = createTag('img');
                (T.crossOrigin = 'anonymous'),
                  T.addEventListener('load', this._imageLoaded, !1),
                  T.addEventListener(
                    'error',
                    function () {
                      (M.img = u), this._imageLoaded();
                    }.bind(this),
                    !1
                  ),
                  (T.src = S);
                var M = { img: T, assetData: P };
                return M;
              }
              function F(u) {
                var P = { assetData: u },
                  S = D(u, this.assetsPath, this.path);
                return (
                  dataManager.loadData(
                    S,
                    function (u) {
                      (P.img = u), this._footageLoaded();
                    }.bind(this),
                    function () {
                      (P.img = {}), this._footageLoaded();
                    }.bind(this)
                  ),
                  P
                );
              }
              function I(u, P) {
                this.imagesLoadedCb = P;
                var S,
                  D = u.length;
                for (S = 0; S < D; S += 1)
                  u[S].layers ||
                    (u[S].t && 'seq' !== u[S].t
                      ? 3 === u[S].t &&
                        ((this.totalFootages += 1),
                        this.images.push(this.createFootageData(u[S])))
                      : ((this.totalImages += 1),
                        this.images.push(this._createImageData(u[S]))));
              }
              function L(u) {
                this.path = u || '';
              }
              function R(u) {
                this.assetsPath = u || '';
              }
              function V(u) {
                for (var P = 0, S = this.images.length; P < S; ) {
                  if (this.images[P].assetData === u) return this.images[P].img;
                  P += 1;
                }
                return null;
              }
              function O() {
                (this.imagesLoadedCb = null), (this.images.length = 0);
              }
              function N() {
                return this.totalImages === this.loadedAssets;
              }
              function G() {
                return this.totalFootages === this.loadedFootagesCount;
              }
              function W(u, P) {
                'svg' === u
                  ? ((this._elementHelper = P),
                    (this._createImageData = this.createImageData.bind(this)))
                  : (this._createImageData = this.createImgData.bind(this));
              }
              function Y() {
                (this._imageLoaded = P.bind(this)),
                  (this._footageLoaded = S.bind(this)),
                  (this.testImageLoaded = T.bind(this)),
                  (this.createFootageData = F.bind(this)),
                  (this.assetsPath = ''),
                  (this.path = ''),
                  (this.totalImages = 0),
                  (this.totalFootages = 0),
                  (this.loadedAssets = 0),
                  (this.loadedFootagesCount = 0),
                  (this.imagesLoadedCb = null),
                  (this.images = []);
              }
              return (
                (Y.prototype = {
                  loadAssets: I,
                  setAssetsPath: R,
                  setPath: L,
                  loadedImages: N,
                  loadedFootages: G,
                  destroy: O,
                  getAsset: V,
                  createImgData: E,
                  createImageData: M,
                  imageLoaded: P,
                  footageLoaded: S,
                  setCacheType: W,
                }),
                Y
              );
            })();
          function BaseEvent() {}
          BaseEvent.prototype = {
            triggerEvent: function (u, P) {
              if (this._cbs[u])
                for (var S = this._cbs[u], D = 0; D < S.length; D += 1) S[D](P);
            },
            addEventListener: function (u, P) {
              return (
                this._cbs[u] || (this._cbs[u] = []),
                this._cbs[u].push(P),
                function () {
                  this.removeEventListener(u, P);
                }.bind(this)
              );
            },
            removeEventListener: function (u, P) {
              if (P) {
                if (this._cbs[u]) {
                  for (var S = 0, D = this._cbs[u].length; S < D; )
                    this._cbs[u][S] === P &&
                      (this._cbs[u].splice(S, 1), (S -= 1), (D -= 1)),
                      (S += 1);
                  this._cbs[u].length || (this._cbs[u] = null);
                }
              } else this._cbs[u] = null;
            },
          };
          var markerParser = (function () {
              function u(u) {
                for (
                  var P, S = u.split('\r\n'), D = {}, T = 0, M = 0;
                  M < S.length;
                  M += 1
                )
                  2 === (P = S[M].split(':')).length &&
                    ((D[P[0]] = P[1].trim()), (T += 1));
                if (0 === T) throw Error();
                return D;
              }
              return function (P) {
                for (var S = [], D = 0; D < P.length; D += 1) {
                  var T = P[D],
                    M = { time: T.tm, duration: T.dr };
                  try {
                    M.payload = JSON.parse(P[D].cm);
                  } catch (S) {
                    try {
                      M.payload = u(P[D].cm);
                    } catch (u) {
                      M.payload = { name: P[D].cm };
                    }
                  }
                  S.push(M);
                }
                return S;
              };
            })(),
            ProjectInterface = (function () {
              function u(u) {
                this.compositions.push(u);
              }
              return function () {
                function P(u) {
                  for (var P = 0, S = this.compositions.length; P < S; ) {
                    if (
                      this.compositions[P].data &&
                      this.compositions[P].data.nm === u
                    )
                      return (
                        this.compositions[P].prepareFrame &&
                          this.compositions[P].data.xt &&
                          this.compositions[P].prepareFrame(this.currentFrame),
                        this.compositions[P].compInterface
                      );
                    P += 1;
                  }
                  return null;
                }
                return (
                  (P.compositions = []),
                  (P.currentFrame = 0),
                  (P.registerComposition = u),
                  P
                );
              };
            })(),
            renderers = {},
            registerRenderer = function (u, P) {
              renderers[u] = P;
            };
          function getRenderer(u) {
            return renderers[u];
          }
          function getRegisteredRenderer() {
            if (renderers.canvas) return 'canvas';
            for (var u in renderers) if (renderers[u]) return u;
            return '';
          }
          function _typeof$4(u) {
            return (_typeof$4 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var AnimationItem = function () {
            (this._cbs = []),
              (this.name = ''),
              (this.path = ''),
              (this.isLoaded = !1),
              (this.currentFrame = 0),
              (this.currentRawFrame = 0),
              (this.firstFrame = 0),
              (this.totalFrames = 0),
              (this.frameRate = 0),
              (this.frameMult = 0),
              (this.playSpeed = 1),
              (this.playDirection = 1),
              (this.playCount = 0),
              (this.animationData = {}),
              (this.assets = []),
              (this.isPaused = !0),
              (this.autoplay = !1),
              (this.loop = !0),
              (this.renderer = null),
              (this.animationID = createElementID()),
              (this.assetsPath = ''),
              (this.timeCompleted = 0),
              (this.segmentPos = 0),
              (this.isSubframeEnabled = getSubframeEnabled()),
              (this.segments = []),
              (this._idle = !0),
              (this._completedLoop = !1),
              (this.projectInterface = ProjectInterface()),
              (this.imagePreloader = new ImagePreloader()),
              (this.audioController = audioControllerFactory()),
              (this.markers = []),
              (this.configAnimation = this.configAnimation.bind(this)),
              (this.onSetupError = this.onSetupError.bind(this)),
              (this.onSegmentComplete = this.onSegmentComplete.bind(this)),
              (this.drawnFrameEvent = new BMEnterFrameEvent(
                'drawnFrame',
                0,
                0,
                0
              )),
              (this.expressionsPlugin = getExpressionsPlugin());
          };
          extendPrototype([BaseEvent], AnimationItem),
            (AnimationItem.prototype.setParams = function (u) {
              (u.wrapper || u.container) &&
                (this.wrapper = u.wrapper || u.container);
              var P = 'svg';
              u.animType ? (P = u.animType) : u.renderer && (P = u.renderer);
              var S = getRenderer(P);
              (this.renderer = new S(this, u.rendererSettings)),
                this.imagePreloader.setCacheType(
                  P,
                  this.renderer.globalData.defs
                ),
                this.renderer.setProjectInterface(this.projectInterface),
                (this.animType = P),
                '' === u.loop ||
                null === u.loop ||
                void 0 === u.loop ||
                !0 === u.loop
                  ? (this.loop = !0)
                  : !1 === u.loop
                  ? (this.loop = !1)
                  : (this.loop = parseInt(u.loop, 10)),
                (this.autoplay = !('autoplay' in u) || u.autoplay),
                (this.name = u.name ? u.name : ''),
                (this.autoloadSegments =
                  !Object.prototype.hasOwnProperty.call(
                    u,
                    'autoloadSegments'
                  ) || u.autoloadSegments),
                (this.assetsPath = u.assetsPath),
                (this.initialSegment = u.initialSegment),
                u.audioFactory &&
                  this.audioController.setAudioFactory(u.audioFactory),
                u.animationData
                  ? this.setupAnimation(u.animationData)
                  : u.path &&
                    (-1 !== u.path.lastIndexOf('\\')
                      ? (this.path = u.path.substr(
                          0,
                          u.path.lastIndexOf('\\') + 1
                        ))
                      : (this.path = u.path.substr(
                          0,
                          u.path.lastIndexOf('/') + 1
                        )),
                    (this.fileName = u.path.substr(
                      u.path.lastIndexOf('/') + 1
                    )),
                    (this.fileName = this.fileName.substr(
                      0,
                      this.fileName.lastIndexOf('.json')
                    )),
                    dataManager.loadAnimation(
                      u.path,
                      this.configAnimation,
                      this.onSetupError
                    ));
            }),
            (AnimationItem.prototype.onSetupError = function () {
              this.trigger('data_failed');
            }),
            (AnimationItem.prototype.setupAnimation = function (u) {
              dataManager.completeAnimation(u, this.configAnimation);
            }),
            (AnimationItem.prototype.setData = function (u, P) {
              P && 'object' !== _typeof$4(P) && (P = JSON.parse(P));
              var S = { wrapper: u, animationData: P },
                D = u.attributes;
              (S.path = D.getNamedItem('data-animation-path')
                ? D.getNamedItem('data-animation-path').value
                : D.getNamedItem('data-bm-path')
                ? D.getNamedItem('data-bm-path').value
                : D.getNamedItem('bm-path')
                ? D.getNamedItem('bm-path').value
                : ''),
                (S.animType = D.getNamedItem('data-anim-type')
                  ? D.getNamedItem('data-anim-type').value
                  : D.getNamedItem('data-bm-type')
                  ? D.getNamedItem('data-bm-type').value
                  : D.getNamedItem('bm-type')
                  ? D.getNamedItem('bm-type').value
                  : D.getNamedItem('data-bm-renderer')
                  ? D.getNamedItem('data-bm-renderer').value
                  : D.getNamedItem('bm-renderer')
                  ? D.getNamedItem('bm-renderer').value
                  : getRegisteredRenderer() || 'canvas');
              var T = D.getNamedItem('data-anim-loop')
                ? D.getNamedItem('data-anim-loop').value
                : D.getNamedItem('data-bm-loop')
                ? D.getNamedItem('data-bm-loop').value
                : D.getNamedItem('bm-loop')
                ? D.getNamedItem('bm-loop').value
                : '';
              'false' === T
                ? (S.loop = !1)
                : 'true' === T
                ? (S.loop = !0)
                : '' !== T && (S.loop = parseInt(T, 10));
              var M = D.getNamedItem('data-anim-autoplay')
                ? D.getNamedItem('data-anim-autoplay').value
                : D.getNamedItem('data-bm-autoplay')
                ? D.getNamedItem('data-bm-autoplay').value
                : !D.getNamedItem('bm-autoplay') ||
                  D.getNamedItem('bm-autoplay').value;
              (S.autoplay = 'false' !== M),
                (S.name = D.getNamedItem('data-name')
                  ? D.getNamedItem('data-name').value
                  : D.getNamedItem('data-bm-name')
                  ? D.getNamedItem('data-bm-name').value
                  : D.getNamedItem('bm-name')
                  ? D.getNamedItem('bm-name').value
                  : ''),
                'false' ===
                  (D.getNamedItem('data-anim-prerender')
                    ? D.getNamedItem('data-anim-prerender').value
                    : D.getNamedItem('data-bm-prerender')
                    ? D.getNamedItem('data-bm-prerender').value
                    : D.getNamedItem('bm-prerender')
                    ? D.getNamedItem('bm-prerender').value
                    : '') && (S.prerender = !1),
                S.path ? this.setParams(S) : this.trigger('destroy');
            }),
            (AnimationItem.prototype.includeLayers = function (u) {
              u.op > this.animationData.op &&
                ((this.animationData.op = u.op),
                (this.totalFrames = Math.floor(u.op - this.animationData.ip)));
              var P,
                S,
                D = this.animationData.layers,
                T = D.length,
                M = u.layers,
                E = M.length;
              for (S = 0; S < E; S += 1)
                for (P = 0; P < T; ) {
                  if (D[P].id === M[S].id) {
                    D[P] = M[S];
                    break;
                  }
                  P += 1;
                }
              if (
                ((u.chars || u.fonts) &&
                  (this.renderer.globalData.fontManager.addChars(u.chars),
                  this.renderer.globalData.fontManager.addFonts(
                    u.fonts,
                    this.renderer.globalData.defs
                  )),
                u.assets)
              )
                for (P = 0, T = u.assets.length; P < T; P += 1)
                  this.animationData.assets.push(u.assets[P]);
              (this.animationData.__complete = !1),
                dataManager.completeAnimation(
                  this.animationData,
                  this.onSegmentComplete
                );
            }),
            (AnimationItem.prototype.onSegmentComplete = function (u) {
              this.animationData = u;
              var P = getExpressionsPlugin();
              P && P.initExpressions(this), this.loadNextSegment();
            }),
            (AnimationItem.prototype.loadNextSegment = function () {
              var u = this.animationData.segments;
              if (!u || 0 === u.length || !this.autoloadSegments) {
                this.trigger('data_ready'),
                  (this.timeCompleted = this.totalFrames);
                return;
              }
              var P = u.shift();
              this.timeCompleted = P.time * this.frameRate;
              var S =
                this.path + this.fileName + '_' + this.segmentPos + '.json';
              (this.segmentPos += 1),
                dataManager.loadData(
                  S,
                  this.includeLayers.bind(this),
                  function () {
                    this.trigger('data_failed');
                  }.bind(this)
                );
            }),
            (AnimationItem.prototype.loadSegments = function () {
              this.animationData.segments ||
                (this.timeCompleted = this.totalFrames),
                this.loadNextSegment();
            }),
            (AnimationItem.prototype.imagesLoaded = function () {
              this.trigger('loaded_images'), this.checkLoaded();
            }),
            (AnimationItem.prototype.preloadImages = function () {
              this.imagePreloader.setAssetsPath(this.assetsPath),
                this.imagePreloader.setPath(this.path),
                this.imagePreloader.loadAssets(
                  this.animationData.assets,
                  this.imagesLoaded.bind(this)
                );
            }),
            (AnimationItem.prototype.configAnimation = function (u) {
              if (this.renderer)
                try {
                  (this.animationData = u),
                    this.initialSegment
                      ? ((this.totalFrames = Math.floor(
                          this.initialSegment[1] - this.initialSegment[0]
                        )),
                        (this.firstFrame = Math.round(this.initialSegment[0])))
                      : ((this.totalFrames = Math.floor(
                          this.animationData.op - this.animationData.ip
                        )),
                        (this.firstFrame = Math.round(this.animationData.ip))),
                    this.renderer.configAnimation(u),
                    u.assets || (u.assets = []),
                    (this.assets = this.animationData.assets),
                    (this.frameRate = this.animationData.fr),
                    (this.frameMult = this.animationData.fr / 1e3),
                    this.renderer.searchExtraCompositions(u.assets),
                    (this.markers = markerParser(u.markers || [])),
                    this.trigger('config_ready'),
                    this.preloadImages(),
                    this.loadSegments(),
                    this.updaFrameModifier(),
                    this.waitForFontsLoaded(),
                    this.isPaused && this.audioController.pause();
                } catch (u) {
                  this.triggerConfigError(u);
                }
            }),
            (AnimationItem.prototype.waitForFontsLoaded = function () {
              this.renderer &&
                (this.renderer.globalData.fontManager.isLoaded
                  ? this.checkLoaded()
                  : setTimeout(this.waitForFontsLoaded.bind(this), 20));
            }),
            (AnimationItem.prototype.checkLoaded = function () {
              if (
                !this.isLoaded &&
                this.renderer.globalData.fontManager.isLoaded &&
                (this.imagePreloader.loadedImages() ||
                  'canvas' !== this.renderer.rendererType) &&
                this.imagePreloader.loadedFootages()
              ) {
                this.isLoaded = !0;
                var u = getExpressionsPlugin();
                u && u.initExpressions(this),
                  this.renderer.initItems(),
                  setTimeout(
                    function () {
                      this.trigger('DOMLoaded');
                    }.bind(this),
                    0
                  ),
                  this.gotoFrame(),
                  this.autoplay && this.play();
              }
            }),
            (AnimationItem.prototype.resize = function (u, P) {
              var S = 'number' == typeof u ? u : void 0,
                D = 'number' == typeof P ? P : void 0;
              this.renderer.updateContainerSize(S, D);
            }),
            (AnimationItem.prototype.setSubframe = function (u) {
              this.isSubframeEnabled = !!u;
            }),
            (AnimationItem.prototype.gotoFrame = function () {
              (this.currentFrame = this.isSubframeEnabled
                ? this.currentRawFrame
                : ~~this.currentRawFrame),
                this.timeCompleted !== this.totalFrames &&
                  this.currentFrame > this.timeCompleted &&
                  (this.currentFrame = this.timeCompleted),
                this.trigger('enterFrame'),
                this.renderFrame(),
                this.trigger('drawnFrame');
            }),
            (AnimationItem.prototype.renderFrame = function () {
              if (!1 !== this.isLoaded && this.renderer)
                try {
                  this.expressionsPlugin && this.expressionsPlugin.resetFrame(),
                    this.renderer.renderFrame(
                      this.currentFrame + this.firstFrame
                    );
                } catch (u) {
                  this.triggerRenderFrameError(u);
                }
            }),
            (AnimationItem.prototype.play = function (u) {
              (!u || this.name === u) &&
                !0 === this.isPaused &&
                ((this.isPaused = !1),
                this.trigger('_play'),
                this.audioController.resume(),
                this._idle && ((this._idle = !1), this.trigger('_active')));
            }),
            (AnimationItem.prototype.pause = function (u) {
              (u && this.name !== u) ||
                !1 !== this.isPaused ||
                ((this.isPaused = !0),
                this.trigger('_pause'),
                (this._idle = !0),
                this.trigger('_idle'),
                this.audioController.pause());
            }),
            (AnimationItem.prototype.togglePause = function (u) {
              (u && this.name !== u) ||
                (!0 === this.isPaused ? this.play() : this.pause());
            }),
            (AnimationItem.prototype.stop = function (u) {
              (u && this.name !== u) ||
                (this.pause(),
                (this.playCount = 0),
                (this._completedLoop = !1),
                this.setCurrentRawFrameValue(0));
            }),
            (AnimationItem.prototype.getMarkerData = function (u) {
              for (var P, S = 0; S < this.markers.length; S += 1)
                if ((P = this.markers[S]).payload && P.payload.name === u)
                  return P;
              return null;
            }),
            (AnimationItem.prototype.goToAndStop = function (u, P, S) {
              if (!S || this.name === S) {
                if (isNaN(Number(u))) {
                  var D = this.getMarkerData(u);
                  D && this.goToAndStop(D.time, !0);
                } else
                  P
                    ? this.setCurrentRawFrameValue(u)
                    : this.setCurrentRawFrameValue(u * this.frameModifier);
                this.pause();
              }
            }),
            (AnimationItem.prototype.goToAndPlay = function (u, P, S) {
              if (!S || this.name === S) {
                var D = Number(u);
                if (isNaN(D)) {
                  var T = this.getMarkerData(u);
                  T &&
                    (T.duration
                      ? this.playSegments([T.time, T.time + T.duration], !0)
                      : this.goToAndStop(T.time, !0));
                } else this.goToAndStop(D, P, S);
                this.play();
              }
            }),
            (AnimationItem.prototype.advanceTime = function (u) {
              if (!0 !== this.isPaused && !1 !== this.isLoaded) {
                var P = this.currentRawFrame + u * this.frameModifier,
                  S = !1;
                P >= this.totalFrames - 1 && this.frameModifier > 0
                  ? this.loop && this.playCount !== this.loop
                    ? P >= this.totalFrames
                      ? ((this.playCount += 1),
                        this.checkSegments(P % this.totalFrames) ||
                          (this.setCurrentRawFrameValue(P % this.totalFrames),
                          (this._completedLoop = !0),
                          this.trigger('loopComplete')))
                      : this.setCurrentRawFrameValue(P)
                    : this.checkSegments(
                        P > this.totalFrames ? P % this.totalFrames : 0
                      ) || ((S = !0), (P = this.totalFrames - 1))
                  : P < 0
                  ? this.checkSegments(P % this.totalFrames) ||
                    (this.loop && !(this.playCount-- <= 0 && !0 !== this.loop)
                      ? (this.setCurrentRawFrameValue(
                          this.totalFrames + (P % this.totalFrames)
                        ),
                        this._completedLoop
                          ? this.trigger('loopComplete')
                          : (this._completedLoop = !0))
                      : ((S = !0), (P = 0)))
                  : this.setCurrentRawFrameValue(P),
                  S &&
                    (this.setCurrentRawFrameValue(P),
                    this.pause(),
                    this.trigger('complete'));
              }
            }),
            (AnimationItem.prototype.adjustSegment = function (u, P) {
              (this.playCount = 0),
                u[1] < u[0]
                  ? (this.frameModifier > 0 &&
                      (this.playSpeed < 0
                        ? this.setSpeed(-this.playSpeed)
                        : this.setDirection(-1)),
                    (this.totalFrames = u[0] - u[1]),
                    (this.timeCompleted = this.totalFrames),
                    (this.firstFrame = u[1]),
                    this.setCurrentRawFrameValue(this.totalFrames - 0.001 - P))
                  : u[1] > u[0] &&
                    (this.frameModifier < 0 &&
                      (this.playSpeed < 0
                        ? this.setSpeed(-this.playSpeed)
                        : this.setDirection(1)),
                    (this.totalFrames = u[1] - u[0]),
                    (this.timeCompleted = this.totalFrames),
                    (this.firstFrame = u[0]),
                    this.setCurrentRawFrameValue(0.001 + P)),
                this.trigger('segmentStart');
            }),
            (AnimationItem.prototype.setSegment = function (u, P) {
              var S = -1;
              this.isPaused &&
                (this.currentRawFrame + this.firstFrame < u
                  ? (S = u)
                  : this.currentRawFrame + this.firstFrame > P && (S = P - u)),
                (this.firstFrame = u),
                (this.totalFrames = P - u),
                (this.timeCompleted = this.totalFrames),
                -1 !== S && this.goToAndStop(S, !0);
            }),
            (AnimationItem.prototype.playSegments = function (u, P) {
              if (
                (P && (this.segments.length = 0), 'object' === _typeof$4(u[0]))
              ) {
                var S,
                  D = u.length;
                for (S = 0; S < D; S += 1) this.segments.push(u[S]);
              } else this.segments.push(u);
              this.segments.length &&
                P &&
                this.adjustSegment(this.segments.shift(), 0),
                this.isPaused && this.play();
            }),
            (AnimationItem.prototype.resetSegments = function (u) {
              (this.segments.length = 0),
                this.segments.push([
                  this.animationData.ip,
                  this.animationData.op,
                ]),
                u && this.checkSegments(0);
            }),
            (AnimationItem.prototype.checkSegments = function (u) {
              return (
                !!this.segments.length &&
                (this.adjustSegment(this.segments.shift(), u), !0)
              );
            }),
            (AnimationItem.prototype.destroy = function (u) {
              (!u || this.name === u) &&
                this.renderer &&
                (this.renderer.destroy(),
                this.imagePreloader.destroy(),
                this.trigger('destroy'),
                (this._cbs = null),
                (this.onEnterFrame = null),
                (this.onLoopComplete = null),
                (this.onComplete = null),
                (this.onSegmentStart = null),
                (this.onDestroy = null),
                (this.renderer = null),
                (this.expressionsPlugin = null),
                (this.imagePreloader = null),
                (this.projectInterface = null));
            }),
            (AnimationItem.prototype.setCurrentRawFrameValue = function (u) {
              (this.currentRawFrame = u), this.gotoFrame();
            }),
            (AnimationItem.prototype.setSpeed = function (u) {
              (this.playSpeed = u), this.updaFrameModifier();
            }),
            (AnimationItem.prototype.setDirection = function (u) {
              (this.playDirection = u < 0 ? -1 : 1), this.updaFrameModifier();
            }),
            (AnimationItem.prototype.setLoop = function (u) {
              this.loop = u;
            }),
            (AnimationItem.prototype.setVolume = function (u, P) {
              (P && this.name !== P) || this.audioController.setVolume(u);
            }),
            (AnimationItem.prototype.getVolume = function () {
              return this.audioController.getVolume();
            }),
            (AnimationItem.prototype.mute = function (u) {
              (u && this.name !== u) || this.audioController.mute();
            }),
            (AnimationItem.prototype.unmute = function (u) {
              (u && this.name !== u) || this.audioController.unmute();
            }),
            (AnimationItem.prototype.updaFrameModifier = function () {
              (this.frameModifier =
                this.frameMult * this.playSpeed * this.playDirection),
                this.audioController.setRate(
                  this.playSpeed * this.playDirection
                );
            }),
            (AnimationItem.prototype.getPath = function () {
              return this.path;
            }),
            (AnimationItem.prototype.getAssetsPath = function (u) {
              var P = '';
              if (u.e) P = u.p;
              else if (this.assetsPath) {
                var S = u.p;
                -1 !== S.indexOf('images/') && (S = S.split('/')[1]),
                  (P = this.assetsPath + S);
              } else P = this.path + (u.u ? u.u : '') + u.p;
              return P;
            }),
            (AnimationItem.prototype.getAssetData = function (u) {
              for (var P = 0, S = this.assets.length; P < S; ) {
                if (u === this.assets[P].id) return this.assets[P];
                P += 1;
              }
              return null;
            }),
            (AnimationItem.prototype.hide = function () {
              this.renderer.hide();
            }),
            (AnimationItem.prototype.show = function () {
              this.renderer.show();
            }),
            (AnimationItem.prototype.getDuration = function (u) {
              return u ? this.totalFrames : this.totalFrames / this.frameRate;
            }),
            (AnimationItem.prototype.updateDocumentData = function (u, P, S) {
              try {
                this.renderer.getElementByPath(u).updateDocumentData(P, S);
              } catch (u) {}
            }),
            (AnimationItem.prototype.trigger = function (u) {
              if (this._cbs && this._cbs[u])
                switch (u) {
                  case 'enterFrame':
                    this.triggerEvent(
                      u,
                      new BMEnterFrameEvent(
                        u,
                        this.currentFrame,
                        this.totalFrames,
                        this.frameModifier
                      )
                    );
                    break;
                  case 'drawnFrame':
                    (this.drawnFrameEvent.currentTime = this.currentFrame),
                      (this.drawnFrameEvent.totalTime = this.totalFrames),
                      (this.drawnFrameEvent.direction = this.frameModifier),
                      this.triggerEvent(u, this.drawnFrameEvent);
                    break;
                  case 'loopComplete':
                    this.triggerEvent(
                      u,
                      new BMCompleteLoopEvent(
                        u,
                        this.loop,
                        this.playCount,
                        this.frameMult
                      )
                    );
                    break;
                  case 'complete':
                    this.triggerEvent(
                      u,
                      new BMCompleteEvent(u, this.frameMult)
                    );
                    break;
                  case 'segmentStart':
                    this.triggerEvent(
                      u,
                      new BMSegmentStartEvent(
                        u,
                        this.firstFrame,
                        this.totalFrames
                      )
                    );
                    break;
                  case 'destroy':
                    this.triggerEvent(u, new BMDestroyEvent(u, this));
                    break;
                  default:
                    this.triggerEvent(u);
                }
              'enterFrame' === u &&
                this.onEnterFrame &&
                this.onEnterFrame.call(
                  this,
                  new BMEnterFrameEvent(
                    u,
                    this.currentFrame,
                    this.totalFrames,
                    this.frameMult
                  )
                ),
                'loopComplete' === u &&
                  this.onLoopComplete &&
                  this.onLoopComplete.call(
                    this,
                    new BMCompleteLoopEvent(
                      u,
                      this.loop,
                      this.playCount,
                      this.frameMult
                    )
                  ),
                'complete' === u &&
                  this.onComplete &&
                  this.onComplete.call(
                    this,
                    new BMCompleteEvent(u, this.frameMult)
                  ),
                'segmentStart' === u &&
                  this.onSegmentStart &&
                  this.onSegmentStart.call(
                    this,
                    new BMSegmentStartEvent(
                      u,
                      this.firstFrame,
                      this.totalFrames
                    )
                  ),
                'destroy' === u &&
                  this.onDestroy &&
                  this.onDestroy.call(this, new BMDestroyEvent(u, this));
            }),
            (AnimationItem.prototype.triggerRenderFrameError = function (u) {
              var P = new BMRenderFrameErrorEvent(u, this.currentFrame);
              this.triggerEvent('error', P),
                this.onError && this.onError.call(this, P);
            }),
            (AnimationItem.prototype.triggerConfigError = function (u) {
              var P = new BMConfigErrorEvent(u, this.currentFrame);
              this.triggerEvent('error', P),
                this.onError && this.onError.call(this, P);
            });
          var animationManager = (function () {
              var u = {},
                P = [],
                S = 0,
                D = 0,
                T = 0,
                M = !0,
                E = !1;
              function F(u) {
                for (var S = 0, T = u.target; S < D; )
                  P[S].animation !== T ||
                    (P.splice(S, 1), (S -= 1), (D -= 1), T.isPaused || V()),
                    (S += 1);
              }
              function I(u, S) {
                if (!u) return null;
                for (var T = 0; T < D; ) {
                  if (P[T].elem === u && null !== P[T].elem)
                    return P[T].animation;
                  T += 1;
                }
                var M = new AnimationItem();
                return O(M, u), M.setData(u, S), M;
              }
              function L() {
                var u,
                  S = P.length,
                  D = [];
                for (u = 0; u < S; u += 1) D.push(P[u].animation);
                return D;
              }
              function R() {
                (T += 1), te();
              }
              function V() {
                T -= 1;
              }
              function O(u, S) {
                u.addEventListener('destroy', F),
                  u.addEventListener('_active', R),
                  u.addEventListener('_idle', V),
                  P.push({ elem: S, animation: u }),
                  (D += 1);
              }
              function N(u) {
                var P = new AnimationItem();
                return O(P, null), P.setParams(u), P;
              }
              function G(u, S) {
                var T;
                for (T = 0; T < D; T += 1) P[T].animation.setSpeed(u, S);
              }
              function W(u, S) {
                var T;
                for (T = 0; T < D; T += 1) P[T].animation.setDirection(u, S);
              }
              function Y(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.play(u);
              }
              function H(u) {
                var F,
                  I = u - S;
                for (F = 0; F < D; F += 1) P[F].animation.advanceTime(I);
                (S = u), T && !E ? window.requestAnimationFrame(H) : (M = !0);
              }
              function X(u) {
                (S = u), window.requestAnimationFrame(H);
              }
              function J(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.pause(u);
              }
              function K(u, S, T) {
                var M;
                for (M = 0; M < D; M += 1) P[M].animation.goToAndStop(u, S, T);
              }
              function Z(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.stop(u);
              }
              function U(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.togglePause(u);
              }
              function Q(u) {
                var S;
                for (S = D - 1; S >= 0; S -= 1) P[S].animation.destroy(u);
              }
              function $(u, P, S) {
                var D,
                  T = [].concat(
                    [].slice.call(document.getElementsByClassName('lottie')),
                    [].slice.call(document.getElementsByClassName('bodymovin'))
                  ),
                  M = T.length;
                for (D = 0; D < M; D += 1)
                  S && T[D].setAttribute('data-bm-type', S), I(T[D], u);
                if (P && 0 === M) {
                  S || (S = 'svg');
                  var E = document.getElementsByTagName('body')[0];
                  E.innerText = '';
                  var F = createTag('div');
                  (F.style.width = '100%'),
                    (F.style.height = '100%'),
                    F.setAttribute('data-bm-type', S),
                    E.appendChild(F),
                    I(F, u);
                }
              }
              function tt() {
                var u;
                for (u = 0; u < D; u += 1) P[u].animation.resize();
              }
              function te() {
                !E && T && M && (window.requestAnimationFrame(X), (M = !1));
              }
              function ts() {
                E = !0;
              }
              function tr() {
                (E = !1), te();
              }
              function ta(u, S) {
                var T;
                for (T = 0; T < D; T += 1) P[T].animation.setVolume(u, S);
              }
              function tn(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.mute(u);
              }
              function th(u) {
                var S;
                for (S = 0; S < D; S += 1) P[S].animation.unmute(u);
              }
              return (
                (u.registerAnimation = I),
                (u.loadAnimation = N),
                (u.setSpeed = G),
                (u.setDirection = W),
                (u.play = Y),
                (u.pause = J),
                (u.stop = Z),
                (u.togglePause = U),
                (u.searchAnimations = $),
                (u.resize = tt),
                (u.goToAndStop = K),
                (u.destroy = Q),
                (u.freeze = ts),
                (u.unfreeze = tr),
                (u.setVolume = ta),
                (u.mute = tn),
                (u.unmute = th),
                (u.getRegisteredAnimations = L),
                u
              );
            })(),
            BezierFactory = (function () {
              var u = {};
              u.getBezierEasing = S;
              var P = {};
              function S(u, S, D, T, M) {
                var E =
                  M ||
                  ('bez_' + u + '_' + S + '_' + D + '_' + T).replace(
                    /\./g,
                    'p'
                  );
                if (P[E]) return P[E];
                var F = new H([u, S, D, T]);
                return (P[E] = F), F;
              }
              var D = 4,
                T = 0.001,
                M = 1e-7,
                E = 10,
                F = 11,
                I = 0.1,
                L = 'function' == typeof Float32Array;
              function R(u, P) {
                return 1 - 3 * P + 3 * u;
              }
              function V(u, P) {
                return 3 * P - 6 * u;
              }
              function O(u) {
                return 3 * u;
              }
              function N(u, P, S) {
                return ((R(P, S) * u + V(P, S)) * u + O(P)) * u;
              }
              function G(u, P, S) {
                return 3 * R(P, S) * u * u + 2 * V(P, S) * u + O(P);
              }
              function W(u, P, S, D, T) {
                var F,
                  I,
                  L = 0;
                do
                  (F = N((I = P + (S - P) / 2), D, T) - u) > 0
                    ? (S = I)
                    : (P = I);
                while (Math.abs(F) > M && ++L < E);
                return I;
              }
              function Y(u, P, S, T) {
                for (var M = 0; M < D; ++M) {
                  var E = G(P, S, T);
                  if (0 === E) break;
                  var F = N(P, S, T) - u;
                  P -= F / E;
                }
                return P;
              }
              function H(u) {
                (this._p = u),
                  (this._mSampleValues = L ? new Float32Array(F) : Array(F)),
                  (this._precomputed = !1),
                  (this.get = this.get.bind(this));
              }
              return (
                (H.prototype = {
                  get: function (u) {
                    var P = this._p[0],
                      S = this._p[1],
                      D = this._p[2],
                      T = this._p[3];
                    return (this._precomputed || this._precompute(),
                    P === S && D === T)
                      ? u
                      : 0 === u
                      ? 0
                      : 1 === u
                      ? 1
                      : N(this._getTForX(u), S, T);
                  },
                  _precompute: function () {
                    var u = this._p[0],
                      P = this._p[1],
                      S = this._p[2],
                      D = this._p[3];
                    (this._precomputed = !0),
                      (u !== P || S !== D) && this._calcSampleValues();
                  },
                  _calcSampleValues: function () {
                    for (var u = this._p[0], P = this._p[2], S = 0; S < F; ++S)
                      this._mSampleValues[S] = N(S * I, u, P);
                  },
                  _getTForX: function (u) {
                    for (
                      var P = this._p[0],
                        S = this._p[2],
                        D = this._mSampleValues,
                        M = 0,
                        E = 1,
                        L = F - 1;
                      E !== L && D[E] <= u;
                      ++E
                    )
                      M += I;
                    var R = M + ((u - D[--E]) / (D[E + 1] - D[E])) * I,
                      V = G(R, P, S);
                    return V >= T
                      ? Y(u, R, P, S)
                      : 0 === V
                      ? R
                      : W(u, M, M + I, P, S);
                  },
                }),
                u
              );
            })(),
            pooling = (function () {
              return {
                double: function (u) {
                  return u.concat(createSizedArray(u.length));
                },
              };
            })(),
            poolFactory = (function () {
              return function (u, P, S) {
                var D = 0,
                  T = u,
                  M = createSizedArray(T);
                return {
                  newElement: function () {
                    var u;
                    return D ? ((D -= 1), (u = M[D])) : (u = P()), u;
                  },
                  release: function (u) {
                    D === T && ((M = pooling.double(M)), (T *= 2)),
                      S && S(u),
                      (M[D] = u),
                      (D += 1);
                  },
                };
              };
            })(),
            bezierLengthPool = (function () {
              return poolFactory(8, function () {
                return {
                  addedLength: 0,
                  percents: createTypedArray(
                    'float32',
                    getDefaultCurveSegments()
                  ),
                  lengths: createTypedArray(
                    'float32',
                    getDefaultCurveSegments()
                  ),
                };
              });
            })(),
            segmentsLengthPool = (function () {
              function u(u) {
                var P,
                  S = u.lengths.length;
                for (P = 0; P < S; P += 1)
                  bezierLengthPool.release(u.lengths[P]);
                u.lengths.length = 0;
              }
              return poolFactory(
                8,
                function () {
                  return { lengths: [], totalLength: 0 };
                },
                u
              );
            })();
          function bezFunction() {
            var u = Math;
            function P(u, P, S, D, T, M) {
              var E = u * D + P * T + S * M - T * D - M * u - S * P;
              return E > -0.001 && E < 0.001;
            }
            function S(S, D, T, M, E, F, I, L, R) {
              if (0 === T && 0 === F && 0 === R) return P(S, D, M, E, I, L);
              var V,
                O = u.sqrt(u.pow(M - S, 2) + u.pow(E - D, 2) + u.pow(F - T, 2)),
                N = u.sqrt(u.pow(I - S, 2) + u.pow(L - D, 2) + u.pow(R - T, 2)),
                G = u.sqrt(u.pow(I - M, 2) + u.pow(L - E, 2) + u.pow(R - F, 2));
              return (
                (V =
                  O > N
                    ? O > G
                      ? O - N - G
                      : G - N - O
                    : G > N
                    ? G - N - O
                    : N - O - G) > -0.0001 && V < 1e-4
              );
            }
            var D = (function () {
              return function (u, P, S, D) {
                var T,
                  M,
                  E,
                  F,
                  I,
                  L,
                  R = getDefaultCurveSegments(),
                  V = 0,
                  O = [],
                  N = [],
                  G = bezierLengthPool.newElement();
                for (T = 0, E = S.length; T < R; T += 1) {
                  for (M = 0, I = T / (R - 1), L = 0; M < E; M += 1)
                    (F =
                      bmPow(1 - I, 3) * u[M] +
                      3 * bmPow(1 - I, 2) * I * S[M] +
                      3 * (1 - I) * bmPow(I, 2) * D[M] +
                      bmPow(I, 3) * P[M]),
                      (O[M] = F),
                      null !== N[M] && (L += bmPow(O[M] - N[M], 2)),
                      (N[M] = O[M]);
                  L && (V += L = bmSqrt(L)),
                    (G.percents[T] = I),
                    (G.lengths[T] = V);
                }
                return (G.addedLength = V), G;
              };
            })();
            function T(u) {
              var P,
                S = segmentsLengthPool.newElement(),
                T = u.c,
                M = u.v,
                E = u.o,
                F = u.i,
                I = u._length,
                L = S.lengths,
                R = 0;
              for (P = 0; P < I - 1; P += 1)
                (L[P] = D(M[P], M[P + 1], E[P], F[P + 1])),
                  (R += L[P].addedLength);
              return (
                T &&
                  I &&
                  ((L[P] = D(M[P], M[0], E[P], F[0])), (R += L[P].addedLength)),
                (S.totalLength = R),
                S
              );
            }
            function M(u) {
              (this.segmentLength = 0), (this.points = Array(u));
            }
            function E(u, P) {
              (this.partialLength = u), (this.point = P);
            }
            var F = (function () {
              var u = {};
              return function (S, D, T, F) {
                var I = (
                  S[0] +
                  '_' +
                  S[1] +
                  '_' +
                  D[0] +
                  '_' +
                  D[1] +
                  '_' +
                  T[0] +
                  '_' +
                  T[1] +
                  '_' +
                  F[0] +
                  '_' +
                  F[1]
                ).replace(/\./g, 'p');
                if (!u[I]) {
                  var L,
                    R,
                    V,
                    O,
                    N,
                    G,
                    W,
                    Y = getDefaultCurveSegments(),
                    H = 0,
                    X = null;
                  2 === S.length &&
                    (S[0] !== D[0] || S[1] !== D[1]) &&
                    P(S[0], S[1], D[0], D[1], S[0] + T[0], S[1] + T[1]) &&
                    P(S[0], S[1], D[0], D[1], D[0] + F[0], D[1] + F[1]) &&
                    (Y = 2);
                  var J = new M(Y);
                  for (L = 0, V = T.length; L < Y; L += 1) {
                    for (
                      R = 0, W = createSizedArray(V), N = L / (Y - 1), G = 0;
                      R < V;
                      R += 1
                    )
                      (O =
                        bmPow(1 - N, 3) * S[R] +
                        3 * bmPow(1 - N, 2) * N * (S[R] + T[R]) +
                        3 * (1 - N) * bmPow(N, 2) * (D[R] + F[R]) +
                        bmPow(N, 3) * D[R]),
                        (W[R] = O),
                        null !== X && (G += bmPow(W[R] - X[R], 2));
                    (H += G = bmSqrt(G)), (J.points[L] = new E(G, W)), (X = W);
                  }
                  (J.segmentLength = H), (u[I] = J);
                }
                return u[I];
              };
            })();
            function I(u, P) {
              var S = P.percents,
                D = P.lengths,
                T = S.length,
                M = bmFloor((T - 1) * u),
                E = u * P.addedLength,
                F = 0;
              if (M === T - 1 || 0 === M || E === D[M]) return S[M];
              for (var I = D[M] > E ? -1 : 1, L = !0; L; )
                if (
                  (D[M] <= E && D[M + 1] > E
                    ? ((F = (E - D[M]) / (D[M + 1] - D[M])), (L = !1))
                    : (M += I),
                  M < 0 || M >= T - 1)
                ) {
                  if (M === T - 1) return S[M];
                  L = !1;
                }
              return S[M] + (S[M + 1] - S[M]) * F;
            }
            function L(P, S, D, T, M, E) {
              var F = I(M, E),
                L = 1 - F;
              return [
                u.round(
                  (L * L * L * P[0] +
                    (F * L * L + L * F * L + L * L * F) * D[0] +
                    (F * F * L + L * F * F + F * L * F) * T[0] +
                    F * F * F * S[0]) *
                    1e3
                ) / 1e3,
                u.round(
                  (L * L * L * P[1] +
                    (F * L * L + L * F * L + L * L * F) * D[1] +
                    (F * F * L + L * F * F + F * L * F) * T[1] +
                    F * F * F * S[1]) *
                    1e3
                ) / 1e3,
              ];
            }
            var R = createTypedArray('float32', 8);
            return {
              getSegmentsLength: T,
              getNewSegment: function (P, S, D, T, M, E, F) {
                M < 0 ? (M = 0) : M > 1 && (M = 1);
                var L,
                  V = I(M, F),
                  O = I((E = E > 1 ? 1 : E), F),
                  N = P.length,
                  G = 1 - V,
                  W = 1 - O,
                  Y = G * G * G,
                  H = V * G * G * 3,
                  X = V * V * G * 3,
                  J = V * V * V,
                  K = G * G * W,
                  Z = V * G * W + G * V * W + G * G * O,
                  U = V * V * W + G * V * O + V * G * O,
                  Q = V * V * O,
                  $ = G * W * W,
                  tt = V * W * W + G * O * W + G * W * O,
                  te = V * O * W + G * O * O + V * W * O,
                  ts = V * O * O,
                  tr = W * W * W,
                  ta = O * W * W + W * O * W + W * W * O,
                  tn = O * O * W + W * O * O + O * W * O,
                  th = O * O * O;
                for (L = 0; L < N; L += 1)
                  (R[4 * L] =
                    u.round((Y * P[L] + H * D[L] + X * T[L] + J * S[L]) * 1e3) /
                    1e3),
                    (R[4 * L + 1] =
                      u.round(
                        (K * P[L] + Z * D[L] + U * T[L] + Q * S[L]) * 1e3
                      ) / 1e3),
                    (R[4 * L + 2] =
                      u.round(
                        ($ * P[L] + tt * D[L] + te * T[L] + ts * S[L]) * 1e3
                      ) / 1e3),
                    (R[4 * L + 3] =
                      u.round(
                        (tr * P[L] + ta * D[L] + tn * T[L] + th * S[L]) * 1e3
                      ) / 1e3);
                return R;
              },
              getPointInSegment: L,
              buildBezierData: F,
              pointOnLine2D: P,
              pointOnLine3D: S,
            };
          }
          var bez = bezFunction(),
            initFrame = initialDefaultFrame,
            mathAbs = Math.abs;
          function interpolateValue(u, P) {
            var S,
              D,
              T,
              M,
              E,
              F = this.offsetTime;
            'multidimensional' === this.propType &&
              (Y = createTypedArray('float32', this.pv.length));
            for (
              var I = P.lastIndex, L = I, R = this.keyframes.length - 1, V = !0;
              V;

            ) {
              if (
                ((H = this.keyframes[L]),
                (X = this.keyframes[L + 1]),
                L === R - 1 && u >= X.t - F)
              ) {
                H.h && (H = X), (I = 0);
                break;
              }
              if (X.t - F > u) {
                I = L;
                break;
              }
              L < R - 1 ? (L += 1) : ((I = 0), (V = !1));
            }
            J = this.keyframesMetadata[L] || {};
            var O = X.t - F,
              N = H.t - F;
            if (H.to) {
              J.bezierData ||
                (J.bezierData = bez.buildBezierData(
                  H.s,
                  X.s || H.e,
                  H.to,
                  H.ti
                ));
              var G = J.bezierData;
              if (u >= O || u < N) {
                var W = u >= O ? G.points.length - 1 : 0;
                for (K = 0, Z = G.points[W].point.length; K < Z; K += 1)
                  Y[K] = G.points[W].point[K];
              } else {
                J.__fnct
                  ? (tt = J.__fnct)
                  : ((tt = BezierFactory.getBezierEasing(
                      H.o.x,
                      H.o.y,
                      H.i.x,
                      H.i.y,
                      H.n
                    ).get),
                    (J.__fnct = tt)),
                  (U = tt((u - N) / (O - N)));
                var Y,
                  H,
                  X,
                  J,
                  K,
                  Z,
                  U,
                  Q,
                  $,
                  tt,
                  te,
                  ts,
                  tr = G.segmentLength * U,
                  ta =
                    P.lastFrame < u && P._lastKeyframeIndex === L
                      ? P._lastAddedLength
                      : 0;
                for (
                  $ =
                    P.lastFrame < u && P._lastKeyframeIndex === L
                      ? P._lastPoint
                      : 0,
                    V = !0,
                    Q = G.points.length;
                  V;

                ) {
                  if (
                    ((ta += G.points[$].partialLength),
                    0 === tr || 0 === U || $ === G.points.length - 1)
                  ) {
                    for (K = 0, Z = G.points[$].point.length; K < Z; K += 1)
                      Y[K] = G.points[$].point[K];
                    break;
                  }
                  if (tr >= ta && tr < ta + G.points[$ + 1].partialLength) {
                    for (
                      K = 0,
                        ts = (tr - ta) / G.points[$ + 1].partialLength,
                        Z = G.points[$].point.length;
                      K < Z;
                      K += 1
                    )
                      Y[K] =
                        G.points[$].point[K] +
                        (G.points[$ + 1].point[K] - G.points[$].point[K]) * ts;
                    break;
                  }
                  $ < Q - 1 ? ($ += 1) : (V = !1);
                }
                (P._lastPoint = $),
                  (P._lastAddedLength = ta - G.points[$].partialLength),
                  (P._lastKeyframeIndex = L);
              }
            } else if (
              ((R = H.s.length), (te = X.s || H.e), this.sh && 1 !== H.h)
            )
              u >= O
                ? ((Y[0] = te[0]), (Y[1] = te[1]), (Y[2] = te[2]))
                : u <= N
                ? ((Y[0] = H.s[0]), (Y[1] = H.s[1]), (Y[2] = H.s[2]))
                : quaternionToEuler(
                    Y,
                    slerp(
                      createQuaternion(H.s),
                      createQuaternion(te),
                      (u - N) / (O - N)
                    )
                  );
            else
              for (L = 0; L < R; L += 1)
                1 !== H.h &&
                  (u >= O
                    ? (U = 1)
                    : u < N
                    ? (U = 0)
                    : (H.o.x.constructor === Array
                        ? (J.__fnct || (J.__fnct = []),
                          J.__fnct[L]
                            ? (tt = J.__fnct[L])
                            : ((S = void 0 === H.o.x[L] ? H.o.x[0] : H.o.x[L]),
                              (D = void 0 === H.o.y[L] ? H.o.y[0] : H.o.y[L]),
                              (T = void 0 === H.i.x[L] ? H.i.x[0] : H.i.x[L]),
                              (M = void 0 === H.i.y[L] ? H.i.y[0] : H.i.y[L]),
                              (tt = BezierFactory.getBezierEasing(
                                S,
                                D,
                                T,
                                M
                              ).get),
                              (J.__fnct[L] = tt)))
                        : J.__fnct
                        ? (tt = J.__fnct)
                        : ((S = H.o.x),
                          (D = H.o.y),
                          (T = H.i.x),
                          (M = H.i.y),
                          (tt = BezierFactory.getBezierEasing(S, D, T, M).get),
                          (H.keyframeMetadata = tt)),
                      (U = tt((u - N) / (O - N))))),
                  (te = X.s || H.e),
                  (E = 1 === H.h ? H.s[L] : H.s[L] + (te[L] - H.s[L]) * U),
                  'multidimensional' === this.propType ? (Y[L] = E) : (Y = E);
            return (P.lastIndex = I), Y;
          }
          function slerp(u, P, S) {
            var D,
              T,
              M,
              E,
              F,
              I = [],
              L = u[0],
              R = u[1],
              V = u[2],
              O = u[3],
              N = P[0],
              G = P[1],
              W = P[2],
              Y = P[3];
            return (
              (T = L * N + R * G + V * W + O * Y) < 0 &&
                ((T = -T), (N = -N), (G = -G), (W = -W), (Y = -Y)),
              1 - T > 1e-6
                ? ((M = Math.sin((D = Math.acos(T)))),
                  (E = Math.sin((1 - S) * D) / M),
                  (F = Math.sin(S * D) / M))
                : ((E = 1 - S), (F = S)),
              (I[0] = E * L + F * N),
              (I[1] = E * R + F * G),
              (I[2] = E * V + F * W),
              (I[3] = E * O + F * Y),
              I
            );
          }
          function quaternionToEuler(u, P) {
            var S = P[0],
              D = P[1],
              T = P[2],
              M = P[3],
              E = Math.atan2(2 * D * M - 2 * S * T, 1 - 2 * D * D - 2 * T * T),
              F = Math.asin(2 * S * D + 2 * T * M),
              I = Math.atan2(2 * S * M - 2 * D * T, 1 - 2 * S * S - 2 * T * T);
            (u[0] = E / degToRads),
              (u[1] = F / degToRads),
              (u[2] = I / degToRads);
          }
          function createQuaternion(u) {
            var P = u[0] * degToRads,
              S = u[1] * degToRads,
              D = u[2] * degToRads,
              T = Math.cos(P / 2),
              M = Math.cos(S / 2),
              E = Math.cos(D / 2),
              F = Math.sin(P / 2),
              I = Math.sin(S / 2),
              L = Math.sin(D / 2),
              R = T * M * E - F * I * L;
            return [
              F * I * E + T * M * L,
              F * M * E + T * I * L,
              T * I * E - F * M * L,
              R,
            ];
          }
          function getValueAtCurrentTime() {
            var u = this.comp.renderedFrame - this.offsetTime,
              P = this.keyframes[0].t - this.offsetTime,
              S = this.keyframes[this.keyframes.length - 1].t - this.offsetTime;
            if (
              !(
                u === this._caching.lastFrame ||
                (this._caching.lastFrame !== initFrame &&
                  ((this._caching.lastFrame >= S && u >= S) ||
                    (this._caching.lastFrame < P && u < P)))
              )
            ) {
              this._caching.lastFrame >= u &&
                ((this._caching._lastKeyframeIndex = -1),
                (this._caching.lastIndex = 0));
              var D = this.interpolateValue(u, this._caching);
              this.pv = D;
            }
            return (this._caching.lastFrame = u), this.pv;
          }
          function setVValue(u) {
            var P;
            if ('unidimensional' === this.propType)
              (P = u * this.mult),
                mathAbs(this.v - P) > 1e-5 && ((this.v = P), (this._mdf = !0));
            else
              for (var S = 0, D = this.v.length; S < D; )
                (P = u[S] * this.mult),
                  mathAbs(this.v[S] - P) > 1e-5 &&
                    ((this.v[S] = P), (this._mdf = !0)),
                  (S += 1);
          }
          function processEffectsSequence() {
            if (
              this.elem.globalData.frameId !== this.frameId &&
              this.effectsSequence.length
            ) {
              if (this.lock) {
                this.setVValue(this.pv);
                return;
              }
              (this.lock = !0), (this._mdf = this._isFirstFrame);
              var u,
                P = this.effectsSequence.length,
                S = this.kf ? this.pv : this.data.k;
              for (u = 0; u < P; u += 1) S = this.effectsSequence[u](S);
              this.setVValue(S),
                (this._isFirstFrame = !1),
                (this.lock = !1),
                (this.frameId = this.elem.globalData.frameId);
            }
          }
          function addEffect(u) {
            this.effectsSequence.push(u),
              this.container.addDynamicProperty(this);
          }
          function ValueProperty(u, P, S, D) {
            (this.propType = 'unidimensional'),
              (this.mult = S || 1),
              (this.data = P),
              (this.v = S ? P.k * S : P.k),
              (this.pv = P.k),
              (this._mdf = !1),
              (this.elem = u),
              (this.container = D),
              (this.comp = u.comp),
              (this.k = !1),
              (this.kf = !1),
              (this.vel = 0),
              (this.effectsSequence = []),
              (this._isFirstFrame = !0),
              (this.getValue = processEffectsSequence),
              (this.setVValue = setVValue),
              (this.addEffect = addEffect);
          }
          function MultiDimensionalProperty(u, P, S, D) {
            (this.propType = 'multidimensional'),
              (this.mult = S || 1),
              (this.data = P),
              (this._mdf = !1),
              (this.elem = u),
              (this.container = D),
              (this.comp = u.comp),
              (this.k = !1),
              (this.kf = !1),
              (this.frameId = -1);
            var T,
              M = P.k.length;
            for (
              T = 0,
                this.v = createTypedArray('float32', M),
                this.pv = createTypedArray('float32', M),
                this.vel = createTypedArray('float32', M);
              T < M;
              T += 1
            )
              (this.v[T] = P.k[T] * this.mult), (this.pv[T] = P.k[T]);
            (this._isFirstFrame = !0),
              (this.effectsSequence = []),
              (this.getValue = processEffectsSequence),
              (this.setVValue = setVValue),
              (this.addEffect = addEffect);
          }
          function KeyframedValueProperty(u, P, S, D) {
            (this.propType = 'unidimensional'),
              (this.keyframes = P.k),
              (this.keyframesMetadata = []),
              (this.offsetTime = u.data.st),
              (this.frameId = -1),
              (this._caching = {
                lastFrame: initFrame,
                lastIndex: 0,
                value: 0,
                _lastKeyframeIndex: -1,
              }),
              (this.k = !0),
              (this.kf = !0),
              (this.data = P),
              (this.mult = S || 1),
              (this.elem = u),
              (this.container = D),
              (this.comp = u.comp),
              (this.v = initFrame),
              (this.pv = initFrame),
              (this._isFirstFrame = !0),
              (this.getValue = processEffectsSequence),
              (this.setVValue = setVValue),
              (this.interpolateValue = interpolateValue),
              (this.effectsSequence = [getValueAtCurrentTime.bind(this)]),
              (this.addEffect = addEffect);
          }
          function KeyframedMultidimensionalProperty(u, P, S, D) {
            this.propType = 'multidimensional';
            var T,
              M,
              E,
              F,
              I,
              L = P.k.length;
            for (T = 0; T < L - 1; T += 1)
              P.k[T].to &&
                P.k[T].s &&
                P.k[T + 1] &&
                P.k[T + 1].s &&
                ((M = P.k[T].s),
                (E = P.k[T + 1].s),
                (F = P.k[T].to),
                (I = P.k[T].ti),
                ((2 === M.length &&
                  !(M[0] === E[0] && M[1] === E[1]) &&
                  bez.pointOnLine2D(
                    M[0],
                    M[1],
                    E[0],
                    E[1],
                    M[0] + F[0],
                    M[1] + F[1]
                  ) &&
                  bez.pointOnLine2D(
                    M[0],
                    M[1],
                    E[0],
                    E[1],
                    E[0] + I[0],
                    E[1] + I[1]
                  )) ||
                  (3 === M.length &&
                    !(M[0] === E[0] && M[1] === E[1] && M[2] === E[2]) &&
                    bez.pointOnLine3D(
                      M[0],
                      M[1],
                      M[2],
                      E[0],
                      E[1],
                      E[2],
                      M[0] + F[0],
                      M[1] + F[1],
                      M[2] + F[2]
                    ) &&
                    bez.pointOnLine3D(
                      M[0],
                      M[1],
                      M[2],
                      E[0],
                      E[1],
                      E[2],
                      E[0] + I[0],
                      E[1] + I[1],
                      E[2] + I[2]
                    ))) &&
                  ((P.k[T].to = null), (P.k[T].ti = null)),
                M[0] === E[0] &&
                  M[1] === E[1] &&
                  0 === F[0] &&
                  0 === F[1] &&
                  0 === I[0] &&
                  0 === I[1] &&
                  (2 === M.length ||
                    (M[2] === E[2] && 0 === F[2] && 0 === I[2])) &&
                  ((P.k[T].to = null), (P.k[T].ti = null)));
            (this.effectsSequence = [getValueAtCurrentTime.bind(this)]),
              (this.data = P),
              (this.keyframes = P.k),
              (this.keyframesMetadata = []),
              (this.offsetTime = u.data.st),
              (this.k = !0),
              (this.kf = !0),
              (this._isFirstFrame = !0),
              (this.mult = S || 1),
              (this.elem = u),
              (this.container = D),
              (this.comp = u.comp),
              (this.getValue = processEffectsSequence),
              (this.setVValue = setVValue),
              (this.interpolateValue = interpolateValue),
              (this.frameId = -1);
            var R = P.k[0].s.length;
            for (
              T = 0,
                this.v = createTypedArray('float32', R),
                this.pv = createTypedArray('float32', R);
              T < R;
              T += 1
            )
              (this.v[T] = initFrame), (this.pv[T] = initFrame);
            (this._caching = {
              lastFrame: initFrame,
              lastIndex: 0,
              value: createTypedArray('float32', R),
            }),
              (this.addEffect = addEffect);
          }
          var PropertyFactory = (function () {
            return {
              getProp: function (u, P, S, D, T) {
                var M;
                if (
                  (P.sid && (P = u.globalData.slotManager.getProp(P)),
                  P.k.length)
                ) {
                  if ('number' == typeof P.k[0])
                    M = new MultiDimensionalProperty(u, P, D, T);
                  else
                    switch (S) {
                      case 0:
                        M = new KeyframedValueProperty(u, P, D, T);
                        break;
                      case 1:
                        M = new KeyframedMultidimensionalProperty(u, P, D, T);
                    }
                } else M = new ValueProperty(u, P, D, T);
                return M.effectsSequence.length && T.addDynamicProperty(M), M;
              },
            };
          })();
          function DynamicPropertyContainer() {}
          DynamicPropertyContainer.prototype = {
            addDynamicProperty: function (u) {
              -1 === this.dynamicProperties.indexOf(u) &&
                (this.dynamicProperties.push(u),
                this.container.addDynamicProperty(this),
                (this._isAnimated = !0));
            },
            iterateDynamicProperties: function () {
              this._mdf = !1;
              var u,
                P = this.dynamicProperties.length;
              for (u = 0; u < P; u += 1)
                this.dynamicProperties[u].getValue(),
                  this.dynamicProperties[u]._mdf && (this._mdf = !0);
            },
            initDynamicPropertyContainer: function (u) {
              (this.container = u),
                (this.dynamicProperties = []),
                (this._mdf = !1),
                (this._isAnimated = !1);
            },
          };
          var pointPool = (function () {
            return poolFactory(8, function () {
              return createTypedArray('float32', 2);
            });
          })();
          function ShapePath() {
            (this.c = !1),
              (this._length = 0),
              (this._maxLength = 8),
              (this.v = createSizedArray(this._maxLength)),
              (this.o = createSizedArray(this._maxLength)),
              (this.i = createSizedArray(this._maxLength));
          }
          (ShapePath.prototype.setPathData = function (u, P) {
            (this.c = u), this.setLength(P);
            for (var S = 0; S < P; )
              (this.v[S] = pointPool.newElement()),
                (this.o[S] = pointPool.newElement()),
                (this.i[S] = pointPool.newElement()),
                (S += 1);
          }),
            (ShapePath.prototype.setLength = function (u) {
              for (; this._maxLength < u; ) this.doubleArrayLength();
              this._length = u;
            }),
            (ShapePath.prototype.doubleArrayLength = function () {
              (this.v = this.v.concat(createSizedArray(this._maxLength))),
                (this.i = this.i.concat(createSizedArray(this._maxLength))),
                (this.o = this.o.concat(createSizedArray(this._maxLength))),
                (this._maxLength *= 2);
            }),
            (ShapePath.prototype.setXYAt = function (u, P, S, D, T) {
              var M;
              switch (
                ((this._length = Math.max(this._length, D + 1)),
                this._length >= this._maxLength && this.doubleArrayLength(),
                S)
              ) {
                case 'v':
                  M = this.v;
                  break;
                case 'i':
                  M = this.i;
                  break;
                case 'o':
                  M = this.o;
                  break;
                default:
                  M = [];
              }
              (M[D] && (!M[D] || T)) || (M[D] = pointPool.newElement()),
                (M[D][0] = u),
                (M[D][1] = P);
            }),
            (ShapePath.prototype.setTripleAt = function (
              u,
              P,
              S,
              D,
              T,
              M,
              E,
              F
            ) {
              this.setXYAt(u, P, 'v', E, F),
                this.setXYAt(S, D, 'o', E, F),
                this.setXYAt(T, M, 'i', E, F);
            }),
            (ShapePath.prototype.reverse = function () {
              var u,
                P = new ShapePath();
              P.setPathData(this.c, this._length);
              var S = this.v,
                D = this.o,
                T = this.i,
                M = 0;
              this.c &&
                (P.setTripleAt(
                  S[0][0],
                  S[0][1],
                  T[0][0],
                  T[0][1],
                  D[0][0],
                  D[0][1],
                  0,
                  !1
                ),
                (M = 1));
              var E = this._length - 1,
                F = this._length;
              for (u = M; u < F; u += 1)
                P.setTripleAt(
                  S[E][0],
                  S[E][1],
                  T[E][0],
                  T[E][1],
                  D[E][0],
                  D[E][1],
                  u,
                  !1
                ),
                  (E -= 1);
              return P;
            }),
            (ShapePath.prototype.length = function () {
              return this._length;
            });
          var shapePool = (function () {
            function u(u) {
              var P,
                S = u._length;
              for (P = 0; P < S; P += 1)
                pointPool.release(u.v[P]),
                  pointPool.release(u.i[P]),
                  pointPool.release(u.o[P]),
                  (u.v[P] = null),
                  (u.i[P] = null),
                  (u.o[P] = null);
              (u._length = 0), (u.c = !1);
            }
            function P(u) {
              var P,
                D = S.newElement(),
                T = void 0 === u._length ? u.v.length : u._length;
              for (D.setLength(T), D.c = u.c, P = 0; P < T; P += 1)
                D.setTripleAt(
                  u.v[P][0],
                  u.v[P][1],
                  u.o[P][0],
                  u.o[P][1],
                  u.i[P][0],
                  u.i[P][1],
                  P
                );
              return D;
            }
            var S = poolFactory(
              4,
              function () {
                return new ShapePath();
              },
              u
            );
            return (S.clone = P), S;
          })();
          function ShapeCollection() {
            (this._length = 0),
              (this._maxLength = 4),
              (this.shapes = createSizedArray(this._maxLength));
          }
          (ShapeCollection.prototype.addShape = function (u) {
            this._length === this._maxLength &&
              ((this.shapes = this.shapes.concat(
                createSizedArray(this._maxLength)
              )),
              (this._maxLength *= 2)),
              (this.shapes[this._length] = u),
              (this._length += 1);
          }),
            (ShapeCollection.prototype.releaseShapes = function () {
              var u;
              for (u = 0; u < this._length; u += 1)
                shapePool.release(this.shapes[u]);
              this._length = 0;
            });
          var shapeCollectionPool = (function () {
              var u = { newShapeCollection: T, release: M },
                P = 0,
                S = 4,
                D = createSizedArray(4);
              function T() {
                var u;
                return (
                  P ? ((P -= 1), (u = D[P])) : (u = new ShapeCollection()), u
                );
              }
              function M(u) {
                var T,
                  M = u._length;
                for (T = 0; T < M; T += 1) shapePool.release(u.shapes[T]);
                (u._length = 0),
                  P === S && ((D = pooling.double(D)), (S *= 2)),
                  (D[P] = u),
                  (P += 1);
              }
              return u;
            })(),
            ShapePropertyFactory = (function () {
              var u = -999999;
              function P(u, P, S) {
                var D = S.lastIndex,
                  T = this.keyframes;
                if (u < T[0].t - this.offsetTime)
                  (M = T[0].s[0]), (F = !0), (D = 0);
                else if (u >= T[T.length - 1].t - this.offsetTime)
                  (M = T[T.length - 1].s
                    ? T[T.length - 1].s[0]
                    : T[T.length - 2].e[0]),
                    (F = !0);
                else {
                  for (
                    var M,
                      E,
                      F,
                      I,
                      L,
                      R,
                      V,
                      O,
                      N,
                      G,
                      W,
                      Y,
                      H,
                      X = D,
                      J = T.length - 1,
                      K = !0;
                    K &&
                    ((G = T[X]), !((W = T[X + 1]).t - this.offsetTime > u));

                  )
                    X < J - 1 ? (X += 1) : (K = !1);
                  (Y = this.keyframesMetadata[X] || {}),
                    (F = 1 === G.h),
                    (D = X),
                    F ||
                      (u >= W.t - this.offsetTime
                        ? (O = 1)
                        : u < G.t - this.offsetTime
                        ? (O = 0)
                        : (Y.__fnct
                            ? (H = Y.__fnct)
                            : ((H = BezierFactory.getBezierEasing(
                                G.o.x,
                                G.o.y,
                                G.i.x,
                                G.i.y
                              ).get),
                              (Y.__fnct = H)),
                          (O = H(
                            (u - (G.t - this.offsetTime)) /
                              (W.t - this.offsetTime - (G.t - this.offsetTime))
                          ))),
                      (E = W.s ? W.s[0] : G.e[0])),
                    (M = G.s[0]);
                }
                for (
                  I = 0, R = P._length, V = M.i[0].length, S.lastIndex = D;
                  I < R;
                  I += 1
                )
                  for (L = 0; L < V; L += 1)
                    (N = F
                      ? M.i[I][L]
                      : M.i[I][L] + (E.i[I][L] - M.i[I][L]) * O),
                      (P.i[I][L] = N),
                      (N = F
                        ? M.o[I][L]
                        : M.o[I][L] + (E.o[I][L] - M.o[I][L]) * O),
                      (P.o[I][L] = N),
                      (N = F
                        ? M.v[I][L]
                        : M.v[I][L] + (E.v[I][L] - M.v[I][L]) * O),
                      (P.v[I][L] = N);
              }
              function S() {
                var P = this.comp.renderedFrame - this.offsetTime,
                  S = this.keyframes[0].t - this.offsetTime,
                  D =
                    this.keyframes[this.keyframes.length - 1].t -
                    this.offsetTime,
                  T = this._caching.lastFrame;
                return (
                  (T !== u && ((T < S && P < S) || (T > D && P > D))) ||
                    ((this._caching.lastIndex =
                      T < P ? this._caching.lastIndex : 0),
                    this.interpolateShape(P, this.pv, this._caching)),
                  (this._caching.lastFrame = P),
                  this.pv
                );
              }
              function D() {
                this.paths = this.localShapeCollection;
              }
              function T(u, P) {
                if (u._length !== P._length || u.c !== P.c) return !1;
                var S,
                  D = u._length;
                for (S = 0; S < D; S += 1)
                  if (
                    u.v[S][0] !== P.v[S][0] ||
                    u.v[S][1] !== P.v[S][1] ||
                    u.o[S][0] !== P.o[S][0] ||
                    u.o[S][1] !== P.o[S][1] ||
                    u.i[S][0] !== P.i[S][0] ||
                    u.i[S][1] !== P.i[S][1]
                  )
                    return !1;
                return !0;
              }
              function M(u) {
                T(this.v, u) ||
                  ((this.v = shapePool.clone(u)),
                  this.localShapeCollection.releaseShapes(),
                  this.localShapeCollection.addShape(this.v),
                  (this._mdf = !0),
                  (this.paths = this.localShapeCollection));
              }
              function E() {
                if (this.elem.globalData.frameId !== this.frameId) {
                  if (!this.effectsSequence.length) {
                    this._mdf = !1;
                    return;
                  }
                  if (this.lock) {
                    this.setVValue(this.pv);
                    return;
                  }
                  (this.lock = !0),
                    (this._mdf = !1),
                    (u = this.kf
                      ? this.pv
                      : this.data.ks
                      ? this.data.ks.k
                      : this.data.pt.k);
                  var u,
                    P,
                    S = this.effectsSequence.length;
                  for (P = 0; P < S; P += 1) u = this.effectsSequence[P](u);
                  this.setVValue(u),
                    (this.lock = !1),
                    (this.frameId = this.elem.globalData.frameId);
                }
              }
              function F(u, P, S) {
                (this.propType = 'shape'),
                  (this.comp = u.comp),
                  (this.container = u),
                  (this.elem = u),
                  (this.data = P),
                  (this.k = !1),
                  (this.kf = !1),
                  (this._mdf = !1);
                var T = 3 === S ? P.pt.k : P.ks.k;
                (this.v = shapePool.clone(T)),
                  (this.pv = shapePool.clone(this.v)),
                  (this.localShapeCollection =
                    shapeCollectionPool.newShapeCollection()),
                  (this.paths = this.localShapeCollection),
                  this.paths.addShape(this.v),
                  (this.reset = D),
                  (this.effectsSequence = []);
              }
              function I(u) {
                this.effectsSequence.push(u),
                  this.container.addDynamicProperty(this);
              }
              function L(P, T, M) {
                (this.propType = 'shape'),
                  (this.comp = P.comp),
                  (this.elem = P),
                  (this.container = P),
                  (this.offsetTime = P.data.st),
                  (this.keyframes = 3 === M ? T.pt.k : T.ks.k),
                  (this.keyframesMetadata = []),
                  (this.k = !0),
                  (this.kf = !0);
                var E = this.keyframes[0].s[0].i.length;
                (this.v = shapePool.newElement()),
                  this.v.setPathData(this.keyframes[0].s[0].c, E),
                  (this.pv = shapePool.clone(this.v)),
                  (this.localShapeCollection =
                    shapeCollectionPool.newShapeCollection()),
                  (this.paths = this.localShapeCollection),
                  this.paths.addShape(this.v),
                  (this.lastFrame = u),
                  (this.reset = D),
                  (this._caching = { lastFrame: u, lastIndex: 0 }),
                  (this.effectsSequence = [S.bind(this)]);
              }
              (F.prototype.interpolateShape = P),
                (F.prototype.getValue = E),
                (F.prototype.setVValue = M),
                (F.prototype.addEffect = I),
                (L.prototype.getValue = E),
                (L.prototype.interpolateShape = P),
                (L.prototype.setVValue = M),
                (L.prototype.addEffect = I);
              var R = (function () {
                  var u = roundCorner;
                  function P(u, P) {
                    (this.v = shapePool.newElement()),
                      this.v.setPathData(!0, 4),
                      (this.localShapeCollection =
                        shapeCollectionPool.newShapeCollection()),
                      (this.paths = this.localShapeCollection),
                      this.localShapeCollection.addShape(this.v),
                      (this.d = P.d),
                      (this.elem = u),
                      (this.comp = u.comp),
                      (this.frameId = -1),
                      this.initDynamicPropertyContainer(u),
                      (this.p = PropertyFactory.getProp(u, P.p, 1, 0, this)),
                      (this.s = PropertyFactory.getProp(u, P.s, 1, 0, this)),
                      this.dynamicProperties.length
                        ? (this.k = !0)
                        : ((this.k = !1), this.convertEllToPath());
                  }
                  return (
                    (P.prototype = {
                      reset: D,
                      getValue: function () {
                        this.elem.globalData.frameId !== this.frameId &&
                          ((this.frameId = this.elem.globalData.frameId),
                          this.iterateDynamicProperties(),
                          this._mdf && this.convertEllToPath());
                      },
                      convertEllToPath: function () {
                        var P = this.p.v[0],
                          S = this.p.v[1],
                          D = this.s.v[0] / 2,
                          T = this.s.v[1] / 2,
                          M = 3 !== this.d,
                          E = this.v;
                        (E.v[0][0] = P),
                          (E.v[0][1] = S - T),
                          (E.v[1][0] = M ? P + D : P - D),
                          (E.v[1][1] = S),
                          (E.v[2][0] = P),
                          (E.v[2][1] = S + T),
                          (E.v[3][0] = M ? P - D : P + D),
                          (E.v[3][1] = S),
                          (E.i[0][0] = M ? P - D * u : P + D * u),
                          (E.i[0][1] = S - T),
                          (E.i[1][0] = M ? P + D : P - D),
                          (E.i[1][1] = S - T * u),
                          (E.i[2][0] = M ? P + D * u : P - D * u),
                          (E.i[2][1] = S + T),
                          (E.i[3][0] = M ? P - D : P + D),
                          (E.i[3][1] = S + T * u),
                          (E.o[0][0] = M ? P + D * u : P - D * u),
                          (E.o[0][1] = S - T),
                          (E.o[1][0] = M ? P + D : P - D),
                          (E.o[1][1] = S + T * u),
                          (E.o[2][0] = M ? P - D * u : P + D * u),
                          (E.o[2][1] = S + T),
                          (E.o[3][0] = M ? P - D : P + D),
                          (E.o[3][1] = S - T * u);
                      },
                    }),
                    extendPrototype([DynamicPropertyContainer], P),
                    P
                  );
                })(),
                V = (function () {
                  function u(u, P) {
                    (this.v = shapePool.newElement()),
                      this.v.setPathData(!0, 0),
                      (this.elem = u),
                      (this.comp = u.comp),
                      (this.data = P),
                      (this.frameId = -1),
                      (this.d = P.d),
                      this.initDynamicPropertyContainer(u),
                      1 === P.sy
                        ? ((this.ir = PropertyFactory.getProp(
                            u,
                            P.ir,
                            0,
                            0,
                            this
                          )),
                          (this.is = PropertyFactory.getProp(
                            u,
                            P.is,
                            0,
                            0.01,
                            this
                          )),
                          (this.convertToPath = this.convertStarToPath))
                        : (this.convertToPath = this.convertPolygonToPath),
                      (this.pt = PropertyFactory.getProp(u, P.pt, 0, 0, this)),
                      (this.p = PropertyFactory.getProp(u, P.p, 1, 0, this)),
                      (this.r = PropertyFactory.getProp(
                        u,
                        P.r,
                        0,
                        degToRads,
                        this
                      )),
                      (this.or = PropertyFactory.getProp(u, P.or, 0, 0, this)),
                      (this.os = PropertyFactory.getProp(
                        u,
                        P.os,
                        0,
                        0.01,
                        this
                      )),
                      (this.localShapeCollection =
                        shapeCollectionPool.newShapeCollection()),
                      this.localShapeCollection.addShape(this.v),
                      (this.paths = this.localShapeCollection),
                      this.dynamicProperties.length
                        ? (this.k = !0)
                        : ((this.k = !1), this.convertToPath());
                  }
                  return (
                    (u.prototype = {
                      reset: D,
                      getValue: function () {
                        this.elem.globalData.frameId !== this.frameId &&
                          ((this.frameId = this.elem.globalData.frameId),
                          this.iterateDynamicProperties(),
                          this._mdf && this.convertToPath());
                      },
                      convertStarToPath: function () {
                        var u,
                          P,
                          S,
                          D,
                          T = 2 * Math.floor(this.pt.v),
                          M = (2 * Math.PI) / T,
                          E = !0,
                          F = this.or.v,
                          I = this.ir.v,
                          L = this.os.v,
                          R = this.is.v,
                          V = (2 * Math.PI * F) / (2 * T),
                          O = (2 * Math.PI * I) / (2 * T),
                          N = -Math.PI / 2;
                        N += this.r.v;
                        var G = 3 === this.data.d ? -1 : 1;
                        for (u = 0, this.v._length = 0; u < T; u += 1) {
                          (P = E ? F : I), (S = E ? L : R), (D = E ? V : O);
                          var W = P * Math.cos(N),
                            Y = P * Math.sin(N),
                            H =
                              0 === W && 0 === Y
                                ? 0
                                : Y / Math.sqrt(W * W + Y * Y),
                            X =
                              0 === W && 0 === Y
                                ? 0
                                : -W / Math.sqrt(W * W + Y * Y);
                          (W += +this.p.v[0]),
                            (Y += +this.p.v[1]),
                            this.v.setTripleAt(
                              W,
                              Y,
                              W - H * D * S * G,
                              Y - X * D * S * G,
                              W + H * D * S * G,
                              Y + X * D * S * G,
                              u,
                              !0
                            ),
                            (E = !E),
                            (N += M * G);
                        }
                      },
                      convertPolygonToPath: function () {
                        var u,
                          P = Math.floor(this.pt.v),
                          S = (2 * Math.PI) / P,
                          D = this.or.v,
                          T = this.os.v,
                          M = (2 * Math.PI * D) / (4 * P),
                          E = -(0.5 * Math.PI),
                          F = 3 === this.data.d ? -1 : 1;
                        for (
                          E += this.r.v, this.v._length = 0, u = 0;
                          u < P;
                          u += 1
                        ) {
                          var I = D * Math.cos(E),
                            L = D * Math.sin(E),
                            R =
                              0 === I && 0 === L
                                ? 0
                                : L / Math.sqrt(I * I + L * L),
                            V =
                              0 === I && 0 === L
                                ? 0
                                : -I / Math.sqrt(I * I + L * L);
                          (I += +this.p.v[0]),
                            (L += +this.p.v[1]),
                            this.v.setTripleAt(
                              I,
                              L,
                              I - R * M * T * F,
                              L - V * M * T * F,
                              I + R * M * T * F,
                              L + V * M * T * F,
                              u,
                              !0
                            ),
                            (E += S * F);
                        }
                        (this.paths.length = 0), (this.paths[0] = this.v);
                      },
                    }),
                    extendPrototype([DynamicPropertyContainer], u),
                    u
                  );
                })(),
                O = (function () {
                  function u(u, P) {
                    (this.v = shapePool.newElement()),
                      (this.v.c = !0),
                      (this.localShapeCollection =
                        shapeCollectionPool.newShapeCollection()),
                      this.localShapeCollection.addShape(this.v),
                      (this.paths = this.localShapeCollection),
                      (this.elem = u),
                      (this.comp = u.comp),
                      (this.frameId = -1),
                      (this.d = P.d),
                      this.initDynamicPropertyContainer(u),
                      (this.p = PropertyFactory.getProp(u, P.p, 1, 0, this)),
                      (this.s = PropertyFactory.getProp(u, P.s, 1, 0, this)),
                      (this.r = PropertyFactory.getProp(u, P.r, 0, 0, this)),
                      this.dynamicProperties.length
                        ? (this.k = !0)
                        : ((this.k = !1), this.convertRectToPath());
                  }
                  return (
                    (u.prototype = {
                      convertRectToPath: function () {
                        var u = this.p.v[0],
                          P = this.p.v[1],
                          S = this.s.v[0] / 2,
                          D = this.s.v[1] / 2,
                          T = bmMin(S, D, this.r.v),
                          M = T * (1 - roundCorner);
                        (this.v._length = 0),
                          2 === this.d || 1 === this.d
                            ? (this.v.setTripleAt(
                                u + S,
                                P - D + T,
                                u + S,
                                P - D + T,
                                u + S,
                                P - D + M,
                                0,
                                !0
                              ),
                              this.v.setTripleAt(
                                u + S,
                                P + D - T,
                                u + S,
                                P + D - M,
                                u + S,
                                P + D - T,
                                1,
                                !0
                              ),
                              0 !== T
                                ? (this.v.setTripleAt(
                                    u + S - T,
                                    P + D,
                                    u + S - T,
                                    P + D,
                                    u + S - M,
                                    P + D,
                                    2,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S + T,
                                    P + D,
                                    u - S + M,
                                    P + D,
                                    u - S + T,
                                    P + D,
                                    3,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P + D - T,
                                    u - S,
                                    P + D - T,
                                    u - S,
                                    P + D - M,
                                    4,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P - D + T,
                                    u - S,
                                    P - D + M,
                                    u - S,
                                    P - D + T,
                                    5,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S + T,
                                    P - D,
                                    u - S + T,
                                    P - D,
                                    u - S + M,
                                    P - D,
                                    6,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u + S - T,
                                    P - D,
                                    u + S - M,
                                    P - D,
                                    u + S - T,
                                    P - D,
                                    7,
                                    !0
                                  ))
                                : (this.v.setTripleAt(
                                    u - S,
                                    P + D,
                                    u - S + M,
                                    P + D,
                                    u - S,
                                    P + D,
                                    2
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P - D,
                                    u - S,
                                    P - D + M,
                                    u - S,
                                    P - D,
                                    3
                                  )))
                            : (this.v.setTripleAt(
                                u + S,
                                P - D + T,
                                u + S,
                                P - D + M,
                                u + S,
                                P - D + T,
                                0,
                                !0
                              ),
                              0 !== T
                                ? (this.v.setTripleAt(
                                    u + S - T,
                                    P - D,
                                    u + S - T,
                                    P - D,
                                    u + S - M,
                                    P - D,
                                    1,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S + T,
                                    P - D,
                                    u - S + M,
                                    P - D,
                                    u - S + T,
                                    P - D,
                                    2,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P - D + T,
                                    u - S,
                                    P - D + T,
                                    u - S,
                                    P - D + M,
                                    3,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P + D - T,
                                    u - S,
                                    P + D - M,
                                    u - S,
                                    P + D - T,
                                    4,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S + T,
                                    P + D,
                                    u - S + T,
                                    P + D,
                                    u - S + M,
                                    P + D,
                                    5,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u + S - T,
                                    P + D,
                                    u + S - M,
                                    P + D,
                                    u + S - T,
                                    P + D,
                                    6,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u + S,
                                    P + D - T,
                                    u + S,
                                    P + D - T,
                                    u + S,
                                    P + D - M,
                                    7,
                                    !0
                                  ))
                                : (this.v.setTripleAt(
                                    u - S,
                                    P - D,
                                    u - S + M,
                                    P - D,
                                    u - S,
                                    P - D,
                                    1,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u - S,
                                    P + D,
                                    u - S,
                                    P + D - M,
                                    u - S,
                                    P + D,
                                    2,
                                    !0
                                  ),
                                  this.v.setTripleAt(
                                    u + S,
                                    P + D,
                                    u + S - M,
                                    P + D,
                                    u + S,
                                    P + D,
                                    3,
                                    !0
                                  )));
                      },
                      getValue: function () {
                        this.elem.globalData.frameId !== this.frameId &&
                          ((this.frameId = this.elem.globalData.frameId),
                          this.iterateDynamicProperties(),
                          this._mdf && this.convertRectToPath());
                      },
                      reset: D,
                    }),
                    extendPrototype([DynamicPropertyContainer], u),
                    u
                  );
                })();
              function N(u, P, S) {
                var D;
                return (
                  3 === S || 4 === S
                    ? (D = (3 === S ? P.pt : P.ks).k.length
                        ? new L(u, P, S)
                        : new F(u, P, S))
                    : 5 === S
                    ? (D = new O(u, P))
                    : 6 === S
                    ? (D = new R(u, P))
                    : 7 === S && (D = new V(u, P)),
                  D.k && u.addDynamicProperty(D),
                  D
                );
              }
              function G() {
                return F;
              }
              function W() {
                return L;
              }
              var Y = {};
              return (
                (Y.getShapeProp = N),
                (Y.getConstructorFunction = G),
                (Y.getKeyframedConstructorFunction = W),
                Y
              );
            })(),
            Matrix = (function () {
              var u = Math.cos,
                P = Math.sin,
                S = Math.tan,
                D = Math.round;
              function T() {
                return (
                  (this.props[0] = 1),
                  (this.props[1] = 0),
                  (this.props[2] = 0),
                  (this.props[3] = 0),
                  (this.props[4] = 0),
                  (this.props[5] = 1),
                  (this.props[6] = 0),
                  (this.props[7] = 0),
                  (this.props[8] = 0),
                  (this.props[9] = 0),
                  (this.props[10] = 1),
                  (this.props[11] = 0),
                  (this.props[12] = 0),
                  (this.props[13] = 0),
                  (this.props[14] = 0),
                  (this.props[15] = 1),
                  this
                );
              }
              function M(S) {
                if (0 === S) return this;
                var D = u(S),
                  T = P(S);
                return this._t(D, -T, 0, 0, T, D, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
              }
              function E(S) {
                if (0 === S) return this;
                var D = u(S),
                  T = P(S);
                return this._t(1, 0, 0, 0, 0, D, -T, 0, 0, T, D, 0, 0, 0, 0, 1);
              }
              function F(S) {
                if (0 === S) return this;
                var D = u(S),
                  T = P(S);
                return this._t(D, 0, T, 0, 0, 1, 0, 0, -T, 0, D, 0, 0, 0, 0, 1);
              }
              function I(S) {
                if (0 === S) return this;
                var D = u(S),
                  T = P(S);
                return this._t(D, -T, 0, 0, T, D, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
              }
              function L(u, P) {
                return this._t(1, P, u, 1, 0, 0);
              }
              function R(u, P) {
                return this.shear(S(u), S(P));
              }
              function V(D, T) {
                var M = u(T),
                  E = P(T);
                return this._t(M, E, 0, 0, -E, M, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
                  ._t(1, 0, 0, 0, S(D), 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)
                  ._t(M, -E, 0, 0, E, M, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1);
              }
              function O(u, P, S) {
                return (S || 0 === S || (S = 1), 1 === u && 1 === P && 1 === S)
                  ? this
                  : this._t(u, 0, 0, 0, 0, P, 0, 0, 0, 0, S, 0, 0, 0, 0, 1);
              }
              function N(u, P, S, D, T, M, E, F, I, L, R, V, O, N, G, W) {
                return (
                  (this.props[0] = u),
                  (this.props[1] = P),
                  (this.props[2] = S),
                  (this.props[3] = D),
                  (this.props[4] = T),
                  (this.props[5] = M),
                  (this.props[6] = E),
                  (this.props[7] = F),
                  (this.props[8] = I),
                  (this.props[9] = L),
                  (this.props[10] = R),
                  (this.props[11] = V),
                  (this.props[12] = O),
                  (this.props[13] = N),
                  (this.props[14] = G),
                  (this.props[15] = W),
                  this
                );
              }
              function G(u, P, S) {
                return ((S = S || 0), 0 !== u || 0 !== P || 0 !== S)
                  ? this._t(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, u, P, S, 1)
                  : this;
              }
              function W(u, P, S, D, T, M, E, F, I, L, R, V, O, N, G, W) {
                var Y = this.props;
                if (
                  1 === u &&
                  0 === P &&
                  0 === S &&
                  0 === D &&
                  0 === T &&
                  1 === M &&
                  0 === E &&
                  0 === F &&
                  0 === I &&
                  0 === L &&
                  1 === R &&
                  0 === V
                )
                  return (
                    (Y[12] = Y[12] * u + Y[15] * O),
                    (Y[13] = Y[13] * M + Y[15] * N),
                    (Y[14] = Y[14] * R + Y[15] * G),
                    (Y[15] *= W),
                    (this._identityCalculated = !1),
                    this
                  );
                var H = Y[0],
                  X = Y[1],
                  J = Y[2],
                  K = Y[3],
                  Z = Y[4],
                  U = Y[5],
                  Q = Y[6],
                  $ = Y[7],
                  tt = Y[8],
                  te = Y[9],
                  ts = Y[10],
                  tr = Y[11],
                  ta = Y[12],
                  tn = Y[13],
                  th = Y[14],
                  tl = Y[15];
                return (
                  (Y[0] = H * u + X * T + J * I + K * O),
                  (Y[1] = H * P + X * M + J * L + K * N),
                  (Y[2] = H * S + X * E + J * R + K * G),
                  (Y[3] = H * D + X * F + J * V + K * W),
                  (Y[4] = Z * u + U * T + Q * I + $ * O),
                  (Y[5] = Z * P + U * M + Q * L + $ * N),
                  (Y[6] = Z * S + U * E + Q * R + $ * G),
                  (Y[7] = Z * D + U * F + Q * V + $ * W),
                  (Y[8] = tt * u + te * T + ts * I + tr * O),
                  (Y[9] = tt * P + te * M + ts * L + tr * N),
                  (Y[10] = tt * S + te * E + ts * R + tr * G),
                  (Y[11] = tt * D + te * F + ts * V + tr * W),
                  (Y[12] = ta * u + tn * T + th * I + tl * O),
                  (Y[13] = ta * P + tn * M + th * L + tl * N),
                  (Y[14] = ta * S + tn * E + th * R + tl * G),
                  (Y[15] = ta * D + tn * F + th * V + tl * W),
                  (this._identityCalculated = !1),
                  this
                );
              }
              function Y(u) {
                var P = u.props;
                return this.transform(
                  P[0],
                  P[1],
                  P[2],
                  P[3],
                  P[4],
                  P[5],
                  P[6],
                  P[7],
                  P[8],
                  P[9],
                  P[10],
                  P[11],
                  P[12],
                  P[13],
                  P[14],
                  P[15]
                );
              }
              function H() {
                return (
                  this._identityCalculated ||
                    ((this._identity = !(
                      1 !== this.props[0] ||
                      0 !== this.props[1] ||
                      0 !== this.props[2] ||
                      0 !== this.props[3] ||
                      0 !== this.props[4] ||
                      1 !== this.props[5] ||
                      0 !== this.props[6] ||
                      0 !== this.props[7] ||
                      0 !== this.props[8] ||
                      0 !== this.props[9] ||
                      1 !== this.props[10] ||
                      0 !== this.props[11] ||
                      0 !== this.props[12] ||
                      0 !== this.props[13] ||
                      0 !== this.props[14] ||
                      1 !== this.props[15]
                    )),
                    (this._identityCalculated = !0)),
                  this._identity
                );
              }
              function X(u) {
                for (var P = 0; P < 16; ) {
                  if (u.props[P] !== this.props[P]) return !1;
                  P += 1;
                }
                return !0;
              }
              function J(u) {
                var P;
                for (P = 0; P < 16; P += 1) u.props[P] = this.props[P];
                return u;
              }
              function K(u) {
                var P;
                for (P = 0; P < 16; P += 1) this.props[P] = u[P];
              }
              function Z(u, P, S) {
                return {
                  x:
                    u * this.props[0] +
                    P * this.props[4] +
                    S * this.props[8] +
                    this.props[12],
                  y:
                    u * this.props[1] +
                    P * this.props[5] +
                    S * this.props[9] +
                    this.props[13],
                  z:
                    u * this.props[2] +
                    P * this.props[6] +
                    S * this.props[10] +
                    this.props[14],
                };
              }
              function U(u, P, S) {
                return (
                  u * this.props[0] +
                  P * this.props[4] +
                  S * this.props[8] +
                  this.props[12]
                );
              }
              function Q(u, P, S) {
                return (
                  u * this.props[1] +
                  P * this.props[5] +
                  S * this.props[9] +
                  this.props[13]
                );
              }
              function $(u, P, S) {
                return (
                  u * this.props[2] +
                  P * this.props[6] +
                  S * this.props[10] +
                  this.props[14]
                );
              }
              function tt() {
                var u =
                    this.props[0] * this.props[5] -
                    this.props[1] * this.props[4],
                  P = this.props[5] / u,
                  S = -this.props[1] / u,
                  D = -this.props[4] / u,
                  T = this.props[0] / u,
                  M =
                    (this.props[4] * this.props[13] -
                      this.props[5] * this.props[12]) /
                    u,
                  E =
                    -(
                      this.props[0] * this.props[13] -
                      this.props[1] * this.props[12]
                    ) / u,
                  F = new Matrix();
                return (
                  (F.props[0] = P),
                  (F.props[1] = S),
                  (F.props[4] = D),
                  (F.props[5] = T),
                  (F.props[12] = M),
                  (F.props[13] = E),
                  F
                );
              }
              function te(u) {
                return this.getInverseMatrix().applyToPointArray(
                  u[0],
                  u[1],
                  u[2] || 0
                );
              }
              function ts(u) {
                var P,
                  S = u.length,
                  D = [];
                for (P = 0; P < S; P += 1) D[P] = te(u[P]);
                return D;
              }
              function tr(u, P, S) {
                var D = createTypedArray('float32', 6);
                if (this.isIdentity())
                  (D[0] = u[0]),
                    (D[1] = u[1]),
                    (D[2] = P[0]),
                    (D[3] = P[1]),
                    (D[4] = S[0]),
                    (D[5] = S[1]);
                else {
                  var T = this.props[0],
                    M = this.props[1],
                    E = this.props[4],
                    F = this.props[5],
                    I = this.props[12],
                    L = this.props[13];
                  (D[0] = u[0] * T + u[1] * E + I),
                    (D[1] = u[0] * M + u[1] * F + L),
                    (D[2] = P[0] * T + P[1] * E + I),
                    (D[3] = P[0] * M + P[1] * F + L),
                    (D[4] = S[0] * T + S[1] * E + I),
                    (D[5] = S[0] * M + S[1] * F + L);
                }
                return D;
              }
              function ta(u, P, S) {
                return this.isIdentity()
                  ? [u, P, S]
                  : [
                      u * this.props[0] +
                        P * this.props[4] +
                        S * this.props[8] +
                        this.props[12],
                      u * this.props[1] +
                        P * this.props[5] +
                        S * this.props[9] +
                        this.props[13],
                      u * this.props[2] +
                        P * this.props[6] +
                        S * this.props[10] +
                        this.props[14],
                    ];
              }
              function tn(u, P) {
                if (this.isIdentity()) return u + ',' + P;
                var S = this.props;
                return (
                  Math.round((u * S[0] + P * S[4] + S[12]) * 100) / 100 +
                  ',' +
                  Math.round((u * S[1] + P * S[5] + S[13]) * 100) / 100
                );
              }
              function th() {
                for (
                  var u = 0, P = this.props, S = 'matrix3d(', T = 1e4;
                  u < 16;

                )
                  (S += D(P[u] * T) / T + (15 === u ? ')' : ',')), (u += 1);
                return S;
              }
              function tl(u) {
                var P = 1e4;
                return (u < 1e-6 && u > 0) || (u > -0.000001 && u < 0)
                  ? D(u * P) / P
                  : u;
              }
              function tp() {
                var u = this.props;
                return (
                  'matrix(' +
                  tl(u[0]) +
                  ',' +
                  tl(u[1]) +
                  ',' +
                  tl(u[4]) +
                  ',' +
                  tl(u[5]) +
                  ',' +
                  tl(u[12]) +
                  ',' +
                  tl(u[13]) +
                  ')'
                );
              }
              return function () {
                (this.reset = T),
                  (this.rotate = M),
                  (this.rotateX = E),
                  (this.rotateY = F),
                  (this.rotateZ = I),
                  (this.skew = R),
                  (this.skewFromAxis = V),
                  (this.shear = L),
                  (this.scale = O),
                  (this.setTransform = N),
                  (this.translate = G),
                  (this.transform = W),
                  (this.multiply = Y),
                  (this.applyToPoint = Z),
                  (this.applyToX = U),
                  (this.applyToY = Q),
                  (this.applyToZ = $),
                  (this.applyToPointArray = ta),
                  (this.applyToTriplePoints = tr),
                  (this.applyToPointStringified = tn),
                  (this.toCSS = th),
                  (this.to2dCSS = tp),
                  (this.clone = J),
                  (this.cloneFromProps = K),
                  (this.equals = X),
                  (this.inversePoints = ts),
                  (this.inversePoint = te),
                  (this.getInverseMatrix = tt),
                  (this._t = this.transform),
                  (this.isIdentity = H),
                  (this._identity = !0),
                  (this._identityCalculated = !1),
                  (this.props = createTypedArray('float32', 16)),
                  this.reset();
              };
            })();
          function _typeof$3(u) {
            return (_typeof$3 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var lottie = {},
            standalone = '__[STANDALONE]__',
            animationData = '__[ANIMATIONDATA]__',
            renderer = '';
          function setLocation(u) {
            setLocationHref(u);
          }
          function searchAnimations() {
            !0 === standalone
              ? animationManager.searchAnimations(
                  animationData,
                  standalone,
                  renderer
                )
              : animationManager.searchAnimations();
          }
          function setSubframeRendering(u) {
            setSubframeEnabled(u);
          }
          function setPrefix(u) {
            setIdPrefix(u);
          }
          function loadAnimation(u) {
            return (
              !0 === standalone &&
                (u.animationData = JSON.parse(animationData)),
              animationManager.loadAnimation(u)
            );
          }
          function setQuality(u) {
            if ('string' == typeof u)
              switch (u) {
                case 'high':
                  setDefaultCurveSegments(200);
                  break;
                default:
                case 'medium':
                  setDefaultCurveSegments(50);
                  break;
                case 'low':
                  setDefaultCurveSegments(10);
              }
            else !isNaN(u) && u > 1 && setDefaultCurveSegments(u);
            getDefaultCurveSegments() >= 50 ? roundValues(!1) : roundValues(!0);
          }
          function inBrowser() {
            return 'undefined' != typeof navigator;
          }
          function installPlugin(u, P) {
            'expressions' === u && setExpressionsPlugin(P);
          }
          function getFactory(u) {
            switch (u) {
              case 'propertyFactory':
                return PropertyFactory;
              case 'shapePropertyFactory':
                return ShapePropertyFactory;
              case 'matrix':
                return Matrix;
              default:
                return null;
            }
          }
          function checkReady() {
            'complete' === document.readyState &&
              (clearInterval(readyStateCheckInterval), searchAnimations());
          }
          function getQueryVariable(u) {
            for (var P = queryString.split('&'), S = 0; S < P.length; S += 1) {
              var D = P[S].split('=');
              if (decodeURIComponent(D[0]) == u)
                return decodeURIComponent(D[1]);
            }
            return null;
          }
          (lottie.play = animationManager.play),
            (lottie.pause = animationManager.pause),
            (lottie.setLocationHref = setLocation),
            (lottie.togglePause = animationManager.togglePause),
            (lottie.setSpeed = animationManager.setSpeed),
            (lottie.setDirection = animationManager.setDirection),
            (lottie.stop = animationManager.stop),
            (lottie.searchAnimations = searchAnimations),
            (lottie.registerAnimation = animationManager.registerAnimation),
            (lottie.loadAnimation = loadAnimation),
            (lottie.setSubframeRendering = setSubframeRendering),
            (lottie.resize = animationManager.resize),
            (lottie.goToAndStop = animationManager.goToAndStop),
            (lottie.destroy = animationManager.destroy),
            (lottie.setQuality = setQuality),
            (lottie.inBrowser = inBrowser),
            (lottie.installPlugin = installPlugin),
            (lottie.freeze = animationManager.freeze),
            (lottie.unfreeze = animationManager.unfreeze),
            (lottie.setVolume = animationManager.setVolume),
            (lottie.mute = animationManager.mute),
            (lottie.unmute = animationManager.unmute),
            (lottie.getRegisteredAnimations =
              animationManager.getRegisteredAnimations),
            (lottie.useWebWorker = setWebWorker),
            (lottie.setIDPrefix = setPrefix),
            (lottie.__getFactory = getFactory),
            (lottie.version = '5.12.2');
          var queryString = '';
          if (standalone) {
            var scripts = document.getElementsByTagName('script'),
              index = scripts.length - 1,
              myScript = scripts[index] || { src: '' };
            (queryString = myScript.src
              ? myScript.src.replace(/^[^\?]+\??/, '')
              : ''),
              (renderer = getQueryVariable('renderer'));
          }
          var readyStateCheckInterval = setInterval(checkReady, 100);
          try {
            'object' !== _typeof$3(exports) && __webpack_require__.amdO;
          } catch (err) {}
          var ShapeModifiers = (function () {
            var u = {},
              P = {};
            function S(u, S) {
              P[u] || (P[u] = S);
            }
            function D(u, S, D) {
              return new P[u](S, D);
            }
            return (u.registerModifier = S), (u.getModifier = D), u;
          })();
          function ShapeModifier() {}
          function TrimModifier() {}
          function PuckerAndBloatModifier() {}
          (ShapeModifier.prototype.initModifierProperties = function () {}),
            (ShapeModifier.prototype.addShapeToModifier = function () {}),
            (ShapeModifier.prototype.addShape = function (u) {
              if (!this.closed) {
                u.sh.container.addDynamicProperty(u.sh);
                var P = {
                  shape: u.sh,
                  data: u,
                  localShapeCollection:
                    shapeCollectionPool.newShapeCollection(),
                };
                this.shapes.push(P),
                  this.addShapeToModifier(P),
                  this._isAnimated && u.setAsAnimated();
              }
            }),
            (ShapeModifier.prototype.init = function (u, P) {
              (this.shapes = []),
                (this.elem = u),
                this.initDynamicPropertyContainer(u),
                this.initModifierProperties(u, P),
                (this.frameId = initialDefaultFrame),
                (this.closed = !1),
                (this.k = !1),
                this.dynamicProperties.length
                  ? (this.k = !0)
                  : this.getValue(!0);
            }),
            (ShapeModifier.prototype.processKeys = function () {
              this.elem.globalData.frameId !== this.frameId &&
                ((this.frameId = this.elem.globalData.frameId),
                this.iterateDynamicProperties());
            }),
            extendPrototype([DynamicPropertyContainer], ShapeModifier),
            extendPrototype([ShapeModifier], TrimModifier),
            (TrimModifier.prototype.initModifierProperties = function (u, P) {
              (this.s = PropertyFactory.getProp(u, P.s, 0, 0.01, this)),
                (this.e = PropertyFactory.getProp(u, P.e, 0, 0.01, this)),
                (this.o = PropertyFactory.getProp(u, P.o, 0, 0, this)),
                (this.sValue = 0),
                (this.eValue = 0),
                (this.getValue = this.processKeys),
                (this.m = P.m),
                (this._isAnimated =
                  !!this.s.effectsSequence.length ||
                  !!this.e.effectsSequence.length ||
                  !!this.o.effectsSequence.length);
            }),
            (TrimModifier.prototype.addShapeToModifier = function (u) {
              u.pathsData = [];
            }),
            (TrimModifier.prototype.calculateShapeEdges = function (
              u,
              P,
              S,
              D,
              T
            ) {
              var M,
                E,
                F = [];
              P <= 1
                ? F.push({ s: u, e: P })
                : u >= 1
                ? F.push({ s: u - 1, e: P - 1 })
                : (F.push({ s: u, e: 1 }), F.push({ s: 0, e: P - 1 }));
              var I = [],
                L = F.length;
              for (M = 0; M < L; M += 1)
                (E = F[M]).e * T < D ||
                  E.s * T > D + S ||
                  I.push([
                    E.s * T <= D ? 0 : (E.s * T - D) / S,
                    E.e * T >= D + S ? 1 : (E.e * T - D) / S,
                  ]);
              return I.length || I.push([0, 0]), I;
            }),
            (TrimModifier.prototype.releasePathsData = function (u) {
              var P,
                S = u.length;
              for (P = 0; P < S; P += 1) segmentsLengthPool.release(u[P]);
              return (u.length = 0), u;
            }),
            (TrimModifier.prototype.processShapes = function (u) {
              if (this._mdf || u) {
                var P = (this.o.v % 360) / 360;
                if (
                  (P < 0 && (P += 1),
                  (M =
                    this.s.v > 1
                      ? 1 + P
                      : this.s.v < 0
                      ? 0 + P
                      : this.s.v + P) >
                    (E =
                      this.e.v > 1
                        ? 1 + P
                        : this.e.v < 0
                        ? 0 + P
                        : this.e.v + P))
                ) {
                  var S = M;
                  (M = E), (E = S);
                }
                (M = 1e-4 * Math.round(1e4 * M)),
                  (E = 1e-4 * Math.round(1e4 * E)),
                  (this.sValue = M),
                  (this.eValue = E);
              } else (M = this.sValue), (E = this.eValue);
              var D = this.shapes.length,
                T = 0;
              if (E === M)
                for (I = 0; I < D; I += 1)
                  this.shapes[I].localShapeCollection.releaseShapes(),
                    (this.shapes[I].shape._mdf = !0),
                    (this.shapes[I].shape.paths =
                      this.shapes[I].localShapeCollection),
                    this._mdf && (this.shapes[I].pathsData.length = 0);
              else if ((1 === E && 0 === M) || (0 === E && 1 === M)) {
                if (this._mdf)
                  for (I = 0; I < D; I += 1)
                    (this.shapes[I].pathsData.length = 0),
                      (this.shapes[I].shape._mdf = !0);
              } else {
                var M,
                  E,
                  F,
                  I,
                  L,
                  R,
                  V,
                  O,
                  N,
                  G,
                  W,
                  Y,
                  H = [];
                for (I = 0; I < D; I += 1)
                  if (
                    (G = this.shapes[I]).shape._mdf ||
                    this._mdf ||
                    u ||
                    2 === this.m
                  ) {
                    if (
                      ((R = (F = G.shape.paths)._length),
                      (N = 0),
                      !G.shape._mdf && G.pathsData.length)
                    )
                      N = G.totalShapeLength;
                    else {
                      for (
                        L = 0, V = this.releasePathsData(G.pathsData);
                        L < R;
                        L += 1
                      )
                        (O = bez.getSegmentsLength(F.shapes[L])),
                          V.push(O),
                          (N += O.totalLength);
                      (G.totalShapeLength = N), (G.pathsData = V);
                    }
                    (T += N), (G.shape._mdf = !0);
                  } else G.shape.paths = G.localShapeCollection;
                var X = M,
                  J = E,
                  K = 0;
                for (I = D - 1; I >= 0; I -= 1)
                  if ((G = this.shapes[I]).shape._mdf) {
                    for (
                      (W = G.localShapeCollection).releaseShapes(),
                        2 === this.m && D > 1
                          ? ((Y = this.calculateShapeEdges(
                              M,
                              E,
                              G.totalShapeLength,
                              K,
                              T
                            )),
                            (K += G.totalShapeLength))
                          : (Y = [[X, J]]),
                        R = Y.length,
                        L = 0;
                      L < R;
                      L += 1
                    ) {
                      (X = Y[L][0]),
                        (J = Y[L][1]),
                        (H.length = 0),
                        J <= 1
                          ? H.push({
                              s: G.totalShapeLength * X,
                              e: G.totalShapeLength * J,
                            })
                          : X >= 1
                          ? H.push({
                              s: G.totalShapeLength * (X - 1),
                              e: G.totalShapeLength * (J - 1),
                            })
                          : (H.push({
                              s: G.totalShapeLength * X,
                              e: G.totalShapeLength,
                            }),
                            H.push({ s: 0, e: G.totalShapeLength * (J - 1) }));
                      var Z = this.addShapes(G, H[0]);
                      if (H[0].s !== H[0].e) {
                        if (H.length > 1) {
                          if (
                            G.shape.paths.shapes[G.shape.paths._length - 1].c
                          ) {
                            var U = Z.pop();
                            this.addPaths(Z, W),
                              (Z = this.addShapes(G, H[1], U));
                          } else
                            this.addPaths(Z, W), (Z = this.addShapes(G, H[1]));
                        }
                        this.addPaths(Z, W);
                      }
                    }
                    G.shape.paths = W;
                  }
              }
            }),
            (TrimModifier.prototype.addPaths = function (u, P) {
              var S,
                D = u.length;
              for (S = 0; S < D; S += 1) P.addShape(u[S]);
            }),
            (TrimModifier.prototype.addSegment = function (
              u,
              P,
              S,
              D,
              T,
              M,
              E
            ) {
              T.setXYAt(P[0], P[1], 'o', M),
                T.setXYAt(S[0], S[1], 'i', M + 1),
                E && T.setXYAt(u[0], u[1], 'v', M),
                T.setXYAt(D[0], D[1], 'v', M + 1);
            }),
            (TrimModifier.prototype.addSegmentFromArray = function (
              u,
              P,
              S,
              D
            ) {
              P.setXYAt(u[1], u[5], 'o', S),
                P.setXYAt(u[2], u[6], 'i', S + 1),
                D && P.setXYAt(u[0], u[4], 'v', S),
                P.setXYAt(u[3], u[7], 'v', S + 1);
            }),
            (TrimModifier.prototype.addShapes = function (u, P, S) {
              var D,
                T,
                M,
                E,
                F,
                I,
                L,
                R,
                V = u.pathsData,
                O = u.shape.paths.shapes,
                N = u.shape.paths._length,
                G = 0,
                W = [],
                Y = !0;
              for (
                S
                  ? ((F = S._length), (R = S._length))
                  : ((S = shapePool.newElement()), (F = 0), (R = 0)),
                  W.push(S),
                  D = 0;
                D < N;
                D += 1
              ) {
                for (
                  T = 1,
                    I = V[D].lengths,
                    S.c = O[D].c,
                    M = O[D].c ? I.length : I.length + 1;
                  T < M;
                  T += 1
                )
                  if (G + (E = I[T - 1]).addedLength < P.s)
                    (G += E.addedLength), (S.c = !1);
                  else if (G > P.e) {
                    S.c = !1;
                    break;
                  } else
                    P.s <= G && P.e >= G + E.addedLength
                      ? (this.addSegment(
                          O[D].v[T - 1],
                          O[D].o[T - 1],
                          O[D].i[T],
                          O[D].v[T],
                          S,
                          F,
                          Y
                        ),
                        (Y = !1))
                      : ((L = bez.getNewSegment(
                          O[D].v[T - 1],
                          O[D].v[T],
                          O[D].o[T - 1],
                          O[D].i[T],
                          (P.s - G) / E.addedLength,
                          (P.e - G) / E.addedLength,
                          I[T - 1]
                        )),
                        this.addSegmentFromArray(L, S, F, Y),
                        (Y = !1),
                        (S.c = !1)),
                      (G += E.addedLength),
                      (F += 1);
                if (O[D].c && I.length) {
                  if (((E = I[T - 1]), G <= P.e)) {
                    var H = I[T - 1].addedLength;
                    P.s <= G && P.e >= G + H
                      ? (this.addSegment(
                          O[D].v[T - 1],
                          O[D].o[T - 1],
                          O[D].i[0],
                          O[D].v[0],
                          S,
                          F,
                          Y
                        ),
                        (Y = !1))
                      : ((L = bez.getNewSegment(
                          O[D].v[T - 1],
                          O[D].v[0],
                          O[D].o[T - 1],
                          O[D].i[0],
                          (P.s - G) / H,
                          (P.e - G) / H,
                          I[T - 1]
                        )),
                        this.addSegmentFromArray(L, S, F, Y),
                        (Y = !1),
                        (S.c = !1));
                  } else S.c = !1;
                  (G += E.addedLength), (F += 1);
                }
                if (
                  (S._length &&
                    (S.setXYAt(S.v[R][0], S.v[R][1], 'i', R),
                    S.setXYAt(
                      S.v[S._length - 1][0],
                      S.v[S._length - 1][1],
                      'o',
                      S._length - 1
                    )),
                  G > P.e)
                )
                  break;
                D < N - 1 &&
                  ((S = shapePool.newElement()), (Y = !0), W.push(S), (F = 0));
              }
              return W;
            }),
            extendPrototype([ShapeModifier], PuckerAndBloatModifier),
            (PuckerAndBloatModifier.prototype.initModifierProperties =
              function (u, P) {
                (this.getValue = this.processKeys),
                  (this.amount = PropertyFactory.getProp(
                    u,
                    P.a,
                    0,
                    null,
                    this
                  )),
                  (this._isAnimated = !!this.amount.effectsSequence.length);
              }),
            (PuckerAndBloatModifier.prototype.processPath = function (u, P) {
              var S,
                D,
                T,
                M,
                E,
                F,
                I = P / 100,
                L = [0, 0],
                R = u._length,
                V = 0;
              for (V = 0; V < R; V += 1)
                (L[0] += u.v[V][0]), (L[1] += u.v[V][1]);
              (L[0] /= R), (L[1] /= R);
              var O = shapePool.newElement();
              for (V = 0, O.c = u.c; V < R; V += 1)
                (S = u.v[V][0] + (L[0] - u.v[V][0]) * I),
                  (D = u.v[V][1] + (L[1] - u.v[V][1]) * I),
                  (T = u.o[V][0] + -((L[0] - u.o[V][0]) * I)),
                  (M = u.o[V][1] + -((L[1] - u.o[V][1]) * I)),
                  (E = u.i[V][0] + -((L[0] - u.i[V][0]) * I)),
                  (F = u.i[V][1] + -((L[1] - u.i[V][1]) * I)),
                  O.setTripleAt(S, D, T, M, E, F, V);
              return O;
            }),
            (PuckerAndBloatModifier.prototype.processShapes = function (u) {
              var P,
                S,
                D,
                T,
                M,
                E,
                F = this.shapes.length,
                I = this.amount.v;
              if (0 !== I)
                for (S = 0; S < F; S += 1) {
                  if (
                    ((E = (M = this.shapes[S]).localShapeCollection),
                    !(!M.shape._mdf && !this._mdf && !u))
                  )
                    for (
                      E.releaseShapes(),
                        M.shape._mdf = !0,
                        P = M.shape.paths.shapes,
                        T = M.shape.paths._length,
                        D = 0;
                      D < T;
                      D += 1
                    )
                      E.addShape(this.processPath(P[D], I));
                  M.shape.paths = M.localShapeCollection;
                }
              this.dynamicProperties.length || (this._mdf = !1);
            });
          var TransformPropertyFactory = (function () {
            var u = [0, 0];
            function P(u) {
              var P = this._mdf;
              this.iterateDynamicProperties(),
                (this._mdf = this._mdf || P),
                this.a && u.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]),
                this.s && u.scale(this.s.v[0], this.s.v[1], this.s.v[2]),
                this.sk && u.skewFromAxis(-this.sk.v, this.sa.v),
                this.r
                  ? u.rotate(-this.r.v)
                  : u
                      .rotateZ(-this.rz.v)
                      .rotateY(this.ry.v)
                      .rotateX(this.rx.v)
                      .rotateZ(-this.or.v[2])
                      .rotateY(this.or.v[1])
                      .rotateX(this.or.v[0]),
                this.data.p.s
                  ? this.data.p.z
                    ? u.translate(this.px.v, this.py.v, -this.pz.v)
                    : u.translate(this.px.v, this.py.v, 0)
                  : u.translate(this.p.v[0], this.p.v[1], -this.p.v[2]);
            }
            function S(P) {
              if (this.elem.globalData.frameId !== this.frameId) {
                if (
                  (this._isDirty &&
                    (this.precalculateMatrix(), (this._isDirty = !1)),
                  this.iterateDynamicProperties(),
                  this._mdf || P)
                ) {
                  var S;
                  if (
                    (this.v.cloneFromProps(this.pre.props),
                    this.appliedTransformations < 1 &&
                      this.v.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]),
                    this.appliedTransformations < 2 &&
                      this.v.scale(this.s.v[0], this.s.v[1], this.s.v[2]),
                    this.sk &&
                      this.appliedTransformations < 3 &&
                      this.v.skewFromAxis(-this.sk.v, this.sa.v),
                    this.r && this.appliedTransformations < 4
                      ? this.v.rotate(-this.r.v)
                      : !this.r &&
                        this.appliedTransformations < 4 &&
                        this.v
                          .rotateZ(-this.rz.v)
                          .rotateY(this.ry.v)
                          .rotateX(this.rx.v)
                          .rotateZ(-this.or.v[2])
                          .rotateY(this.or.v[1])
                          .rotateX(this.or.v[0]),
                    this.autoOriented)
                  ) {
                    if (
                      ((S = this.elem.globalData.frameRate),
                      this.p && this.p.keyframes && this.p.getValueAtTime)
                    )
                      this.p._caching.lastFrame + this.p.offsetTime <=
                      this.p.keyframes[0].t
                        ? ((D = this.p.getValueAtTime(
                            (this.p.keyframes[0].t + 0.01) / S,
                            0
                          )),
                          (T = this.p.getValueAtTime(
                            this.p.keyframes[0].t / S,
                            0
                          )))
                        : this.p._caching.lastFrame + this.p.offsetTime >=
                          this.p.keyframes[this.p.keyframes.length - 1].t
                        ? ((D = this.p.getValueAtTime(
                            this.p.keyframes[this.p.keyframes.length - 1].t / S,
                            0
                          )),
                          (T = this.p.getValueAtTime(
                            (this.p.keyframes[this.p.keyframes.length - 1].t -
                              0.05) /
                              S,
                            0
                          )))
                        : ((D = this.p.pv),
                          (T = this.p.getValueAtTime(
                            (this.p._caching.lastFrame +
                              this.p.offsetTime -
                              0.01) /
                              S,
                            this.p.offsetTime
                          )));
                    else if (
                      this.px &&
                      this.px.keyframes &&
                      this.py.keyframes &&
                      this.px.getValueAtTime &&
                      this.py.getValueAtTime
                    ) {
                      (D = []), (T = []);
                      var D,
                        T,
                        M = this.px,
                        E = this.py;
                      M._caching.lastFrame + M.offsetTime <= M.keyframes[0].t
                        ? ((D[0] = M.getValueAtTime(
                            (M.keyframes[0].t + 0.01) / S,
                            0
                          )),
                          (D[1] = E.getValueAtTime(
                            (E.keyframes[0].t + 0.01) / S,
                            0
                          )),
                          (T[0] = M.getValueAtTime(M.keyframes[0].t / S, 0)),
                          (T[1] = E.getValueAtTime(E.keyframes[0].t / S, 0)))
                        : M._caching.lastFrame + M.offsetTime >=
                          M.keyframes[M.keyframes.length - 1].t
                        ? ((D[0] = M.getValueAtTime(
                            M.keyframes[M.keyframes.length - 1].t / S,
                            0
                          )),
                          (D[1] = E.getValueAtTime(
                            E.keyframes[E.keyframes.length - 1].t / S,
                            0
                          )),
                          (T[0] = M.getValueAtTime(
                            (M.keyframes[M.keyframes.length - 1].t - 0.01) / S,
                            0
                          )),
                          (T[1] = E.getValueAtTime(
                            (E.keyframes[E.keyframes.length - 1].t - 0.01) / S,
                            0
                          )))
                        : ((D = [M.pv, E.pv]),
                          (T[0] = M.getValueAtTime(
                            (M._caching.lastFrame + M.offsetTime - 0.01) / S,
                            M.offsetTime
                          )),
                          (T[1] = E.getValueAtTime(
                            (E._caching.lastFrame + E.offsetTime - 0.01) / S,
                            E.offsetTime
                          )));
                    } else D = T = u;
                    this.v.rotate(-Math.atan2(D[1] - T[1], D[0] - T[0]));
                  }
                  this.data.p && this.data.p.s
                    ? this.data.p.z
                      ? this.v.translate(this.px.v, this.py.v, -this.pz.v)
                      : this.v.translate(this.px.v, this.py.v, 0)
                    : this.v.translate(this.p.v[0], this.p.v[1], -this.p.v[2]);
                }
                this.frameId = this.elem.globalData.frameId;
              }
            }
            function D() {
              if (
                ((this.appliedTransformations = 0),
                this.pre.reset(),
                !this.a.effectsSequence.length &&
                  (this.pre.translate(-this.a.v[0], -this.a.v[1], this.a.v[2]),
                  (this.appliedTransformations = 1),
                  !this.s.effectsSequence.length))
              ) {
                if (
                  (this.pre.scale(this.s.v[0], this.s.v[1], this.s.v[2]),
                  (this.appliedTransformations = 2),
                  this.sk)
                ) {
                  if (
                    this.sk.effectsSequence.length ||
                    this.sa.effectsSequence.length
                  )
                    return;
                  this.pre.skewFromAxis(-this.sk.v, this.sa.v),
                    (this.appliedTransformations = 3);
                }
                this.r
                  ? this.r.effectsSequence.length ||
                    (this.pre.rotate(-this.r.v),
                    (this.appliedTransformations = 4))
                  : this.rz.effectsSequence.length ||
                    this.ry.effectsSequence.length ||
                    this.rx.effectsSequence.length ||
                    this.or.effectsSequence.length ||
                    (this.pre
                      .rotateZ(-this.rz.v)
                      .rotateY(this.ry.v)
                      .rotateX(this.rx.v)
                      .rotateZ(-this.or.v[2])
                      .rotateY(this.or.v[1])
                      .rotateX(this.or.v[0]),
                    (this.appliedTransformations = 4));
              }
            }
            function T() {}
            function M(u) {
              this._addDynamicProperty(u),
                this.elem.addDynamicProperty(u),
                (this._isDirty = !0);
            }
            function E(u, P, S) {
              if (
                ((this.elem = u),
                (this.frameId = -1),
                (this.propType = 'transform'),
                (this.data = P),
                (this.v = new Matrix()),
                (this.pre = new Matrix()),
                (this.appliedTransformations = 0),
                this.initDynamicPropertyContainer(S || u),
                P.p && P.p.s
                  ? ((this.px = PropertyFactory.getProp(u, P.p.x, 0, 0, this)),
                    (this.py = PropertyFactory.getProp(u, P.p.y, 0, 0, this)),
                    P.p.z &&
                      (this.pz = PropertyFactory.getProp(u, P.p.z, 0, 0, this)))
                  : (this.p = PropertyFactory.getProp(
                      u,
                      P.p || { k: [0, 0, 0] },
                      1,
                      0,
                      this
                    )),
                P.rx)
              ) {
                if (
                  ((this.rx = PropertyFactory.getProp(
                    u,
                    P.rx,
                    0,
                    degToRads,
                    this
                  )),
                  (this.ry = PropertyFactory.getProp(
                    u,
                    P.ry,
                    0,
                    degToRads,
                    this
                  )),
                  (this.rz = PropertyFactory.getProp(
                    u,
                    P.rz,
                    0,
                    degToRads,
                    this
                  )),
                  P.or.k[0].ti)
                ) {
                  var D,
                    T = P.or.k.length;
                  for (D = 0; D < T; D += 1)
                    (P.or.k[D].to = null), (P.or.k[D].ti = null);
                }
                (this.or = PropertyFactory.getProp(
                  u,
                  P.or,
                  1,
                  degToRads,
                  this
                )),
                  (this.or.sh = !0);
              } else
                this.r = PropertyFactory.getProp(
                  u,
                  P.r || { k: 0 },
                  0,
                  degToRads,
                  this
                );
              P.sk &&
                ((this.sk = PropertyFactory.getProp(
                  u,
                  P.sk,
                  0,
                  degToRads,
                  this
                )),
                (this.sa = PropertyFactory.getProp(
                  u,
                  P.sa,
                  0,
                  degToRads,
                  this
                ))),
                (this.a = PropertyFactory.getProp(
                  u,
                  P.a || { k: [0, 0, 0] },
                  1,
                  0,
                  this
                )),
                (this.s = PropertyFactory.getProp(
                  u,
                  P.s || { k: [100, 100, 100] },
                  1,
                  0.01,
                  this
                )),
                P.o
                  ? (this.o = PropertyFactory.getProp(u, P.o, 0, 0.01, u))
                  : (this.o = { _mdf: !1, v: 1 }),
                (this._isDirty = !0),
                this.dynamicProperties.length || this.getValue(!0);
            }
            return (
              (E.prototype = {
                applyToMatrix: P,
                getValue: S,
                precalculateMatrix: D,
                autoOrient: T,
              }),
              extendPrototype([DynamicPropertyContainer], E),
              (E.prototype.addDynamicProperty = M),
              (E.prototype._addDynamicProperty =
                DynamicPropertyContainer.prototype.addDynamicProperty),
              {
                getTransformProperty: function (u, P, S) {
                  return new E(u, P, S);
                },
              }
            );
          })();
          function RepeaterModifier() {}
          function RoundCornersModifier() {}
          function floatEqual(u, P) {
            return 1e5 * Math.abs(u - P) <= Math.min(Math.abs(u), Math.abs(P));
          }
          function floatZero(u) {
            return 1e-5 >= Math.abs(u);
          }
          function lerp(u, P, S) {
            return u * (1 - S) + P * S;
          }
          function lerpPoint(u, P, S) {
            return [lerp(u[0], P[0], S), lerp(u[1], P[1], S)];
          }
          function quadRoots(u, P, S) {
            if (0 === u) return [];
            var D = P * P - 4 * u * S;
            if (D < 0) return [];
            var T = -P / (2 * u);
            if (0 === D) return [T];
            var M = Math.sqrt(D) / (2 * u);
            return [T - M, T + M];
          }
          function polynomialCoefficients(u, P, S, D) {
            return [
              -u + 3 * P - 3 * S + D,
              3 * u - 6 * P + 3 * S,
              -3 * u + 3 * P,
              u,
            ];
          }
          function singlePoint(u) {
            return new PolynomialBezier(u, u, u, u, !1);
          }
          function PolynomialBezier(u, P, S, D, T) {
            T && pointEqual(u, P) && (P = lerpPoint(u, D, 1 / 3)),
              T && pointEqual(S, D) && (S = lerpPoint(u, D, 2 / 3));
            var M = polynomialCoefficients(u[0], P[0], S[0], D[0]),
              E = polynomialCoefficients(u[1], P[1], S[1], D[1]);
            (this.a = [M[0], E[0]]),
              (this.b = [M[1], E[1]]),
              (this.c = [M[2], E[2]]),
              (this.d = [M[3], E[3]]),
              (this.points = [u, P, S, D]);
          }
          function extrema(u, P) {
            var S = u.points[0][P],
              D = u.points[u.points.length - 1][P];
            if (S > D) {
              var T = D;
              (D = S), (S = T);
            }
            for (
              var M = quadRoots(3 * u.a[P], 2 * u.b[P], u.c[P]), E = 0;
              E < M.length;
              E += 1
            )
              if (M[E] > 0 && M[E] < 1) {
                var F = u.point(M[E])[P];
                F < S ? (S = F) : F > D && (D = F);
              }
            return { min: S, max: D };
          }
          function intersectData(u, P, S) {
            var D = u.boundingBox();
            return {
              cx: D.cx,
              cy: D.cy,
              width: D.width,
              height: D.height,
              bez: u,
              t: (P + S) / 2,
              t1: P,
              t2: S,
            };
          }
          function splitData(u) {
            var P = u.bez.split(0.5);
            return [
              intersectData(P[0], u.t1, u.t),
              intersectData(P[1], u.t, u.t2),
            ];
          }
          function boxIntersect(u, P) {
            return (
              2 * Math.abs(u.cx - P.cx) < u.width + P.width &&
              2 * Math.abs(u.cy - P.cy) < u.height + P.height
            );
          }
          function intersectsImpl(u, P, S, D, T, M) {
            if (boxIntersect(u, P)) {
              if (
                S >= M ||
                (u.width <= D && u.height <= D && P.width <= D && P.height <= D)
              ) {
                T.push([u.t, P.t]);
                return;
              }
              var E = splitData(u),
                F = splitData(P);
              intersectsImpl(E[0], F[0], S + 1, D, T, M),
                intersectsImpl(E[0], F[1], S + 1, D, T, M),
                intersectsImpl(E[1], F[0], S + 1, D, T, M),
                intersectsImpl(E[1], F[1], S + 1, D, T, M);
            }
          }
          function crossProduct(u, P) {
            return [
              u[1] * P[2] - u[2] * P[1],
              u[2] * P[0] - u[0] * P[2],
              u[0] * P[1] - u[1] * P[0],
            ];
          }
          function lineIntersection(u, P, S, D) {
            var T = [u[0], u[1], 1],
              M = [P[0], P[1], 1],
              E = [S[0], S[1], 1],
              F = [D[0], D[1], 1],
              I = crossProduct(crossProduct(T, M), crossProduct(E, F));
            return floatZero(I[2]) ? null : [I[0] / I[2], I[1] / I[2]];
          }
          function polarOffset(u, P, S) {
            return [u[0] + Math.cos(P) * S, u[1] - Math.sin(P) * S];
          }
          function pointDistance(u, P) {
            return Math.hypot(u[0] - P[0], u[1] - P[1]);
          }
          function pointEqual(u, P) {
            return floatEqual(u[0], P[0]) && floatEqual(u[1], P[1]);
          }
          function ZigZagModifier() {}
          function setPoint(u, P, S, D, T, M, E) {
            var F = S - Math.PI / 2,
              I = S + Math.PI / 2,
              L = P[0] + Math.cos(S) * D * T,
              R = P[1] - Math.sin(S) * D * T;
            u.setTripleAt(
              L,
              R,
              L + Math.cos(F) * M,
              R - Math.sin(F) * M,
              L + Math.cos(I) * E,
              R - Math.sin(I) * E,
              u.length()
            );
          }
          function getPerpendicularVector(u, P) {
            var S = [P[0] - u[0], P[1] - u[1]],
              D = -(0.5 * Math.PI);
            return [
              Math.cos(D) * S[0] - Math.sin(D) * S[1],
              Math.sin(D) * S[0] + Math.cos(D) * S[1],
            ];
          }
          function getProjectingAngle(u, P) {
            var S = 0 === P ? u.length() - 1 : P - 1,
              D = (P + 1) % u.length(),
              T = getPerpendicularVector(u.v[S], u.v[D]);
            return Math.atan2(0, 1) - Math.atan2(T[1], T[0]);
          }
          function zigZagCorner(u, P, S, D, T, M, E) {
            var F = getProjectingAngle(P, S),
              I = P.v[S % P._length],
              L = P.v[0 === S ? P._length - 1 : S - 1],
              R = P.v[(S + 1) % P._length],
              V =
                2 === M
                  ? Math.sqrt(
                      Math.pow(I[0] - L[0], 2) + Math.pow(I[1] - L[1], 2)
                    )
                  : 0,
              O =
                2 === M
                  ? Math.sqrt(
                      Math.pow(I[0] - R[0], 2) + Math.pow(I[1] - R[1], 2)
                    )
                  : 0;
            setPoint(
              u,
              P.v[S % P._length],
              F,
              E,
              D,
              O / ((T + 1) * 2),
              V / ((T + 1) * 2),
              M
            );
          }
          function zigZagSegment(u, P, S, D, T, M) {
            for (var E = 0; E < D; E += 1) {
              var F = (E + 1) / (D + 1),
                I =
                  2 === T
                    ? Math.sqrt(
                        Math.pow(P.points[3][0] - P.points[0][0], 2) +
                          Math.pow(P.points[3][1] - P.points[0][1], 2)
                      )
                    : 0,
                L = P.normalAngle(F);
              setPoint(
                u,
                P.point(F),
                L,
                M,
                S,
                I / ((D + 1) * 2),
                I / ((D + 1) * 2),
                T
              ),
                (M = -M);
            }
            return M;
          }
          function linearOffset(u, P, S) {
            var D = Math.atan2(P[0] - u[0], P[1] - u[1]);
            return [polarOffset(u, D, S), polarOffset(P, D, S)];
          }
          function offsetSegment(u, P) {
            (S = (I = linearOffset(u.points[0], u.points[1], P))[0]),
              (D = I[1]),
              (T = (I = linearOffset(u.points[1], u.points[2], P))[0]),
              (M = I[1]),
              (E = (I = linearOffset(u.points[2], u.points[3], P))[0]),
              (F = I[1]);
            var S,
              D,
              T,
              M,
              E,
              F,
              I,
              L = lineIntersection(S, D, T, M);
            null === L && (L = D);
            var R = lineIntersection(E, F, T, M);
            return null === R && (R = E), new PolynomialBezier(S, L, R, F);
          }
          function joinLines(u, P, S, D, T) {
            var M = P.points[3],
              E = S.points[0];
            if (3 === D || pointEqual(M, E)) return M;
            if (2 === D) {
              var F = -P.tangentAngle(1),
                I = -S.tangentAngle(0) + Math.PI,
                L = lineIntersection(
                  M,
                  polarOffset(M, F + Math.PI / 2, 100),
                  E,
                  polarOffset(E, F + Math.PI / 2, 100)
                ),
                R = L ? pointDistance(L, M) : pointDistance(M, E) / 2,
                V = polarOffset(M, F, 2 * R * roundCorner);
              return (
                u.setXYAt(V[0], V[1], 'o', u.length() - 1),
                (V = polarOffset(E, I, 2 * R * roundCorner)),
                u.setTripleAt(E[0], E[1], E[0], E[1], V[0], V[1], u.length()),
                E
              );
            }
            var O = pointEqual(M, P.points[2]) ? P.points[0] : P.points[2],
              N = pointEqual(E, S.points[1]) ? S.points[3] : S.points[1],
              G = lineIntersection(O, M, E, N);
            return G && pointDistance(G, M) < T
              ? (u.setTripleAt(G[0], G[1], G[0], G[1], G[0], G[1], u.length()),
                G)
              : M;
          }
          function getIntersection(u, P) {
            var S = u.intersections(P);
            return (S.length && floatEqual(S[0][0], 1) && S.shift(), S.length)
              ? S[0]
              : null;
          }
          function pruneSegmentIntersection(u, P) {
            var S = u.slice(),
              D = P.slice(),
              T = getIntersection(u[u.length - 1], P[0]);
            return (T &&
              ((S[u.length - 1] = u[u.length - 1].split(T[0])[0]),
              (D[0] = P[0].split(T[1])[1])),
            u.length > 1 &&
              P.length > 1 &&
              (T = getIntersection(u[0], P[P.length - 1])))
              ? [[u[0].split(T[0])[0]], [P[P.length - 1].split(T[1])[1]]]
              : [S, D];
          }
          function pruneIntersections(u) {
            for (var P, S = 1; S < u.length; S += 1)
              (P = pruneSegmentIntersection(u[S - 1], u[S])),
                (u[S - 1] = P[0]),
                (u[S] = P[1]);
            return (
              u.length > 1 &&
                ((P = pruneSegmentIntersection(u[u.length - 1], u[0])),
                (u[u.length - 1] = P[0]),
                (u[0] = P[1])),
              u
            );
          }
          function offsetSegmentSplit(u, P) {
            var S,
              D,
              T,
              M,
              E = u.inflectionPoints();
            if (0 === E.length) return [offsetSegment(u, P)];
            if (1 === E.length || floatEqual(E[1], 1))
              return (
                (S = (T = u.split(E[0]))[0]),
                (D = T[1]),
                [offsetSegment(S, P), offsetSegment(D, P)]
              );
            S = (T = u.split(E[0]))[0];
            var F = (E[1] - E[0]) / (1 - E[0]);
            return (
              (M = (T = T[1].split(F))[0]),
              (D = T[1]),
              [offsetSegment(S, P), offsetSegment(M, P), offsetSegment(D, P)]
            );
          }
          function OffsetPathModifier() {}
          function getFontProperties(u) {
            for (
              var P = u.fStyle ? u.fStyle.split(' ') : [],
                S = 'normal',
                D = 'normal',
                T = P.length,
                M = 0;
              M < T;
              M += 1
            )
              switch (P[M].toLowerCase()) {
                case 'italic':
                  D = 'italic';
                  break;
                case 'bold':
                  S = '700';
                  break;
                case 'black':
                  S = '900';
                  break;
                case 'medium':
                  S = '500';
                  break;
                case 'regular':
                case 'normal':
                  S = '400';
                  break;
                case 'light':
                case 'thin':
                  S = '200';
              }
            return { style: D, weight: u.fWeight || S };
          }
          extendPrototype([ShapeModifier], RepeaterModifier),
            (RepeaterModifier.prototype.initModifierProperties = function (
              u,
              P
            ) {
              (this.getValue = this.processKeys),
                (this.c = PropertyFactory.getProp(u, P.c, 0, null, this)),
                (this.o = PropertyFactory.getProp(u, P.o, 0, null, this)),
                (this.tr = TransformPropertyFactory.getTransformProperty(
                  u,
                  P.tr,
                  this
                )),
                (this.so = PropertyFactory.getProp(u, P.tr.so, 0, 0.01, this)),
                (this.eo = PropertyFactory.getProp(u, P.tr.eo, 0, 0.01, this)),
                (this.data = P),
                this.dynamicProperties.length || this.getValue(!0),
                (this._isAnimated = !!this.dynamicProperties.length),
                (this.pMatrix = new Matrix()),
                (this.rMatrix = new Matrix()),
                (this.sMatrix = new Matrix()),
                (this.tMatrix = new Matrix()),
                (this.matrix = new Matrix());
            }),
            (RepeaterModifier.prototype.applyTransforms = function (
              u,
              P,
              S,
              D,
              T,
              M
            ) {
              var E = M ? -1 : 1,
                F = D.s.v[0] + (1 - D.s.v[0]) * (1 - T),
                I = D.s.v[1] + (1 - D.s.v[1]) * (1 - T);
              u.translate(D.p.v[0] * E * T, D.p.v[1] * E * T, D.p.v[2]),
                P.translate(-D.a.v[0], -D.a.v[1], D.a.v[2]),
                P.rotate(-D.r.v * E * T),
                P.translate(D.a.v[0], D.a.v[1], D.a.v[2]),
                S.translate(-D.a.v[0], -D.a.v[1], D.a.v[2]),
                S.scale(M ? 1 / F : F, M ? 1 / I : I),
                S.translate(D.a.v[0], D.a.v[1], D.a.v[2]);
            }),
            (RepeaterModifier.prototype.init = function (u, P, S, D) {
              for (
                this.elem = u,
                  this.arr = P,
                  this.pos = S,
                  this.elemsData = D,
                  this._currentCopies = 0,
                  this._elements = [],
                  this._groups = [],
                  this.frameId = -1,
                  this.initDynamicPropertyContainer(u),
                  this.initModifierProperties(u, P[S]);
                S > 0;

              )
                (S -= 1), this._elements.unshift(P[S]);
              this.dynamicProperties.length ? (this.k = !0) : this.getValue(!0);
            }),
            (RepeaterModifier.prototype.resetElements = function (u) {
              var P,
                S = u.length;
              for (P = 0; P < S; P += 1)
                (u[P]._processed = !1),
                  'gr' === u[P].ty && this.resetElements(u[P].it);
            }),
            (RepeaterModifier.prototype.cloneElements = function (u) {
              var P = JSON.parse(JSON.stringify(u));
              return this.resetElements(P), P;
            }),
            (RepeaterModifier.prototype.changeGroupRender = function (u, P) {
              var S,
                D = u.length;
              for (S = 0; S < D; S += 1)
                (u[S]._render = P),
                  'gr' === u[S].ty && this.changeGroupRender(u[S].it, P);
            }),
            (RepeaterModifier.prototype.processShapes = function (u) {
              var P = !1;
              if (this._mdf || u) {
                var S,
                  D,
                  T,
                  M,
                  E,
                  F,
                  I,
                  L,
                  R = Math.ceil(this.c.v);
                if (this._groups.length < R) {
                  for (; this._groups.length < R; ) {
                    var V = {
                      it: this.cloneElements(this._elements),
                      ty: 'gr',
                    };
                    V.it.push({
                      a: { a: 0, ix: 1, k: [0, 0] },
                      nm: 'Transform',
                      o: { a: 0, ix: 7, k: 100 },
                      p: { a: 0, ix: 2, k: [0, 0] },
                      r: {
                        a: 1,
                        ix: 6,
                        k: [
                          { s: 0, e: 0, t: 0 },
                          { s: 0, e: 0, t: 1 },
                        ],
                      },
                      s: { a: 0, ix: 3, k: [100, 100] },
                      sa: { a: 0, ix: 5, k: 0 },
                      sk: { a: 0, ix: 4, k: 0 },
                      ty: 'tr',
                    }),
                      this.arr.splice(0, 0, V),
                      this._groups.splice(0, 0, V),
                      (this._currentCopies += 1);
                  }
                  this.elem.reloadShapes(), (P = !0);
                }
                for (T = 0, E = 0; T <= this._groups.length - 1; T += 1) {
                  if (
                    ((F = E < R),
                    (this._groups[T]._render = F),
                    this.changeGroupRender(this._groups[T].it, F),
                    !F)
                  ) {
                    var O = this.elemsData[T].it,
                      N = O[O.length - 1];
                    0 !== N.transform.op.v
                      ? ((N.transform.op._mdf = !0), (N.transform.op.v = 0))
                      : (N.transform.op._mdf = !1);
                  }
                  E += 1;
                }
                this._currentCopies = R;
                var G = this.o.v,
                  W = G % 1,
                  Y = G > 0 ? Math.floor(G) : Math.ceil(G),
                  H = this.pMatrix.props,
                  X = this.rMatrix.props,
                  J = this.sMatrix.props;
                this.pMatrix.reset(),
                  this.rMatrix.reset(),
                  this.sMatrix.reset(),
                  this.tMatrix.reset(),
                  this.matrix.reset();
                var K = 0;
                if (G > 0) {
                  for (; K < Y; )
                    this.applyTransforms(
                      this.pMatrix,
                      this.rMatrix,
                      this.sMatrix,
                      this.tr,
                      1,
                      !1
                    ),
                      (K += 1);
                  W &&
                    (this.applyTransforms(
                      this.pMatrix,
                      this.rMatrix,
                      this.sMatrix,
                      this.tr,
                      W,
                      !1
                    ),
                    (K += W));
                } else if (G < 0) {
                  for (; K > Y; )
                    this.applyTransforms(
                      this.pMatrix,
                      this.rMatrix,
                      this.sMatrix,
                      this.tr,
                      1,
                      !0
                    ),
                      (K -= 1);
                  W &&
                    (this.applyTransforms(
                      this.pMatrix,
                      this.rMatrix,
                      this.sMatrix,
                      this.tr,
                      -W,
                      !0
                    ),
                    (K -= W));
                }
                for (
                  T = 1 === this.data.m ? 0 : this._currentCopies - 1,
                    M = 1 === this.data.m ? 1 : -1,
                    E = this._currentCopies;
                  E;

                ) {
                  if (
                    ((L = (D = (S = this.elemsData[T].it)[S.length - 1]
                      .transform.mProps.v.props).length),
                    (S[S.length - 1].transform.mProps._mdf = !0),
                    (S[S.length - 1].transform.op._mdf = !0),
                    (S[S.length - 1].transform.op.v =
                      1 === this._currentCopies
                        ? this.so.v
                        : this.so.v +
                          (this.eo.v - this.so.v) *
                            (T / (this._currentCopies - 1))),
                    0 !== K)
                  ) {
                    for (
                      ((0 !== T && 1 === M) ||
                        (T !== this._currentCopies - 1 && -1 === M)) &&
                        this.applyTransforms(
                          this.pMatrix,
                          this.rMatrix,
                          this.sMatrix,
                          this.tr,
                          1,
                          !1
                        ),
                        this.matrix.transform(
                          X[0],
                          X[1],
                          X[2],
                          X[3],
                          X[4],
                          X[5],
                          X[6],
                          X[7],
                          X[8],
                          X[9],
                          X[10],
                          X[11],
                          X[12],
                          X[13],
                          X[14],
                          X[15]
                        ),
                        this.matrix.transform(
                          J[0],
                          J[1],
                          J[2],
                          J[3],
                          J[4],
                          J[5],
                          J[6],
                          J[7],
                          J[8],
                          J[9],
                          J[10],
                          J[11],
                          J[12],
                          J[13],
                          J[14],
                          J[15]
                        ),
                        this.matrix.transform(
                          H[0],
                          H[1],
                          H[2],
                          H[3],
                          H[4],
                          H[5],
                          H[6],
                          H[7],
                          H[8],
                          H[9],
                          H[10],
                          H[11],
                          H[12],
                          H[13],
                          H[14],
                          H[15]
                        ),
                        I = 0;
                      I < L;
                      I += 1
                    )
                      D[I] = this.matrix.props[I];
                    this.matrix.reset();
                  } else
                    for (this.matrix.reset(), I = 0; I < L; I += 1)
                      D[I] = this.matrix.props[I];
                  (K += 1), (E -= 1), (T += M);
                }
              } else
                for (E = this._currentCopies, T = 0, M = 1; E; )
                  (D = (S = this.elemsData[T].it)[S.length - 1].transform.mProps
                    .v.props),
                    (S[S.length - 1].transform.mProps._mdf = !1),
                    (S[S.length - 1].transform.op._mdf = !1),
                    (E -= 1),
                    (T += M);
              return P;
            }),
            (RepeaterModifier.prototype.addShape = function () {}),
            extendPrototype([ShapeModifier], RoundCornersModifier),
            (RoundCornersModifier.prototype.initModifierProperties = function (
              u,
              P
            ) {
              (this.getValue = this.processKeys),
                (this.rd = PropertyFactory.getProp(u, P.r, 0, null, this)),
                (this._isAnimated = !!this.rd.effectsSequence.length);
            }),
            (RoundCornersModifier.prototype.processPath = function (u, P) {
              var S,
                D,
                T,
                M,
                E,
                F,
                I,
                L,
                R,
                V,
                O,
                N,
                G,
                W = shapePool.newElement();
              W.c = u.c;
              var Y = u._length,
                H = 0;
              for (S = 0; S < Y; S += 1)
                (D = u.v[S]),
                  (M = u.o[S]),
                  (T = u.i[S]),
                  D[0] === M[0] &&
                  D[1] === M[1] &&
                  D[0] === T[0] &&
                  D[1] === T[1]
                    ? (0 !== S && S !== Y - 1) || u.c
                      ? ((E = 0 === S ? u.v[Y - 1] : u.v[S - 1]),
                        (I = (F = Math.sqrt(
                          Math.pow(D[0] - E[0], 2) + Math.pow(D[1] - E[1], 2)
                        ))
                          ? Math.min(F / 2, P) / F
                          : 0),
                        (L = N = D[0] + (E[0] - D[0]) * I),
                        (R = G = D[1] - (D[1] - E[1]) * I),
                        (V = L - (L - D[0]) * roundCorner),
                        (O = R - (R - D[1]) * roundCorner),
                        W.setTripleAt(L, R, V, O, N, G, H),
                        (H += 1),
                        (E = S === Y - 1 ? u.v[0] : u.v[S + 1]),
                        (I = (F = Math.sqrt(
                          Math.pow(D[0] - E[0], 2) + Math.pow(D[1] - E[1], 2)
                        ))
                          ? Math.min(F / 2, P) / F
                          : 0),
                        (L = V = D[0] + (E[0] - D[0]) * I),
                        (R = O = D[1] + (E[1] - D[1]) * I),
                        (N = L - (L - D[0]) * roundCorner),
                        (G = R - (R - D[1]) * roundCorner),
                        W.setTripleAt(L, R, V, O, N, G, H),
                        (H += 1))
                      : (W.setTripleAt(D[0], D[1], M[0], M[1], T[0], T[1], H),
                        (H += 1))
                    : (W.setTripleAt(
                        u.v[S][0],
                        u.v[S][1],
                        u.o[S][0],
                        u.o[S][1],
                        u.i[S][0],
                        u.i[S][1],
                        H
                      ),
                      (H += 1));
              return W;
            }),
            (RoundCornersModifier.prototype.processShapes = function (u) {
              var P,
                S,
                D,
                T,
                M,
                E,
                F = this.shapes.length,
                I = this.rd.v;
              if (0 !== I)
                for (S = 0; S < F; S += 1) {
                  if (
                    ((E = (M = this.shapes[S]).localShapeCollection),
                    !(!M.shape._mdf && !this._mdf && !u))
                  )
                    for (
                      E.releaseShapes(),
                        M.shape._mdf = !0,
                        P = M.shape.paths.shapes,
                        T = M.shape.paths._length,
                        D = 0;
                      D < T;
                      D += 1
                    )
                      E.addShape(this.processPath(P[D], I));
                  M.shape.paths = M.localShapeCollection;
                }
              this.dynamicProperties.length || (this._mdf = !1);
            }),
            (PolynomialBezier.prototype.point = function (u) {
              return [
                ((this.a[0] * u + this.b[0]) * u + this.c[0]) * u + this.d[0],
                ((this.a[1] * u + this.b[1]) * u + this.c[1]) * u + this.d[1],
              ];
            }),
            (PolynomialBezier.prototype.derivative = function (u) {
              return [
                (3 * u * this.a[0] + 2 * this.b[0]) * u + this.c[0],
                (3 * u * this.a[1] + 2 * this.b[1]) * u + this.c[1],
              ];
            }),
            (PolynomialBezier.prototype.tangentAngle = function (u) {
              var P = this.derivative(u);
              return Math.atan2(P[1], P[0]);
            }),
            (PolynomialBezier.prototype.normalAngle = function (u) {
              var P = this.derivative(u);
              return Math.atan2(P[0], P[1]);
            }),
            (PolynomialBezier.prototype.inflectionPoints = function () {
              var u = this.a[1] * this.b[0] - this.a[0] * this.b[1];
              if (floatZero(u)) return [];
              var P =
                  (-0.5 * (this.a[1] * this.c[0] - this.a[0] * this.c[1])) / u,
                S =
                  P * P -
                  ((1 / 3) * (this.b[1] * this.c[0] - this.b[0] * this.c[1])) /
                    u;
              if (S < 0) return [];
              var D = Math.sqrt(S);
              return floatZero(D)
                ? D > 0 && D < 1
                  ? [P]
                  : []
                : [P - D, P + D].filter(function (u) {
                    return u > 0 && u < 1;
                  });
            }),
            (PolynomialBezier.prototype.split = function (u) {
              if (u <= 0) return [singlePoint(this.points[0]), this];
              if (u >= 1)
                return [this, singlePoint(this.points[this.points.length - 1])];
              var P = lerpPoint(this.points[0], this.points[1], u),
                S = lerpPoint(this.points[1], this.points[2], u),
                D = lerpPoint(this.points[2], this.points[3], u),
                T = lerpPoint(P, S, u),
                M = lerpPoint(S, D, u),
                E = lerpPoint(T, M, u);
              return [
                new PolynomialBezier(this.points[0], P, T, E, !0),
                new PolynomialBezier(E, M, D, this.points[3], !0),
              ];
            }),
            (PolynomialBezier.prototype.bounds = function () {
              return { x: extrema(this, 0), y: extrema(this, 1) };
            }),
            (PolynomialBezier.prototype.boundingBox = function () {
              var u = this.bounds();
              return {
                left: u.x.min,
                right: u.x.max,
                top: u.y.min,
                bottom: u.y.max,
                width: u.x.max - u.x.min,
                height: u.y.max - u.y.min,
                cx: (u.x.max + u.x.min) / 2,
                cy: (u.y.max + u.y.min) / 2,
              };
            }),
            (PolynomialBezier.prototype.intersections = function (u, P, S) {
              void 0 === P && (P = 2), void 0 === S && (S = 7);
              var D = [];
              return (
                intersectsImpl(
                  intersectData(this, 0, 1),
                  intersectData(u, 0, 1),
                  0,
                  P,
                  D,
                  S
                ),
                D
              );
            }),
            (PolynomialBezier.shapeSegment = function (u, P) {
              var S = (P + 1) % u.length();
              return new PolynomialBezier(u.v[P], u.o[P], u.i[S], u.v[S], !0);
            }),
            (PolynomialBezier.shapeSegmentInverted = function (u, P) {
              var S = (P + 1) % u.length();
              return new PolynomialBezier(u.v[S], u.i[S], u.o[P], u.v[P], !0);
            }),
            extendPrototype([ShapeModifier], ZigZagModifier),
            (ZigZagModifier.prototype.initModifierProperties = function (u, P) {
              (this.getValue = this.processKeys),
                (this.amplitude = PropertyFactory.getProp(
                  u,
                  P.s,
                  0,
                  null,
                  this
                )),
                (this.frequency = PropertyFactory.getProp(
                  u,
                  P.r,
                  0,
                  null,
                  this
                )),
                (this.pointsType = PropertyFactory.getProp(
                  u,
                  P.pt,
                  0,
                  null,
                  this
                )),
                (this._isAnimated =
                  0 !== this.amplitude.effectsSequence.length ||
                  0 !== this.frequency.effectsSequence.length ||
                  0 !== this.pointsType.effectsSequence.length);
            }),
            (ZigZagModifier.prototype.processPath = function (u, P, S, D) {
              var T = u._length,
                M = shapePool.newElement();
              if (((M.c = u.c), u.c || (T -= 1), 0 === T)) return M;
              var E = -1,
                F = PolynomialBezier.shapeSegment(u, 0);
              zigZagCorner(M, u, 0, P, S, D, E);
              for (var I = 0; I < T; I += 1)
                (E = zigZagSegment(M, F, P, S, D, -E)),
                  (F =
                    I !== T - 1 || u.c
                      ? PolynomialBezier.shapeSegment(u, (I + 1) % T)
                      : null),
                  zigZagCorner(M, u, I + 1, P, S, D, E);
              return M;
            }),
            (ZigZagModifier.prototype.processShapes = function (u) {
              var P,
                S,
                D,
                T,
                M,
                E,
                F = this.shapes.length,
                I = this.amplitude.v,
                L = Math.max(0, Math.round(this.frequency.v)),
                R = this.pointsType.v;
              if (0 !== I)
                for (S = 0; S < F; S += 1) {
                  if (
                    ((E = (M = this.shapes[S]).localShapeCollection),
                    !(!M.shape._mdf && !this._mdf && !u))
                  )
                    for (
                      E.releaseShapes(),
                        M.shape._mdf = !0,
                        P = M.shape.paths.shapes,
                        T = M.shape.paths._length,
                        D = 0;
                      D < T;
                      D += 1
                    )
                      E.addShape(this.processPath(P[D], I, L, R));
                  M.shape.paths = M.localShapeCollection;
                }
              this.dynamicProperties.length || (this._mdf = !1);
            }),
            extendPrototype([ShapeModifier], OffsetPathModifier),
            (OffsetPathModifier.prototype.initModifierProperties = function (
              u,
              P
            ) {
              (this.getValue = this.processKeys),
                (this.amount = PropertyFactory.getProp(u, P.a, 0, null, this)),
                (this.miterLimit = PropertyFactory.getProp(
                  u,
                  P.ml,
                  0,
                  null,
                  this
                )),
                (this.lineJoin = P.lj),
                (this._isAnimated = 0 !== this.amount.effectsSequence.length);
            }),
            (OffsetPathModifier.prototype.processPath = function (u, P, S, D) {
              var T,
                M,
                E,
                F = shapePool.newElement();
              F.c = u.c;
              var I = u.length();
              u.c || (I -= 1);
              var L = [];
              for (T = 0; T < I; T += 1)
                (E = PolynomialBezier.shapeSegment(u, T)),
                  L.push(offsetSegmentSplit(E, P));
              if (!u.c)
                for (T = I - 1; T >= 0; T -= 1)
                  (E = PolynomialBezier.shapeSegmentInverted(u, T)),
                    L.push(offsetSegmentSplit(E, P));
              L = pruneIntersections(L);
              var R = null,
                V = null;
              for (T = 0; T < L.length; T += 1) {
                var O = L[T];
                for (
                  V && (R = joinLines(F, V, O[0], S, D)),
                    V = O[O.length - 1],
                    M = 0;
                  M < O.length;
                  M += 1
                )
                  (E = O[M]),
                    R && pointEqual(E.points[0], R)
                      ? F.setXYAt(
                          E.points[1][0],
                          E.points[1][1],
                          'o',
                          F.length() - 1
                        )
                      : F.setTripleAt(
                          E.points[0][0],
                          E.points[0][1],
                          E.points[1][0],
                          E.points[1][1],
                          E.points[0][0],
                          E.points[0][1],
                          F.length()
                        ),
                    F.setTripleAt(
                      E.points[3][0],
                      E.points[3][1],
                      E.points[3][0],
                      E.points[3][1],
                      E.points[2][0],
                      E.points[2][1],
                      F.length()
                    ),
                    (R = E.points[3]);
              }
              return L.length && joinLines(F, V, L[0][0], S, D), F;
            }),
            (OffsetPathModifier.prototype.processShapes = function (u) {
              var P,
                S,
                D,
                T,
                M,
                E,
                F = this.shapes.length,
                I = this.amount.v,
                L = this.miterLimit.v,
                R = this.lineJoin;
              if (0 !== I)
                for (S = 0; S < F; S += 1) {
                  if (
                    ((E = (M = this.shapes[S]).localShapeCollection),
                    !(!M.shape._mdf && !this._mdf && !u))
                  )
                    for (
                      E.releaseShapes(),
                        M.shape._mdf = !0,
                        P = M.shape.paths.shapes,
                        T = M.shape.paths._length,
                        D = 0;
                      D < T;
                      D += 1
                    )
                      E.addShape(this.processPath(P[D], I, R, L));
                  M.shape.paths = M.localShapeCollection;
                }
              this.dynamicProperties.length || (this._mdf = !1);
            });
          var FontManager = (function () {
            var u = 5e3,
              P = { w: 0, size: 0, shapes: [], data: { shapes: [] } },
              S = [];
            S = S.concat([
              2304, 2305, 2306, 2307, 2362, 2363, 2364, 2364, 2366, 2367, 2368,
              2369, 2370, 2371, 2372, 2373, 2374, 2375, 2376, 2377, 2378, 2379,
              2380, 2381, 2382, 2383, 2387, 2388, 2389, 2390, 2391, 2402, 2403,
            ]);
            var D = 127988,
              T = 917631,
              M = 917601,
              E = 917626,
              F = 65039,
              I = 8205,
              L = 127462,
              R = 127487,
              V = ['d83cdffb', 'd83cdffc', 'd83cdffd', 'd83cdffe', 'd83cdfff'];
            function O(u) {
              var P,
                S = u.split(','),
                D = S.length,
                T = [];
              for (P = 0; P < D; P += 1)
                'sans-serif' !== S[P] && 'monospace' !== S[P] && T.push(S[P]);
              return T.join(',');
            }
            function N(u, P) {
              var S = createTag('span');
              S.setAttribute('aria-hidden', !0), (S.style.fontFamily = P);
              var D = createTag('span');
              (D.innerText = 'giItT1WQy@!-/#'),
                (S.style.position = 'absolute'),
                (S.style.left = '-10000px'),
                (S.style.top = '-10000px'),
                (S.style.fontSize = '300px'),
                (S.style.fontVariant = 'normal'),
                (S.style.fontStyle = 'normal'),
                (S.style.fontWeight = 'normal'),
                (S.style.letterSpacing = '0'),
                S.appendChild(D),
                document.body.appendChild(S);
              var T = D.offsetWidth;
              return (
                (D.style.fontFamily = O(u) + ', ' + P),
                { node: D, w: T, parent: S }
              );
            }
            function G() {
              var P,
                S,
                D,
                T = this.fonts.length,
                M = T;
              for (P = 0; P < T; P += 1)
                this.fonts[P].loaded
                  ? (M -= 1)
                  : 'n' === this.fonts[P].fOrigin || 0 === this.fonts[P].origin
                  ? (this.fonts[P].loaded = !0)
                  : ((S = this.fonts[P].monoCase.node),
                    (D = this.fonts[P].monoCase.w),
                    S.offsetWidth !== D
                      ? ((M -= 1), (this.fonts[P].loaded = !0))
                      : ((S = this.fonts[P].sansCase.node),
                        (D = this.fonts[P].sansCase.w),
                        S.offsetWidth !== D &&
                          ((M -= 1), (this.fonts[P].loaded = !0))),
                    this.fonts[P].loaded &&
                      (this.fonts[P].sansCase.parent.parentNode.removeChild(
                        this.fonts[P].sansCase.parent
                      ),
                      this.fonts[P].monoCase.parent.parentNode.removeChild(
                        this.fonts[P].monoCase.parent
                      )));
              0 !== M && Date.now() - this.initTime < u
                ? setTimeout(this.checkLoadedFontsBinded, 20)
                : setTimeout(this.setIsLoadedBinded, 10);
            }
            function W(u, P) {
              var S,
                D = document.body && P ? 'svg' : 'canvas',
                T = getFontProperties(u);
              if ('svg' === D) {
                var M = createNS('text');
                (M.style.fontSize = '100px'),
                  M.setAttribute('font-family', u.fFamily),
                  M.setAttribute('font-style', T.style),
                  M.setAttribute('font-weight', T.weight),
                  (M.textContent = '1'),
                  u.fClass
                    ? ((M.style.fontFamily = 'inherit'),
                      M.setAttribute('class', u.fClass))
                    : (M.style.fontFamily = u.fFamily),
                  P.appendChild(M),
                  (S = M);
              } else {
                var E = new OffscreenCanvas(500, 500).getContext('2d');
                (E.font = T.style + ' ' + T.weight + ' 100px ' + u.fFamily),
                  (S = E);
              }
              return {
                measureText: function (u) {
                  return 'svg' === D
                    ? ((S.textContent = u), S.getComputedTextLength())
                    : S.measureText(u).width;
                },
              };
            }
            function Y(u, P) {
              if (!u) {
                this.isLoaded = !0;
                return;
              }
              if (this.chars) {
                (this.isLoaded = !0), (this.fonts = u.list);
                return;
              }
              if (!document.body) {
                (this.isLoaded = !0),
                  u.list.forEach(function (u) {
                    (u.helper = W(u)), (u.cache = {});
                  }),
                  (this.fonts = u.list);
                return;
              }
              var S = u.list,
                D = S.length,
                T = D;
              for (M = 0; M < D; M += 1) {
                var M,
                  E,
                  F,
                  I = !0;
                if (
                  ((S[M].loaded = !1),
                  (S[M].monoCase = N(S[M].fFamily, 'monospace')),
                  (S[M].sansCase = N(S[M].fFamily, 'sans-serif')),
                  S[M].fPath)
                ) {
                  if ('p' === S[M].fOrigin || 3 === S[M].origin) {
                    if (
                      ((E = document.querySelectorAll(
                        'style[f-forigin="p"][f-family="' +
                          S[M].fFamily +
                          '"], style[f-origin="3"][f-family="' +
                          S[M].fFamily +
                          '"]'
                      )).length > 0 && (I = !1),
                      I)
                    ) {
                      var L = createTag('style');
                      L.setAttribute('f-forigin', S[M].fOrigin),
                        L.setAttribute('f-origin', S[M].origin),
                        L.setAttribute('f-family', S[M].fFamily),
                        (L.type = 'text/css'),
                        (L.innerText =
                          '@font-face {font-family: ' +
                          S[M].fFamily +
                          "; font-style: normal; src: url('" +
                          S[M].fPath +
                          "');}"),
                        P.appendChild(L);
                    }
                  } else if ('g' === S[M].fOrigin || 1 === S[M].origin) {
                    for (
                      F = 0,
                        E = document.querySelectorAll(
                          'link[f-forigin="g"], link[f-origin="1"]'
                        );
                      F < E.length;
                      F += 1
                    )
                      -1 !== E[F].href.indexOf(S[M].fPath) && (I = !1);
                    if (I) {
                      var R = createTag('link');
                      R.setAttribute('f-forigin', S[M].fOrigin),
                        R.setAttribute('f-origin', S[M].origin),
                        (R.type = 'text/css'),
                        (R.rel = 'stylesheet'),
                        (R.href = S[M].fPath),
                        document.body.appendChild(R);
                    }
                  } else if ('t' === S[M].fOrigin || 2 === S[M].origin) {
                    for (
                      F = 0,
                        E = document.querySelectorAll(
                          'script[f-forigin="t"], script[f-origin="2"]'
                        );
                      F < E.length;
                      F += 1
                    )
                      S[M].fPath === E[F].src && (I = !1);
                    if (I) {
                      var V = createTag('link');
                      V.setAttribute('f-forigin', S[M].fOrigin),
                        V.setAttribute('f-origin', S[M].origin),
                        V.setAttribute('rel', 'stylesheet'),
                        V.setAttribute('href', S[M].fPath),
                        P.appendChild(V);
                    }
                  }
                } else (S[M].loaded = !0), (T -= 1);
                (S[M].helper = W(S[M], P)),
                  (S[M].cache = {}),
                  this.fonts.push(S[M]);
              }
              0 === T
                ? (this.isLoaded = !0)
                : setTimeout(this.checkLoadedFonts.bind(this), 100);
            }
            function H(u) {
              if (u) {
                this.chars || (this.chars = []);
                var P,
                  S,
                  D,
                  T = u.length,
                  M = this.chars.length;
                for (P = 0; P < T; P += 1) {
                  for (S = 0, D = !1; S < M; )
                    this.chars[S].style === u[P].style &&
                      this.chars[S].fFamily === u[P].fFamily &&
                      this.chars[S].ch === u[P].ch &&
                      (D = !0),
                      (S += 1);
                  D || (this.chars.push(u[P]), (M += 1));
                }
              }
            }
            function X(u, S, D) {
              for (var T = 0, M = this.chars.length; T < M; ) {
                if (
                  this.chars[T].ch === u &&
                  this.chars[T].style === S &&
                  this.chars[T].fFamily === D
                )
                  return this.chars[T];
                T += 1;
              }
              return (
                (('string' == typeof u && 13 !== u.charCodeAt(0)) || !u) &&
                  console &&
                  console.warn &&
                  !this._warned &&
                  ((this._warned = !0),
                  console.warn(
                    'Missing character from exported characters list: ',
                    u,
                    S,
                    D
                  )),
                P
              );
            }
            function J(u, P, S) {
              var D = this.getFontByName(P),
                T = u;
              if (!D.cache[T]) {
                var M = D.helper;
                if (' ' === u) {
                  var E = M.measureText('|' + u + '|'),
                    F = M.measureText('||');
                  D.cache[T] = (E - F) / 100;
                } else D.cache[T] = M.measureText(u) / 100;
              }
              return D.cache[T] * S;
            }
            function K(u) {
              for (var P = 0, S = this.fonts.length; P < S; ) {
                if (this.fonts[P].fName === u) return this.fonts[P];
                P += 1;
              }
              return this.fonts[0];
            }
            function Z(u) {
              var P = 0,
                S = u.charCodeAt(0);
              if (S >= 55296 && S <= 56319) {
                var D = u.charCodeAt(1);
                D >= 56320 &&
                  D <= 57343 &&
                  (P = (S - 55296) * 1024 + D - 56320 + 65536);
              }
              return P;
            }
            function U(u, P) {
              var S = u.toString(16) + P.toString(16);
              return -1 !== V.indexOf(S);
            }
            function Q(u) {
              return u === I;
            }
            function $(u) {
              return u === F;
            }
            function tt(u) {
              var P = Z(u);
              return P >= L && P <= R;
            }
            function te(u) {
              return tt(u.substr(0, 2)) && tt(u.substr(2, 2));
            }
            function ts(u) {
              return -1 !== S.indexOf(u);
            }
            function tr(u, P) {
              var S = Z(u.substr(P, 2));
              if (S !== D) return !1;
              var F = 0;
              for (P += 2; F < 5; ) {
                if ((S = Z(u.substr(P, 2))) < M || S > E) return !1;
                (F += 1), (P += 2);
              }
              return Z(u.substr(P, 2)) === T;
            }
            function ta() {
              this.isLoaded = !0;
            }
            var tn = function () {
              (this.fonts = []),
                (this.chars = null),
                (this.typekitLoaded = 0),
                (this.isLoaded = !1),
                (this._warned = !1),
                (this.initTime = Date.now()),
                (this.setIsLoadedBinded = this.setIsLoaded.bind(this)),
                (this.checkLoadedFontsBinded =
                  this.checkLoadedFonts.bind(this));
            };
            (tn.isModifier = U),
              (tn.isZeroWidthJoiner = Q),
              (tn.isFlagEmoji = te),
              (tn.isRegionalCode = tt),
              (tn.isCombinedCharacter = ts),
              (tn.isRegionalFlag = tr),
              (tn.isVariationSelector = $),
              (tn.BLACK_FLAG_CODE_POINT = D);
            var th = {
              addChars: H,
              addFonts: Y,
              getCharData: X,
              getFontByName: K,
              measureText: J,
              checkLoadedFonts: G,
              setIsLoaded: ta,
            };
            return (tn.prototype = th), tn;
          })();
          function SlotManager(u) {
            this.animationData = u;
          }
          function slotFactory(u) {
            return new SlotManager(u);
          }
          function RenderableElement() {}
          (SlotManager.prototype.getProp = function (u) {
            return this.animationData.slots && this.animationData.slots[u.sid]
              ? Object.assign(u, this.animationData.slots[u.sid].p)
              : u;
          }),
            (RenderableElement.prototype = {
              initRenderable: function () {
                (this.isInRange = !1),
                  (this.hidden = !1),
                  (this.isTransparent = !1),
                  (this.renderableComponents = []);
              },
              addRenderableComponent: function (u) {
                -1 === this.renderableComponents.indexOf(u) &&
                  this.renderableComponents.push(u);
              },
              removeRenderableComponent: function (u) {
                -1 !== this.renderableComponents.indexOf(u) &&
                  this.renderableComponents.splice(
                    this.renderableComponents.indexOf(u),
                    1
                  );
              },
              prepareRenderableFrame: function (u) {
                this.checkLayerLimits(u);
              },
              checkTransparency: function () {
                this.finalTransform.mProp.o.v <= 0
                  ? !this.isTransparent &&
                    this.globalData.renderConfig.hideOnTransparent &&
                    ((this.isTransparent = !0), this.hide())
                  : this.isTransparent &&
                    ((this.isTransparent = !1), this.show());
              },
              checkLayerLimits: function (u) {
                this.data.ip - this.data.st <= u &&
                this.data.op - this.data.st > u
                  ? !0 !== this.isInRange &&
                    ((this.globalData._mdf = !0),
                    (this._mdf = !0),
                    (this.isInRange = !0),
                    this.show())
                  : !1 !== this.isInRange &&
                    ((this.globalData._mdf = !0),
                    (this.isInRange = !1),
                    this.hide());
              },
              renderRenderable: function () {
                var u,
                  P = this.renderableComponents.length;
                for (u = 0; u < P; u += 1)
                  this.renderableComponents[u].renderFrame(this._isFirstFrame);
              },
              sourceRectAtTime: function () {
                return { top: 0, left: 0, width: 100, height: 100 };
              },
              getLayerSize: function () {
                return 5 === this.data.ty
                  ? {
                      w: this.data.textData.width,
                      h: this.data.textData.height,
                    }
                  : { w: this.data.width, h: this.data.height };
              },
            });
          var getBlendMode = (function () {
            var u = {
              0: 'source-over',
              1: 'multiply',
              2: 'screen',
              3: 'overlay',
              4: 'darken',
              5: 'lighten',
              6: 'color-dodge',
              7: 'color-burn',
              8: 'hard-light',
              9: 'soft-light',
              10: 'difference',
              11: 'exclusion',
              12: 'hue',
              13: 'saturation',
              14: 'color',
              15: 'luminosity',
            };
            return function (P) {
              return u[P] || '';
            };
          })();
          function SliderEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 0, 0, S);
          }
          function AngleEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 0, 0, S);
          }
          function ColorEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 1, 0, S);
          }
          function PointEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 1, 0, S);
          }
          function LayerIndexEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 0, 0, S);
          }
          function MaskIndexEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 0, 0, S);
          }
          function CheckboxEffect(u, P, S) {
            this.p = PropertyFactory.getProp(P, u.v, 0, 0, S);
          }
          function NoValueEffect() {
            this.p = {};
          }
          function EffectsManager(u, P) {
            var S,
              D,
              T = u.ef || [];
            this.effectElements = [];
            var M = T.length;
            for (S = 0; S < M; S += 1)
              (D = new GroupEffect(T[S], P)), this.effectElements.push(D);
          }
          function GroupEffect(u, P) {
            this.init(u, P);
          }
          function BaseElement() {}
          function FrameElement() {}
          function FootageElement(u, P, S) {
            this.initFrame(),
              this.initRenderable(),
              (this.assetData = P.getAssetData(u.refId)),
              (this.footageData = P.imageLoader.getAsset(this.assetData)),
              this.initBaseData(u, P, S);
          }
          function AudioElement(u, P, S) {
            this.initFrame(),
              this.initRenderable(),
              (this.assetData = P.getAssetData(u.refId)),
              this.initBaseData(u, P, S),
              (this._isPlaying = !1),
              (this._canPlay = !1);
            var D = this.globalData.getAssetsPath(this.assetData);
            (this.audio = this.globalData.audioController.createAudio(D)),
              (this._currentTime = 0),
              this.globalData.audioController.addAudio(this),
              (this._volumeMultiplier = 1),
              (this._volume = 1),
              (this._previousVolume = null),
              (this.tm = u.tm
                ? PropertyFactory.getProp(this, u.tm, 0, P.frameRate, this)
                : { _placeholder: !0 }),
              (this.lv = PropertyFactory.getProp(
                this,
                u.au && u.au.lv ? u.au.lv : { k: [100] },
                1,
                0.01,
                this
              ));
          }
          function BaseRenderer() {}
          extendPrototype([DynamicPropertyContainer], GroupEffect),
            (GroupEffect.prototype.getValue =
              GroupEffect.prototype.iterateDynamicProperties),
            (GroupEffect.prototype.init = function (u, P) {
              (this.data = u),
                (this.effectElements = []),
                this.initDynamicPropertyContainer(P);
              var S,
                D,
                T = this.data.ef.length,
                M = this.data.ef;
              for (S = 0; S < T; S += 1) {
                switch (((D = null), M[S].ty)) {
                  case 0:
                    D = new SliderEffect(M[S], P, this);
                    break;
                  case 1:
                    D = new AngleEffect(M[S], P, this);
                    break;
                  case 2:
                    D = new ColorEffect(M[S], P, this);
                    break;
                  case 3:
                    D = new PointEffect(M[S], P, this);
                    break;
                  case 4:
                  case 7:
                    D = new CheckboxEffect(M[S], P, this);
                    break;
                  case 10:
                    D = new LayerIndexEffect(M[S], P, this);
                    break;
                  case 11:
                    D = new MaskIndexEffect(M[S], P, this);
                    break;
                  case 5:
                    D = new EffectsManager(M[S], P, this);
                    break;
                  default:
                    D = new NoValueEffect(M[S], P, this);
                }
                D && this.effectElements.push(D);
              }
            }),
            (BaseElement.prototype = {
              checkMasks: function () {
                if (!this.data.hasMask) return !1;
                for (var u = 0, P = this.data.masksProperties.length; u < P; ) {
                  if (
                    'n' !== this.data.masksProperties[u].mode &&
                    !1 !== this.data.masksProperties[u].cl
                  )
                    return !0;
                  u += 1;
                }
                return !1;
              },
              initExpressions: function () {
                var u = getExpressionInterfaces();
                if (u) {
                  var P = u('layer'),
                    S = u('effects'),
                    D = u('shape'),
                    T = u('text'),
                    M = u('comp');
                  (this.layerInterface = P(this)),
                    this.data.hasMask &&
                      this.maskManager &&
                      this.layerInterface.registerMaskInterface(
                        this.maskManager
                      );
                  var E = S.createEffectsInterface(this, this.layerInterface);
                  this.layerInterface.registerEffectsInterface(E),
                    0 === this.data.ty || this.data.xt
                      ? (this.compInterface = M(this))
                      : 4 === this.data.ty
                      ? ((this.layerInterface.shapeInterface = D(
                          this.shapesData,
                          this.itemsData,
                          this.layerInterface
                        )),
                        (this.layerInterface.content =
                          this.layerInterface.shapeInterface))
                      : 5 === this.data.ty &&
                        ((this.layerInterface.textInterface = T(this)),
                        (this.layerInterface.text =
                          this.layerInterface.textInterface));
                }
              },
              setBlendMode: function () {
                var u = getBlendMode(this.data.bm);
                (this.baseElement || this.layerElement).style[
                  'mix-blend-mode'
                ] = u;
              },
              initBaseData: function (u, P, S) {
                (this.globalData = P),
                  (this.comp = S),
                  (this.data = u),
                  (this.layerId = createElementID()),
                  this.data.sr || (this.data.sr = 1),
                  (this.effectsManager = new EffectsManager(
                    this.data,
                    this,
                    this.dynamicProperties
                  ));
              },
              getType: function () {
                return this.type;
              },
              sourceRectAtTime: function () {},
            }),
            (FrameElement.prototype = {
              initFrame: function () {
                (this._isFirstFrame = !1),
                  (this.dynamicProperties = []),
                  (this._mdf = !1);
              },
              prepareProperties: function (u, P) {
                var S,
                  D = this.dynamicProperties.length;
                for (S = 0; S < D; S += 1)
                  (P ||
                    (this._isParent &&
                      'transform' === this.dynamicProperties[S].propType)) &&
                    (this.dynamicProperties[S].getValue(),
                    this.dynamicProperties[S]._mdf &&
                      ((this.globalData._mdf = !0), (this._mdf = !0)));
              },
              addDynamicProperty: function (u) {
                -1 === this.dynamicProperties.indexOf(u) &&
                  this.dynamicProperties.push(u);
              },
            }),
            (FootageElement.prototype.prepareFrame = function () {}),
            extendPrototype(
              [RenderableElement, BaseElement, FrameElement],
              FootageElement
            ),
            (FootageElement.prototype.getBaseElement = function () {
              return null;
            }),
            (FootageElement.prototype.renderFrame = function () {}),
            (FootageElement.prototype.destroy = function () {}),
            (FootageElement.prototype.initExpressions = function () {
              var u = getExpressionInterfaces();
              if (u) {
                var P = u('footage');
                this.layerInterface = P(this);
              }
            }),
            (FootageElement.prototype.getFootageData = function () {
              return this.footageData;
            }),
            (AudioElement.prototype.prepareFrame = function (u) {
              if (
                (this.prepareRenderableFrame(u, !0),
                this.prepareProperties(u, !0),
                this.tm._placeholder)
              )
                this._currentTime = u / this.data.sr;
              else {
                var P = this.tm.v;
                this._currentTime = P;
              }
              this._volume = this.lv.v[0];
              var S = this._volume * this._volumeMultiplier;
              this._previousVolume !== S &&
                ((this._previousVolume = S), this.audio.volume(S));
            }),
            extendPrototype(
              [RenderableElement, BaseElement, FrameElement],
              AudioElement
            ),
            (AudioElement.prototype.renderFrame = function () {
              this.isInRange &&
                this._canPlay &&
                (this._isPlaying
                  ? (!this.audio.playing() ||
                      Math.abs(
                        this._currentTime / this.globalData.frameRate -
                          this.audio.seek()
                      ) > 0.1) &&
                    this.audio.seek(
                      this._currentTime / this.globalData.frameRate
                    )
                  : (this.audio.play(),
                    this.audio.seek(
                      this._currentTime / this.globalData.frameRate
                    ),
                    (this._isPlaying = !0)));
            }),
            (AudioElement.prototype.show = function () {}),
            (AudioElement.prototype.hide = function () {
              this.audio.pause(), (this._isPlaying = !1);
            }),
            (AudioElement.prototype.pause = function () {
              this.audio.pause(), (this._isPlaying = !1), (this._canPlay = !1);
            }),
            (AudioElement.prototype.resume = function () {
              this._canPlay = !0;
            }),
            (AudioElement.prototype.setRate = function (u) {
              this.audio.rate(u);
            }),
            (AudioElement.prototype.volume = function (u) {
              (this._volumeMultiplier = u),
                (this._previousVolume = u * this._volume),
                this.audio.volume(this._previousVolume);
            }),
            (AudioElement.prototype.getBaseElement = function () {
              return null;
            }),
            (AudioElement.prototype.destroy = function () {}),
            (AudioElement.prototype.sourceRectAtTime = function () {}),
            (AudioElement.prototype.initExpressions = function () {}),
            (BaseRenderer.prototype.checkLayers = function (u) {
              var P,
                S,
                D = this.layers.length;
              for (this.completeLayers = !0, P = D - 1; P >= 0; P -= 1)
                !this.elements[P] &&
                  (S = this.layers[P]).ip - S.st <= u - this.layers[P].st &&
                  S.op - S.st > u - this.layers[P].st &&
                  this.buildItem(P),
                  (this.completeLayers =
                    !!this.elements[P] && this.completeLayers);
              this.checkPendingElements();
            }),
            (BaseRenderer.prototype.createItem = function (u) {
              switch (u.ty) {
                case 2:
                  return this.createImage(u);
                case 0:
                  return this.createComp(u);
                case 1:
                  return this.createSolid(u);
                case 3:
                default:
                  return this.createNull(u);
                case 4:
                  return this.createShape(u);
                case 5:
                  return this.createText(u);
                case 6:
                  return this.createAudio(u);
                case 13:
                  return this.createCamera(u);
                case 15:
                  return this.createFootage(u);
              }
            }),
            (BaseRenderer.prototype.createCamera = function () {
              throw Error("You're using a 3d camera. Try the html renderer.");
            }),
            (BaseRenderer.prototype.createAudio = function (u) {
              return new AudioElement(u, this.globalData, this);
            }),
            (BaseRenderer.prototype.createFootage = function (u) {
              return new FootageElement(u, this.globalData, this);
            }),
            (BaseRenderer.prototype.buildAllItems = function () {
              var u,
                P = this.layers.length;
              for (u = 0; u < P; u += 1) this.buildItem(u);
              this.checkPendingElements();
            }),
            (BaseRenderer.prototype.includeLayers = function (u) {
              this.completeLayers = !1;
              var P,
                S,
                D = u.length,
                T = this.layers.length;
              for (P = 0; P < D; P += 1)
                for (S = 0; S < T; ) {
                  if (this.layers[S].id === u[P].id) {
                    this.layers[S] = u[P];
                    break;
                  }
                  S += 1;
                }
            }),
            (BaseRenderer.prototype.setProjectInterface = function (u) {
              this.globalData.projectInterface = u;
            }),
            (BaseRenderer.prototype.initItems = function () {
              this.globalData.progressiveLoad || this.buildAllItems();
            }),
            (BaseRenderer.prototype.buildElementParenting = function (u, P, S) {
              for (
                var D = this.elements, T = this.layers, M = 0, E = T.length;
                M < E;

              )
                T[M].ind == P &&
                  (D[M] && !0 !== D[M]
                    ? (S.push(D[M]),
                      D[M].setAsParent(),
                      void 0 !== T[M].parent
                        ? this.buildElementParenting(u, T[M].parent, S)
                        : u.setHierarchy(S))
                    : (this.buildItem(M), this.addPendingElement(u))),
                  (M += 1);
            }),
            (BaseRenderer.prototype.addPendingElement = function (u) {
              this.pendingElements.push(u);
            }),
            (BaseRenderer.prototype.searchExtraCompositions = function (u) {
              var P,
                S = u.length;
              for (P = 0; P < S; P += 1)
                if (u[P].xt) {
                  var D = this.createComp(u[P]);
                  D.initExpressions(),
                    this.globalData.projectInterface.registerComposition(D);
                }
            }),
            (BaseRenderer.prototype.getElementById = function (u) {
              var P,
                S = this.elements.length;
              for (P = 0; P < S; P += 1)
                if (this.elements[P].data.ind === u) return this.elements[P];
              return null;
            }),
            (BaseRenderer.prototype.getElementByPath = function (u) {
              var P = u.shift();
              if ('number' == typeof P) S = this.elements[P];
              else {
                var S,
                  D,
                  T = this.elements.length;
                for (D = 0; D < T; D += 1)
                  if (this.elements[D].data.nm === P) {
                    S = this.elements[D];
                    break;
                  }
              }
              return 0 === u.length ? S : S.getElementByPath(u);
            }),
            (BaseRenderer.prototype.setupGlobalData = function (u, P) {
              (this.globalData.fontManager = new FontManager()),
                (this.globalData.slotManager = slotFactory(u)),
                this.globalData.fontManager.addChars(u.chars),
                this.globalData.fontManager.addFonts(u.fonts, P),
                (this.globalData.getAssetData =
                  this.animationItem.getAssetData.bind(this.animationItem)),
                (this.globalData.getAssetsPath =
                  this.animationItem.getAssetsPath.bind(this.animationItem)),
                (this.globalData.imageLoader =
                  this.animationItem.imagePreloader),
                (this.globalData.audioController =
                  this.animationItem.audioController),
                (this.globalData.frameId = 0),
                (this.globalData.frameRate = u.fr),
                (this.globalData.nm = u.nm),
                (this.globalData.compSize = { w: u.w, h: u.h });
            });
          var effectTypes = { TRANSFORM_EFFECT: 'transformEFfect' };
          function TransformElement() {}
          function MaskElement(u, P, S) {
            (this.data = u),
              (this.element = P),
              (this.globalData = S),
              (this.storedData = []),
              (this.masksProperties = this.data.masksProperties || []),
              (this.maskElement = null);
            var D = this.globalData.defs,
              T = this.masksProperties ? this.masksProperties.length : 0;
            (this.viewData = createSizedArray(T)), (this.solidPath = '');
            var M = this.masksProperties,
              E = 0,
              F = [],
              I = createElementID(),
              L = 'clipPath',
              R = 'clip-path';
            for (V = 0; V < T; V += 1)
              if (
                ((('a' !== M[V].mode && 'n' !== M[V].mode) ||
                  M[V].inv ||
                  100 !== M[V].o.k ||
                  M[V].o.x) &&
                  ((L = 'mask'), (R = 'mask')),
                ('s' === M[V].mode || 'i' === M[V].mode) && 0 === E
                  ? ((W = createNS('rect')).setAttribute('fill', '#ffffff'),
                    W.setAttribute('width', this.element.comp.data.w || 0),
                    W.setAttribute('height', this.element.comp.data.h || 0),
                    F.push(W))
                  : (W = null),
                (O = createNS('path')),
                'n' === M[V].mode)
              )
                (this.viewData[V] = {
                  op: PropertyFactory.getProp(
                    this.element,
                    M[V].o,
                    0,
                    0.01,
                    this.element
                  ),
                  prop: ShapePropertyFactory.getShapeProp(
                    this.element,
                    M[V],
                    3
                  ),
                  elem: O,
                  lastPath: '',
                }),
                  D.appendChild(O);
              else {
                if (
                  ((E += 1),
                  O.setAttribute(
                    'fill',
                    's' === M[V].mode ? '#000000' : '#ffffff'
                  ),
                  O.setAttribute('clip-rule', 'nonzero'),
                  0 !== M[V].x.k
                    ? ((L = 'mask'),
                      (R = 'mask'),
                      (X = PropertyFactory.getProp(
                        this.element,
                        M[V].x,
                        0,
                        null,
                        this.element
                      )),
                      (J = createElementID()),
                      (Y = createNS('filter')).setAttribute('id', J),
                      (H = createNS('feMorphology')).setAttribute(
                        'operator',
                        'erode'
                      ),
                      H.setAttribute('in', 'SourceGraphic'),
                      H.setAttribute('radius', '0'),
                      Y.appendChild(H),
                      D.appendChild(Y),
                      O.setAttribute(
                        'stroke',
                        's' === M[V].mode ? '#000000' : '#ffffff'
                      ))
                    : ((H = null), (X = null)),
                  (this.storedData[V] = {
                    elem: O,
                    x: X,
                    expan: H,
                    lastPath: '',
                    lastOperator: '',
                    filterId: J,
                    lastRadius: 0,
                  }),
                  'i' === M[V].mode)
                ) {
                  G = F.length;
                  var V,
                    O,
                    N,
                    G,
                    W,
                    Y,
                    H,
                    X,
                    J,
                    K = createNS('g');
                  for (N = 0; N < G; N += 1) K.appendChild(F[N]);
                  var Z = createNS('mask');
                  Z.setAttribute('mask-type', 'alpha'),
                    Z.setAttribute('id', I + '_' + E),
                    Z.appendChild(O),
                    D.appendChild(Z),
                    K.setAttribute(
                      'mask',
                      'url(' + getLocationHref() + '#' + I + '_' + E + ')'
                    ),
                    (F.length = 0),
                    F.push(K);
                } else F.push(O);
                M[V].inv &&
                  !this.solidPath &&
                  (this.solidPath = this.createLayerSolidPath()),
                  (this.viewData[V] = {
                    elem: O,
                    lastPath: '',
                    op: PropertyFactory.getProp(
                      this.element,
                      M[V].o,
                      0,
                      0.01,
                      this.element
                    ),
                    prop: ShapePropertyFactory.getShapeProp(
                      this.element,
                      M[V],
                      3
                    ),
                    invRect: W,
                  }),
                  this.viewData[V].prop.k ||
                    this.drawPath(
                      M[V],
                      this.viewData[V].prop.v,
                      this.viewData[V]
                    );
              }
            for (
              V = 0, this.maskElement = createNS(L), T = F.length;
              V < T;
              V += 1
            )
              this.maskElement.appendChild(F[V]);
            E > 0 &&
              (this.maskElement.setAttribute('id', I),
              this.element.maskedElement.setAttribute(
                R,
                'url(' + getLocationHref() + '#' + I + ')'
              ),
              D.appendChild(this.maskElement)),
              this.viewData.length && this.element.addRenderableComponent(this);
          }
          (TransformElement.prototype = {
            initTransform: function () {
              var u = new Matrix();
              (this.finalTransform = {
                mProp: this.data.ks
                  ? TransformPropertyFactory.getTransformProperty(
                      this,
                      this.data.ks,
                      this
                    )
                  : { o: 0 },
                _matMdf: !1,
                _localMatMdf: !1,
                _opMdf: !1,
                mat: u,
                localMat: u,
                localOpacity: 1,
              }),
                this.data.ao && (this.finalTransform.mProp.autoOriented = !0),
                this.data.ty;
            },
            renderTransform: function () {
              if (
                ((this.finalTransform._opMdf =
                  this.finalTransform.mProp.o._mdf || this._isFirstFrame),
                (this.finalTransform._matMdf =
                  this.finalTransform.mProp._mdf || this._isFirstFrame),
                this.hierarchy)
              ) {
                var u,
                  P = this.finalTransform.mat,
                  S = 0,
                  D = this.hierarchy.length;
                if (!this.finalTransform._matMdf)
                  for (; S < D; ) {
                    if (this.hierarchy[S].finalTransform.mProp._mdf) {
                      this.finalTransform._matMdf = !0;
                      break;
                    }
                    S += 1;
                  }
                if (this.finalTransform._matMdf)
                  for (
                    u = this.finalTransform.mProp.v.props,
                      P.cloneFromProps(u),
                      S = 0;
                    S < D;
                    S += 1
                  )
                    P.multiply(this.hierarchy[S].finalTransform.mProp.v);
              }
              this.finalTransform._matMdf &&
                (this.finalTransform._localMatMdf =
                  this.finalTransform._matMdf),
                this.finalTransform._opMdf &&
                  (this.finalTransform.localOpacity =
                    this.finalTransform.mProp.o.v);
            },
            renderLocalTransform: function () {
              if (this.localTransforms) {
                var u = 0,
                  P = this.localTransforms.length;
                if (
                  ((this.finalTransform._localMatMdf =
                    this.finalTransform._matMdf),
                  !this.finalTransform._localMatMdf ||
                    !this.finalTransform._opMdf)
                )
                  for (; u < P; )
                    this.localTransforms[u]._mdf &&
                      (this.finalTransform._localMatMdf = !0),
                      this.localTransforms[u]._opMdf &&
                        !this.finalTransform._opMdf &&
                        ((this.finalTransform.localOpacity =
                          this.finalTransform.mProp.o.v),
                        (this.finalTransform._opMdf = !0)),
                      (u += 1);
                if (this.finalTransform._localMatMdf) {
                  var S = this.finalTransform.localMat;
                  for (
                    this.localTransforms[0].matrix.clone(S), u = 1;
                    u < P;
                    u += 1
                  ) {
                    var D = this.localTransforms[u].matrix;
                    S.multiply(D);
                  }
                  S.multiply(this.finalTransform.mat);
                }
                if (this.finalTransform._opMdf) {
                  var T = this.finalTransform.localOpacity;
                  for (u = 0; u < P; u += 1)
                    T *= 0.01 * this.localTransforms[u].opacity;
                  this.finalTransform.localOpacity = T;
                }
              }
            },
            searchEffectTransforms: function () {
              if (this.renderableEffectsManager) {
                var u = this.renderableEffectsManager.getEffects(
                  effectTypes.TRANSFORM_EFFECT
                );
                if (u.length) {
                  (this.localTransforms = []),
                    (this.finalTransform.localMat = new Matrix());
                  var P = 0,
                    S = u.length;
                  for (P = 0; P < S; P += 1) this.localTransforms.push(u[P]);
                }
              }
            },
            globalToLocal: function (u) {
              var P,
                S,
                D = [];
              D.push(this.finalTransform);
              for (var T = !0, M = this.comp; T; )
                M.finalTransform
                  ? (M.data.hasMask && D.splice(0, 0, M.finalTransform),
                    (M = M.comp))
                  : (T = !1);
              var E = D.length;
              for (P = 0; P < E; P += 1)
                (S = D[P].mat.applyToPointArray(0, 0, 0)),
                  (u = [u[0] - S[0], u[1] - S[1], 0]);
              return u;
            },
            mHelper: new Matrix(),
          }),
            (MaskElement.prototype.getMaskProperty = function (u) {
              return this.viewData[u].prop;
            }),
            (MaskElement.prototype.renderFrame = function (u) {
              var P,
                S = this.element.finalTransform.mat,
                D = this.masksProperties.length;
              for (P = 0; P < D; P += 1)
                if (
                  ((this.viewData[P].prop._mdf || u) &&
                    this.drawPath(
                      this.masksProperties[P],
                      this.viewData[P].prop.v,
                      this.viewData[P]
                    ),
                  (this.viewData[P].op._mdf || u) &&
                    this.viewData[P].elem.setAttribute(
                      'fill-opacity',
                      this.viewData[P].op.v
                    ),
                  'n' !== this.masksProperties[P].mode &&
                    (this.viewData[P].invRect &&
                      (this.element.finalTransform.mProp._mdf || u) &&
                      this.viewData[P].invRect.setAttribute(
                        'transform',
                        S.getInverseMatrix().to2dCSS()
                      ),
                    this.storedData[P].x && (this.storedData[P].x._mdf || u)))
                ) {
                  var T = this.storedData[P].expan;
                  this.storedData[P].x.v < 0
                    ? ('erode' !== this.storedData[P].lastOperator &&
                        ((this.storedData[P].lastOperator = 'erode'),
                        this.storedData[P].elem.setAttribute(
                          'filter',
                          'url(' +
                            getLocationHref() +
                            '#' +
                            this.storedData[P].filterId +
                            ')'
                        )),
                      T.setAttribute('radius', -this.storedData[P].x.v))
                    : ('dilate' !== this.storedData[P].lastOperator &&
                        ((this.storedData[P].lastOperator = 'dilate'),
                        this.storedData[P].elem.setAttribute('filter', null)),
                      this.storedData[P].elem.setAttribute(
                        'stroke-width',
                        2 * this.storedData[P].x.v
                      ));
                }
            }),
            (MaskElement.prototype.getMaskelement = function () {
              return this.maskElement;
            }),
            (MaskElement.prototype.createLayerSolidPath = function () {
              return (
                'M0,0 ' +
                (' h' +
                  this.globalData.compSize.w +
                  ' v' +
                  this.globalData.compSize.h +
                  ' h-' +
                  this.globalData.compSize.w +
                  ' v-' +
                  this.globalData.compSize.h) +
                ' '
              );
            }),
            (MaskElement.prototype.drawPath = function (u, P, S) {
              var D,
                T,
                M = ' M' + P.v[0][0] + ',' + P.v[0][1];
              for (D = 1, T = P._length; D < T; D += 1)
                M +=
                  ' C' +
                  P.o[D - 1][0] +
                  ',' +
                  P.o[D - 1][1] +
                  ' ' +
                  P.i[D][0] +
                  ',' +
                  P.i[D][1] +
                  ' ' +
                  P.v[D][0] +
                  ',' +
                  P.v[D][1];
              if (
                (P.c &&
                  T > 1 &&
                  (M +=
                    ' C' +
                    P.o[D - 1][0] +
                    ',' +
                    P.o[D - 1][1] +
                    ' ' +
                    P.i[0][0] +
                    ',' +
                    P.i[0][1] +
                    ' ' +
                    P.v[0][0] +
                    ',' +
                    P.v[0][1]),
                S.lastPath !== M)
              ) {
                var E = '';
                S.elem &&
                  (P.c && (E = u.inv ? this.solidPath + M : M),
                  S.elem.setAttribute('d', E)),
                  (S.lastPath = M);
              }
            }),
            (MaskElement.prototype.destroy = function () {
              (this.element = null),
                (this.globalData = null),
                (this.maskElement = null),
                (this.data = null),
                (this.masksProperties = null);
            });
          var filtersFactory = (function () {
              var u = {};
              function P(u, P) {
                var S = createNS('filter');
                return (
                  S.setAttribute('id', u),
                  !0 !== P &&
                    (S.setAttribute('filterUnits', 'objectBoundingBox'),
                    S.setAttribute('x', '0%'),
                    S.setAttribute('y', '0%'),
                    S.setAttribute('width', '100%'),
                    S.setAttribute('height', '100%')),
                  S
                );
              }
              function S() {
                var u = createNS('feColorMatrix');
                return (
                  u.setAttribute('type', 'matrix'),
                  u.setAttribute('color-interpolation-filters', 'sRGB'),
                  u.setAttribute(
                    'values',
                    '0 0 0 1 0  0 0 0 1 0  0 0 0 1 0  0 0 0 1 1'
                  ),
                  u
                );
              }
              return (
                (u.createFilter = P), (u.createAlphaToLuminanceFilter = S), u
              );
            })(),
            featureSupport = (function () {
              var u = {
                maskType: !0,
                svgLumaHidden: !0,
                offscreenCanvas: 'undefined' != typeof OffscreenCanvas,
              };
              return (
                (/MSIE 10/i.test(navigator.userAgent) ||
                  /MSIE 9/i.test(navigator.userAgent) ||
                  /rv:11.0/i.test(navigator.userAgent) ||
                  /Edge\/\d./i.test(navigator.userAgent)) &&
                  (u.maskType = !1),
                /firefox/i.test(navigator.userAgent) && (u.svgLumaHidden = !1),
                u
              );
            })(),
            registeredEffects$1 = {},
            idPrefix = 'filter_result_';
          function SVGEffects(u) {
            var P,
              S,
              D = 'SourceGraphic',
              T = u.data.ef ? u.data.ef.length : 0,
              M = createElementID(),
              E = filtersFactory.createFilter(M, !0),
              F = 0;
            for (P = 0, this.filters = []; P < T; P += 1) {
              S = null;
              var I = u.data.ef[P].ty;
              registeredEffects$1[I] &&
                ((S = new registeredEffects$1[I].effect(
                  E,
                  u.effectsManager.effectElements[P],
                  u,
                  idPrefix + F,
                  D
                )),
                (D = idPrefix + F),
                registeredEffects$1[I].countsAsEffect && (F += 1)),
                S && this.filters.push(S);
            }
            F &&
              (u.globalData.defs.appendChild(E),
              u.layerElement.setAttribute(
                'filter',
                'url(' + getLocationHref() + '#' + M + ')'
              )),
              this.filters.length && u.addRenderableComponent(this);
          }
          function registerEffect$1(u, P, S) {
            registeredEffects$1[u] = { effect: P, countsAsEffect: S };
          }
          function SVGBaseElement() {}
          function HierarchyElement() {}
          function RenderableDOMElement() {}
          function IImageElement(u, P, S) {
            (this.assetData = P.getAssetData(u.refId)),
              this.assetData &&
                this.assetData.sid &&
                (this.assetData = P.slotManager.getProp(this.assetData)),
              this.initElement(u, P, S),
              (this.sourceRect = {
                top: 0,
                left: 0,
                width: this.assetData.w,
                height: this.assetData.h,
              });
          }
          function ProcessedElement(u, P) {
            (this.elem = u), (this.pos = P);
          }
          function IShapeElement() {}
          (SVGEffects.prototype.renderFrame = function (u) {
            var P,
              S = this.filters.length;
            for (P = 0; P < S; P += 1) this.filters[P].renderFrame(u);
          }),
            (SVGEffects.prototype.getEffects = function (u) {
              var P,
                S = this.filters.length,
                D = [];
              for (P = 0; P < S; P += 1)
                this.filters[P].type === u && D.push(this.filters[P]);
              return D;
            }),
            (SVGBaseElement.prototype = {
              initRendererElement: function () {
                this.layerElement = createNS('g');
              },
              createContainerElements: function () {
                (this.matteElement = createNS('g')),
                  (this.transformedElement = this.layerElement),
                  (this.maskedElement = this.layerElement),
                  (this._sizeChanged = !1);
                var u = null;
                if (this.data.td) {
                  this.matteMasks = {};
                  var P = createNS('g');
                  P.setAttribute('id', this.layerId),
                    P.appendChild(this.layerElement),
                    (u = P),
                    this.globalData.defs.appendChild(P);
                } else
                  this.data.tt
                    ? (this.matteElement.appendChild(this.layerElement),
                      (u = this.matteElement),
                      (this.baseElement = this.matteElement))
                    : (this.baseElement = this.layerElement);
                if (
                  (this.data.ln &&
                    this.layerElement.setAttribute('id', this.data.ln),
                  this.data.cl &&
                    this.layerElement.setAttribute('class', this.data.cl),
                  0 === this.data.ty && !this.data.hd)
                ) {
                  var S = createNS('clipPath'),
                    D = createNS('path');
                  D.setAttribute(
                    'd',
                    'M0,0 L' +
                      this.data.w +
                      ',0 L' +
                      this.data.w +
                      ',' +
                      this.data.h +
                      ' L0,' +
                      this.data.h +
                      'z'
                  );
                  var T = createElementID();
                  if (
                    (S.setAttribute('id', T),
                    S.appendChild(D),
                    this.globalData.defs.appendChild(S),
                    this.checkMasks())
                  ) {
                    var M = createNS('g');
                    M.setAttribute(
                      'clip-path',
                      'url(' + getLocationHref() + '#' + T + ')'
                    ),
                      M.appendChild(this.layerElement),
                      (this.transformedElement = M),
                      u
                        ? u.appendChild(this.transformedElement)
                        : (this.baseElement = this.transformedElement);
                  } else
                    this.layerElement.setAttribute(
                      'clip-path',
                      'url(' + getLocationHref() + '#' + T + ')'
                    );
                }
                0 !== this.data.bm && this.setBlendMode();
              },
              renderElement: function () {
                this.finalTransform._localMatMdf &&
                  this.transformedElement.setAttribute(
                    'transform',
                    this.finalTransform.localMat.to2dCSS()
                  ),
                  this.finalTransform._opMdf &&
                    this.transformedElement.setAttribute(
                      'opacity',
                      this.finalTransform.localOpacity
                    );
              },
              destroyBaseElement: function () {
                (this.layerElement = null),
                  (this.matteElement = null),
                  this.maskManager.destroy();
              },
              getBaseElement: function () {
                return this.data.hd ? null : this.baseElement;
              },
              createRenderableComponents: function () {
                (this.maskManager = new MaskElement(
                  this.data,
                  this,
                  this.globalData
                )),
                  (this.renderableEffectsManager = new SVGEffects(this)),
                  this.searchEffectTransforms();
              },
              getMatte: function (u) {
                if (
                  (this.matteMasks || (this.matteMasks = {}),
                  !this.matteMasks[u])
                ) {
                  var P,
                    S,
                    D,
                    T,
                    M = this.layerId + '_' + u;
                  if (1 === u || 3 === u) {
                    var E = createNS('mask');
                    E.setAttribute('id', M),
                      E.setAttribute(
                        'mask-type',
                        3 === u ? 'luminance' : 'alpha'
                      ),
                      (D = createNS('use')).setAttributeNS(
                        'http://www.w3.org/1999/xlink',
                        'href',
                        '#' + this.layerId
                      ),
                      E.appendChild(D),
                      this.globalData.defs.appendChild(E),
                      featureSupport.maskType ||
                        1 !== u ||
                        (E.setAttribute('mask-type', 'luminance'),
                        (P = createElementID()),
                        (S = filtersFactory.createFilter(P)),
                        this.globalData.defs.appendChild(S),
                        S.appendChild(
                          filtersFactory.createAlphaToLuminanceFilter()
                        ),
                        (T = createNS('g')).appendChild(D),
                        E.appendChild(T),
                        T.setAttribute(
                          'filter',
                          'url(' + getLocationHref() + '#' + P + ')'
                        ));
                  } else if (2 === u) {
                    var F = createNS('mask');
                    F.setAttribute('id', M),
                      F.setAttribute('mask-type', 'alpha');
                    var I = createNS('g');
                    F.appendChild(I),
                      (P = createElementID()),
                      (S = filtersFactory.createFilter(P));
                    var L = createNS('feComponentTransfer');
                    L.setAttribute('in', 'SourceGraphic'), S.appendChild(L);
                    var R = createNS('feFuncA');
                    R.setAttribute('type', 'table'),
                      R.setAttribute('tableValues', '1.0 0.0'),
                      L.appendChild(R),
                      this.globalData.defs.appendChild(S);
                    var V = createNS('rect');
                    V.setAttribute('width', this.comp.data.w),
                      V.setAttribute('height', this.comp.data.h),
                      V.setAttribute('x', '0'),
                      V.setAttribute('y', '0'),
                      V.setAttribute('fill', '#ffffff'),
                      V.setAttribute('opacity', '0'),
                      I.setAttribute(
                        'filter',
                        'url(' + getLocationHref() + '#' + P + ')'
                      ),
                      I.appendChild(V),
                      (D = createNS('use')).setAttributeNS(
                        'http://www.w3.org/1999/xlink',
                        'href',
                        '#' + this.layerId
                      ),
                      I.appendChild(D),
                      featureSupport.maskType ||
                        (F.setAttribute('mask-type', 'luminance'),
                        S.appendChild(
                          filtersFactory.createAlphaToLuminanceFilter()
                        ),
                        (T = createNS('g')),
                        I.appendChild(V),
                        T.appendChild(this.layerElement),
                        I.appendChild(T)),
                      this.globalData.defs.appendChild(F);
                  }
                  this.matteMasks[u] = M;
                }
                return this.matteMasks[u];
              },
              setMatte: function (u) {
                this.matteElement &&
                  this.matteElement.setAttribute(
                    'mask',
                    'url(' + getLocationHref() + '#' + u + ')'
                  );
              },
            }),
            (HierarchyElement.prototype = {
              initHierarchy: function () {
                (this.hierarchy = []),
                  (this._isParent = !1),
                  this.checkParenting();
              },
              setHierarchy: function (u) {
                this.hierarchy = u;
              },
              setAsParent: function () {
                this._isParent = !0;
              },
              checkParenting: function () {
                void 0 !== this.data.parent &&
                  this.comp.buildElementParenting(this, this.data.parent, []);
              },
            }),
            (function () {
              extendPrototype(
                [
                  RenderableElement,
                  createProxyFunction({
                    initElement: function (u, P, S) {
                      this.initFrame(),
                        this.initBaseData(u, P, S),
                        this.initTransform(u, P, S),
                        this.initHierarchy(),
                        this.initRenderable(),
                        this.initRendererElement(),
                        this.createContainerElements(),
                        this.createRenderableComponents(),
                        this.createContent(),
                        this.hide();
                    },
                    hide: function () {
                      this.hidden ||
                        (this.isInRange && !this.isTransparent) ||
                        (((
                          this.baseElement || this.layerElement
                        ).style.display = 'none'),
                        (this.hidden = !0));
                    },
                    show: function () {
                      this.isInRange &&
                        !this.isTransparent &&
                        (this.data.hd ||
                          ((
                            this.baseElement || this.layerElement
                          ).style.display = 'block'),
                        (this.hidden = !1),
                        (this._isFirstFrame = !0));
                    },
                    renderFrame: function () {
                      this.data.hd ||
                        this.hidden ||
                        (this.renderTransform(),
                        this.renderRenderable(),
                        this.renderLocalTransform(),
                        this.renderElement(),
                        this.renderInnerContent(),
                        this._isFirstFrame && (this._isFirstFrame = !1));
                    },
                    renderInnerContent: function () {},
                    prepareFrame: function (u) {
                      (this._mdf = !1),
                        this.prepareRenderableFrame(u),
                        this.prepareProperties(u, this.isInRange),
                        this.checkTransparency();
                    },
                    destroy: function () {
                      (this.innerElem = null), this.destroyBaseElement();
                    },
                  }),
                ],
                RenderableDOMElement
              );
            })(),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                SVGBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableDOMElement,
              ],
              IImageElement
            ),
            (IImageElement.prototype.createContent = function () {
              var u = this.globalData.getAssetsPath(this.assetData);
              (this.innerElem = createNS('image')),
                this.innerElem.setAttribute('width', this.assetData.w + 'px'),
                this.innerElem.setAttribute('height', this.assetData.h + 'px'),
                this.innerElem.setAttribute(
                  'preserveAspectRatio',
                  this.assetData.pr ||
                    this.globalData.renderConfig.imagePreserveAspectRatio
                ),
                this.innerElem.setAttributeNS(
                  'http://www.w3.org/1999/xlink',
                  'href',
                  u
                ),
                this.layerElement.appendChild(this.innerElem);
            }),
            (IImageElement.prototype.sourceRectAtTime = function () {
              return this.sourceRect;
            }),
            (IShapeElement.prototype = {
              addShapeToModifiers: function (u) {
                var P,
                  S = this.shapeModifiers.length;
                for (P = 0; P < S; P += 1) this.shapeModifiers[P].addShape(u);
              },
              isShapeInAnimatedModifiers: function (u) {
                for (var P = 0, S = this.shapeModifiers.length; P < S; )
                  if (this.shapeModifiers[P].isAnimatedWithShape(u)) return !0;
                return !1;
              },
              renderModifiers: function () {
                if (this.shapeModifiers.length) {
                  var u,
                    P = this.shapes.length;
                  for (u = 0; u < P; u += 1) this.shapes[u].sh.reset();
                  for (
                    u = (P = this.shapeModifiers.length) - 1;
                    u >= 0 &&
                    !this.shapeModifiers[u].processShapes(this._isFirstFrame);
                    u -= 1
                  );
                }
              },
              searchProcessedElement: function (u) {
                for (
                  var P = this.processedElements, S = 0, D = P.length;
                  S < D;

                ) {
                  if (P[S].elem === u) return P[S].pos;
                  S += 1;
                }
                return 0;
              },
              addProcessedElement: function (u, P) {
                for (var S = this.processedElements, D = S.length; D; )
                  if (S[(D -= 1)].elem === u) {
                    S[D].pos = P;
                    return;
                  }
                S.push(new ProcessedElement(u, P));
              },
              prepareFrame: function (u) {
                this.prepareRenderableFrame(u),
                  this.prepareProperties(u, this.isInRange);
              },
            });
          var lineCapEnum = { 1: 'butt', 2: 'round', 3: 'square' },
            lineJoinEnum = { 1: 'miter', 2: 'round', 3: 'bevel' };
          function SVGShapeData(u, P, S) {
            (this.caches = []),
              (this.styles = []),
              (this.transformers = u),
              (this.lStr = ''),
              (this.sh = S),
              (this.lvl = P),
              (this._isAnimated = !!S.k);
            for (var D = 0, T = u.length; D < T; ) {
              if (u[D].mProps.dynamicProperties.length) {
                this._isAnimated = !0;
                break;
              }
              D += 1;
            }
          }
          function SVGStyleData(u, P) {
            (this.data = u),
              (this.type = u.ty),
              (this.d = ''),
              (this.lvl = P),
              (this._mdf = !1),
              (this.closed = !0 === u.hd),
              (this.pElem = createNS('path')),
              (this.msElem = null);
          }
          function DashProperty(u, P, S, D) {
            (this.elem = u),
              (this.frameId = -1),
              (this.dataProps = createSizedArray(P.length)),
              (this.renderer = S),
              (this.k = !1),
              (this.dashStr = ''),
              (this.dashArray = createTypedArray(
                'float32',
                P.length ? P.length - 1 : 0
              )),
              (this.dashoffset = createTypedArray('float32', 1)),
              this.initDynamicPropertyContainer(D);
            var T,
              M,
              E = P.length || 0;
            for (T = 0; T < E; T += 1)
              (M = PropertyFactory.getProp(u, P[T].v, 0, 0, this)),
                (this.k = M.k || this.k),
                (this.dataProps[T] = { n: P[T].n, p: M });
            this.k || this.getValue(!0), (this._isAnimated = this.k);
          }
          function SVGStrokeStyleData(u, P, S) {
            this.initDynamicPropertyContainer(u),
              (this.getValue = this.iterateDynamicProperties),
              (this.o = PropertyFactory.getProp(u, P.o, 0, 0.01, this)),
              (this.w = PropertyFactory.getProp(u, P.w, 0, null, this)),
              (this.d = new DashProperty(u, P.d || {}, 'svg', this)),
              (this.c = PropertyFactory.getProp(u, P.c, 1, 255, this)),
              (this.style = S),
              (this._isAnimated = !!this._isAnimated);
          }
          function SVGFillStyleData(u, P, S) {
            this.initDynamicPropertyContainer(u),
              (this.getValue = this.iterateDynamicProperties),
              (this.o = PropertyFactory.getProp(u, P.o, 0, 0.01, this)),
              (this.c = PropertyFactory.getProp(u, P.c, 1, 255, this)),
              (this.style = S);
          }
          function SVGNoStyleData(u, P, S) {
            this.initDynamicPropertyContainer(u),
              (this.getValue = this.iterateDynamicProperties),
              (this.style = S);
          }
          function GradientProperty(u, P, S) {
            (this.data = P), (this.c = createTypedArray('uint8c', 4 * P.p));
            var D = P.k.k[0].s
              ? P.k.k[0].s.length - 4 * P.p
              : P.k.k.length - 4 * P.p;
            (this.o = createTypedArray('float32', D)),
              (this._cmdf = !1),
              (this._omdf = !1),
              (this._collapsable = this.checkCollapsable()),
              (this._hasOpacity = D),
              this.initDynamicPropertyContainer(S),
              (this.prop = PropertyFactory.getProp(u, P.k, 1, null, this)),
              (this.k = this.prop.k),
              this.getValue(!0);
          }
          function SVGGradientFillStyleData(u, P, S) {
            this.initDynamicPropertyContainer(u),
              (this.getValue = this.iterateDynamicProperties),
              this.initGradientData(u, P, S);
          }
          function SVGGradientStrokeStyleData(u, P, S) {
            this.initDynamicPropertyContainer(u),
              (this.getValue = this.iterateDynamicProperties),
              (this.w = PropertyFactory.getProp(u, P.w, 0, null, this)),
              (this.d = new DashProperty(u, P.d || {}, 'svg', this)),
              this.initGradientData(u, P, S),
              (this._isAnimated = !!this._isAnimated);
          }
          function ShapeGroupData() {
            (this.it = []), (this.prevViewData = []), (this.gr = createNS('g'));
          }
          function SVGTransformData(u, P, S) {
            (this.transform = { mProps: u, op: P, container: S }),
              (this.elements = []),
              (this._isAnimated =
                this.transform.mProps.dynamicProperties.length ||
                this.transform.op.effectsSequence.length);
          }
          (SVGShapeData.prototype.setAsAnimated = function () {
            this._isAnimated = !0;
          }),
            (SVGStyleData.prototype.reset = function () {
              (this.d = ''), (this._mdf = !1);
            }),
            (DashProperty.prototype.getValue = function (u) {
              if (
                (this.elem.globalData.frameId !== this.frameId || u) &&
                ((this.frameId = this.elem.globalData.frameId),
                this.iterateDynamicProperties(),
                (this._mdf = this._mdf || u),
                this._mdf)
              ) {
                var P = 0,
                  S = this.dataProps.length;
                for (
                  'svg' === this.renderer && (this.dashStr = ''), P = 0;
                  P < S;
                  P += 1
                )
                  'o' !== this.dataProps[P].n
                    ? 'svg' === this.renderer
                      ? (this.dashStr += ' ' + this.dataProps[P].p.v)
                      : (this.dashArray[P] = this.dataProps[P].p.v)
                    : (this.dashoffset[0] = this.dataProps[P].p.v);
              }
            }),
            extendPrototype([DynamicPropertyContainer], DashProperty),
            extendPrototype([DynamicPropertyContainer], SVGStrokeStyleData),
            extendPrototype([DynamicPropertyContainer], SVGFillStyleData),
            extendPrototype([DynamicPropertyContainer], SVGNoStyleData),
            (GradientProperty.prototype.comparePoints = function (u, P) {
              for (var S = 0, D = this.o.length / 2; S < D; ) {
                if (Math.abs(u[4 * S] - u[4 * P + 2 * S]) > 0.01) return !1;
                S += 1;
              }
              return !0;
            }),
            (GradientProperty.prototype.checkCollapsable = function () {
              if (this.o.length / 2 != this.c.length / 4) return !1;
              if (this.data.k.k[0].s)
                for (var u = 0, P = this.data.k.k.length; u < P; ) {
                  if (!this.comparePoints(this.data.k.k[u].s, this.data.p))
                    return !1;
                  u += 1;
                }
              else if (!this.comparePoints(this.data.k.k, this.data.p))
                return !1;
              return !0;
            }),
            (GradientProperty.prototype.getValue = function (u) {
              if (
                (this.prop.getValue(),
                (this._mdf = !1),
                (this._cmdf = !1),
                (this._omdf = !1),
                this.prop._mdf || u)
              ) {
                var P,
                  S,
                  D,
                  T = 4 * this.data.p;
                for (P = 0; P < T; P += 1)
                  (S = P % 4 == 0 ? 100 : 255),
                    (D = Math.round(this.prop.v[P] * S)),
                    this.c[P] !== D && ((this.c[P] = D), (this._cmdf = !u));
                if (this.o.length)
                  for (
                    T = this.prop.v.length, P = 4 * this.data.p;
                    P < T;
                    P += 1
                  )
                    (S = P % 2 == 0 ? 100 : 1),
                      (D =
                        P % 2 == 0
                          ? Math.round(100 * this.prop.v[P])
                          : this.prop.v[P]),
                      this.o[P - 4 * this.data.p] !== D &&
                        ((this.o[P - 4 * this.data.p] = D), (this._omdf = !u));
                this._mdf = !u;
              }
            }),
            extendPrototype([DynamicPropertyContainer], GradientProperty),
            (SVGGradientFillStyleData.prototype.initGradientData = function (
              u,
              P,
              S
            ) {
              (this.o = PropertyFactory.getProp(u, P.o, 0, 0.01, this)),
                (this.s = PropertyFactory.getProp(u, P.s, 1, null, this)),
                (this.e = PropertyFactory.getProp(u, P.e, 1, null, this)),
                (this.h = PropertyFactory.getProp(
                  u,
                  P.h || { k: 0 },
                  0,
                  0.01,
                  this
                )),
                (this.a = PropertyFactory.getProp(
                  u,
                  P.a || { k: 0 },
                  0,
                  degToRads,
                  this
                )),
                (this.g = new GradientProperty(u, P.g, this)),
                (this.style = S),
                (this.stops = []),
                this.setGradientData(S.pElem, P),
                this.setGradientOpacity(P, S),
                (this._isAnimated = !!this._isAnimated);
            }),
            (SVGGradientFillStyleData.prototype.setGradientData = function (
              u,
              P
            ) {
              var S,
                D,
                T,
                M = createElementID(),
                E = createNS(1 === P.t ? 'linearGradient' : 'radialGradient');
              E.setAttribute('id', M),
                E.setAttribute('spreadMethod', 'pad'),
                E.setAttribute('gradientUnits', 'userSpaceOnUse');
              var F = [];
              for (D = 0, T = 4 * P.g.p; D < T; D += 4)
                (S = createNS('stop')), E.appendChild(S), F.push(S);
              u.setAttribute(
                'gf' === P.ty ? 'fill' : 'stroke',
                'url(' + getLocationHref() + '#' + M + ')'
              ),
                (this.gf = E),
                (this.cst = F);
            }),
            (SVGGradientFillStyleData.prototype.setGradientOpacity = function (
              u,
              P
            ) {
              if (this.g._hasOpacity && !this.g._collapsable) {
                var S,
                  D,
                  T,
                  M = createNS('mask'),
                  E = createNS('path');
                M.appendChild(E);
                var F = createElementID(),
                  I = createElementID();
                M.setAttribute('id', I);
                var L = createNS(
                  1 === u.t ? 'linearGradient' : 'radialGradient'
                );
                L.setAttribute('id', F),
                  L.setAttribute('spreadMethod', 'pad'),
                  L.setAttribute('gradientUnits', 'userSpaceOnUse'),
                  (T = u.g.k.k[0].s ? u.g.k.k[0].s.length : u.g.k.k.length);
                var R = this.stops;
                for (D = 4 * u.g.p; D < T; D += 2)
                  (S = createNS('stop')).setAttribute(
                    'stop-color',
                    'rgb(255,255,255)'
                  ),
                    L.appendChild(S),
                    R.push(S);
                E.setAttribute(
                  'gf' === u.ty ? 'fill' : 'stroke',
                  'url(' + getLocationHref() + '#' + F + ')'
                ),
                  'gs' === u.ty &&
                    (E.setAttribute('stroke-linecap', lineCapEnum[u.lc || 2]),
                    E.setAttribute('stroke-linejoin', lineJoinEnum[u.lj || 2]),
                    1 === u.lj && E.setAttribute('stroke-miterlimit', u.ml)),
                  (this.of = L),
                  (this.ms = M),
                  (this.ost = R),
                  (this.maskId = I),
                  (P.msElem = E);
              }
            }),
            extendPrototype(
              [DynamicPropertyContainer],
              SVGGradientFillStyleData
            ),
            extendPrototype(
              [SVGGradientFillStyleData, DynamicPropertyContainer],
              SVGGradientStrokeStyleData
            );
          var buildShapeString = function (u, P, S, D) {
              if (0 === P) return '';
              var T,
                M = u.o,
                E = u.i,
                F = u.v,
                I = ' M' + D.applyToPointStringified(F[0][0], F[0][1]);
              for (T = 1; T < P; T += 1)
                I +=
                  ' C' +
                  D.applyToPointStringified(M[T - 1][0], M[T - 1][1]) +
                  ' ' +
                  D.applyToPointStringified(E[T][0], E[T][1]) +
                  ' ' +
                  D.applyToPointStringified(F[T][0], F[T][1]);
              return (
                S &&
                  P &&
                  (I +=
                    ' C' +
                    D.applyToPointStringified(M[T - 1][0], M[T - 1][1]) +
                    ' ' +
                    D.applyToPointStringified(E[0][0], E[0][1]) +
                    ' ' +
                    D.applyToPointStringified(F[0][0], F[0][1]) +
                    'z'),
                I
              );
            },
            SVGElementsRenderer = (function () {
              var u = new Matrix(),
                P = new Matrix();
              function S(u, P, S) {
                (S || P.transform.op._mdf) &&
                  P.transform.container.setAttribute(
                    'opacity',
                    P.transform.op.v
                  ),
                  (S || P.transform.mProps._mdf) &&
                    P.transform.container.setAttribute(
                      'transform',
                      P.transform.mProps.v.to2dCSS()
                    );
              }
              function D() {}
              function T(S, D, T) {
                var M,
                  E,
                  F,
                  I,
                  L,
                  R,
                  V,
                  O,
                  N,
                  G,
                  W = D.styles.length,
                  Y = D.lvl;
                for (R = 0; R < W; R += 1) {
                  if (((I = D.sh._mdf || T), D.styles[R].lvl < Y)) {
                    for (
                      O = P.reset(),
                        N = Y - D.styles[R].lvl,
                        G = D.transformers.length - 1;
                      !I && N > 0;

                    )
                      (I = D.transformers[G].mProps._mdf || I),
                        (N -= 1),
                        (G -= 1);
                    if (I)
                      for (
                        N = Y - D.styles[R].lvl, G = D.transformers.length - 1;
                        N > 0;

                      )
                        O.multiply(D.transformers[G].mProps.v),
                          (N -= 1),
                          (G -= 1);
                  } else O = u;
                  if (((E = (V = D.sh.paths)._length), I)) {
                    for (M = 0, F = ''; M < E; M += 1)
                      (L = V.shapes[M]) &&
                        L._length &&
                        (F += buildShapeString(L, L._length, L.c, O));
                    D.caches[R] = F;
                  } else F = D.caches[R];
                  (D.styles[R].d += !0 === S.hd ? '' : F),
                    (D.styles[R]._mdf = I || D.styles[R]._mdf);
                }
              }
              function M(u, P, S) {
                var D = P.style;
                (P.c._mdf || S) &&
                  D.pElem.setAttribute(
                    'fill',
                    'rgb(' +
                      bmFloor(P.c.v[0]) +
                      ',' +
                      bmFloor(P.c.v[1]) +
                      ',' +
                      bmFloor(P.c.v[2]) +
                      ')'
                  ),
                  (P.o._mdf || S) &&
                    D.pElem.setAttribute('fill-opacity', P.o.v);
              }
              function E(u, P, S) {
                F(u, P, S), I(u, P, S);
              }
              function F(u, P, S) {
                var D,
                  T,
                  M,
                  E,
                  F,
                  I = P.gf,
                  L = P.g._hasOpacity,
                  R = P.s.v,
                  V = P.e.v;
                if (P.o._mdf || S) {
                  var O = 'gf' === u.ty ? 'fill-opacity' : 'stroke-opacity';
                  P.style.pElem.setAttribute(O, P.o.v);
                }
                if (P.s._mdf || S) {
                  var N = 1 === u.t ? 'x1' : 'cx',
                    G = 'x1' === N ? 'y1' : 'cy';
                  I.setAttribute(N, R[0]),
                    I.setAttribute(G, R[1]),
                    L &&
                      !P.g._collapsable &&
                      (P.of.setAttribute(N, R[0]), P.of.setAttribute(G, R[1]));
                }
                if (P.g._cmdf || S) {
                  D = P.cst;
                  var W = P.g.c;
                  for (T = 0, M = D.length; T < M; T += 1)
                    (E = D[T]).setAttribute('offset', W[4 * T] + '%'),
                      E.setAttribute(
                        'stop-color',
                        'rgb(' +
                          W[4 * T + 1] +
                          ',' +
                          W[4 * T + 2] +
                          ',' +
                          W[4 * T + 3] +
                          ')'
                      );
                }
                if (L && (P.g._omdf || S)) {
                  var Y = P.g.o;
                  for (
                    T = 0, M = (D = P.g._collapsable ? P.cst : P.ost).length;
                    T < M;
                    T += 1
                  )
                    (E = D[T]),
                      P.g._collapsable ||
                        E.setAttribute('offset', Y[2 * T] + '%'),
                      E.setAttribute('stop-opacity', Y[2 * T + 1]);
                }
                if (1 === u.t)
                  (P.e._mdf || S) &&
                    (I.setAttribute('x2', V[0]),
                    I.setAttribute('y2', V[1]),
                    L &&
                      !P.g._collapsable &&
                      (P.of.setAttribute('x2', V[0]),
                      P.of.setAttribute('y2', V[1])));
                else if (
                  ((P.s._mdf || P.e._mdf || S) &&
                    ((F = Math.sqrt(
                      Math.pow(R[0] - V[0], 2) + Math.pow(R[1] - V[1], 2)
                    )),
                    I.setAttribute('r', F),
                    L && !P.g._collapsable && P.of.setAttribute('r', F)),
                  P.e._mdf || P.h._mdf || P.a._mdf || S)
                ) {
                  F ||
                    (F = Math.sqrt(
                      Math.pow(R[0] - V[0], 2) + Math.pow(R[1] - V[1], 2)
                    ));
                  var H = Math.atan2(V[1] - R[1], V[0] - R[0]),
                    X = P.h.v;
                  X >= 1 ? (X = 0.99) : X <= -1 && (X = -0.99);
                  var J = F * X,
                    K = Math.cos(H + P.a.v) * J + R[0],
                    Z = Math.sin(H + P.a.v) * J + R[1];
                  I.setAttribute('fx', K),
                    I.setAttribute('fy', Z),
                    L &&
                      !P.g._collapsable &&
                      (P.of.setAttribute('fx', K), P.of.setAttribute('fy', Z));
                }
              }
              function I(u, P, S) {
                var D = P.style,
                  T = P.d;
                T &&
                  (T._mdf || S) &&
                  T.dashStr &&
                  (D.pElem.setAttribute('stroke-dasharray', T.dashStr),
                  D.pElem.setAttribute('stroke-dashoffset', T.dashoffset[0])),
                  P.c &&
                    (P.c._mdf || S) &&
                    D.pElem.setAttribute(
                      'stroke',
                      'rgb(' +
                        bmFloor(P.c.v[0]) +
                        ',' +
                        bmFloor(P.c.v[1]) +
                        ',' +
                        bmFloor(P.c.v[2]) +
                        ')'
                    ),
                  (P.o._mdf || S) &&
                    D.pElem.setAttribute('stroke-opacity', P.o.v),
                  (P.w._mdf || S) &&
                    (D.pElem.setAttribute('stroke-width', P.w.v),
                    D.msElem && D.msElem.setAttribute('stroke-width', P.w.v));
              }
              return {
                createRenderFunction: function (u) {
                  switch (u.ty) {
                    case 'fl':
                      return M;
                    case 'gf':
                      return F;
                    case 'gs':
                      return E;
                    case 'st':
                      return I;
                    case 'sh':
                    case 'el':
                    case 'rc':
                    case 'sr':
                      return T;
                    case 'tr':
                      return S;
                    case 'no':
                      return D;
                    default:
                      return null;
                  }
                },
              };
            })();
          function SVGShapeElement(u, P, S) {
            (this.shapes = []),
              (this.shapesData = u.shapes),
              (this.stylesList = []),
              (this.shapeModifiers = []),
              (this.itemsData = []),
              (this.processedElements = []),
              (this.animatedContents = []),
              this.initElement(u, P, S),
              (this.prevViewData = []);
          }
          function LetterProps(u, P, S, D, T, M) {
            (this.o = u),
              (this.sw = P),
              (this.sc = S),
              (this.fc = D),
              (this.m = T),
              (this.p = M),
              (this._mdf = { o: !0, sw: !!P, sc: !!S, fc: !!D, m: !0, p: !0 });
          }
          function TextProperty(u, P) {
            (this._frameId = initialDefaultFrame),
              (this.pv = ''),
              (this.v = ''),
              (this.kf = !1),
              (this._isFirstFrame = !0),
              (this._mdf = !1),
              P.d && P.d.sid && (P.d = u.globalData.slotManager.getProp(P.d)),
              (this.data = P),
              (this.elem = u),
              (this.comp = this.elem.comp),
              (this.keysIndex = 0),
              (this.canResize = !1),
              (this.minimumFontSize = 1),
              (this.effectsSequence = []),
              (this.currentData = {
                ascent: 0,
                boxWidth: this.defaultBoxWidth,
                f: '',
                fStyle: '',
                fWeight: '',
                fc: '',
                j: '',
                justifyOffset: '',
                l: [],
                lh: 0,
                lineWidths: [],
                ls: '',
                of: '',
                s: '',
                sc: '',
                sw: 0,
                t: 0,
                tr: 0,
                sz: 0,
                ps: null,
                fillColorAnim: !1,
                strokeColorAnim: !1,
                strokeWidthAnim: !1,
                yOffset: 0,
                finalSize: 0,
                finalText: [],
                finalLineHeight: 0,
                __complete: !1,
              }),
              this.copyData(this.currentData, this.data.d.k[0].s),
              this.searchProperty() || this.completeTextData(this.currentData);
          }
          extendPrototype(
            [
              BaseElement,
              TransformElement,
              SVGBaseElement,
              IShapeElement,
              HierarchyElement,
              FrameElement,
              RenderableDOMElement,
            ],
            SVGShapeElement
          ),
            (SVGShapeElement.prototype.initSecondaryElement = function () {}),
            (SVGShapeElement.prototype.identityMatrix = new Matrix()),
            (SVGShapeElement.prototype.buildExpressionInterface =
              function () {}),
            (SVGShapeElement.prototype.createContent = function () {
              this.searchShapes(
                this.shapesData,
                this.itemsData,
                this.prevViewData,
                this.layerElement,
                0,
                [],
                !0
              ),
                this.filterUniqueShapes();
            }),
            (SVGShapeElement.prototype.filterUniqueShapes = function () {
              var u,
                P,
                S,
                D,
                T = this.shapes.length,
                M = this.stylesList.length,
                E = [],
                F = !1;
              for (S = 0; S < M; S += 1) {
                for (
                  u = 0, D = this.stylesList[S], F = !1, E.length = 0;
                  u < T;
                  u += 1
                )
                  -1 !== (P = this.shapes[u]).styles.indexOf(D) &&
                    (E.push(P), (F = P._isAnimated || F));
                E.length > 1 && F && this.setShapesAsAnimated(E);
              }
            }),
            (SVGShapeElement.prototype.setShapesAsAnimated = function (u) {
              var P,
                S = u.length;
              for (P = 0; P < S; P += 1) u[P].setAsAnimated();
            }),
            (SVGShapeElement.prototype.createStyleElement = function (u, P) {
              var S,
                D = new SVGStyleData(u, P),
                T = D.pElem;
              return (
                'st' === u.ty
                  ? (S = new SVGStrokeStyleData(this, u, D))
                  : 'fl' === u.ty
                  ? (S = new SVGFillStyleData(this, u, D))
                  : 'gf' === u.ty || 'gs' === u.ty
                  ? ((S = new (
                      'gf' === u.ty
                        ? SVGGradientFillStyleData
                        : SVGGradientStrokeStyleData
                    )(this, u, D)),
                    this.globalData.defs.appendChild(S.gf),
                    S.maskId &&
                      (this.globalData.defs.appendChild(S.ms),
                      this.globalData.defs.appendChild(S.of),
                      T.setAttribute(
                        'mask',
                        'url(' + getLocationHref() + '#' + S.maskId + ')'
                      )))
                  : 'no' === u.ty && (S = new SVGNoStyleData(this, u, D)),
                ('st' === u.ty || 'gs' === u.ty) &&
                  (T.setAttribute('stroke-linecap', lineCapEnum[u.lc || 2]),
                  T.setAttribute('stroke-linejoin', lineJoinEnum[u.lj || 2]),
                  T.setAttribute('fill-opacity', '0'),
                  1 === u.lj && T.setAttribute('stroke-miterlimit', u.ml)),
                2 === u.r && T.setAttribute('fill-rule', 'evenodd'),
                u.ln && T.setAttribute('id', u.ln),
                u.cl && T.setAttribute('class', u.cl),
                u.bm && (T.style['mix-blend-mode'] = getBlendMode(u.bm)),
                this.stylesList.push(D),
                this.addToAnimatedContents(u, S),
                S
              );
            }),
            (SVGShapeElement.prototype.createGroupElement = function (u) {
              var P = new ShapeGroupData();
              return (
                u.ln && P.gr.setAttribute('id', u.ln),
                u.cl && P.gr.setAttribute('class', u.cl),
                u.bm && (P.gr.style['mix-blend-mode'] = getBlendMode(u.bm)),
                P
              );
            }),
            (SVGShapeElement.prototype.createTransformElement = function (
              u,
              P
            ) {
              var S = TransformPropertyFactory.getTransformProperty(
                  this,
                  u,
                  this
                ),
                D = new SVGTransformData(S, S.o, P);
              return this.addToAnimatedContents(u, D), D;
            }),
            (SVGShapeElement.prototype.createShapeElement = function (u, P, S) {
              var D = 4;
              'rc' === u.ty
                ? (D = 5)
                : 'el' === u.ty
                ? (D = 6)
                : 'sr' === u.ty && (D = 7);
              var T = ShapePropertyFactory.getShapeProp(this, u, D, this),
                M = new SVGShapeData(P, S, T);
              return (
                this.shapes.push(M),
                this.addShapeToModifiers(M),
                this.addToAnimatedContents(u, M),
                M
              );
            }),
            (SVGShapeElement.prototype.addToAnimatedContents = function (u, P) {
              for (var S = 0, D = this.animatedContents.length; S < D; ) {
                if (this.animatedContents[S].element === P) return;
                S += 1;
              }
              this.animatedContents.push({
                fn: SVGElementsRenderer.createRenderFunction(u),
                element: P,
                data: u,
              });
            }),
            (SVGShapeElement.prototype.setElementStyles = function (u) {
              var P,
                S = u.styles,
                D = this.stylesList.length;
              for (P = 0; P < D; P += 1)
                this.stylesList[P].closed || S.push(this.stylesList[P]);
            }),
            (SVGShapeElement.prototype.reloadShapes = function () {
              this._isFirstFrame = !0;
              var u,
                P = this.itemsData.length;
              for (u = 0; u < P; u += 1)
                this.prevViewData[u] = this.itemsData[u];
              for (
                this.searchShapes(
                  this.shapesData,
                  this.itemsData,
                  this.prevViewData,
                  this.layerElement,
                  0,
                  [],
                  !0
                ),
                  this.filterUniqueShapes(),
                  P = this.dynamicProperties.length,
                  u = 0;
                u < P;
                u += 1
              )
                this.dynamicProperties[u].getValue();
              this.renderModifiers();
            }),
            (SVGShapeElement.prototype.searchShapes = function (
              u,
              P,
              S,
              D,
              T,
              M,
              E
            ) {
              var F,
                I,
                L,
                R,
                V,
                O,
                N = [].concat(M),
                G = u.length - 1,
                W = [],
                Y = [];
              for (F = G; F >= 0; F -= 1) {
                if (
                  ((O = this.searchProcessedElement(u[F]))
                    ? (P[F] = S[O - 1])
                    : (u[F]._render = E),
                  'fl' === u[F].ty ||
                    'st' === u[F].ty ||
                    'gf' === u[F].ty ||
                    'gs' === u[F].ty ||
                    'no' === u[F].ty)
                )
                  O
                    ? (P[F].style.closed = !1)
                    : (P[F] = this.createStyleElement(u[F], T)),
                    u[F]._render &&
                      P[F].style.pElem.parentNode !== D &&
                      D.appendChild(P[F].style.pElem),
                    W.push(P[F].style);
                else if ('gr' === u[F].ty) {
                  if (O)
                    for (I = 0, L = P[F].it.length; I < L; I += 1)
                      P[F].prevViewData[I] = P[F].it[I];
                  else P[F] = this.createGroupElement(u[F]);
                  this.searchShapes(
                    u[F].it,
                    P[F].it,
                    P[F].prevViewData,
                    P[F].gr,
                    T + 1,
                    N,
                    E
                  ),
                    u[F]._render &&
                      P[F].gr.parentNode !== D &&
                      D.appendChild(P[F].gr);
                } else
                  'tr' === u[F].ty
                    ? (O || (P[F] = this.createTransformElement(u[F], D)),
                      (R = P[F].transform),
                      N.push(R))
                    : 'sh' === u[F].ty ||
                      'rc' === u[F].ty ||
                      'el' === u[F].ty ||
                      'sr' === u[F].ty
                    ? (O || (P[F] = this.createShapeElement(u[F], N, T)),
                      this.setElementStyles(P[F]))
                    : 'tm' === u[F].ty ||
                      'rd' === u[F].ty ||
                      'ms' === u[F].ty ||
                      'pb' === u[F].ty ||
                      'zz' === u[F].ty ||
                      'op' === u[F].ty
                    ? (O
                        ? ((V = P[F]).closed = !1)
                        : ((V = ShapeModifiers.getModifier(u[F].ty)).init(
                            this,
                            u[F]
                          ),
                          (P[F] = V),
                          this.shapeModifiers.push(V)),
                      Y.push(V))
                    : 'rp' === u[F].ty &&
                      (O
                        ? ((V = P[F]).closed = !0)
                        : ((V = ShapeModifiers.getModifier(u[F].ty)),
                          (P[F] = V),
                          V.init(this, u, F, P),
                          this.shapeModifiers.push(V),
                          (E = !1)),
                      Y.push(V));
                this.addProcessedElement(u[F], F + 1);
              }
              for (F = 0, G = W.length; F < G; F += 1) W[F].closed = !0;
              for (F = 0, G = Y.length; F < G; F += 1) Y[F].closed = !0;
            }),
            (SVGShapeElement.prototype.renderInnerContent = function () {
              this.renderModifiers();
              var u,
                P = this.stylesList.length;
              for (u = 0; u < P; u += 1) this.stylesList[u].reset();
              for (this.renderShape(), u = 0; u < P; u += 1)
                (this.stylesList[u]._mdf || this._isFirstFrame) &&
                  (this.stylesList[u].msElem &&
                    (this.stylesList[u].msElem.setAttribute(
                      'd',
                      this.stylesList[u].d
                    ),
                    (this.stylesList[u].d = 'M0 0' + this.stylesList[u].d)),
                  this.stylesList[u].pElem.setAttribute(
                    'd',
                    this.stylesList[u].d || 'M0 0'
                  ));
            }),
            (SVGShapeElement.prototype.renderShape = function () {
              var u,
                P,
                S = this.animatedContents.length;
              for (u = 0; u < S; u += 1)
                (P = this.animatedContents[u]),
                  (this._isFirstFrame || P.element._isAnimated) &&
                    !0 !== P.data &&
                    P.fn(P.data, P.element, this._isFirstFrame);
            }),
            (SVGShapeElement.prototype.destroy = function () {
              this.destroyBaseElement(),
                (this.shapesData = null),
                (this.itemsData = null);
            }),
            (LetterProps.prototype.update = function (u, P, S, D, T, M) {
              (this._mdf.o = !1),
                (this._mdf.sw = !1),
                (this._mdf.sc = !1),
                (this._mdf.fc = !1),
                (this._mdf.m = !1),
                (this._mdf.p = !1);
              var E = !1;
              return (
                this.o !== u && ((this.o = u), (this._mdf.o = !0), (E = !0)),
                this.sw !== P && ((this.sw = P), (this._mdf.sw = !0), (E = !0)),
                this.sc !== S && ((this.sc = S), (this._mdf.sc = !0), (E = !0)),
                this.fc !== D && ((this.fc = D), (this._mdf.fc = !0), (E = !0)),
                this.m !== T && ((this.m = T), (this._mdf.m = !0), (E = !0)),
                M.length &&
                  (this.p[0] !== M[0] ||
                    this.p[1] !== M[1] ||
                    this.p[4] !== M[4] ||
                    this.p[5] !== M[5] ||
                    this.p[12] !== M[12] ||
                    this.p[13] !== M[13]) &&
                  ((this.p = M), (this._mdf.p = !0), (E = !0)),
                E
              );
            }),
            (TextProperty.prototype.defaultBoxWidth = [0, 0]),
            (TextProperty.prototype.copyData = function (u, P) {
              for (var S in P)
                Object.prototype.hasOwnProperty.call(P, S) && (u[S] = P[S]);
              return u;
            }),
            (TextProperty.prototype.setCurrentData = function (u) {
              u.__complete || this.completeTextData(u),
                (this.currentData = u),
                (this.currentData.boxWidth =
                  this.currentData.boxWidth || this.defaultBoxWidth),
                (this._mdf = !0);
            }),
            (TextProperty.prototype.searchProperty = function () {
              return this.searchKeyframes();
            }),
            (TextProperty.prototype.searchKeyframes = function () {
              return (
                (this.kf = this.data.d.k.length > 1),
                this.kf && this.addEffect(this.getKeyframeValue.bind(this)),
                this.kf
              );
            }),
            (TextProperty.prototype.addEffect = function (u) {
              this.effectsSequence.push(u), this.elem.addDynamicProperty(this);
            }),
            (TextProperty.prototype.getValue = function (u) {
              if (
                (this.elem.globalData.frameId !== this.frameId &&
                  this.effectsSequence.length) ||
                u
              ) {
                this.currentData.t = this.data.d.k[this.keysIndex].s.t;
                var P,
                  S = this.currentData,
                  D = this.keysIndex;
                if (this.lock) {
                  this.setCurrentData(this.currentData);
                  return;
                }
                (this.lock = !0), (this._mdf = !1);
                var T = this.effectsSequence.length,
                  M = u || this.data.d.k[this.keysIndex].s;
                for (P = 0; P < T; P += 1)
                  M =
                    D !== this.keysIndex
                      ? this.effectsSequence[P](M, M.t)
                      : this.effectsSequence[P](this.currentData, M.t);
                S !== M && this.setCurrentData(M),
                  (this.v = this.currentData),
                  (this.pv = this.v),
                  (this.lock = !1),
                  (this.frameId = this.elem.globalData.frameId);
              }
            }),
            (TextProperty.prototype.getKeyframeValue = function () {
              for (
                var u = this.data.d.k,
                  P = this.elem.comp.renderedFrame,
                  S = 0,
                  D = u.length;
                S <= D - 1 && S !== D - 1 && !(u[S + 1].t > P);

              )
                S += 1;
              return (
                this.keysIndex !== S && (this.keysIndex = S),
                this.data.d.k[this.keysIndex].s
              );
            }),
            (TextProperty.prototype.buildFinalText = function (u) {
              for (
                var P, S, D = [], T = 0, M = u.length, E = !1, F = !1, I = '';
                T < M;

              )
                (E = F),
                  (F = !1),
                  (P = u.charCodeAt(T)),
                  (I = u.charAt(T)),
                  FontManager.isCombinedCharacter(P)
                    ? (E = !0)
                    : P >= 55296 && P <= 56319
                    ? FontManager.isRegionalFlag(u, T)
                      ? (I = u.substr(T, 14))
                      : (S = u.charCodeAt(T + 1)) >= 56320 &&
                        S <= 57343 &&
                        (FontManager.isModifier(P, S)
                          ? ((I = u.substr(T, 2)), (E = !0))
                          : (I = FontManager.isFlagEmoji(u.substr(T, 4))
                              ? u.substr(T, 4)
                              : u.substr(T, 2)))
                    : P > 56319
                    ? ((S = u.charCodeAt(T + 1)),
                      FontManager.isVariationSelector(P) && (E = !0))
                    : FontManager.isZeroWidthJoiner(P) && ((E = !0), (F = !0)),
                  E ? ((D[D.length - 1] += I), (E = !1)) : D.push(I),
                  (T += I.length);
              return D;
            }),
            (TextProperty.prototype.completeTextData = function (u) {
              u.__complete = !0;
              var P = this.elem.globalData.fontManager,
                S = this.data,
                D = [],
                T = 0,
                M = S.m.g,
                E = 0,
                F = 0,
                I = 0,
                L = [],
                R = 0,
                V = 0,
                O = P.getFontByName(u.f),
                N = 0,
                G = getFontProperties(O);
              (u.fWeight = G.weight),
                (u.fStyle = G.style),
                (u.finalSize = u.s),
                (u.finalText = this.buildFinalText(u.t)),
                (H = u.finalText.length),
                (u.finalLineHeight = u.lh);
              var W = (u.tr / 1e3) * u.finalSize;
              if (u.sz)
                for (
                  var Y,
                    H,
                    X,
                    J,
                    K,
                    Z,
                    U,
                    Q,
                    $,
                    tt,
                    te = !0,
                    ts = u.sz[0],
                    tr = u.sz[1];
                  te;

                ) {
                  (tt = this.buildFinalText(u.t)),
                    ($ = 0),
                    (R = 0),
                    (H = tt.length),
                    (W = (u.tr / 1e3) * u.finalSize);
                  var ta = -1;
                  for (Y = 0; Y < H; Y += 1)
                    (Q = tt[Y].charCodeAt(0)),
                      (X = !1),
                      ' ' === tt[Y]
                        ? (ta = Y)
                        : (13 === Q || 3 === Q) &&
                          ((R = 0),
                          (X = !0),
                          ($ += u.finalLineHeight || 1.2 * u.finalSize)),
                      P.chars
                        ? ((U = P.getCharData(tt[Y], O.fStyle, O.fFamily)),
                          (N = X ? 0 : (U.w * u.finalSize) / 100))
                        : (N = P.measureText(tt[Y], u.f, u.finalSize)),
                      R + N > ts && ' ' !== tt[Y]
                        ? (-1 === ta ? (H += 1) : (Y = ta),
                          ($ += u.finalLineHeight || 1.2 * u.finalSize),
                          tt.splice(Y, ta === Y ? 1 : 0, '\r'),
                          (ta = -1),
                          (R = 0))
                        : (R += N + W);
                  ($ += (O.ascent * u.finalSize) / 100),
                    this.canResize &&
                    u.finalSize > this.minimumFontSize &&
                    tr < $
                      ? ((u.finalSize -= 1),
                        (u.finalLineHeight = (u.finalSize * u.lh) / u.s))
                      : ((u.finalText = tt),
                        (H = u.finalText.length),
                        (te = !1));
                }
              (R = -W), (N = 0);
              var tn = 0;
              for (Y = 0; Y < H; Y += 1)
                if (
                  ((X = !1),
                  13 === (Q = (tp = u.finalText[Y]).charCodeAt(0)) || 3 === Q
                    ? ((tn = 0),
                      L.push(R),
                      (V = R > V ? R : V),
                      (R = -2 * W),
                      (J = ''),
                      (X = !0),
                      (I += 1))
                    : (J = tp),
                  P.chars
                    ? ((U = P.getCharData(
                        tp,
                        O.fStyle,
                        P.getFontByName(u.f).fFamily
                      )),
                      (N = X ? 0 : (U.w * u.finalSize) / 100))
                    : (N = P.measureText(J, u.f, u.finalSize)),
                  ' ' === tp ? (tn += N + W) : ((R += N + W + tn), (tn = 0)),
                  D.push({
                    l: N,
                    an: N,
                    add: E,
                    n: X,
                    anIndexes: [],
                    val: J,
                    line: I,
                    animatorJustifyOffset: 0,
                  }),
                  2 == M)
                ) {
                  if (((E += N), '' === J || ' ' === J || Y === H - 1)) {
                    for (('' === J || ' ' === J) && (E -= N); F <= Y; )
                      (D[F].an = E), (D[F].ind = T), (D[F].extra = N), (F += 1);
                    (T += 1), (E = 0);
                  }
                } else if (3 == M) {
                  if (((E += N), '' === J || Y === H - 1)) {
                    for ('' === J && (E -= N); F <= Y; )
                      (D[F].an = E), (D[F].ind = T), (D[F].extra = N), (F += 1);
                    (E = 0), (T += 1);
                  }
                } else (D[T].ind = T), (D[T].extra = 0), (T += 1);
              if (((u.l = D), (V = R > V ? R : V), L.push(R), u.sz))
                (u.boxWidth = u.sz[0]), (u.justifyOffset = 0);
              else
                switch (((u.boxWidth = V), u.j)) {
                  case 1:
                    u.justifyOffset = -u.boxWidth;
                    break;
                  case 2:
                    u.justifyOffset = -u.boxWidth / 2;
                    break;
                  default:
                    u.justifyOffset = 0;
                }
              u.lineWidths = L;
              var th = S.a;
              Z = th.length;
              var tl = [];
              for (K = 0; K < Z; K += 1) {
                for (
                  (tf = th[K]).a.sc && (u.strokeColorAnim = !0),
                    tf.a.sw && (u.strokeWidthAnim = !0),
                    (tf.a.fc || tf.a.fh || tf.a.fs || tf.a.fb) &&
                      (u.fillColorAnim = !0),
                    tu = 0,
                    tm = tf.s.b,
                    Y = 0;
                  Y < H;
                  Y += 1
                )
                  ((tc = D[Y]).anIndexes[K] = tu),
                    ((1 == tm && '' !== tc.val) ||
                      (2 == tm && '' !== tc.val && ' ' !== tc.val) ||
                      (3 == tm && (tc.n || ' ' == tc.val || Y == H - 1)) ||
                      (4 == tm && (tc.n || Y == H - 1))) &&
                      (1 === tf.s.rn && tl.push(tu), (tu += 1));
                S.a[K].s.totalChars = tu;
                var tp,
                  tf,
                  tc,
                  tm,
                  tu,
                  td,
                  tg = -1;
                if (1 === tf.s.rn)
                  for (Y = 0; Y < H; Y += 1)
                    tg != (tc = D[Y]).anIndexes[K] &&
                      ((tg = tc.anIndexes[K]),
                      (td = tl.splice(
                        Math.floor(Math.random() * tl.length),
                        1
                      )[0])),
                      (tc.anIndexes[K] = td);
              }
              (u.yOffset = u.finalLineHeight || 1.2 * u.finalSize),
                (u.ls = u.ls || 0),
                (u.ascent = (O.ascent * u.finalSize) / 100);
            }),
            (TextProperty.prototype.updateDocumentData = function (u, P) {
              P = void 0 === P ? this.keysIndex : P;
              var S = this.copyData({}, this.data.d.k[P].s);
              (S = this.copyData(S, u)),
                (this.data.d.k[P].s = S),
                this.recalculate(P),
                this.setCurrentData(S),
                this.elem.addDynamicProperty(this);
            }),
            (TextProperty.prototype.recalculate = function (u) {
              var P = this.data.d.k[u].s;
              (P.__complete = !1),
                (this.keysIndex = 0),
                (this._isFirstFrame = !0),
                this.getValue(P);
            }),
            (TextProperty.prototype.canResizeFont = function (u) {
              (this.canResize = u),
                this.recalculate(this.keysIndex),
                this.elem.addDynamicProperty(this);
            }),
            (TextProperty.prototype.setMinimumFontSize = function (u) {
              (this.minimumFontSize = Math.floor(u) || 1),
                this.recalculate(this.keysIndex),
                this.elem.addDynamicProperty(this);
            });
          var TextSelectorProp = (function () {
            var u = Math.max,
              P = Math.min,
              S = Math.floor;
            function D(u, P) {
              (this._currentTextLength = -1),
                (this.k = !1),
                (this.data = P),
                (this.elem = u),
                (this.comp = u.comp),
                (this.finalS = 0),
                (this.finalE = 0),
                this.initDynamicPropertyContainer(u),
                (this.s = PropertyFactory.getProp(
                  u,
                  P.s || { k: 0 },
                  0,
                  0,
                  this
                )),
                'e' in P
                  ? (this.e = PropertyFactory.getProp(u, P.e, 0, 0, this))
                  : (this.e = { v: 100 }),
                (this.o = PropertyFactory.getProp(
                  u,
                  P.o || { k: 0 },
                  0,
                  0,
                  this
                )),
                (this.xe = PropertyFactory.getProp(
                  u,
                  P.xe || { k: 0 },
                  0,
                  0,
                  this
                )),
                (this.ne = PropertyFactory.getProp(
                  u,
                  P.ne || { k: 0 },
                  0,
                  0,
                  this
                )),
                (this.sm = PropertyFactory.getProp(
                  u,
                  P.sm || { k: 100 },
                  0,
                  0,
                  this
                )),
                (this.a = PropertyFactory.getProp(u, P.a, 0, 0.01, this)),
                this.dynamicProperties.length || this.getValue();
            }
            return (
              (D.prototype = {
                getMult: function (D) {
                  this._currentTextLength !==
                    this.elem.textProperty.currentData.l.length &&
                    this.getValue();
                  var T = 0,
                    M = 0,
                    E = 1,
                    F = 1;
                  this.ne.v > 0
                    ? (T = this.ne.v / 100)
                    : (M = -this.ne.v / 100),
                    this.xe.v > 0
                      ? (E = 1 - this.xe.v / 100)
                      : (F = 1 + this.xe.v / 100);
                  var I = BezierFactory.getBezierEasing(T, M, E, F).get,
                    L = 0,
                    R = this.finalS,
                    V = this.finalE,
                    O = this.data.sh;
                  if (2 === O)
                    L = I(
                      (L =
                        V === R
                          ? D >= V
                            ? 1
                            : 0
                          : u(0, P(0.5 / (V - R) + (D - R) / (V - R), 1)))
                    );
                  else if (3 === O)
                    L = I(
                      (L =
                        V === R
                          ? D >= V
                            ? 0
                            : 1
                          : 1 - u(0, P(0.5 / (V - R) + (D - R) / (V - R), 1)))
                    );
                  else if (4 === O)
                    V === R
                      ? (L = 0)
                      : (L = u(0, P(0.5 / (V - R) + (D - R) / (V - R), 1))) <
                        0.5
                      ? (L *= 2)
                      : (L = 1 - 2 * (L - 0.5)),
                      (L = I(L));
                  else if (5 === O) {
                    if (V === R) L = 0;
                    else {
                      var N = V - R,
                        G = -N / 2 + (D = P(u(0, D + 0.5 - R), V - R)),
                        W = N / 2;
                      L = Math.sqrt(1 - (G * G) / (W * W));
                    }
                    L = I(L);
                  } else
                    6 === O
                      ? (L = I(
                          (L =
                            V === R
                              ? 0
                              : (1 +
                                  Math.cos(
                                    Math.PI +
                                      (2 *
                                        Math.PI *
                                        (D = P(u(0, D + 0.5 - R), V - R))) /
                                        (V - R)
                                  )) /
                                2)
                        ))
                      : (D >= S(R) &&
                          (L =
                            D - R < 0
                              ? u(0, P(P(V, 1) - (R - D), 1))
                              : u(0, P(V - D, 1))),
                        (L = I(L)));
                  if (100 !== this.sm.v) {
                    var Y = 0.01 * this.sm.v;
                    0 === Y && (Y = 1e-8);
                    var H = 0.5 - 0.5 * Y;
                    L < H ? (L = 0) : (L = (L - H) / Y) > 1 && (L = 1);
                  }
                  return L * this.a.v;
                },
                getValue: function (u) {
                  this.iterateDynamicProperties(),
                    (this._mdf = u || this._mdf),
                    (this._currentTextLength =
                      this.elem.textProperty.currentData.l.length || 0),
                    u &&
                      2 === this.data.r &&
                      (this.e.v = this._currentTextLength);
                  var P = 2 === this.data.r ? 1 : 100 / this.data.totalChars,
                    S = this.o.v / P,
                    D = this.s.v / P + S,
                    T = this.e.v / P + S;
                  if (D > T) {
                    var M = D;
                    (D = T), (T = M);
                  }
                  (this.finalS = D), (this.finalE = T);
                },
              }),
              extendPrototype([DynamicPropertyContainer], D),
              {
                getTextSelectorProp: function (u, P, S) {
                  return new D(u, P, S);
                },
              }
            );
          })();
          function TextAnimatorDataProperty(u, P, S) {
            var D = { propType: !1 },
              T = PropertyFactory.getProp,
              M = P.a;
            (this.a = {
              r: M.r ? T(u, M.r, 0, degToRads, S) : D,
              rx: M.rx ? T(u, M.rx, 0, degToRads, S) : D,
              ry: M.ry ? T(u, M.ry, 0, degToRads, S) : D,
              sk: M.sk ? T(u, M.sk, 0, degToRads, S) : D,
              sa: M.sa ? T(u, M.sa, 0, degToRads, S) : D,
              s: M.s ? T(u, M.s, 1, 0.01, S) : D,
              a: M.a ? T(u, M.a, 1, 0, S) : D,
              o: M.o ? T(u, M.o, 0, 0.01, S) : D,
              p: M.p ? T(u, M.p, 1, 0, S) : D,
              sw: M.sw ? T(u, M.sw, 0, 0, S) : D,
              sc: M.sc ? T(u, M.sc, 1, 0, S) : D,
              fc: M.fc ? T(u, M.fc, 1, 0, S) : D,
              fh: M.fh ? T(u, M.fh, 0, 0, S) : D,
              fs: M.fs ? T(u, M.fs, 0, 0.01, S) : D,
              fb: M.fb ? T(u, M.fb, 0, 0.01, S) : D,
              t: M.t ? T(u, M.t, 0, 0, S) : D,
            }),
              (this.s = TextSelectorProp.getTextSelectorProp(u, P.s, S)),
              (this.s.t = P.s.t);
          }
          function TextAnimatorProperty(u, P, S) {
            (this._isFirstFrame = !0),
              (this._hasMaskedPath = !1),
              (this._frameId = -1),
              (this._textData = u),
              (this._renderType = P),
              (this._elem = S),
              (this._animatorsData = createSizedArray(this._textData.a.length)),
              (this._pathData = {}),
              (this._moreOptions = { alignment: {} }),
              (this.renderedLetters = []),
              (this.lettersChangedFlag = !1),
              this.initDynamicPropertyContainer(S);
          }
          function ITextElement() {}
          (TextAnimatorProperty.prototype.searchProperties = function () {
            var u,
              P,
              S = this._textData.a.length,
              D = PropertyFactory.getProp;
            for (u = 0; u < S; u += 1)
              (P = this._textData.a[u]),
                (this._animatorsData[u] = new TextAnimatorDataProperty(
                  this._elem,
                  P,
                  this
                ));
            this._textData.p && 'm' in this._textData.p
              ? ((this._pathData = {
                  a: D(this._elem, this._textData.p.a, 0, 0, this),
                  f: D(this._elem, this._textData.p.f, 0, 0, this),
                  l: D(this._elem, this._textData.p.l, 0, 0, this),
                  r: D(this._elem, this._textData.p.r, 0, 0, this),
                  p: D(this._elem, this._textData.p.p, 0, 0, this),
                  m: this._elem.maskManager.getMaskProperty(this._textData.p.m),
                }),
                (this._hasMaskedPath = !0))
              : (this._hasMaskedPath = !1),
              (this._moreOptions.alignment = D(
                this._elem,
                this._textData.m.a,
                1,
                0,
                this
              ));
          }),
            (TextAnimatorProperty.prototype.getMeasures = function (u, P) {
              if (
                ((this.lettersChangedFlag = P),
                this._mdf ||
                  this._isFirstFrame ||
                  P ||
                  (this._hasMaskedPath && this._pathData.m._mdf))
              ) {
                this._isFirstFrame = !1;
                var S,
                  D,
                  T,
                  M,
                  E,
                  F,
                  I,
                  L,
                  R,
                  V,
                  O,
                  N,
                  G,
                  W,
                  Y,
                  H,
                  X,
                  J,
                  K = this._moreOptions.alignment.v,
                  Z = this._animatorsData,
                  U = this._textData,
                  Q = this.mHelper,
                  $ = this._renderType,
                  tt = this.renderedLetters.length,
                  te = u.l;
                if (this._hasMaskedPath) {
                  if (
                    ((tC = this._pathData.m),
                    !this._pathData.n || this._pathData._mdf)
                  ) {
                    var ts,
                      tr,
                      ta,
                      tn,
                      th,
                      tl,
                      tp,
                      tf,
                      tc,
                      tm,
                      tu,
                      td,
                      tg,
                      tv,
                      tb,
                      t_,
                      tk,
                      tC,
                      tP,
                      tA = tC.v;
                    for (
                      this._pathData.r.v && (tA = tA.reverse()),
                        th = { tLength: 0, segments: [] },
                        tn = tA._length - 1,
                        t_ = 0,
                        ta = 0;
                      ta < tn;
                      ta += 1
                    )
                      (tP = bez.buildBezierData(
                        tA.v[ta],
                        tA.v[ta + 1],
                        [tA.o[ta][0] - tA.v[ta][0], tA.o[ta][1] - tA.v[ta][1]],
                        [
                          tA.i[ta + 1][0] - tA.v[ta + 1][0],
                          tA.i[ta + 1][1] - tA.v[ta + 1][1],
                        ]
                      )),
                        (th.tLength += tP.segmentLength),
                        th.segments.push(tP),
                        (t_ += tP.segmentLength);
                    (ta = tn),
                      tC.v.c &&
                        ((tP = bez.buildBezierData(
                          tA.v[ta],
                          tA.v[0],
                          [
                            tA.o[ta][0] - tA.v[ta][0],
                            tA.o[ta][1] - tA.v[ta][1],
                          ],
                          [tA.i[0][0] - tA.v[0][0], tA.i[0][1] - tA.v[0][1]]
                        )),
                        (th.tLength += tP.segmentLength),
                        th.segments.push(tP),
                        (t_ += tP.segmentLength)),
                      (this._pathData.pi = th);
                  }
                  if (
                    ((th = this._pathData.pi),
                    (tl = this._pathData.f.v),
                    (tu = 0),
                    (tm = 1),
                    (tf = 0),
                    (tc = !0),
                    (tv = th.segments),
                    tl < 0 && tC.v.c)
                  )
                    for (
                      th.tLength < Math.abs(tl) &&
                        (tl = -Math.abs(tl) % th.tLength),
                        tu = tv.length - 1,
                        tm = (tg = tv[tu].points).length - 1;
                      tl < 0;

                    )
                      (tl += tg[tm].partialLength),
                        (tm -= 1) < 0 &&
                          ((tu -= 1), (tm = (tg = tv[tu].points).length - 1));
                  (td = (tg = tv[tu].points)[tm - 1]),
                    (tb = (tp = tg[tm]).partialLength);
                }
                (tn = te.length), (ts = 0), (tr = 0);
                var tw = 1.2 * u.finalSize * 0.714,
                  tS = !0;
                M = Z.length;
                var tD = -1,
                  tT = tl,
                  tM = tu,
                  tE = tm,
                  tF = -1,
                  tI = '',
                  tL = this.defaultPropsArray;
                if (2 === u.j || 1 === u.j) {
                  var tB = 0,
                    tR = 0,
                    tV = 2 === u.j ? -0.5 : -1,
                    tO = 0,
                    tN = !0;
                  for (ta = 0; ta < tn; ta += 1)
                    if (te[ta].n) {
                      for (tB && (tB += tR); tO < ta; )
                        (te[tO].animatorJustifyOffset = tB), (tO += 1);
                      (tB = 0), (tN = !0);
                    } else {
                      for (T = 0; T < M; T += 1)
                        (S = Z[T].a).t.propType &&
                          (tN && 2 === u.j && (tR += S.t.v * tV),
                          (F = (D = Z[T].s).getMult(
                            te[ta].anIndexes[T],
                            U.a[T].s.totalChars
                          )).length
                            ? (tB += S.t.v * F[0] * tV)
                            : (tB += S.t.v * F * tV));
                      tN = !1;
                    }
                  for (tB && (tB += tR); tO < ta; )
                    (te[tO].animatorJustifyOffset = tB), (tO += 1);
                }
                for (ta = 0; ta < tn; ta += 1) {
                  if ((Q.reset(), (V = 1), te[ta].n))
                    (ts = 0),
                      (tr += u.yOffset + (tS ? 1 : 0)),
                      (tl = tT),
                      (tS = !1),
                      this._hasMaskedPath &&
                        ((tu = tM),
                        (tm = tE),
                        (td = (tg = tv[tu].points)[tm - 1]),
                        (tb = (tp = tg[tm]).partialLength),
                        (tf = 0)),
                      (tI = ''),
                      (X = ''),
                      (Y = ''),
                      (J = ''),
                      (tL = this.defaultPropsArray);
                  else {
                    if (this._hasMaskedPath) {
                      if (tF !== te[ta].line) {
                        switch (u.j) {
                          case 1:
                            tl += t_ - u.lineWidths[te[ta].line];
                            break;
                          case 2:
                            tl += (t_ - u.lineWidths[te[ta].line]) / 2;
                        }
                        tF = te[ta].line;
                      }
                      tD !== te[ta].ind &&
                        (te[tD] && (tl += te[tD].extra),
                        (tl += te[ta].an / 2),
                        (tD = te[ta].ind)),
                        (tl += K[0] * te[ta].an * 0.005);
                      var tG = 0;
                      for (T = 0; T < M; T += 1)
                        (S = Z[T].a).p.propType &&
                          ((F = (D = Z[T].s).getMult(
                            te[ta].anIndexes[T],
                            U.a[T].s.totalChars
                          )).length
                            ? (tG += S.p.v[0] * F[0])
                            : (tG += S.p.v[0] * F)),
                          S.a.propType &&
                            ((F = (D = Z[T].s).getMult(
                              te[ta].anIndexes[T],
                              U.a[T].s.totalChars
                            )).length
                              ? (tG += S.a.v[0] * F[0])
                              : (tG += S.a.v[0] * F));
                      for (
                        tc = !0,
                          this._pathData.a.v &&
                            (tl =
                              0.5 * te[0].an +
                              ((t_ -
                                this._pathData.f.v -
                                0.5 * te[0].an -
                                0.5 * te[te.length - 1].an) *
                                tD) /
                                (tn - 1) +
                              this._pathData.f.v);
                        tc;

                      )
                        tf + tb >= tl + tG || !tg
                          ? ((tk = (tl + tG - tf) / tp.partialLength),
                            (L =
                              td.point[0] + (tp.point[0] - td.point[0]) * tk),
                            (R =
                              td.point[1] + (tp.point[1] - td.point[1]) * tk),
                            Q.translate(
                              -K[0] * te[ta].an * 0.005,
                              -(0.01 * (K[1] * tw))
                            ),
                            (tc = !1))
                          : tg &&
                            ((tf += tp.partialLength),
                            (tm += 1) >= tg.length &&
                              ((tm = 0),
                              tv[(tu += 1)]
                                ? (tg = tv[tu].points)
                                : tC.v.c
                                ? ((tm = 0), (tg = tv[(tu = 0)].points))
                                : ((tf -= tp.partialLength), (tg = null))),
                            tg &&
                              ((td = tp), (tb = (tp = tg[tm]).partialLength)));
                      (I = te[ta].an / 2 - te[ta].add), Q.translate(-I, 0, 0);
                    } else
                      (I = te[ta].an / 2 - te[ta].add),
                        Q.translate(-I, 0, 0),
                        Q.translate(
                          -K[0] * te[ta].an * 0.005,
                          -K[1] * tw * 0.01,
                          0
                        );
                    for (T = 0; T < M; T += 1)
                      (S = Z[T].a).t.propType &&
                        ((F = (D = Z[T].s).getMult(
                          te[ta].anIndexes[T],
                          U.a[T].s.totalChars
                        )),
                        (0 !== ts || 0 !== u.j) &&
                          (this._hasMaskedPath
                            ? F.length
                              ? (tl += S.t.v * F[0])
                              : (tl += S.t.v * F)
                            : F.length
                            ? (ts += S.t.v * F[0])
                            : (ts += S.t.v * F)));
                    for (
                      u.strokeWidthAnim && (N = u.sw || 0),
                        u.strokeColorAnim &&
                          (O = u.sc ? [u.sc[0], u.sc[1], u.sc[2]] : [0, 0, 0]),
                        u.fillColorAnim &&
                          u.fc &&
                          (G = [u.fc[0], u.fc[1], u.fc[2]]),
                        T = 0;
                      T < M;
                      T += 1
                    )
                      (S = Z[T].a).a.propType &&
                        ((F = (D = Z[T].s).getMult(
                          te[ta].anIndexes[T],
                          U.a[T].s.totalChars
                        )).length
                          ? Q.translate(
                              -S.a.v[0] * F[0],
                              -S.a.v[1] * F[1],
                              S.a.v[2] * F[2]
                            )
                          : Q.translate(
                              -S.a.v[0] * F,
                              -S.a.v[1] * F,
                              S.a.v[2] * F
                            ));
                    for (T = 0; T < M; T += 1)
                      (S = Z[T].a).s.propType &&
                        ((F = (D = Z[T].s).getMult(
                          te[ta].anIndexes[T],
                          U.a[T].s.totalChars
                        )).length
                          ? Q.scale(
                              1 + (S.s.v[0] - 1) * F[0],
                              1 + (S.s.v[1] - 1) * F[1],
                              1
                            )
                          : Q.scale(
                              1 + (S.s.v[0] - 1) * F,
                              1 + (S.s.v[1] - 1) * F,
                              1
                            ));
                    for (T = 0; T < M; T += 1) {
                      if (
                        ((S = Z[T].a),
                        (F = (D = Z[T].s).getMult(
                          te[ta].anIndexes[T],
                          U.a[T].s.totalChars
                        )),
                        S.sk.propType &&
                          (F.length
                            ? Q.skewFromAxis(-S.sk.v * F[0], S.sa.v * F[1])
                            : Q.skewFromAxis(-S.sk.v * F, S.sa.v * F)),
                        S.r.propType &&
                          (F.length
                            ? Q.rotateZ(-S.r.v * F[2])
                            : Q.rotateZ(-S.r.v * F)),
                        S.ry.propType &&
                          (F.length
                            ? Q.rotateY(S.ry.v * F[1])
                            : Q.rotateY(S.ry.v * F)),
                        S.rx.propType &&
                          (F.length
                            ? Q.rotateX(S.rx.v * F[0])
                            : Q.rotateX(S.rx.v * F)),
                        S.o.propType &&
                          (F.length
                            ? (V += (S.o.v * F[0] - V) * F[0])
                            : (V += (S.o.v * F - V) * F)),
                        u.strokeWidthAnim &&
                          S.sw.propType &&
                          (F.length ? (N += S.sw.v * F[0]) : (N += S.sw.v * F)),
                        u.strokeColorAnim && S.sc.propType)
                      )
                        for (W = 0; W < 3; W += 1)
                          F.length
                            ? (O[W] += (S.sc.v[W] - O[W]) * F[0])
                            : (O[W] += (S.sc.v[W] - O[W]) * F);
                      if (u.fillColorAnim && u.fc) {
                        if (S.fc.propType)
                          for (W = 0; W < 3; W += 1)
                            F.length
                              ? (G[W] += (S.fc.v[W] - G[W]) * F[0])
                              : (G[W] += (S.fc.v[W] - G[W]) * F);
                        S.fh.propType &&
                          (G = F.length
                            ? addHueToRGB(G, S.fh.v * F[0])
                            : addHueToRGB(G, S.fh.v * F)),
                          S.fs.propType &&
                            (G = F.length
                              ? addSaturationToRGB(G, S.fs.v * F[0])
                              : addSaturationToRGB(G, S.fs.v * F)),
                          S.fb.propType &&
                            (G = F.length
                              ? addBrightnessToRGB(G, S.fb.v * F[0])
                              : addBrightnessToRGB(G, S.fb.v * F));
                      }
                    }
                    for (T = 0; T < M; T += 1)
                      (S = Z[T].a).p.propType &&
                        ((F = (D = Z[T].s).getMult(
                          te[ta].anIndexes[T],
                          U.a[T].s.totalChars
                        )),
                        this._hasMaskedPath
                          ? F.length
                            ? Q.translate(0, S.p.v[1] * F[0], -S.p.v[2] * F[1])
                            : Q.translate(0, S.p.v[1] * F, -S.p.v[2] * F)
                          : F.length
                          ? Q.translate(
                              S.p.v[0] * F[0],
                              S.p.v[1] * F[1],
                              -S.p.v[2] * F[2]
                            )
                          : Q.translate(
                              S.p.v[0] * F,
                              S.p.v[1] * F,
                              -S.p.v[2] * F
                            ));
                    if (
                      (u.strokeWidthAnim && (Y = N < 0 ? 0 : N),
                      u.strokeColorAnim &&
                        (H =
                          'rgb(' +
                          Math.round(255 * O[0]) +
                          ',' +
                          Math.round(255 * O[1]) +
                          ',' +
                          Math.round(255 * O[2]) +
                          ')'),
                      u.fillColorAnim &&
                        u.fc &&
                        (X =
                          'rgb(' +
                          Math.round(255 * G[0]) +
                          ',' +
                          Math.round(255 * G[1]) +
                          ',' +
                          Math.round(255 * G[2]) +
                          ')'),
                      this._hasMaskedPath)
                    ) {
                      if (
                        (Q.translate(0, -u.ls),
                        Q.translate(0, K[1] * tw * 0.01 + tr, 0),
                        this._pathData.p.v)
                      ) {
                        var tj =
                          (180 *
                            Math.atan(
                              (tp.point[1] - td.point[1]) /
                                (tp.point[0] - td.point[0])
                            )) /
                          Math.PI;
                        tp.point[0] < td.point[0] && (tj += 180),
                          Q.rotate((-tj * Math.PI) / 180);
                      }
                      Q.translate(L, R, 0),
                        (tl -= K[0] * te[ta].an * 0.005),
                        te[ta + 1] &&
                          tD !== te[ta + 1].ind &&
                          (tl += te[ta].an / 2 + 0.001 * u.tr * u.finalSize);
                    } else {
                      switch (
                        (Q.translate(ts, tr, 0),
                        u.ps && Q.translate(u.ps[0], u.ps[1] + u.ascent, 0),
                        u.j)
                      ) {
                        case 1:
                          Q.translate(
                            te[ta].animatorJustifyOffset +
                              u.justifyOffset +
                              (u.boxWidth - u.lineWidths[te[ta].line]),
                            0,
                            0
                          );
                          break;
                        case 2:
                          Q.translate(
                            te[ta].animatorJustifyOffset +
                              u.justifyOffset +
                              (u.boxWidth - u.lineWidths[te[ta].line]) / 2,
                            0,
                            0
                          );
                      }
                      Q.translate(0, -u.ls),
                        Q.translate(I, 0, 0),
                        Q.translate(
                          K[0] * te[ta].an * 0.005,
                          K[1] * tw * 0.01,
                          0
                        ),
                        (ts += te[ta].l + 0.001 * u.tr * u.finalSize);
                    }
                    'html' === $
                      ? (tI = Q.toCSS())
                      : 'svg' === $
                      ? (tI = Q.to2dCSS())
                      : (tL = [
                          Q.props[0],
                          Q.props[1],
                          Q.props[2],
                          Q.props[3],
                          Q.props[4],
                          Q.props[5],
                          Q.props[6],
                          Q.props[7],
                          Q.props[8],
                          Q.props[9],
                          Q.props[10],
                          Q.props[11],
                          Q.props[12],
                          Q.props[13],
                          Q.props[14],
                          Q.props[15],
                        ]),
                      (J = V);
                  }
                  tt <= ta
                    ? ((E = new LetterProps(J, Y, H, X, tI, tL)),
                      this.renderedLetters.push(E),
                      (tt += 1),
                      (this.lettersChangedFlag = !0))
                    : ((E = this.renderedLetters[ta]),
                      (this.lettersChangedFlag =
                        E.update(J, Y, H, X, tI, tL) ||
                        this.lettersChangedFlag));
                }
              }
            }),
            (TextAnimatorProperty.prototype.getValue = function () {
              this._elem.globalData.frameId !== this._frameId &&
                ((this._frameId = this._elem.globalData.frameId),
                this.iterateDynamicProperties());
            }),
            (TextAnimatorProperty.prototype.mHelper = new Matrix()),
            (TextAnimatorProperty.prototype.defaultPropsArray = []),
            extendPrototype([DynamicPropertyContainer], TextAnimatorProperty),
            (ITextElement.prototype.initElement = function (u, P, S) {
              (this.lettersChangedFlag = !0),
                this.initFrame(),
                this.initBaseData(u, P, S),
                (this.textProperty = new TextProperty(
                  this,
                  u.t,
                  this.dynamicProperties
                )),
                (this.textAnimator = new TextAnimatorProperty(
                  u.t,
                  this.renderType,
                  this
                )),
                this.initTransform(u, P, S),
                this.initHierarchy(),
                this.initRenderable(),
                this.initRendererElement(),
                this.createContainerElements(),
                this.createRenderableComponents(),
                this.createContent(),
                this.hide(),
                this.textAnimator.searchProperties(this.dynamicProperties);
            }),
            (ITextElement.prototype.prepareFrame = function (u) {
              (this._mdf = !1),
                this.prepareRenderableFrame(u),
                this.prepareProperties(u, this.isInRange);
            }),
            (ITextElement.prototype.createPathShape = function (u, P) {
              var S,
                D,
                T = P.length,
                M = '';
              for (S = 0; S < T; S += 1)
                'sh' === P[S].ty &&
                  (M += buildShapeString((D = P[S].ks.k), D.i.length, !0, u));
              return M;
            }),
            (ITextElement.prototype.updateDocumentData = function (u, P) {
              this.textProperty.updateDocumentData(u, P);
            }),
            (ITextElement.prototype.canResizeFont = function (u) {
              this.textProperty.canResizeFont(u);
            }),
            (ITextElement.prototype.setMinimumFontSize = function (u) {
              this.textProperty.setMinimumFontSize(u);
            }),
            (ITextElement.prototype.applyTextPropertiesToMatrix = function (
              u,
              P,
              S,
              D,
              T
            ) {
              switch (
                (u.ps && P.translate(u.ps[0], u.ps[1] + u.ascent, 0),
                P.translate(0, -u.ls, 0),
                u.j)
              ) {
                case 1:
                  P.translate(
                    u.justifyOffset + (u.boxWidth - u.lineWidths[S]),
                    0,
                    0
                  );
                  break;
                case 2:
                  P.translate(
                    u.justifyOffset + (u.boxWidth - u.lineWidths[S]) / 2,
                    0,
                    0
                  );
              }
              P.translate(D, T, 0);
            }),
            (ITextElement.prototype.buildColor = function (u) {
              return (
                'rgb(' +
                Math.round(255 * u[0]) +
                ',' +
                Math.round(255 * u[1]) +
                ',' +
                Math.round(255 * u[2]) +
                ')'
              );
            }),
            (ITextElement.prototype.emptyProp = new LetterProps()),
            (ITextElement.prototype.destroy = function () {}),
            (ITextElement.prototype.validateText = function () {
              (this.textProperty._mdf || this.textProperty._isFirstFrame) &&
                (this.buildNewText(),
                (this.textProperty._isFirstFrame = !1),
                (this.textProperty._mdf = !1));
            });
          var emptyShapeData = { shapes: [] };
          function SVGTextLottieElement(u, P, S) {
            (this.textSpans = []),
              (this.renderType = 'svg'),
              this.initElement(u, P, S);
          }
          function ISolidElement(u, P, S) {
            this.initElement(u, P, S);
          }
          function NullElement(u, P, S) {
            this.initFrame(),
              this.initBaseData(u, P, S),
              this.initFrame(),
              this.initTransform(u, P, S),
              this.initHierarchy();
          }
          function SVGRendererBase() {}
          function ICompElement() {}
          function SVGCompElement(u, P, S) {
            (this.layers = u.layers),
              (this.supports3d = !0),
              (this.completeLayers = !1),
              (this.pendingElements = []),
              (this.elements = this.layers
                ? createSizedArray(this.layers.length)
                : []),
              this.initElement(u, P, S),
              (this.tm = u.tm
                ? PropertyFactory.getProp(this, u.tm, 0, P.frameRate, this)
                : { _placeholder: !0 });
          }
          function SVGRenderer(u, P) {
            (this.animationItem = u),
              (this.layers = null),
              (this.renderedFrame = -1),
              (this.svgElement = createNS('svg'));
            var S = '';
            if (P && P.title) {
              var D = createNS('title'),
                T = createElementID();
              D.setAttribute('id', T),
                (D.textContent = P.title),
                this.svgElement.appendChild(D),
                (S += T);
            }
            if (P && P.description) {
              var M = createNS('desc'),
                E = createElementID();
              M.setAttribute('id', E),
                (M.textContent = P.description),
                this.svgElement.appendChild(M),
                (S += ' ' + E);
            }
            S && this.svgElement.setAttribute('aria-labelledby', S);
            var F = createNS('defs');
            this.svgElement.appendChild(F);
            var I = createNS('g');
            this.svgElement.appendChild(I),
              (this.layerElement = I),
              (this.renderConfig = {
                preserveAspectRatio:
                  (P && P.preserveAspectRatio) || 'xMidYMid meet',
                imagePreserveAspectRatio:
                  (P && P.imagePreserveAspectRatio) || 'xMidYMid slice',
                contentVisibility: (P && P.contentVisibility) || 'visible',
                progressiveLoad: (P && P.progressiveLoad) || !1,
                hideOnTransparent: !(P && !1 === P.hideOnTransparent),
                viewBoxOnly: (P && P.viewBoxOnly) || !1,
                viewBoxSize: (P && P.viewBoxSize) || !1,
                className: (P && P.className) || '',
                id: (P && P.id) || '',
                focusable: P && P.focusable,
                filterSize: {
                  width: (P && P.filterSize && P.filterSize.width) || '100%',
                  height: (P && P.filterSize && P.filterSize.height) || '100%',
                  x: (P && P.filterSize && P.filterSize.x) || '0%',
                  y: (P && P.filterSize && P.filterSize.y) || '0%',
                },
                width: P && P.width,
                height: P && P.height,
                runExpressions:
                  !P || void 0 === P.runExpressions || P.runExpressions,
              }),
              (this.globalData = {
                _mdf: !1,
                frameNum: -1,
                defs: F,
                renderConfig: this.renderConfig,
              }),
              (this.elements = []),
              (this.pendingElements = []),
              (this.destroyed = !1),
              (this.rendererType = 'svg');
          }
          function ShapeTransformManager() {
            (this.sequences = {}),
              (this.sequenceList = []),
              (this.transform_key_count = 0);
          }
          extendPrototype(
            [
              BaseElement,
              TransformElement,
              SVGBaseElement,
              HierarchyElement,
              FrameElement,
              RenderableDOMElement,
              ITextElement,
            ],
            SVGTextLottieElement
          ),
            (SVGTextLottieElement.prototype.createContent = function () {
              this.data.singleShape &&
                !this.globalData.fontManager.chars &&
                (this.textContainer = createNS('text'));
            }),
            (SVGTextLottieElement.prototype.buildTextContents = function (u) {
              for (var P = 0, S = u.length, D = [], T = ''; P < S; )
                '\r' === u[P] || '\x03' === u[P]
                  ? (D.push(T), (T = ''))
                  : (T += u[P]),
                  (P += 1);
              return D.push(T), D;
            }),
            (SVGTextLottieElement.prototype.buildShapeData = function (u, P) {
              if (u.shapes && u.shapes.length) {
                var S = u.shapes[0];
                if (S.it) {
                  var D = S.it[S.it.length - 1];
                  D.s && ((D.s.k[0] = P), (D.s.k[1] = P));
                }
              }
              return u;
            }),
            (SVGTextLottieElement.prototype.buildNewText = function () {
              this.addDynamicProperty(this);
              var u = this.textProperty.currentData;
              (this.renderedLetters = createSizedArray(u ? u.l.length : 0)),
                u.fc
                  ? this.layerElement.setAttribute(
                      'fill',
                      this.buildColor(u.fc)
                    )
                  : this.layerElement.setAttribute('fill', 'rgba(0,0,0,0)'),
                u.sc &&
                  (this.layerElement.setAttribute(
                    'stroke',
                    this.buildColor(u.sc)
                  ),
                  this.layerElement.setAttribute('stroke-width', u.sw)),
                this.layerElement.setAttribute('font-size', u.finalSize);
              var P = this.globalData.fontManager.getFontByName(u.f);
              if (P.fClass) this.layerElement.setAttribute('class', P.fClass);
              else {
                this.layerElement.setAttribute('font-family', P.fFamily);
                var S = u.fWeight,
                  D = u.fStyle;
                this.layerElement.setAttribute('font-style', D),
                  this.layerElement.setAttribute('font-weight', S);
              }
              this.layerElement.setAttribute('aria-label', u.t);
              var T = u.l || [],
                M = !!this.globalData.fontManager.chars;
              Y = T.length;
              var E = this.mHelper,
                F = '',
                I = this.data.singleShape,
                L = 0,
                R = 0,
                V = !0,
                O = 0.001 * u.tr * u.finalSize;
              if (!I || M || u.sz) {
                var N = this.textSpans.length;
                for (W = 0; W < Y; W += 1) {
                  if (
                    (this.textSpans[W] ||
                      (this.textSpans[W] = {
                        span: null,
                        childSpan: null,
                        glyph: null,
                      }),
                    !M || !I || 0 === W)
                  ) {
                    if (
                      ((H =
                        N > W
                          ? this.textSpans[W].span
                          : createNS(M ? 'g' : 'text')),
                      N <= W)
                    ) {
                      if (
                        (H.setAttribute('stroke-linecap', 'butt'),
                        H.setAttribute('stroke-linejoin', 'round'),
                        H.setAttribute('stroke-miterlimit', '4'),
                        (this.textSpans[W].span = H),
                        M)
                      ) {
                        var G = createNS('g');
                        H.appendChild(G), (this.textSpans[W].childSpan = G);
                      }
                      (this.textSpans[W].span = H),
                        this.layerElement.appendChild(H);
                    }
                    H.style.display = 'inherit';
                  }
                  if (
                    (E.reset(),
                    I &&
                      (T[W].n &&
                        ((L = -O), (R += u.yOffset + (V ? 1 : 0)), (V = !1)),
                      this.applyTextPropertiesToMatrix(u, E, T[W].line, L, R),
                      (L += (T[W].l || 0) + O)),
                    M)
                  ) {
                    if (
                      1 ===
                      (X = this.globalData.fontManager.getCharData(
                        u.finalText[W],
                        P.fStyle,
                        this.globalData.fontManager.getFontByName(u.f).fFamily
                      )).t
                    )
                      J = new SVGCompElement(X.data, this.globalData, this);
                    else {
                      var W,
                        Y,
                        H,
                        X,
                        J,
                        K = emptyShapeData;
                      X.data &&
                        X.data.shapes &&
                        (K = this.buildShapeData(X.data, u.finalSize)),
                        (J = new SVGShapeElement(K, this.globalData, this));
                    }
                    if (this.textSpans[W].glyph) {
                      var Z = this.textSpans[W].glyph;
                      this.textSpans[W].childSpan.removeChild(Z.layerElement),
                        Z.destroy();
                    }
                    (this.textSpans[W].glyph = J),
                      (J._debug = !0),
                      J.prepareFrame(0),
                      J.renderFrame(),
                      this.textSpans[W].childSpan.appendChild(J.layerElement),
                      1 === X.t &&
                        this.textSpans[W].childSpan.setAttribute(
                          'transform',
                          'scale(' +
                            u.finalSize / 100 +
                            ',' +
                            u.finalSize / 100 +
                            ')'
                        );
                  } else
                    I &&
                      H.setAttribute(
                        'transform',
                        'translate(' + E.props[12] + ',' + E.props[13] + ')'
                      ),
                      (H.textContent = T[W].val),
                      H.setAttributeNS(
                        'http://www.w3.org/XML/1998/namespace',
                        'xml:space',
                        'preserve'
                      );
                }
                I && H && H.setAttribute('d', F);
              } else {
                var U = this.textContainer,
                  Q = 'start';
                switch (u.j) {
                  case 1:
                    Q = 'end';
                    break;
                  case 2:
                    Q = 'middle';
                    break;
                  default:
                    Q = 'start';
                }
                U.setAttribute('text-anchor', Q),
                  U.setAttribute('letter-spacing', O);
                var $ = this.buildTextContents(u.finalText);
                for (
                  W = 0, Y = $.length, R = u.ps ? u.ps[1] + u.ascent : 0;
                  W < Y;
                  W += 1
                )
                  ((H =
                    this.textSpans[W].span || createNS('tspan')).textContent =
                    $[W]),
                    H.setAttribute('x', 0),
                    H.setAttribute('y', R),
                    (H.style.display = 'inherit'),
                    U.appendChild(H),
                    this.textSpans[W] ||
                      (this.textSpans[W] = { span: null, glyph: null }),
                    (this.textSpans[W].span = H),
                    (R += u.finalLineHeight);
                this.layerElement.appendChild(U);
              }
              for (; W < this.textSpans.length; )
                (this.textSpans[W].span.style.display = 'none'), (W += 1);
              this._sizeChanged = !0;
            }),
            (SVGTextLottieElement.prototype.sourceRectAtTime = function () {
              if (
                (this.prepareFrame(this.comp.renderedFrame - this.data.st),
                this.renderInnerContent(),
                this._sizeChanged)
              ) {
                this._sizeChanged = !1;
                var u = this.layerElement.getBBox();
                this.bbox = {
                  top: u.y,
                  left: u.x,
                  width: u.width,
                  height: u.height,
                };
              }
              return this.bbox;
            }),
            (SVGTextLottieElement.prototype.getValue = function () {
              var u,
                P,
                S = this.textSpans.length;
              for (
                u = 0, this.renderedFrame = this.comp.renderedFrame;
                u < S;
                u += 1
              )
                (P = this.textSpans[u].glyph) &&
                  (P.prepareFrame(this.comp.renderedFrame - this.data.st),
                  P._mdf && (this._mdf = !0));
            }),
            (SVGTextLottieElement.prototype.renderInnerContent = function () {
              if (
                (this.validateText(),
                (!this.data.singleShape || this._mdf) &&
                  (this.textAnimator.getMeasures(
                    this.textProperty.currentData,
                    this.lettersChangedFlag
                  ),
                  this.lettersChangedFlag ||
                    this.textAnimator.lettersChangedFlag))
              ) {
                this._sizeChanged = !0;
                var u,
                  P,
                  S,
                  D,
                  T,
                  M = this.textAnimator.renderedLetters,
                  E = this.textProperty.currentData.l;
                for (u = 0, P = E.length; u < P; u += 1)
                  !E[u].n &&
                    ((S = M[u]),
                    (D = this.textSpans[u].span),
                    (T = this.textSpans[u].glyph) && T.renderFrame(),
                    S._mdf.m && D.setAttribute('transform', S.m),
                    S._mdf.o && D.setAttribute('opacity', S.o),
                    S._mdf.sw && D.setAttribute('stroke-width', S.sw),
                    S._mdf.sc && D.setAttribute('stroke', S.sc),
                    S._mdf.fc && D.setAttribute('fill', S.fc));
              }
            }),
            extendPrototype([IImageElement], ISolidElement),
            (ISolidElement.prototype.createContent = function () {
              var u = createNS('rect');
              u.setAttribute('width', this.data.sw),
                u.setAttribute('height', this.data.sh),
                u.setAttribute('fill', this.data.sc),
                this.layerElement.appendChild(u);
            }),
            (NullElement.prototype.prepareFrame = function (u) {
              this.prepareProperties(u, !0);
            }),
            (NullElement.prototype.renderFrame = function () {}),
            (NullElement.prototype.getBaseElement = function () {
              return null;
            }),
            (NullElement.prototype.destroy = function () {}),
            (NullElement.prototype.sourceRectAtTime = function () {}),
            (NullElement.prototype.hide = function () {}),
            extendPrototype(
              [BaseElement, TransformElement, HierarchyElement, FrameElement],
              NullElement
            ),
            extendPrototype([BaseRenderer], SVGRendererBase),
            (SVGRendererBase.prototype.createNull = function (u) {
              return new NullElement(u, this.globalData, this);
            }),
            (SVGRendererBase.prototype.createShape = function (u) {
              return new SVGShapeElement(u, this.globalData, this);
            }),
            (SVGRendererBase.prototype.createText = function (u) {
              return new SVGTextLottieElement(u, this.globalData, this);
            }),
            (SVGRendererBase.prototype.createImage = function (u) {
              return new IImageElement(u, this.globalData, this);
            }),
            (SVGRendererBase.prototype.createSolid = function (u) {
              return new ISolidElement(u, this.globalData, this);
            }),
            (SVGRendererBase.prototype.configAnimation = function (u) {
              this.svgElement.setAttribute(
                'xmlns',
                'http://www.w3.org/2000/svg'
              ),
                this.svgElement.setAttribute(
                  'xmlns:xlink',
                  'http://www.w3.org/1999/xlink'
                ),
                this.renderConfig.viewBoxSize
                  ? this.svgElement.setAttribute(
                      'viewBox',
                      this.renderConfig.viewBoxSize
                    )
                  : this.svgElement.setAttribute(
                      'viewBox',
                      '0 0 ' + u.w + ' ' + u.h
                    ),
                this.renderConfig.viewBoxOnly ||
                  (this.svgElement.setAttribute('width', u.w),
                  this.svgElement.setAttribute('height', u.h),
                  (this.svgElement.style.width = '100%'),
                  (this.svgElement.style.height = '100%'),
                  (this.svgElement.style.transform = 'translate3d(0,0,0)'),
                  (this.svgElement.style.contentVisibility =
                    this.renderConfig.contentVisibility)),
                this.renderConfig.width &&
                  this.svgElement.setAttribute(
                    'width',
                    this.renderConfig.width
                  ),
                this.renderConfig.height &&
                  this.svgElement.setAttribute(
                    'height',
                    this.renderConfig.height
                  ),
                this.renderConfig.className &&
                  this.svgElement.setAttribute(
                    'class',
                    this.renderConfig.className
                  ),
                this.renderConfig.id &&
                  this.svgElement.setAttribute('id', this.renderConfig.id),
                void 0 !== this.renderConfig.focusable &&
                  this.svgElement.setAttribute(
                    'focusable',
                    this.renderConfig.focusable
                  ),
                this.svgElement.setAttribute(
                  'preserveAspectRatio',
                  this.renderConfig.preserveAspectRatio
                ),
                this.animationItem.wrapper.appendChild(this.svgElement);
              var P = this.globalData.defs;
              this.setupGlobalData(u, P),
                (this.globalData.progressiveLoad =
                  this.renderConfig.progressiveLoad),
                (this.data = u);
              var S = createNS('clipPath'),
                D = createNS('rect');
              D.setAttribute('width', u.w),
                D.setAttribute('height', u.h),
                D.setAttribute('x', 0),
                D.setAttribute('y', 0);
              var T = createElementID();
              S.setAttribute('id', T),
                S.appendChild(D),
                this.layerElement.setAttribute(
                  'clip-path',
                  'url(' + getLocationHref() + '#' + T + ')'
                ),
                P.appendChild(S),
                (this.layers = u.layers),
                (this.elements = createSizedArray(u.layers.length));
            }),
            (SVGRendererBase.prototype.destroy = function () {
              this.animationItem.wrapper &&
                (this.animationItem.wrapper.innerText = ''),
                (this.layerElement = null),
                (this.globalData.defs = null);
              var u,
                P = this.layers ? this.layers.length : 0;
              for (u = 0; u < P; u += 1)
                this.elements[u] &&
                  this.elements[u].destroy &&
                  this.elements[u].destroy();
              (this.elements.length = 0),
                (this.destroyed = !0),
                (this.animationItem = null);
            }),
            (SVGRendererBase.prototype.updateContainerSize = function () {}),
            (SVGRendererBase.prototype.findIndexByInd = function (u) {
              var P = 0,
                S = this.layers.length;
              for (P = 0; P < S; P += 1) if (this.layers[P].ind === u) return P;
              return -1;
            }),
            (SVGRendererBase.prototype.buildItem = function (u) {
              var P = this.elements;
              if (!P[u] && 99 !== this.layers[u].ty) {
                P[u] = !0;
                var S = this.createItem(this.layers[u]);
                if (
                  ((P[u] = S),
                  getExpressionsPlugin() &&
                    (0 === this.layers[u].ty &&
                      this.globalData.projectInterface.registerComposition(S),
                    S.initExpressions()),
                  this.appendElementInPos(S, u),
                  this.layers[u].tt)
                ) {
                  var D =
                    'tp' in this.layers[u]
                      ? this.findIndexByInd(this.layers[u].tp)
                      : u - 1;
                  if (-1 === D) return;
                  if (this.elements[D] && !0 !== this.elements[D]) {
                    var T = P[D].getMatte(this.layers[u].tt);
                    S.setMatte(T);
                  } else this.buildItem(D), this.addPendingElement(S);
                }
              }
            }),
            (SVGRendererBase.prototype.checkPendingElements = function () {
              for (; this.pendingElements.length; ) {
                var u = this.pendingElements.pop();
                if ((u.checkParenting(), u.data.tt))
                  for (var P = 0, S = this.elements.length; P < S; ) {
                    if (this.elements[P] === u) {
                      var D =
                          'tp' in u.data
                            ? this.findIndexByInd(u.data.tp)
                            : P - 1,
                        T = this.elements[D].getMatte(this.layers[P].tt);
                      u.setMatte(T);
                      break;
                    }
                    P += 1;
                  }
              }
            }),
            (SVGRendererBase.prototype.renderFrame = function (u) {
              if (this.renderedFrame !== u && !this.destroyed) {
                null === u
                  ? (u = this.renderedFrame)
                  : (this.renderedFrame = u),
                  (this.globalData.frameNum = u),
                  (this.globalData.frameId += 1),
                  (this.globalData.projectInterface.currentFrame = u),
                  (this.globalData._mdf = !1);
                var P,
                  S = this.layers.length;
                for (
                  this.completeLayers || this.checkLayers(u), P = S - 1;
                  P >= 0;
                  P -= 1
                )
                  (this.completeLayers || this.elements[P]) &&
                    this.elements[P].prepareFrame(u - this.layers[P].st);
                if (this.globalData._mdf)
                  for (P = 0; P < S; P += 1)
                    (this.completeLayers || this.elements[P]) &&
                      this.elements[P].renderFrame();
              }
            }),
            (SVGRendererBase.prototype.appendElementInPos = function (u, P) {
              var S,
                D = u.getBaseElement();
              if (D) {
                for (var T = 0; T < P; )
                  this.elements[T] &&
                    !0 !== this.elements[T] &&
                    this.elements[T].getBaseElement() &&
                    (S = this.elements[T].getBaseElement()),
                    (T += 1);
                S
                  ? this.layerElement.insertBefore(D, S)
                  : this.layerElement.appendChild(D);
              }
            }),
            (SVGRendererBase.prototype.hide = function () {
              this.layerElement.style.display = 'none';
            }),
            (SVGRendererBase.prototype.show = function () {
              this.layerElement.style.display = 'block';
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                HierarchyElement,
                FrameElement,
                RenderableDOMElement,
              ],
              ICompElement
            ),
            (ICompElement.prototype.initElement = function (u, P, S) {
              this.initFrame(),
                this.initBaseData(u, P, S),
                this.initTransform(u, P, S),
                this.initRenderable(),
                this.initHierarchy(),
                this.initRendererElement(),
                this.createContainerElements(),
                this.createRenderableComponents(),
                (this.data.xt || !P.progressiveLoad) && this.buildAllItems(),
                this.hide();
            }),
            (ICompElement.prototype.prepareFrame = function (u) {
              if (
                ((this._mdf = !1),
                this.prepareRenderableFrame(u),
                this.prepareProperties(u, this.isInRange),
                this.isInRange || this.data.xt)
              ) {
                if (this.tm._placeholder) this.renderedFrame = u / this.data.sr;
                else {
                  var P,
                    S = this.tm.v;
                  S === this.data.op && (S = this.data.op - 1),
                    (this.renderedFrame = S);
                }
                var D = this.elements.length;
                for (
                  this.completeLayers || this.checkLayers(this.renderedFrame),
                    P = D - 1;
                  P >= 0;
                  P -= 1
                )
                  (this.completeLayers || this.elements[P]) &&
                    (this.elements[P].prepareFrame(
                      this.renderedFrame - this.layers[P].st
                    ),
                    this.elements[P]._mdf && (this._mdf = !0));
              }
            }),
            (ICompElement.prototype.renderInnerContent = function () {
              var u,
                P = this.layers.length;
              for (u = 0; u < P; u += 1)
                (this.completeLayers || this.elements[u]) &&
                  this.elements[u].renderFrame();
            }),
            (ICompElement.prototype.setElements = function (u) {
              this.elements = u;
            }),
            (ICompElement.prototype.getElements = function () {
              return this.elements;
            }),
            (ICompElement.prototype.destroyElements = function () {
              var u,
                P = this.layers.length;
              for (u = 0; u < P; u += 1)
                this.elements[u] && this.elements[u].destroy();
            }),
            (ICompElement.prototype.destroy = function () {
              this.destroyElements(), this.destroyBaseElement();
            }),
            extendPrototype(
              [SVGRendererBase, ICompElement, SVGBaseElement],
              SVGCompElement
            ),
            (SVGCompElement.prototype.createComp = function (u) {
              return new SVGCompElement(u, this.globalData, this);
            }),
            extendPrototype([SVGRendererBase], SVGRenderer),
            (SVGRenderer.prototype.createComp = function (u) {
              return new SVGCompElement(u, this.globalData, this);
            }),
            (ShapeTransformManager.prototype = {
              addTransformSequence: function (u) {
                var P,
                  S = u.length,
                  D = '_';
                for (P = 0; P < S; P += 1) D += u[P].transform.key + '_';
                var T = this.sequences[D];
                return (
                  T ||
                    ((T = {
                      transforms: [].concat(u),
                      finalTransform: new Matrix(),
                      _mdf: !1,
                    }),
                    (this.sequences[D] = T),
                    this.sequenceList.push(T)),
                  T
                );
              },
              processSequence: function (u, P) {
                for (var S = 0, D = u.transforms.length, T = P; S < D && !P; ) {
                  if (u.transforms[S].transform.mProps._mdf) {
                    T = !0;
                    break;
                  }
                  S += 1;
                }
                if (T)
                  for (u.finalTransform.reset(), S = D - 1; S >= 0; S -= 1)
                    u.finalTransform.multiply(
                      u.transforms[S].transform.mProps.v
                    );
                u._mdf = T;
              },
              processSequences: function (u) {
                var P,
                  S = this.sequenceList.length;
                for (P = 0; P < S; P += 1)
                  this.processSequence(this.sequenceList[P], u);
              },
              getNewKey: function () {
                return (
                  (this.transform_key_count += 1),
                  '_' + this.transform_key_count
                );
              },
            });
          var lumaLoader = function () {
            var u = '__lottie_element_luma_buffer',
              P = null,
              S = null,
              D = null;
            function T() {
              var P = createNS('svg'),
                S = createNS('filter'),
                D = createNS('feColorMatrix');
              return (
                S.setAttribute('id', u),
                D.setAttribute('type', 'matrix'),
                D.setAttribute('color-interpolation-filters', 'sRGB'),
                D.setAttribute(
                  'values',
                  '0.3, 0.3, 0.3, 0, 0, 0.3, 0.3, 0.3, 0, 0, 0.3, 0.3, 0.3, 0, 0, 0.3, 0.3, 0.3, 0, 0'
                ),
                S.appendChild(D),
                P.appendChild(S),
                P.setAttribute('id', u + '_svg'),
                featureSupport.svgLumaHidden && (P.style.display = 'none'),
                P
              );
            }
            function M() {
              P ||
                ((D = T()),
                document.body.appendChild(D),
                ((S = (P = createTag('canvas')).getContext('2d')).filter =
                  'url(#' + u + ')'),
                (S.fillStyle = 'rgba(0,0,0,0)'),
                S.fillRect(0, 0, 1, 1));
            }
            function E(D) {
              return (
                P || M(),
                (P.width = D.width),
                (P.height = D.height),
                (S.filter = 'url(#' + u + ')'),
                P
              );
            }
            return { load: M, get: E };
          };
          function createCanvas(u, P) {
            if (featureSupport.offscreenCanvas)
              return new OffscreenCanvas(u, P);
            var S = createTag('canvas');
            return (S.width = u), (S.height = P), S;
          }
          var assetLoader = (function () {
              return {
                loadLumaCanvas: lumaLoader.load,
                getLumaCanvas: lumaLoader.get,
                createCanvas: createCanvas,
              };
            })(),
            registeredEffects = {};
          function CVEffects(u) {
            var P,
              S,
              D = u.data.ef ? u.data.ef.length : 0;
            for (P = 0, this.filters = []; P < D; P += 1) {
              S = null;
              var T = u.data.ef[P].ty;
              registeredEffects[T] &&
                (S = new registeredEffects[T].effect(
                  u.effectsManager.effectElements[P],
                  u
                )),
                S && this.filters.push(S);
            }
            this.filters.length && u.addRenderableComponent(this);
          }
          function registerEffect(u, P) {
            registeredEffects[u] = { effect: P };
          }
          function CVMaskElement(u, P) {
            (this.data = u),
              (this.element = P),
              (this.masksProperties = this.data.masksProperties || []),
              (this.viewData = createSizedArray(this.masksProperties.length));
            var S,
              D = this.masksProperties.length,
              T = !1;
            for (S = 0; S < D; S += 1)
              'n' !== this.masksProperties[S].mode && (T = !0),
                (this.viewData[S] = ShapePropertyFactory.getShapeProp(
                  this.element,
                  this.masksProperties[S],
                  3
                ));
            (this.hasMasks = T), T && this.element.addRenderableComponent(this);
          }
          function CVBaseElement() {}
          (CVEffects.prototype.renderFrame = function (u) {
            var P,
              S = this.filters.length;
            for (P = 0; P < S; P += 1) this.filters[P].renderFrame(u);
          }),
            (CVEffects.prototype.getEffects = function (u) {
              var P,
                S = this.filters.length,
                D = [];
              for (P = 0; P < S; P += 1)
                this.filters[P].type === u && D.push(this.filters[P]);
              return D;
            }),
            (CVMaskElement.prototype.renderFrame = function () {
              if (this.hasMasks) {
                var u = this.element.finalTransform.mat,
                  P = this.element.canvasContext,
                  S = this.masksProperties.length;
                for (P.beginPath(), D = 0; D < S; D += 1)
                  if ('n' !== this.masksProperties[D].mode) {
                    this.masksProperties[D].inv &&
                      (P.moveTo(0, 0),
                      P.lineTo(this.element.globalData.compSize.w, 0),
                      P.lineTo(
                        this.element.globalData.compSize.w,
                        this.element.globalData.compSize.h
                      ),
                      P.lineTo(0, this.element.globalData.compSize.h),
                      P.lineTo(0, 0)),
                      (E = this.viewData[D].v),
                      (T = u.applyToPointArray(E.v[0][0], E.v[0][1], 0)),
                      P.moveTo(T[0], T[1]);
                    var D,
                      T,
                      M,
                      E,
                      F,
                      I = E._length;
                    for (F = 1; F < I; F += 1)
                      (M = u.applyToTriplePoints(E.o[F - 1], E.i[F], E.v[F])),
                        P.bezierCurveTo(M[0], M[1], M[2], M[3], M[4], M[5]);
                    (M = u.applyToTriplePoints(E.o[F - 1], E.i[0], E.v[0])),
                      P.bezierCurveTo(M[0], M[1], M[2], M[3], M[4], M[5]);
                  }
                this.element.globalData.renderer.save(!0), P.clip();
              }
            }),
            (CVMaskElement.prototype.getMaskProperty =
              MaskElement.prototype.getMaskProperty),
            (CVMaskElement.prototype.destroy = function () {
              this.element = null;
            });
          var operationsMap = {
            1: 'source-in',
            2: 'source-out',
            3: 'source-in',
            4: 'source-out',
          };
          function CVShapeData(u, P, S, D) {
            (this.styledShapes = []), (this.tr = [0, 0, 0, 0, 0, 0]);
            var T,
              M,
              E = 4;
            'rc' === P.ty
              ? (E = 5)
              : 'el' === P.ty
              ? (E = 6)
              : 'sr' === P.ty && (E = 7),
              (this.sh = ShapePropertyFactory.getShapeProp(u, P, E, u));
            var F = S.length;
            for (T = 0; T < F; T += 1)
              S[T].closed ||
                ((M = {
                  transforms: D.addTransformSequence(S[T].transforms),
                  trNodes: [],
                }),
                this.styledShapes.push(M),
                S[T].elements.push(M));
          }
          function CVShapeElement(u, P, S) {
            (this.shapes = []),
              (this.shapesData = u.shapes),
              (this.stylesList = []),
              (this.itemsData = []),
              (this.prevViewData = []),
              (this.shapeModifiers = []),
              (this.processedElements = []),
              (this.transformsManager = new ShapeTransformManager()),
              this.initElement(u, P, S);
          }
          function CVTextElement(u, P, S) {
            (this.textSpans = []),
              (this.yOffset = 0),
              (this.fillColorAnim = !1),
              (this.strokeColorAnim = !1),
              (this.strokeWidthAnim = !1),
              (this.stroke = !1),
              (this.fill = !1),
              (this.justifyOffset = 0),
              (this.currentRender = null),
              (this.renderType = 'canvas'),
              (this.values = {
                fill: 'rgba(0,0,0,0)',
                stroke: 'rgba(0,0,0,0)',
                sWidth: 0,
                fValue: '',
              }),
              this.initElement(u, P, S);
          }
          function CVImageElement(u, P, S) {
            (this.assetData = P.getAssetData(u.refId)),
              (this.img = P.imageLoader.getAsset(this.assetData)),
              this.initElement(u, P, S);
          }
          function CVSolidElement(u, P, S) {
            this.initElement(u, P, S);
          }
          function CanvasRendererBase() {}
          function CanvasContext() {
            (this.opacity = -1),
              (this.transform = createTypedArray('float32', 16)),
              (this.fillStyle = ''),
              (this.strokeStyle = ''),
              (this.lineWidth = ''),
              (this.lineCap = ''),
              (this.lineJoin = ''),
              (this.miterLimit = ''),
              (this.id = Math.random());
          }
          function CVContextData() {
            (this.stack = []), (this.cArrPos = 0), (this.cTr = new Matrix());
            var u,
              P = 15;
            for (u = 0; u < P; u += 1) {
              var S = new CanvasContext();
              this.stack[u] = S;
            }
            (this._length = P),
              (this.nativeContext = null),
              (this.transformMat = new Matrix()),
              (this.currentOpacity = 1),
              (this.currentFillStyle = ''),
              (this.appliedFillStyle = ''),
              (this.currentStrokeStyle = ''),
              (this.appliedStrokeStyle = ''),
              (this.currentLineWidth = ''),
              (this.appliedLineWidth = ''),
              (this.currentLineCap = ''),
              (this.appliedLineCap = ''),
              (this.currentLineJoin = ''),
              (this.appliedLineJoin = ''),
              (this.appliedMiterLimit = ''),
              (this.currentMiterLimit = '');
          }
          function CVCompElement(u, P, S) {
            (this.completeLayers = !1),
              (this.layers = u.layers),
              (this.pendingElements = []),
              (this.elements = createSizedArray(this.layers.length)),
              this.initElement(u, P, S),
              (this.tm = u.tm
                ? PropertyFactory.getProp(this, u.tm, 0, P.frameRate, this)
                : { _placeholder: !0 });
          }
          function CanvasRenderer(u, P) {
            (this.animationItem = u),
              (this.renderConfig = {
                clearCanvas: !P || void 0 === P.clearCanvas || P.clearCanvas,
                context: (P && P.context) || null,
                progressiveLoad: (P && P.progressiveLoad) || !1,
                preserveAspectRatio:
                  (P && P.preserveAspectRatio) || 'xMidYMid meet',
                imagePreserveAspectRatio:
                  (P && P.imagePreserveAspectRatio) || 'xMidYMid slice',
                contentVisibility: (P && P.contentVisibility) || 'visible',
                className: (P && P.className) || '',
                id: (P && P.id) || '',
                runExpressions:
                  !P || void 0 === P.runExpressions || P.runExpressions,
              }),
              (this.renderConfig.dpr = (P && P.dpr) || 1),
              this.animationItem.wrapper &&
                (this.renderConfig.dpr =
                  (P && P.dpr) || window.devicePixelRatio || 1),
              (this.renderedFrame = -1),
              (this.globalData = {
                frameNum: -1,
                _mdf: !1,
                renderConfig: this.renderConfig,
                currentGlobalAlpha: -1,
              }),
              (this.contextData = new CVContextData()),
              (this.elements = []),
              (this.pendingElements = []),
              (this.transformMat = new Matrix()),
              (this.completeLayers = !1),
              (this.rendererType = 'canvas'),
              this.renderConfig.clearCanvas &&
                ((this.ctxTransform = this.contextData.transform.bind(
                  this.contextData
                )),
                (this.ctxOpacity = this.contextData.opacity.bind(
                  this.contextData
                )),
                (this.ctxFillStyle = this.contextData.fillStyle.bind(
                  this.contextData
                )),
                (this.ctxStrokeStyle = this.contextData.strokeStyle.bind(
                  this.contextData
                )),
                (this.ctxLineWidth = this.contextData.lineWidth.bind(
                  this.contextData
                )),
                (this.ctxLineCap = this.contextData.lineCap.bind(
                  this.contextData
                )),
                (this.ctxLineJoin = this.contextData.lineJoin.bind(
                  this.contextData
                )),
                (this.ctxMiterLimit = this.contextData.miterLimit.bind(
                  this.contextData
                )),
                (this.ctxFill = this.contextData.fill.bind(this.contextData)),
                (this.ctxFillRect = this.contextData.fillRect.bind(
                  this.contextData
                )),
                (this.ctxStroke = this.contextData.stroke.bind(
                  this.contextData
                )),
                (this.save = this.contextData.save.bind(this.contextData)));
          }
          function HBaseElement() {}
          function HSolidElement(u, P, S) {
            this.initElement(u, P, S);
          }
          function HShapeElement(u, P, S) {
            (this.shapes = []),
              (this.shapesData = u.shapes),
              (this.stylesList = []),
              (this.shapeModifiers = []),
              (this.itemsData = []),
              (this.processedElements = []),
              (this.animatedContents = []),
              (this.shapesContainer = createNS('g')),
              this.initElement(u, P, S),
              (this.prevViewData = []),
              (this.currentBBox = { x: 999999, y: -999999, h: 0, w: 0 });
          }
          function HTextElement(u, P, S) {
            (this.textSpans = []),
              (this.textPaths = []),
              (this.currentBBox = { x: 999999, y: -999999, h: 0, w: 0 }),
              (this.renderType = 'svg'),
              (this.isMasked = !1),
              this.initElement(u, P, S);
          }
          function HCameraElement(u, P, S) {
            this.initFrame(), this.initBaseData(u, P, S), this.initHierarchy();
            var D = PropertyFactory.getProp;
            if (
              ((this.pe = D(this, u.pe, 0, 0, this)),
              u.ks.p.s
                ? ((this.px = D(this, u.ks.p.x, 1, 0, this)),
                  (this.py = D(this, u.ks.p.y, 1, 0, this)),
                  (this.pz = D(this, u.ks.p.z, 1, 0, this)))
                : (this.p = D(this, u.ks.p, 1, 0, this)),
              u.ks.a && (this.a = D(this, u.ks.a, 1, 0, this)),
              u.ks.or.k.length && u.ks.or.k[0].to)
            ) {
              var T,
                M = u.ks.or.k.length;
              for (T = 0; T < M; T += 1)
                (u.ks.or.k[T].to = null), (u.ks.or.k[T].ti = null);
            }
            (this.or = D(this, u.ks.or, 1, degToRads, this)),
              (this.or.sh = !0),
              (this.rx = D(this, u.ks.rx, 0, degToRads, this)),
              (this.ry = D(this, u.ks.ry, 0, degToRads, this)),
              (this.rz = D(this, u.ks.rz, 0, degToRads, this)),
              (this.mat = new Matrix()),
              (this._prevMat = new Matrix()),
              (this._isFirstFrame = !0),
              (this.finalTransform = { mProp: this });
          }
          function HImageElement(u, P, S) {
            (this.assetData = P.getAssetData(u.refId)),
              this.initElement(u, P, S);
          }
          function HybridRendererBase(u, P) {
            (this.animationItem = u),
              (this.layers = null),
              (this.renderedFrame = -1),
              (this.renderConfig = {
                className: (P && P.className) || '',
                imagePreserveAspectRatio:
                  (P && P.imagePreserveAspectRatio) || 'xMidYMid slice',
                hideOnTransparent: !(P && !1 === P.hideOnTransparent),
                filterSize: {
                  width: (P && P.filterSize && P.filterSize.width) || '400%',
                  height: (P && P.filterSize && P.filterSize.height) || '400%',
                  x: (P && P.filterSize && P.filterSize.x) || '-100%',
                  y: (P && P.filterSize && P.filterSize.y) || '-100%',
                },
              }),
              (this.globalData = {
                _mdf: !1,
                frameNum: -1,
                renderConfig: this.renderConfig,
              }),
              (this.pendingElements = []),
              (this.elements = []),
              (this.threeDElements = []),
              (this.destroyed = !1),
              (this.camera = null),
              (this.supports3d = !0),
              (this.rendererType = 'html');
          }
          function HCompElement(u, P, S) {
            (this.layers = u.layers),
              (this.supports3d = !u.hasMask),
              (this.completeLayers = !1),
              (this.pendingElements = []),
              (this.elements = this.layers
                ? createSizedArray(this.layers.length)
                : []),
              this.initElement(u, P, S),
              (this.tm = u.tm
                ? PropertyFactory.getProp(this, u.tm, 0, P.frameRate, this)
                : { _placeholder: !0 });
          }
          function HybridRenderer(u, P) {
            (this.animationItem = u),
              (this.layers = null),
              (this.renderedFrame = -1),
              (this.renderConfig = {
                className: (P && P.className) || '',
                imagePreserveAspectRatio:
                  (P && P.imagePreserveAspectRatio) || 'xMidYMid slice',
                hideOnTransparent: !(P && !1 === P.hideOnTransparent),
                filterSize: {
                  width: (P && P.filterSize && P.filterSize.width) || '400%',
                  height: (P && P.filterSize && P.filterSize.height) || '400%',
                  x: (P && P.filterSize && P.filterSize.x) || '-100%',
                  y: (P && P.filterSize && P.filterSize.y) || '-100%',
                },
                runExpressions:
                  !P || void 0 === P.runExpressions || P.runExpressions,
              }),
              (this.globalData = {
                _mdf: !1,
                frameNum: -1,
                renderConfig: this.renderConfig,
              }),
              (this.pendingElements = []),
              (this.elements = []),
              (this.threeDElements = []),
              (this.destroyed = !1),
              (this.camera = null),
              (this.supports3d = !0),
              (this.rendererType = 'html');
          }
          (CVBaseElement.prototype = {
            createElements: function () {},
            initRendererElement: function () {},
            createContainerElements: function () {
              if (this.data.tt >= 1) {
                this.buffers = [];
                var u = this.globalData.canvasContext,
                  P = assetLoader.createCanvas(u.canvas.width, u.canvas.height);
                this.buffers.push(P);
                var S = assetLoader.createCanvas(
                  u.canvas.width,
                  u.canvas.height
                );
                this.buffers.push(S),
                  this.data.tt >= 3 &&
                    !document._isProxy &&
                    assetLoader.loadLumaCanvas();
              }
              (this.canvasContext = this.globalData.canvasContext),
                (this.transformCanvas = this.globalData.transformCanvas),
                (this.renderableEffectsManager = new CVEffects(this)),
                this.searchEffectTransforms();
            },
            createContent: function () {},
            setBlendMode: function () {
              var u = this.globalData;
              if (u.blendMode !== this.data.bm) {
                u.blendMode = this.data.bm;
                var P = getBlendMode(this.data.bm);
                u.canvasContext.globalCompositeOperation = P;
              }
            },
            createRenderableComponents: function () {
              (this.maskManager = new CVMaskElement(this.data, this)),
                (this.transformEffects =
                  this.renderableEffectsManager.getEffects(
                    effectTypes.TRANSFORM_EFFECT
                  ));
            },
            hideElement: function () {
              this.hidden ||
                (this.isInRange && !this.isTransparent) ||
                (this.hidden = !0);
            },
            showElement: function () {
              this.isInRange &&
                !this.isTransparent &&
                ((this.hidden = !1),
                (this._isFirstFrame = !0),
                (this.maskManager._isFirstFrame = !0));
            },
            clearCanvas: function (u) {
              u.clearRect(
                this.transformCanvas.tx,
                this.transformCanvas.ty,
                this.transformCanvas.w * this.transformCanvas.sx,
                this.transformCanvas.h * this.transformCanvas.sy
              );
            },
            prepareLayer: function () {
              if (this.data.tt >= 1) {
                var u = this.buffers[0].getContext('2d');
                this.clearCanvas(u),
                  u.drawImage(this.canvasContext.canvas, 0, 0),
                  (this.currentTransform = this.canvasContext.getTransform()),
                  this.canvasContext.setTransform(1, 0, 0, 1, 0, 0),
                  this.clearCanvas(this.canvasContext),
                  this.canvasContext.setTransform(this.currentTransform);
              }
            },
            exitLayer: function () {
              if (this.data.tt >= 1) {
                var u = this.buffers[1],
                  P = u.getContext('2d');
                if (
                  (this.clearCanvas(P),
                  P.drawImage(this.canvasContext.canvas, 0, 0),
                  this.canvasContext.setTransform(1, 0, 0, 1, 0, 0),
                  this.clearCanvas(this.canvasContext),
                  this.canvasContext.setTransform(this.currentTransform),
                  this.comp
                    .getElementById(
                      'tp' in this.data ? this.data.tp : this.data.ind - 1
                    )
                    .renderFrame(!0),
                  this.canvasContext.setTransform(1, 0, 0, 1, 0, 0),
                  this.data.tt >= 3 && !document._isProxy)
                ) {
                  var S = assetLoader.getLumaCanvas(this.canvasContext.canvas);
                  S.getContext('2d').drawImage(this.canvasContext.canvas, 0, 0),
                    this.clearCanvas(this.canvasContext),
                    this.canvasContext.drawImage(S, 0, 0);
                }
                (this.canvasContext.globalCompositeOperation =
                  operationsMap[this.data.tt]),
                  this.canvasContext.drawImage(u, 0, 0),
                  (this.canvasContext.globalCompositeOperation =
                    'destination-over'),
                  this.canvasContext.drawImage(this.buffers[0], 0, 0),
                  this.canvasContext.setTransform(this.currentTransform),
                  (this.canvasContext.globalCompositeOperation = 'source-over');
              }
            },
            renderFrame: function (u) {
              if (!this.hidden && !this.data.hd && (1 !== this.data.td || u)) {
                this.renderTransform(),
                  this.renderRenderable(),
                  this.renderLocalTransform(),
                  this.setBlendMode();
                var P = 0 === this.data.ty;
                this.prepareLayer(),
                  this.globalData.renderer.save(P),
                  this.globalData.renderer.ctxTransform(
                    this.finalTransform.localMat.props
                  ),
                  this.globalData.renderer.ctxOpacity(
                    this.finalTransform.localOpacity
                  ),
                  this.renderInnerContent(),
                  this.globalData.renderer.restore(P),
                  this.exitLayer(),
                  this.maskManager.hasMasks &&
                    this.globalData.renderer.restore(!0),
                  this._isFirstFrame && (this._isFirstFrame = !1);
              }
            },
            destroy: function () {
              (this.canvasContext = null),
                (this.data = null),
                (this.globalData = null),
                this.maskManager.destroy();
            },
            mHelper: new Matrix(),
          }),
            (CVBaseElement.prototype.hide =
              CVBaseElement.prototype.hideElement),
            (CVBaseElement.prototype.show =
              CVBaseElement.prototype.showElement),
            (CVShapeData.prototype.setAsAnimated =
              SVGShapeData.prototype.setAsAnimated),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                CVBaseElement,
                IShapeElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
              ],
              CVShapeElement
            ),
            (CVShapeElement.prototype.initElement =
              RenderableDOMElement.prototype.initElement),
            (CVShapeElement.prototype.transformHelper = {
              opacity: 1,
              _opMdf: !1,
            }),
            (CVShapeElement.prototype.dashResetter = []),
            (CVShapeElement.prototype.createContent = function () {
              this.searchShapes(
                this.shapesData,
                this.itemsData,
                this.prevViewData,
                !0,
                []
              );
            }),
            (CVShapeElement.prototype.createStyleElement = function (u, P) {
              var S = {
                  data: u,
                  type: u.ty,
                  preTransforms: this.transformsManager.addTransformSequence(P),
                  transforms: [],
                  elements: [],
                  closed: !0 === u.hd,
                },
                D = {};
              if (
                ('fl' === u.ty || 'st' === u.ty
                  ? ((D.c = PropertyFactory.getProp(this, u.c, 1, 255, this)),
                    D.c.k ||
                      (S.co =
                        'rgb(' +
                        bmFloor(D.c.v[0]) +
                        ',' +
                        bmFloor(D.c.v[1]) +
                        ',' +
                        bmFloor(D.c.v[2]) +
                        ')'))
                  : ('gf' === u.ty || 'gs' === u.ty) &&
                    ((D.s = PropertyFactory.getProp(this, u.s, 1, null, this)),
                    (D.e = PropertyFactory.getProp(this, u.e, 1, null, this)),
                    (D.h = PropertyFactory.getProp(
                      this,
                      u.h || { k: 0 },
                      0,
                      0.01,
                      this
                    )),
                    (D.a = PropertyFactory.getProp(
                      this,
                      u.a || { k: 0 },
                      0,
                      degToRads,
                      this
                    )),
                    (D.g = new GradientProperty(this, u.g, this))),
                (D.o = PropertyFactory.getProp(this, u.o, 0, 0.01, this)),
                'st' === u.ty || 'gs' === u.ty)
              ) {
                if (
                  ((S.lc = lineCapEnum[u.lc || 2]),
                  (S.lj = lineJoinEnum[u.lj || 2]),
                  1 == u.lj && (S.ml = u.ml),
                  (D.w = PropertyFactory.getProp(this, u.w, 0, null, this)),
                  D.w.k || (S.wi = D.w.v),
                  u.d)
                ) {
                  var T = new DashProperty(this, u.d, 'canvas', this);
                  (D.d = T),
                    D.d.k ||
                      ((S.da = D.d.dashArray), (S.do = D.d.dashoffset[0]));
                }
              } else S.r = 2 === u.r ? 'evenodd' : 'nonzero';
              return this.stylesList.push(S), (D.style = S), D;
            }),
            (CVShapeElement.prototype.createGroupElement = function () {
              return { it: [], prevViewData: [] };
            }),
            (CVShapeElement.prototype.createTransformElement = function (u) {
              return {
                transform: {
                  opacity: 1,
                  _opMdf: !1,
                  key: this.transformsManager.getNewKey(),
                  op: PropertyFactory.getProp(this, u.o, 0, 0.01, this),
                  mProps: TransformPropertyFactory.getTransformProperty(
                    this,
                    u,
                    this
                  ),
                },
              };
            }),
            (CVShapeElement.prototype.createShapeElement = function (u) {
              var P = new CVShapeData(
                this,
                u,
                this.stylesList,
                this.transformsManager
              );
              return this.shapes.push(P), this.addShapeToModifiers(P), P;
            }),
            (CVShapeElement.prototype.reloadShapes = function () {
              this._isFirstFrame = !0;
              var u,
                P = this.itemsData.length;
              for (u = 0; u < P; u += 1)
                this.prevViewData[u] = this.itemsData[u];
              for (
                this.searchShapes(
                  this.shapesData,
                  this.itemsData,
                  this.prevViewData,
                  !0,
                  []
                ),
                  P = this.dynamicProperties.length,
                  u = 0;
                u < P;
                u += 1
              )
                this.dynamicProperties[u].getValue();
              this.renderModifiers(),
                this.transformsManager.processSequences(this._isFirstFrame);
            }),
            (CVShapeElement.prototype.addTransformToStyleList = function (u) {
              var P,
                S = this.stylesList.length;
              for (P = 0; P < S; P += 1)
                this.stylesList[P].closed ||
                  this.stylesList[P].transforms.push(u);
            }),
            (CVShapeElement.prototype.removeTransformFromStyleList =
              function () {
                var u,
                  P = this.stylesList.length;
                for (u = 0; u < P; u += 1)
                  this.stylesList[u].closed ||
                    this.stylesList[u].transforms.pop();
              }),
            (CVShapeElement.prototype.closeStyles = function (u) {
              var P,
                S = u.length;
              for (P = 0; P < S; P += 1) u[P].closed = !0;
            }),
            (CVShapeElement.prototype.searchShapes = function (u, P, S, D, T) {
              var M,
                E,
                F,
                I,
                L,
                R,
                V = u.length - 1,
                O = [],
                N = [],
                G = [].concat(T);
              for (M = V; M >= 0; M -= 1) {
                if (
                  ((I = this.searchProcessedElement(u[M]))
                    ? (P[M] = S[I - 1])
                    : (u[M]._shouldRender = D),
                  'fl' === u[M].ty ||
                    'st' === u[M].ty ||
                    'gf' === u[M].ty ||
                    'gs' === u[M].ty)
                )
                  I
                    ? (P[M].style.closed = !1)
                    : (P[M] = this.createStyleElement(u[M], G)),
                    O.push(P[M].style);
                else if ('gr' === u[M].ty) {
                  if (I)
                    for (E = 0, F = P[M].it.length; E < F; E += 1)
                      P[M].prevViewData[E] = P[M].it[E];
                  else P[M] = this.createGroupElement(u[M]);
                  this.searchShapes(u[M].it, P[M].it, P[M].prevViewData, D, G);
                } else
                  'tr' === u[M].ty
                    ? (I ||
                        ((R = this.createTransformElement(u[M])), (P[M] = R)),
                      G.push(P[M]),
                      this.addTransformToStyleList(P[M]))
                    : 'sh' === u[M].ty ||
                      'rc' === u[M].ty ||
                      'el' === u[M].ty ||
                      'sr' === u[M].ty
                    ? I || (P[M] = this.createShapeElement(u[M]))
                    : 'tm' === u[M].ty ||
                      'rd' === u[M].ty ||
                      'pb' === u[M].ty ||
                      'zz' === u[M].ty ||
                      'op' === u[M].ty
                    ? (I
                        ? ((L = P[M]).closed = !1)
                        : ((L = ShapeModifiers.getModifier(u[M].ty)).init(
                            this,
                            u[M]
                          ),
                          (P[M] = L),
                          this.shapeModifiers.push(L)),
                      N.push(L))
                    : 'rp' === u[M].ty &&
                      (I
                        ? ((L = P[M]).closed = !0)
                        : ((L = ShapeModifiers.getModifier(u[M].ty)),
                          (P[M] = L),
                          L.init(this, u, M, P),
                          this.shapeModifiers.push(L),
                          (D = !1)),
                      N.push(L));
                this.addProcessedElement(u[M], M + 1);
              }
              for (
                this.removeTransformFromStyleList(),
                  this.closeStyles(O),
                  V = N.length,
                  M = 0;
                M < V;
                M += 1
              )
                N[M].closed = !0;
            }),
            (CVShapeElement.prototype.renderInnerContent = function () {
              (this.transformHelper.opacity = 1),
                (this.transformHelper._opMdf = !1),
                this.renderModifiers(),
                this.transformsManager.processSequences(this._isFirstFrame),
                this.renderShape(
                  this.transformHelper,
                  this.shapesData,
                  this.itemsData,
                  !0
                );
            }),
            (CVShapeElement.prototype.renderShapeTransform = function (u, P) {
              (u._opMdf || P.op._mdf || this._isFirstFrame) &&
                ((P.opacity = u.opacity),
                (P.opacity *= P.op.v),
                (P._opMdf = !0));
            }),
            (CVShapeElement.prototype.drawLayer = function () {
              var u,
                P,
                S,
                D,
                T,
                M,
                E,
                F,
                I,
                L = this.stylesList.length,
                R = this.globalData.renderer,
                V = this.globalData.canvasContext;
              for (u = 0; u < L; u += 1)
                if (
                  !(
                    (('st' === (F = (I = this.stylesList[u]).type) ||
                      'gs' === F) &&
                      0 === I.wi) ||
                    !I.data._shouldRender ||
                    0 === I.coOp ||
                    0 === this.globalData.currentGlobalAlpha
                  )
                ) {
                  for (
                    R.save(),
                      M = I.elements,
                      'st' === F || 'gs' === F
                        ? (R.ctxStrokeStyle('st' === F ? I.co : I.grd),
                          R.ctxLineWidth(I.wi),
                          R.ctxLineCap(I.lc),
                          R.ctxLineJoin(I.lj),
                          R.ctxMiterLimit(I.ml || 0))
                        : R.ctxFillStyle('fl' === F ? I.co : I.grd),
                      R.ctxOpacity(I.coOp),
                      'st' !== F && 'gs' !== F && V.beginPath(),
                      R.ctxTransform(I.preTransforms.finalTransform.props),
                      S = M.length,
                      P = 0;
                    P < S;
                    P += 1
                  ) {
                    for (
                      ('st' === F || 'gs' === F) &&
                        (V.beginPath(),
                        I.da &&
                          (V.setLineDash(I.da), (V.lineDashOffset = I.do))),
                        T = (E = M[P].trNodes).length,
                        D = 0;
                      D < T;
                      D += 1
                    )
                      'm' === E[D].t
                        ? V.moveTo(E[D].p[0], E[D].p[1])
                        : 'c' === E[D].t
                        ? V.bezierCurveTo(
                            E[D].pts[0],
                            E[D].pts[1],
                            E[D].pts[2],
                            E[D].pts[3],
                            E[D].pts[4],
                            E[D].pts[5]
                          )
                        : V.closePath();
                    ('st' === F || 'gs' === F) &&
                      (R.ctxStroke(), I.da && V.setLineDash(this.dashResetter));
                  }
                  'st' !== F &&
                    'gs' !== F &&
                    this.globalData.renderer.ctxFill(I.r),
                    R.restore();
                }
            }),
            (CVShapeElement.prototype.renderShape = function (u, P, S, D) {
              var T,
                M,
                E = P.length - 1;
              for (M = u, T = E; T >= 0; T -= 1)
                'tr' === P[T].ty
                  ? ((M = S[T].transform), this.renderShapeTransform(u, M))
                  : 'sh' === P[T].ty ||
                    'el' === P[T].ty ||
                    'rc' === P[T].ty ||
                    'sr' === P[T].ty
                  ? this.renderPath(P[T], S[T])
                  : 'fl' === P[T].ty
                  ? this.renderFill(P[T], S[T], M)
                  : 'st' === P[T].ty
                  ? this.renderStroke(P[T], S[T], M)
                  : 'gf' === P[T].ty || 'gs' === P[T].ty
                  ? this.renderGradientFill(P[T], S[T], M)
                  : 'gr' === P[T].ty
                  ? this.renderShape(M, P[T].it, S[T].it)
                  : P[T].ty;
              D && this.drawLayer();
            }),
            (CVShapeElement.prototype.renderStyledShape = function (u, P) {
              if (this._isFirstFrame || P._mdf || u.transforms._mdf) {
                var S,
                  D,
                  T,
                  M = u.trNodes,
                  E = P.paths,
                  F = E._length;
                M.length = 0;
                var I = u.transforms.finalTransform;
                for (T = 0; T < F; T += 1) {
                  var L = E.shapes[T];
                  if (L && L.v) {
                    for (S = 1, D = L._length; S < D; S += 1)
                      1 === S &&
                        M.push({
                          t: 'm',
                          p: I.applyToPointArray(L.v[0][0], L.v[0][1], 0),
                        }),
                        M.push({
                          t: 'c',
                          pts: I.applyToTriplePoints(
                            L.o[S - 1],
                            L.i[S],
                            L.v[S]
                          ),
                        });
                    1 === D &&
                      M.push({
                        t: 'm',
                        p: I.applyToPointArray(L.v[0][0], L.v[0][1], 0),
                      }),
                      L.c &&
                        D &&
                        (M.push({
                          t: 'c',
                          pts: I.applyToTriplePoints(
                            L.o[S - 1],
                            L.i[0],
                            L.v[0]
                          ),
                        }),
                        M.push({ t: 'z' }));
                  }
                }
                u.trNodes = M;
              }
            }),
            (CVShapeElement.prototype.renderPath = function (u, P) {
              if (!0 !== u.hd && u._shouldRender) {
                var S,
                  D = P.styledShapes.length;
                for (S = 0; S < D; S += 1)
                  this.renderStyledShape(P.styledShapes[S], P.sh);
              }
            }),
            (CVShapeElement.prototype.renderFill = function (u, P, S) {
              var D = P.style;
              (P.c._mdf || this._isFirstFrame) &&
                (D.co =
                  'rgb(' +
                  bmFloor(P.c.v[0]) +
                  ',' +
                  bmFloor(P.c.v[1]) +
                  ',' +
                  bmFloor(P.c.v[2]) +
                  ')'),
                (P.o._mdf || S._opMdf || this._isFirstFrame) &&
                  (D.coOp = P.o.v * S.opacity);
            }),
            (CVShapeElement.prototype.renderGradientFill = function (u, P, S) {
              var D = P.style;
              if (
                !D.grd ||
                P.g._mdf ||
                P.s._mdf ||
                P.e._mdf ||
                (1 !== u.t && (P.h._mdf || P.a._mdf))
              ) {
                var T,
                  M,
                  E = this.globalData.canvasContext,
                  F = P.s.v,
                  I = P.e.v;
                if (1 === u.t)
                  T = E.createLinearGradient(F[0], F[1], I[0], I[1]);
                else {
                  var L = Math.sqrt(
                      Math.pow(F[0] - I[0], 2) + Math.pow(F[1] - I[1], 2)
                    ),
                    R = Math.atan2(I[1] - F[1], I[0] - F[0]),
                    V = P.h.v;
                  V >= 1 ? (V = 0.99) : V <= -1 && (V = -0.99);
                  var O = L * V,
                    N = Math.cos(R + P.a.v) * O + F[0],
                    G = Math.sin(R + P.a.v) * O + F[1];
                  T = E.createRadialGradient(N, G, 0, F[0], F[1], L);
                }
                var W = u.g.p,
                  Y = P.g.c,
                  H = 1;
                for (M = 0; M < W; M += 1)
                  P.g._hasOpacity && P.g._collapsable && (H = P.g.o[2 * M + 1]),
                    T.addColorStop(
                      Y[4 * M] / 100,
                      'rgba(' +
                        Y[4 * M + 1] +
                        ',' +
                        Y[4 * M + 2] +
                        ',' +
                        Y[4 * M + 3] +
                        ',' +
                        H +
                        ')'
                    );
                D.grd = T;
              }
              D.coOp = P.o.v * S.opacity;
            }),
            (CVShapeElement.prototype.renderStroke = function (u, P, S) {
              var D = P.style,
                T = P.d;
              T &&
                (T._mdf || this._isFirstFrame) &&
                ((D.da = T.dashArray), (D.do = T.dashoffset[0])),
                (P.c._mdf || this._isFirstFrame) &&
                  (D.co =
                    'rgb(' +
                    bmFloor(P.c.v[0]) +
                    ',' +
                    bmFloor(P.c.v[1]) +
                    ',' +
                    bmFloor(P.c.v[2]) +
                    ')'),
                (P.o._mdf || S._opMdf || this._isFirstFrame) &&
                  (D.coOp = P.o.v * S.opacity),
                (P.w._mdf || this._isFirstFrame) && (D.wi = P.w.v);
            }),
            (CVShapeElement.prototype.destroy = function () {
              (this.shapesData = null),
                (this.globalData = null),
                (this.canvasContext = null),
                (this.stylesList.length = 0),
                (this.itemsData.length = 0);
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                CVBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
                ITextElement,
              ],
              CVTextElement
            ),
            (CVTextElement.prototype.tHelper =
              createTag('canvas').getContext('2d')),
            (CVTextElement.prototype.buildNewText = function () {
              var u,
                P,
                S,
                D,
                T,
                M,
                E,
                F,
                I,
                L,
                R,
                V,
                O = this.textProperty.currentData;
              this.renderedLetters = createSizedArray(O.l ? O.l.length : 0);
              var N = !1;
              O.fc
                ? ((N = !0), (this.values.fill = this.buildColor(O.fc)))
                : (this.values.fill = 'rgba(0,0,0,0)'),
                (this.fill = N);
              var G = !1;
              O.sc &&
                ((G = !0),
                (this.values.stroke = this.buildColor(O.sc)),
                (this.values.sWidth = O.sw));
              var W = this.globalData.fontManager.getFontByName(O.f),
                Y = O.l,
                H = this.mHelper;
              (this.stroke = G),
                (this.values.fValue =
                  O.finalSize +
                  'px ' +
                  this.globalData.fontManager.getFontByName(O.f).fFamily),
                (P = O.finalText.length);
              var X = this.data.singleShape,
                J = 0.001 * O.tr * O.finalSize,
                K = 0,
                Z = 0,
                U = !0,
                Q = 0;
              for (u = 0; u < P; u += 1) {
                (D =
                  ((S = this.globalData.fontManager.getCharData(
                    O.finalText[u],
                    W.fStyle,
                    this.globalData.fontManager.getFontByName(O.f).fFamily
                  )) &&
                    S.data) ||
                  {}),
                  H.reset(),
                  X &&
                    Y[u].n &&
                    ((K = -J), (Z += O.yOffset + (U ? 1 : 0)), (U = !1)),
                  (I = (E = D.shapes ? D.shapes[0].it : []).length),
                  H.scale(O.finalSize / 100, O.finalSize / 100),
                  X && this.applyTextPropertiesToMatrix(O, H, Y[u].line, K, Z),
                  (R = createSizedArray(I - 1));
                var $ = 0;
                for (F = 0; F < I; F += 1)
                  if ('sh' === E[F].ty) {
                    for (
                      T = 1, M = E[F].ks.k.i.length, L = E[F].ks.k, V = [];
                      T < M;
                      T += 1
                    )
                      1 === T &&
                        V.push(
                          H.applyToX(L.v[0][0], L.v[0][1], 0),
                          H.applyToY(L.v[0][0], L.v[0][1], 0)
                        ),
                        V.push(
                          H.applyToX(L.o[T - 1][0], L.o[T - 1][1], 0),
                          H.applyToY(L.o[T - 1][0], L.o[T - 1][1], 0),
                          H.applyToX(L.i[T][0], L.i[T][1], 0),
                          H.applyToY(L.i[T][0], L.i[T][1], 0),
                          H.applyToX(L.v[T][0], L.v[T][1], 0),
                          H.applyToY(L.v[T][0], L.v[T][1], 0)
                        );
                    V.push(
                      H.applyToX(L.o[T - 1][0], L.o[T - 1][1], 0),
                      H.applyToY(L.o[T - 1][0], L.o[T - 1][1], 0),
                      H.applyToX(L.i[0][0], L.i[0][1], 0),
                      H.applyToY(L.i[0][0], L.i[0][1], 0),
                      H.applyToX(L.v[0][0], L.v[0][1], 0),
                      H.applyToY(L.v[0][0], L.v[0][1], 0)
                    ),
                      (R[$] = V),
                      ($ += 1);
                  }
                X && (K += Y[u].l + J),
                  this.textSpans[Q]
                    ? (this.textSpans[Q].elem = R)
                    : (this.textSpans[Q] = { elem: R }),
                  (Q += 1);
              }
            }),
            (CVTextElement.prototype.renderInnerContent = function () {
              this.validateText(),
                (this.canvasContext.font = this.values.fValue),
                this.globalData.renderer.ctxLineCap('butt'),
                this.globalData.renderer.ctxLineJoin('miter'),
                this.globalData.renderer.ctxMiterLimit(4),
                this.data.singleShape ||
                  this.textAnimator.getMeasures(
                    this.textProperty.currentData,
                    this.lettersChangedFlag
                  );
              var u,
                P,
                S,
                D,
                T,
                M,
                E,
                F,
                I,
                L = this.textAnimator.renderedLetters,
                R = this.textProperty.currentData.l;
              P = R.length;
              var V = null,
                O = null,
                N = null,
                G = this.globalData.renderer;
              for (u = 0; u < P; u += 1)
                if (!R[u].n) {
                  if (
                    ((E = L[u]) &&
                      (G.save(), G.ctxTransform(E.p), G.ctxOpacity(E.o)),
                    this.fill)
                  ) {
                    for (
                      E && E.fc
                        ? V !== E.fc && (G.ctxFillStyle(E.fc), (V = E.fc))
                        : V !== this.values.fill &&
                          ((V = this.values.fill),
                          G.ctxFillStyle(this.values.fill)),
                        D = (F = this.textSpans[u].elem).length,
                        this.globalData.canvasContext.beginPath(),
                        S = 0;
                      S < D;
                      S += 1
                    )
                      for (
                        M = (I = F[S]).length,
                          this.globalData.canvasContext.moveTo(I[0], I[1]),
                          T = 2;
                        T < M;
                        T += 6
                      )
                        this.globalData.canvasContext.bezierCurveTo(
                          I[T],
                          I[T + 1],
                          I[T + 2],
                          I[T + 3],
                          I[T + 4],
                          I[T + 5]
                        );
                    this.globalData.canvasContext.closePath(), G.ctxFill();
                  }
                  if (this.stroke) {
                    for (
                      E && E.sw
                        ? N !== E.sw && ((N = E.sw), G.ctxLineWidth(E.sw))
                        : N !== this.values.sWidth &&
                          ((N = this.values.sWidth),
                          G.ctxLineWidth(this.values.sWidth)),
                        E && E.sc
                          ? O !== E.sc && ((O = E.sc), G.ctxStrokeStyle(E.sc))
                          : O !== this.values.stroke &&
                            ((O = this.values.stroke),
                            G.ctxStrokeStyle(this.values.stroke)),
                        D = (F = this.textSpans[u].elem).length,
                        this.globalData.canvasContext.beginPath(),
                        S = 0;
                      S < D;
                      S += 1
                    )
                      for (
                        M = (I = F[S]).length,
                          this.globalData.canvasContext.moveTo(I[0], I[1]),
                          T = 2;
                        T < M;
                        T += 6
                      )
                        this.globalData.canvasContext.bezierCurveTo(
                          I[T],
                          I[T + 1],
                          I[T + 2],
                          I[T + 3],
                          I[T + 4],
                          I[T + 5]
                        );
                    this.globalData.canvasContext.closePath(), G.ctxStroke();
                  }
                  E && this.globalData.renderer.restore();
                }
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                CVBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
              ],
              CVImageElement
            ),
            (CVImageElement.prototype.initElement =
              SVGShapeElement.prototype.initElement),
            (CVImageElement.prototype.prepareFrame =
              IImageElement.prototype.prepareFrame),
            (CVImageElement.prototype.createContent = function () {
              if (
                this.img.width &&
                (this.assetData.w !== this.img.width ||
                  this.assetData.h !== this.img.height)
              ) {
                var u,
                  P,
                  S = createTag('canvas');
                (S.width = this.assetData.w), (S.height = this.assetData.h);
                var D = S.getContext('2d'),
                  T = this.img.width,
                  M = this.img.height,
                  E = T / M,
                  F = this.assetData.w / this.assetData.h,
                  I =
                    this.assetData.pr ||
                    this.globalData.renderConfig.imagePreserveAspectRatio;
                (E > F && 'xMidYMid slice' === I) ||
                (E < F && 'xMidYMid slice' !== I)
                  ? (u = (P = M) * F)
                  : (P = (u = T) / F),
                  D.drawImage(
                    this.img,
                    (T - u) / 2,
                    (M - P) / 2,
                    u,
                    P,
                    0,
                    0,
                    this.assetData.w,
                    this.assetData.h
                  ),
                  (this.img = S);
              }
            }),
            (CVImageElement.prototype.renderInnerContent = function () {
              this.canvasContext.drawImage(this.img, 0, 0);
            }),
            (CVImageElement.prototype.destroy = function () {
              this.img = null;
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                CVBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
              ],
              CVSolidElement
            ),
            (CVSolidElement.prototype.initElement =
              SVGShapeElement.prototype.initElement),
            (CVSolidElement.prototype.prepareFrame =
              IImageElement.prototype.prepareFrame),
            (CVSolidElement.prototype.renderInnerContent = function () {
              this.globalData.renderer.ctxFillStyle(this.data.sc),
                this.globalData.renderer.ctxFillRect(
                  0,
                  0,
                  this.data.sw,
                  this.data.sh
                );
            }),
            extendPrototype([BaseRenderer], CanvasRendererBase),
            (CanvasRendererBase.prototype.createShape = function (u) {
              return new CVShapeElement(u, this.globalData, this);
            }),
            (CanvasRendererBase.prototype.createText = function (u) {
              return new CVTextElement(u, this.globalData, this);
            }),
            (CanvasRendererBase.prototype.createImage = function (u) {
              return new CVImageElement(u, this.globalData, this);
            }),
            (CanvasRendererBase.prototype.createSolid = function (u) {
              return new CVSolidElement(u, this.globalData, this);
            }),
            (CanvasRendererBase.prototype.createNull =
              SVGRenderer.prototype.createNull),
            (CanvasRendererBase.prototype.ctxTransform = function (u) {
              (1 !== u[0] ||
                0 !== u[1] ||
                0 !== u[4] ||
                1 !== u[5] ||
                0 !== u[12] ||
                0 !== u[13]) &&
                this.canvasContext.transform(
                  u[0],
                  u[1],
                  u[4],
                  u[5],
                  u[12],
                  u[13]
                );
            }),
            (CanvasRendererBase.prototype.ctxOpacity = function (u) {
              this.canvasContext.globalAlpha *= u < 0 ? 0 : u;
            }),
            (CanvasRendererBase.prototype.ctxFillStyle = function (u) {
              this.canvasContext.fillStyle = u;
            }),
            (CanvasRendererBase.prototype.ctxStrokeStyle = function (u) {
              this.canvasContext.strokeStyle = u;
            }),
            (CanvasRendererBase.prototype.ctxLineWidth = function (u) {
              this.canvasContext.lineWidth = u;
            }),
            (CanvasRendererBase.prototype.ctxLineCap = function (u) {
              this.canvasContext.lineCap = u;
            }),
            (CanvasRendererBase.prototype.ctxLineJoin = function (u) {
              this.canvasContext.lineJoin = u;
            }),
            (CanvasRendererBase.prototype.ctxMiterLimit = function (u) {
              this.canvasContext.miterLimit = u;
            }),
            (CanvasRendererBase.prototype.ctxFill = function (u) {
              this.canvasContext.fill(u);
            }),
            (CanvasRendererBase.prototype.ctxFillRect = function (u, P, S, D) {
              this.canvasContext.fillRect(u, P, S, D);
            }),
            (CanvasRendererBase.prototype.ctxStroke = function () {
              this.canvasContext.stroke();
            }),
            (CanvasRendererBase.prototype.reset = function () {
              if (!this.renderConfig.clearCanvas) {
                this.canvasContext.restore();
                return;
              }
              this.contextData.reset();
            }),
            (CanvasRendererBase.prototype.save = function () {
              this.canvasContext.save();
            }),
            (CanvasRendererBase.prototype.restore = function (u) {
              if (!this.renderConfig.clearCanvas) {
                this.canvasContext.restore();
                return;
              }
              u && (this.globalData.blendMode = 'source-over'),
                this.contextData.restore(u);
            }),
            (CanvasRendererBase.prototype.configAnimation = function (u) {
              if (this.animationItem.wrapper) {
                this.animationItem.container = createTag('canvas');
                var P = this.animationItem.container.style;
                (P.width = '100%'), (P.height = '100%');
                var S = '0px 0px 0px';
                (P.transformOrigin = S),
                  (P.mozTransformOrigin = S),
                  (P.webkitTransformOrigin = S),
                  (P['-webkit-transform'] = S),
                  (P.contentVisibility = this.renderConfig.contentVisibility),
                  this.animationItem.wrapper.appendChild(
                    this.animationItem.container
                  ),
                  (this.canvasContext =
                    this.animationItem.container.getContext('2d')),
                  this.renderConfig.className &&
                    this.animationItem.container.setAttribute(
                      'class',
                      this.renderConfig.className
                    ),
                  this.renderConfig.id &&
                    this.animationItem.container.setAttribute(
                      'id',
                      this.renderConfig.id
                    );
              } else this.canvasContext = this.renderConfig.context;
              this.contextData.setContext(this.canvasContext),
                (this.data = u),
                (this.layers = u.layers),
                (this.transformCanvas = {
                  w: u.w,
                  h: u.h,
                  sx: 0,
                  sy: 0,
                  tx: 0,
                  ty: 0,
                }),
                this.setupGlobalData(u, document.body),
                (this.globalData.canvasContext = this.canvasContext),
                (this.globalData.renderer = this),
                (this.globalData.isDashed = !1),
                (this.globalData.progressiveLoad =
                  this.renderConfig.progressiveLoad),
                (this.globalData.transformCanvas = this.transformCanvas),
                (this.elements = createSizedArray(u.layers.length)),
                this.updateContainerSize();
            }),
            (CanvasRendererBase.prototype.updateContainerSize = function (
              u,
              P
            ) {
              if (
                (this.reset(),
                u
                  ? ((S = u),
                    (D = P),
                    (this.canvasContext.canvas.width = S),
                    (this.canvasContext.canvas.height = D))
                  : (this.animationItem.wrapper && this.animationItem.container
                      ? ((S = this.animationItem.wrapper.offsetWidth),
                        (D = this.animationItem.wrapper.offsetHeight))
                      : ((S = this.canvasContext.canvas.width),
                        (D = this.canvasContext.canvas.height)),
                    (this.canvasContext.canvas.width =
                      S * this.renderConfig.dpr),
                    (this.canvasContext.canvas.height =
                      D * this.renderConfig.dpr)),
                -1 !== this.renderConfig.preserveAspectRatio.indexOf('meet') ||
                  -1 !== this.renderConfig.preserveAspectRatio.indexOf('slice'))
              ) {
                var S,
                  D,
                  T,
                  M,
                  E = this.renderConfig.preserveAspectRatio.split(' '),
                  F = E[1] || 'meet',
                  I = E[0] || 'xMidYMid',
                  L = I.substr(0, 4),
                  R = I.substr(4);
                (T = S / D),
                  ((M = this.transformCanvas.w / this.transformCanvas.h) > T &&
                    'meet' === F) ||
                  (M < T && 'slice' === F)
                    ? ((this.transformCanvas.sx =
                        S / (this.transformCanvas.w / this.renderConfig.dpr)),
                      (this.transformCanvas.sy =
                        S / (this.transformCanvas.w / this.renderConfig.dpr)))
                    : ((this.transformCanvas.sx =
                        D / (this.transformCanvas.h / this.renderConfig.dpr)),
                      (this.transformCanvas.sy =
                        D / (this.transformCanvas.h / this.renderConfig.dpr))),
                  'xMid' === L &&
                  ((M < T && 'meet' === F) || (M > T && 'slice' === F))
                    ? (this.transformCanvas.tx =
                        ((S -
                          this.transformCanvas.w *
                            (D / this.transformCanvas.h)) /
                          2) *
                        this.renderConfig.dpr)
                    : 'xMax' === L &&
                      ((M < T && 'meet' === F) || (M > T && 'slice' === F))
                    ? (this.transformCanvas.tx =
                        (S -
                          this.transformCanvas.w *
                            (D / this.transformCanvas.h)) *
                        this.renderConfig.dpr)
                    : (this.transformCanvas.tx = 0),
                  'YMid' === R &&
                  ((M > T && 'meet' === F) || (M < T && 'slice' === F))
                    ? (this.transformCanvas.ty =
                        ((D -
                          this.transformCanvas.h *
                            (S / this.transformCanvas.w)) /
                          2) *
                        this.renderConfig.dpr)
                    : 'YMax' === R &&
                      ((M > T && 'meet' === F) || (M < T && 'slice' === F))
                    ? (this.transformCanvas.ty =
                        (D -
                          this.transformCanvas.h *
                            (S / this.transformCanvas.w)) *
                        this.renderConfig.dpr)
                    : (this.transformCanvas.ty = 0);
              } else
                'none' === this.renderConfig.preserveAspectRatio
                  ? ((this.transformCanvas.sx =
                      S / (this.transformCanvas.w / this.renderConfig.dpr)),
                    (this.transformCanvas.sy =
                      D / (this.transformCanvas.h / this.renderConfig.dpr)),
                    (this.transformCanvas.tx = 0),
                    (this.transformCanvas.ty = 0))
                  : ((this.transformCanvas.sx = this.renderConfig.dpr),
                    (this.transformCanvas.sy = this.renderConfig.dpr),
                    (this.transformCanvas.tx = 0),
                    (this.transformCanvas.ty = 0));
              (this.transformCanvas.props = [
                this.transformCanvas.sx,
                0,
                0,
                0,
                0,
                this.transformCanvas.sy,
                0,
                0,
                0,
                0,
                1,
                0,
                this.transformCanvas.tx,
                this.transformCanvas.ty,
                0,
                1,
              ]),
                this.ctxTransform(this.transformCanvas.props),
                this.canvasContext.beginPath(),
                this.canvasContext.rect(
                  0,
                  0,
                  this.transformCanvas.w,
                  this.transformCanvas.h
                ),
                this.canvasContext.closePath(),
                this.canvasContext.clip(),
                this.renderFrame(this.renderedFrame, !0);
            }),
            (CanvasRendererBase.prototype.destroy = function () {
              var u;
              for (
                this.renderConfig.clearCanvas &&
                  this.animationItem.wrapper &&
                  (this.animationItem.wrapper.innerText = ''),
                  u = (this.layers ? this.layers.length : 0) - 1;
                u >= 0;
                u -= 1
              )
                this.elements[u] &&
                  this.elements[u].destroy &&
                  this.elements[u].destroy();
              (this.elements.length = 0),
                (this.globalData.canvasContext = null),
                (this.animationItem.container = null),
                (this.destroyed = !0);
            }),
            (CanvasRendererBase.prototype.renderFrame = function (u, P) {
              if (
                (this.renderedFrame !== u ||
                  !0 !== this.renderConfig.clearCanvas ||
                  P) &&
                !this.destroyed &&
                -1 !== u
              ) {
                (this.renderedFrame = u),
                  (this.globalData.frameNum =
                    u - this.animationItem._isFirstFrame),
                  (this.globalData.frameId += 1),
                  (this.globalData._mdf = !this.renderConfig.clearCanvas || P),
                  (this.globalData.projectInterface.currentFrame = u);
                var S,
                  D = this.layers.length;
                for (
                  this.completeLayers || this.checkLayers(u), S = D - 1;
                  S >= 0;
                  S -= 1
                )
                  (this.completeLayers || this.elements[S]) &&
                    this.elements[S].prepareFrame(u - this.layers[S].st);
                if (this.globalData._mdf) {
                  for (
                    !0 === this.renderConfig.clearCanvas
                      ? this.canvasContext.clearRect(
                          0,
                          0,
                          this.transformCanvas.w,
                          this.transformCanvas.h
                        )
                      : this.save(),
                      S = D - 1;
                    S >= 0;
                    S -= 1
                  )
                    (this.completeLayers || this.elements[S]) &&
                      this.elements[S].renderFrame();
                  !0 !== this.renderConfig.clearCanvas && this.restore();
                }
              }
            }),
            (CanvasRendererBase.prototype.buildItem = function (u) {
              var P = this.elements;
              if (!P[u] && 99 !== this.layers[u].ty) {
                var S = this.createItem(this.layers[u], this, this.globalData);
                (P[u] = S), S.initExpressions();
              }
            }),
            (CanvasRendererBase.prototype.checkPendingElements = function () {
              for (; this.pendingElements.length; )
                this.pendingElements.pop().checkParenting();
            }),
            (CanvasRendererBase.prototype.hide = function () {
              this.animationItem.container.style.display = 'none';
            }),
            (CanvasRendererBase.prototype.show = function () {
              this.animationItem.container.style.display = 'block';
            }),
            (CVContextData.prototype.duplicate = function () {
              var u = 2 * this._length,
                P = 0;
              for (P = this._length; P < u; P += 1)
                this.stack[P] = new CanvasContext();
              this._length = u;
            }),
            (CVContextData.prototype.reset = function () {
              (this.cArrPos = 0),
                this.cTr.reset(),
                (this.stack[this.cArrPos].opacity = 1);
            }),
            (CVContextData.prototype.restore = function (u) {
              this.cArrPos -= 1;
              var P,
                S = this.stack[this.cArrPos],
                D = S.transform,
                T = this.cTr.props;
              for (P = 0; P < 16; P += 1) T[P] = D[P];
              if (u) {
                this.nativeContext.restore();
                var M = this.stack[this.cArrPos + 1];
                (this.appliedFillStyle = M.fillStyle),
                  (this.appliedStrokeStyle = M.strokeStyle),
                  (this.appliedLineWidth = M.lineWidth),
                  (this.appliedLineCap = M.lineCap),
                  (this.appliedLineJoin = M.lineJoin),
                  (this.appliedMiterLimit = M.miterLimit);
              }
              this.nativeContext.setTransform(
                D[0],
                D[1],
                D[4],
                D[5],
                D[12],
                D[13]
              ),
                (u ||
                  (-1 !== S.opacity && this.currentOpacity !== S.opacity)) &&
                  ((this.nativeContext.globalAlpha = S.opacity),
                  (this.currentOpacity = S.opacity)),
                (this.currentFillStyle = S.fillStyle),
                (this.currentStrokeStyle = S.strokeStyle),
                (this.currentLineWidth = S.lineWidth),
                (this.currentLineCap = S.lineCap),
                (this.currentLineJoin = S.lineJoin),
                (this.currentMiterLimit = S.miterLimit);
            }),
            (CVContextData.prototype.save = function (u) {
              u && this.nativeContext.save();
              var P,
                S = this.cTr.props;
              this._length <= this.cArrPos && this.duplicate();
              var D = this.stack[this.cArrPos];
              for (P = 0; P < 16; P += 1) D.transform[P] = S[P];
              this.cArrPos += 1;
              var T = this.stack[this.cArrPos];
              (T.opacity = D.opacity),
                (T.fillStyle = D.fillStyle),
                (T.strokeStyle = D.strokeStyle),
                (T.lineWidth = D.lineWidth),
                (T.lineCap = D.lineCap),
                (T.lineJoin = D.lineJoin),
                (T.miterLimit = D.miterLimit);
            }),
            (CVContextData.prototype.setOpacity = function (u) {
              this.stack[this.cArrPos].opacity = u;
            }),
            (CVContextData.prototype.setContext = function (u) {
              this.nativeContext = u;
            }),
            (CVContextData.prototype.fillStyle = function (u) {
              this.stack[this.cArrPos].fillStyle !== u &&
                ((this.currentFillStyle = u),
                (this.stack[this.cArrPos].fillStyle = u));
            }),
            (CVContextData.prototype.strokeStyle = function (u) {
              this.stack[this.cArrPos].strokeStyle !== u &&
                ((this.currentStrokeStyle = u),
                (this.stack[this.cArrPos].strokeStyle = u));
            }),
            (CVContextData.prototype.lineWidth = function (u) {
              this.stack[this.cArrPos].lineWidth !== u &&
                ((this.currentLineWidth = u),
                (this.stack[this.cArrPos].lineWidth = u));
            }),
            (CVContextData.prototype.lineCap = function (u) {
              this.stack[this.cArrPos].lineCap !== u &&
                ((this.currentLineCap = u),
                (this.stack[this.cArrPos].lineCap = u));
            }),
            (CVContextData.prototype.lineJoin = function (u) {
              this.stack[this.cArrPos].lineJoin !== u &&
                ((this.currentLineJoin = u),
                (this.stack[this.cArrPos].lineJoin = u));
            }),
            (CVContextData.prototype.miterLimit = function (u) {
              this.stack[this.cArrPos].miterLimit !== u &&
                ((this.currentMiterLimit = u),
                (this.stack[this.cArrPos].miterLimit = u));
            }),
            (CVContextData.prototype.transform = function (u) {
              this.transformMat.cloneFromProps(u);
              var P = this.cTr;
              this.transformMat.multiply(P),
                P.cloneFromProps(this.transformMat.props);
              var S = P.props;
              this.nativeContext.setTransform(
                S[0],
                S[1],
                S[4],
                S[5],
                S[12],
                S[13]
              );
            }),
            (CVContextData.prototype.opacity = function (u) {
              var P = this.stack[this.cArrPos].opacity;
              (P *= u < 0 ? 0 : u),
                this.stack[this.cArrPos].opacity !== P &&
                  (this.currentOpacity !== u &&
                    ((this.nativeContext.globalAlpha = u),
                    (this.currentOpacity = u)),
                  (this.stack[this.cArrPos].opacity = P));
            }),
            (CVContextData.prototype.fill = function (u) {
              this.appliedFillStyle !== this.currentFillStyle &&
                ((this.appliedFillStyle = this.currentFillStyle),
                (this.nativeContext.fillStyle = this.appliedFillStyle)),
                this.nativeContext.fill(u);
            }),
            (CVContextData.prototype.fillRect = function (u, P, S, D) {
              this.appliedFillStyle !== this.currentFillStyle &&
                ((this.appliedFillStyle = this.currentFillStyle),
                (this.nativeContext.fillStyle = this.appliedFillStyle)),
                this.nativeContext.fillRect(u, P, S, D);
            }),
            (CVContextData.prototype.stroke = function () {
              this.appliedStrokeStyle !== this.currentStrokeStyle &&
                ((this.appliedStrokeStyle = this.currentStrokeStyle),
                (this.nativeContext.strokeStyle = this.appliedStrokeStyle)),
                this.appliedLineWidth !== this.currentLineWidth &&
                  ((this.appliedLineWidth = this.currentLineWidth),
                  (this.nativeContext.lineWidth = this.appliedLineWidth)),
                this.appliedLineCap !== this.currentLineCap &&
                  ((this.appliedLineCap = this.currentLineCap),
                  (this.nativeContext.lineCap = this.appliedLineCap)),
                this.appliedLineJoin !== this.currentLineJoin &&
                  ((this.appliedLineJoin = this.currentLineJoin),
                  (this.nativeContext.lineJoin = this.appliedLineJoin)),
                this.appliedMiterLimit !== this.currentMiterLimit &&
                  ((this.appliedMiterLimit = this.currentMiterLimit),
                  (this.nativeContext.miterLimit = this.appliedMiterLimit)),
                this.nativeContext.stroke();
            }),
            extendPrototype(
              [CanvasRendererBase, ICompElement, CVBaseElement],
              CVCompElement
            ),
            (CVCompElement.prototype.renderInnerContent = function () {
              var u,
                P = this.canvasContext;
              for (
                P.beginPath(),
                  P.moveTo(0, 0),
                  P.lineTo(this.data.w, 0),
                  P.lineTo(this.data.w, this.data.h),
                  P.lineTo(0, this.data.h),
                  P.lineTo(0, 0),
                  P.clip(),
                  u = this.layers.length - 1;
                u >= 0;
                u -= 1
              )
                (this.completeLayers || this.elements[u]) &&
                  this.elements[u].renderFrame();
            }),
            (CVCompElement.prototype.destroy = function () {
              var u;
              for (u = this.layers.length - 1; u >= 0; u -= 1)
                this.elements[u] && this.elements[u].destroy();
              (this.layers = null), (this.elements = null);
            }),
            (CVCompElement.prototype.createComp = function (u) {
              return new CVCompElement(u, this.globalData, this);
            }),
            extendPrototype([CanvasRendererBase], CanvasRenderer),
            (CanvasRenderer.prototype.createComp = function (u) {
              return new CVCompElement(u, this.globalData, this);
            }),
            (HBaseElement.prototype = {
              checkBlendMode: function () {},
              initRendererElement: function () {
                (this.baseElement = createTag(this.data.tg || 'div')),
                  this.data.hasMask
                    ? ((this.svgElement = createNS('svg')),
                      (this.layerElement = createNS('g')),
                      (this.maskedElement = this.layerElement),
                      this.svgElement.appendChild(this.layerElement),
                      this.baseElement.appendChild(this.svgElement))
                    : (this.layerElement = this.baseElement),
                  styleDiv(this.baseElement);
              },
              createContainerElements: function () {
                (this.renderableEffectsManager = new CVEffects(this)),
                  (this.transformedElement = this.baseElement),
                  (this.maskedElement = this.layerElement),
                  this.data.ln &&
                    this.layerElement.setAttribute('id', this.data.ln),
                  this.data.cl &&
                    this.layerElement.setAttribute('class', this.data.cl),
                  0 !== this.data.bm && this.setBlendMode();
              },
              renderElement: function () {
                var u = this.transformedElement
                  ? this.transformedElement.style
                  : {};
                if (this.finalTransform._matMdf) {
                  var P = this.finalTransform.mat.toCSS();
                  (u.transform = P), (u.webkitTransform = P);
                }
                this.finalTransform._opMdf &&
                  (u.opacity = this.finalTransform.mProp.o.v);
              },
              renderFrame: function () {
                this.data.hd ||
                  this.hidden ||
                  (this.renderTransform(),
                  this.renderRenderable(),
                  this.renderElement(),
                  this.renderInnerContent(),
                  this._isFirstFrame && (this._isFirstFrame = !1));
              },
              destroy: function () {
                (this.layerElement = null),
                  (this.transformedElement = null),
                  this.matteElement && (this.matteElement = null),
                  this.maskManager &&
                    (this.maskManager.destroy(), (this.maskManager = null));
              },
              createRenderableComponents: function () {
                this.maskManager = new MaskElement(
                  this.data,
                  this,
                  this.globalData
                );
              },
              addEffects: function () {},
              setMatte: function () {},
            }),
            (HBaseElement.prototype.getBaseElement =
              SVGBaseElement.prototype.getBaseElement),
            (HBaseElement.prototype.destroyBaseElement =
              HBaseElement.prototype.destroy),
            (HBaseElement.prototype.buildElementParenting =
              BaseRenderer.prototype.buildElementParenting),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                HBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableDOMElement,
              ],
              HSolidElement
            ),
            (HSolidElement.prototype.createContent = function () {
              var u;
              this.data.hasMask
                ? ((u = createNS('rect')).setAttribute('width', this.data.sw),
                  u.setAttribute('height', this.data.sh),
                  u.setAttribute('fill', this.data.sc),
                  this.svgElement.setAttribute('width', this.data.sw),
                  this.svgElement.setAttribute('height', this.data.sh))
                : (((u = createTag('div')).style.width = this.data.sw + 'px'),
                  (u.style.height = this.data.sh + 'px'),
                  (u.style.backgroundColor = this.data.sc)),
                this.layerElement.appendChild(u);
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                HSolidElement,
                SVGShapeElement,
                HBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
              ],
              HShapeElement
            ),
            (HShapeElement.prototype._renderShapeFrame =
              HShapeElement.prototype.renderInnerContent),
            (HShapeElement.prototype.createContent = function () {
              var u;
              if (((this.baseElement.style.fontSize = 0), this.data.hasMask))
                this.layerElement.appendChild(this.shapesContainer),
                  (u = this.svgElement);
              else {
                u = createNS('svg');
                var P = this.comp.data
                  ? this.comp.data
                  : this.globalData.compSize;
                u.setAttribute('width', P.w),
                  u.setAttribute('height', P.h),
                  u.appendChild(this.shapesContainer),
                  this.layerElement.appendChild(u);
              }
              this.searchShapes(
                this.shapesData,
                this.itemsData,
                this.prevViewData,
                this.shapesContainer,
                0,
                [],
                !0
              ),
                this.filterUniqueShapes(),
                (this.shapeCont = u);
            }),
            (HShapeElement.prototype.getTransformedPoint = function (u, P) {
              var S,
                D = u.length;
              for (S = 0; S < D; S += 1)
                P = u[S].mProps.v.applyToPointArray(P[0], P[1], 0);
              return P;
            }),
            (HShapeElement.prototype.calculateShapeBoundingBox = function (
              u,
              P
            ) {
              var S,
                D,
                T,
                M,
                E,
                F = u.sh.v,
                I = u.transformers,
                L = F._length;
              if (!(L <= 1)) {
                for (S = 0; S < L - 1; S += 1)
                  (D = this.getTransformedPoint(I, F.v[S])),
                    (T = this.getTransformedPoint(I, F.o[S])),
                    (M = this.getTransformedPoint(I, F.i[S + 1])),
                    (E = this.getTransformedPoint(I, F.v[S + 1])),
                    this.checkBounds(D, T, M, E, P);
                F.c &&
                  ((D = this.getTransformedPoint(I, F.v[S])),
                  (T = this.getTransformedPoint(I, F.o[S])),
                  (M = this.getTransformedPoint(I, F.i[0])),
                  (E = this.getTransformedPoint(I, F.v[0])),
                  this.checkBounds(D, T, M, E, P));
              }
            }),
            (HShapeElement.prototype.checkBounds = function (u, P, S, D, T) {
              this.getBoundsOfCurve(u, P, S, D);
              var M = this.shapeBoundingBox;
              (T.x = bmMin(M.left, T.x)),
                (T.xMax = bmMax(M.right, T.xMax)),
                (T.y = bmMin(M.top, T.y)),
                (T.yMax = bmMax(M.bottom, T.yMax));
            }),
            (HShapeElement.prototype.shapeBoundingBox = {
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }),
            (HShapeElement.prototype.tempBoundingBox = {
              x: 0,
              xMax: 0,
              y: 0,
              yMax: 0,
              width: 0,
              height: 0,
            }),
            (HShapeElement.prototype.getBoundsOfCurve = function (u, P, S, D) {
              for (
                var T,
                  M,
                  E,
                  F,
                  I,
                  L,
                  R,
                  V = [
                    [u[0], D[0]],
                    [u[1], D[1]],
                  ],
                  O = 0;
                O < 2;
                ++O
              )
                (M = 6 * u[O] - 12 * P[O] + 6 * S[O]),
                  (T = -3 * u[O] + 9 * P[O] - 9 * S[O] + 3 * D[O]),
                  (E = 3 * P[O] - 3 * u[O]),
                  (M |= 0),
                  (E |= 0),
                  (0 == (T |= 0) && 0 === M) ||
                    (0 === T
                      ? (F = -E / M) > 0 &&
                        F < 1 &&
                        V[O].push(this.calculateF(F, u, P, S, D, O))
                      : (I = M * M - 4 * E * T) >= 0 &&
                        ((L = (-M + bmSqrt(I)) / (2 * T)) > 0 &&
                          L < 1 &&
                          V[O].push(this.calculateF(L, u, P, S, D, O)),
                        (R = (-M - bmSqrt(I)) / (2 * T)) > 0 &&
                          R < 1 &&
                          V[O].push(this.calculateF(R, u, P, S, D, O))));
              (this.shapeBoundingBox.left = bmMin.apply(null, V[0])),
                (this.shapeBoundingBox.top = bmMin.apply(null, V[1])),
                (this.shapeBoundingBox.right = bmMax.apply(null, V[0])),
                (this.shapeBoundingBox.bottom = bmMax.apply(null, V[1]));
            }),
            (HShapeElement.prototype.calculateF = function (u, P, S, D, T, M) {
              return (
                bmPow(1 - u, 3) * P[M] +
                3 * bmPow(1 - u, 2) * u * S[M] +
                3 * (1 - u) * bmPow(u, 2) * D[M] +
                bmPow(u, 3) * T[M]
              );
            }),
            (HShapeElement.prototype.calculateBoundingBox = function (u, P) {
              var S,
                D = u.length;
              for (S = 0; S < D; S += 1)
                u[S] && u[S].sh
                  ? this.calculateShapeBoundingBox(u[S], P)
                  : u[S] && u[S].it
                  ? this.calculateBoundingBox(u[S].it, P)
                  : u[S] &&
                    u[S].style &&
                    u[S].w &&
                    this.expandStrokeBoundingBox(u[S].w, P);
            }),
            (HShapeElement.prototype.expandStrokeBoundingBox = function (u, P) {
              var S = 0;
              if (u.keyframes) {
                for (var D = 0; D < u.keyframes.length; D += 1) {
                  var T = u.keyframes[D].s;
                  T > S && (S = T);
                }
                S *= u.mult;
              } else S = u.v * u.mult;
              (P.x -= S), (P.xMax += S), (P.y -= S), (P.yMax += S);
            }),
            (HShapeElement.prototype.currentBoxContains = function (u) {
              return (
                this.currentBBox.x <= u.x &&
                this.currentBBox.y <= u.y &&
                this.currentBBox.width + this.currentBBox.x >= u.x + u.width &&
                this.currentBBox.height + this.currentBBox.y >= u.y + u.height
              );
            }),
            (HShapeElement.prototype.renderInnerContent = function () {
              if (
                (this._renderShapeFrame(),
                !this.hidden && (this._isFirstFrame || this._mdf))
              ) {
                var u = this.tempBoundingBox,
                  P = 999999;
                if (
                  ((u.x = P),
                  (u.xMax = -P),
                  (u.y = P),
                  (u.yMax = -P),
                  this.calculateBoundingBox(this.itemsData, u),
                  (u.width = u.xMax < u.x ? 0 : u.xMax - u.x),
                  (u.height = u.yMax < u.y ? 0 : u.yMax - u.y),
                  !this.currentBoxContains(u))
                ) {
                  var S = !1;
                  if (
                    (this.currentBBox.w !== u.width &&
                      ((this.currentBBox.w = u.width),
                      this.shapeCont.setAttribute('width', u.width),
                      (S = !0)),
                    this.currentBBox.h !== u.height &&
                      ((this.currentBBox.h = u.height),
                      this.shapeCont.setAttribute('height', u.height),
                      (S = !0)),
                    S ||
                      this.currentBBox.x !== u.x ||
                      this.currentBBox.y !== u.y)
                  ) {
                    (this.currentBBox.w = u.width),
                      (this.currentBBox.h = u.height),
                      (this.currentBBox.x = u.x),
                      (this.currentBBox.y = u.y),
                      this.shapeCont.setAttribute(
                        'viewBox',
                        this.currentBBox.x +
                          ' ' +
                          this.currentBBox.y +
                          ' ' +
                          this.currentBBox.w +
                          ' ' +
                          this.currentBBox.h
                      );
                    var D = this.shapeCont.style,
                      T =
                        'translate(' +
                        this.currentBBox.x +
                        'px,' +
                        this.currentBBox.y +
                        'px)';
                    (D.transform = T), (D.webkitTransform = T);
                  }
                }
              }
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                HBaseElement,
                HierarchyElement,
                FrameElement,
                RenderableDOMElement,
                ITextElement,
              ],
              HTextElement
            ),
            (HTextElement.prototype.createContent = function () {
              if (((this.isMasked = this.checkMasks()), this.isMasked)) {
                (this.renderType = 'svg'),
                  (this.compW = this.comp.data.w),
                  (this.compH = this.comp.data.h),
                  this.svgElement.setAttribute('width', this.compW),
                  this.svgElement.setAttribute('height', this.compH);
                var u = createNS('g');
                this.maskedElement.appendChild(u), (this.innerElem = u);
              } else
                (this.renderType = 'html'),
                  (this.innerElem = this.layerElement);
              this.checkParenting();
            }),
            (HTextElement.prototype.buildNewText = function () {
              var u = this.textProperty.currentData;
              this.renderedLetters = createSizedArray(u.l ? u.l.length : 0);
              var P = this.innerElem.style,
                S = u.fc ? this.buildColor(u.fc) : 'rgba(0,0,0,0)';
              (P.fill = S),
                (P.color = S),
                u.sc &&
                  ((P.stroke = this.buildColor(u.sc)),
                  (P.strokeWidth = u.sw + 'px'));
              var D = this.globalData.fontManager.getFontByName(u.f);
              if (!this.globalData.fontManager.chars) {
                if (
                  ((P.fontSize = u.finalSize + 'px'),
                  (P.lineHeight = u.finalSize + 'px'),
                  D.fClass)
                )
                  this.innerElem.className = D.fClass;
                else {
                  P.fontFamily = D.fFamily;
                  var T = u.fWeight,
                    M = u.fStyle;
                  (P.fontStyle = M), (P.fontWeight = T);
                }
              }
              var E = u.l;
              V = E.length;
              var F = this.mHelper,
                I = '',
                L = 0;
              for (R = 0; R < V; R += 1) {
                if (
                  (this.globalData.fontManager.chars
                    ? (this.textPaths[L]
                        ? (O = this.textPaths[L])
                        : ((O = createNS('path')).setAttribute(
                            'stroke-linecap',
                            lineCapEnum[1]
                          ),
                          O.setAttribute('stroke-linejoin', lineJoinEnum[2]),
                          O.setAttribute('stroke-miterlimit', '4')),
                      this.isMasked ||
                        (this.textSpans[L]
                          ? (G = (N = this.textSpans[L]).children[0])
                          : (((N = createTag('div')).style.lineHeight = 0),
                            (G = createNS('svg')).appendChild(O),
                            styleDiv(N))))
                    : this.isMasked
                    ? (O = this.textPaths[L]
                        ? this.textPaths[L]
                        : createNS('text'))
                    : this.textSpans[L]
                    ? ((N = this.textSpans[L]), (O = this.textPaths[L]))
                    : (styleDiv((N = createTag('span'))),
                      styleDiv((O = createTag('span'))),
                      N.appendChild(O)),
                  this.globalData.fontManager.chars)
                ) {
                  var R,
                    V,
                    O,
                    N,
                    G,
                    W,
                    Y,
                    H = this.globalData.fontManager.getCharData(
                      u.finalText[R],
                      D.fStyle,
                      this.globalData.fontManager.getFontByName(u.f).fFamily
                    );
                  if (
                    ((Y = H ? H.data : null),
                    F.reset(),
                    Y &&
                      Y.shapes &&
                      Y.shapes.length &&
                      ((W = Y.shapes[0].it),
                      F.scale(u.finalSize / 100, u.finalSize / 100),
                      (I = this.createPathShape(F, W)),
                      O.setAttribute('d', I)),
                    this.isMasked)
                  )
                    this.innerElem.appendChild(O);
                  else {
                    if ((this.innerElem.appendChild(N), Y && Y.shapes)) {
                      document.body.appendChild(G);
                      var X = G.getBBox();
                      G.setAttribute('width', X.width + 2),
                        G.setAttribute('height', X.height + 2),
                        G.setAttribute(
                          'viewBox',
                          X.x -
                            1 +
                            ' ' +
                            (X.y - 1) +
                            ' ' +
                            (X.width + 2) +
                            ' ' +
                            (X.height + 2)
                        );
                      var J = G.style,
                        K =
                          'translate(' + (X.x - 1) + 'px,' + (X.y - 1) + 'px)';
                      (J.transform = K),
                        (J.webkitTransform = K),
                        (E[R].yOffset = X.y - 1);
                    } else
                      G.setAttribute('width', 1), G.setAttribute('height', 1);
                    N.appendChild(G);
                  }
                } else if (
                  ((O.textContent = E[R].val),
                  O.setAttributeNS(
                    'http://www.w3.org/XML/1998/namespace',
                    'xml:space',
                    'preserve'
                  ),
                  this.isMasked)
                )
                  this.innerElem.appendChild(O);
                else {
                  this.innerElem.appendChild(N);
                  var Z = O.style,
                    U = 'translate3d(0,' + -u.finalSize / 1.2 + 'px,0)';
                  (Z.transform = U), (Z.webkitTransform = U);
                }
                this.isMasked
                  ? (this.textSpans[L] = O)
                  : (this.textSpans[L] = N),
                  (this.textSpans[L].style.display = 'block'),
                  (this.textPaths[L] = O),
                  (L += 1);
              }
              for (; L < this.textSpans.length; )
                (this.textSpans[L].style.display = 'none'), (L += 1);
            }),
            (HTextElement.prototype.renderInnerContent = function () {
              if ((this.validateText(), this.data.singleShape)) {
                if (!this._isFirstFrame && !this.lettersChangedFlag) return;
                if (this.isMasked && this.finalTransform._matMdf) {
                  this.svgElement.setAttribute(
                    'viewBox',
                    -this.finalTransform.mProp.p.v[0] +
                      ' ' +
                      -this.finalTransform.mProp.p.v[1] +
                      ' ' +
                      this.compW +
                      ' ' +
                      this.compH
                  ),
                    (u = this.svgElement.style);
                  var u,
                    P,
                    S,
                    D,
                    T,
                    M,
                    E =
                      'translate(' +
                      -this.finalTransform.mProp.p.v[0] +
                      'px,' +
                      -this.finalTransform.mProp.p.v[1] +
                      'px)';
                  (u.transform = E), (u.webkitTransform = E);
                }
              }
              if (
                (this.textAnimator.getMeasures(
                  this.textProperty.currentData,
                  this.lettersChangedFlag
                ),
                this.lettersChangedFlag || this.textAnimator.lettersChangedFlag)
              ) {
                var F = 0,
                  I = this.textAnimator.renderedLetters,
                  L = this.textProperty.currentData.l;
                for (P = 0, S = L.length; P < S; P += 1)
                  L[P].n
                    ? (F += 1)
                    : ((T = this.textSpans[P]),
                      (M = this.textPaths[P]),
                      (D = I[F]),
                      (F += 1),
                      D._mdf.m &&
                        (this.isMasked
                          ? T.setAttribute('transform', D.m)
                          : ((T.style.webkitTransform = D.m),
                            (T.style.transform = D.m))),
                      (T.style.opacity = D.o),
                      D.sw && D._mdf.sw && M.setAttribute('stroke-width', D.sw),
                      D.sc && D._mdf.sc && M.setAttribute('stroke', D.sc),
                      D.fc &&
                        D._mdf.fc &&
                        (M.setAttribute('fill', D.fc), (M.style.color = D.fc)));
                if (
                  this.innerElem.getBBox &&
                  !this.hidden &&
                  (this._isFirstFrame || this._mdf)
                ) {
                  var R = this.innerElem.getBBox();
                  this.currentBBox.w !== R.width &&
                    ((this.currentBBox.w = R.width),
                    this.svgElement.setAttribute('width', R.width)),
                    this.currentBBox.h !== R.height &&
                      ((this.currentBBox.h = R.height),
                      this.svgElement.setAttribute('height', R.height));
                  var V = 1;
                  if (
                    this.currentBBox.w !== R.width + 2 * V ||
                    this.currentBBox.h !== R.height + 2 * V ||
                    this.currentBBox.x !== R.x - V ||
                    this.currentBBox.y !== R.y - V
                  ) {
                    (this.currentBBox.w = R.width + 2 * V),
                      (this.currentBBox.h = R.height + 2 * V),
                      (this.currentBBox.x = R.x - V),
                      (this.currentBBox.y = R.y - V),
                      this.svgElement.setAttribute(
                        'viewBox',
                        this.currentBBox.x +
                          ' ' +
                          this.currentBBox.y +
                          ' ' +
                          this.currentBBox.w +
                          ' ' +
                          this.currentBBox.h
                      ),
                      (u = this.svgElement.style);
                    var O =
                      'translate(' +
                      this.currentBBox.x +
                      'px,' +
                      this.currentBBox.y +
                      'px)';
                    (u.transform = O), (u.webkitTransform = O);
                  }
                }
              }
            }),
            extendPrototype(
              [BaseElement, FrameElement, HierarchyElement],
              HCameraElement
            ),
            (HCameraElement.prototype.setup = function () {
              var u,
                P,
                S,
                D,
                T = this.comp.threeDElements.length;
              for (u = 0; u < T; u += 1)
                if ('3d' === (P = this.comp.threeDElements[u]).type) {
                  (S = P.perspectiveElem.style), (D = P.container.style);
                  var M = this.pe.v + 'px',
                    E = '0px 0px 0px',
                    F = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';
                  (S.perspective = M),
                    (S.webkitPerspective = M),
                    (D.transformOrigin = E),
                    (D.mozTransformOrigin = E),
                    (D.webkitTransformOrigin = E),
                    (S.transform = F),
                    (S.webkitTransform = F);
                }
            }),
            (HCameraElement.prototype.createElements = function () {}),
            (HCameraElement.prototype.hide = function () {}),
            (HCameraElement.prototype.renderFrame = function () {
              var u = this._isFirstFrame;
              if (this.hierarchy)
                for (S = 0, D = this.hierarchy.length; S < D; S += 1)
                  u = this.hierarchy[S].finalTransform.mProp._mdf || u;
              if (
                u ||
                this.pe._mdf ||
                (this.p && this.p._mdf) ||
                (this.px && (this.px._mdf || this.py._mdf || this.pz._mdf)) ||
                this.rx._mdf ||
                this.ry._mdf ||
                this.rz._mdf ||
                this.or._mdf ||
                (this.a && this.a._mdf)
              ) {
                if ((this.mat.reset(), this.hierarchy))
                  for (S = D = this.hierarchy.length - 1; S >= 0; S -= 1) {
                    var P = this.hierarchy[S].finalTransform.mProp;
                    this.mat.translate(-P.p.v[0], -P.p.v[1], P.p.v[2]),
                      this.mat
                        .rotateX(-P.or.v[0])
                        .rotateY(-P.or.v[1])
                        .rotateZ(P.or.v[2]),
                      this.mat
                        .rotateX(-P.rx.v)
                        .rotateY(-P.ry.v)
                        .rotateZ(P.rz.v),
                      this.mat.scale(1 / P.s.v[0], 1 / P.s.v[1], 1 / P.s.v[2]),
                      this.mat.translate(P.a.v[0], P.a.v[1], P.a.v[2]);
                  }
                if (
                  (this.p
                    ? this.mat.translate(
                        -this.p.v[0],
                        -this.p.v[1],
                        this.p.v[2]
                      )
                    : this.mat.translate(-this.px.v, -this.py.v, this.pz.v),
                  this.a)
                ) {
                  var S,
                    D,
                    T,
                    M = Math.sqrt(
                      Math.pow(
                        (T = this.p
                          ? [
                              this.p.v[0] - this.a.v[0],
                              this.p.v[1] - this.a.v[1],
                              this.p.v[2] - this.a.v[2],
                            ]
                          : [
                              this.px.v - this.a.v[0],
                              this.py.v - this.a.v[1],
                              this.pz.v - this.a.v[2],
                            ])[0],
                        2
                      ) +
                        Math.pow(T[1], 2) +
                        Math.pow(T[2], 2)
                    ),
                    E = [T[0] / M, T[1] / M, T[2] / M],
                    F = Math.sqrt(E[2] * E[2] + E[0] * E[0]),
                    I = Math.atan2(E[1], F),
                    L = Math.atan2(E[0], -E[2]);
                  this.mat.rotateY(L).rotateX(-I);
                }
                this.mat
                  .rotateX(-this.rx.v)
                  .rotateY(-this.ry.v)
                  .rotateZ(this.rz.v),
                  this.mat
                    .rotateX(-this.or.v[0])
                    .rotateY(-this.or.v[1])
                    .rotateZ(this.or.v[2]),
                  this.mat.translate(
                    this.globalData.compSize.w / 2,
                    this.globalData.compSize.h / 2,
                    0
                  ),
                  this.mat.translate(0, 0, this.pe.v);
                var R = !this._prevMat.equals(this.mat);
                if ((R || this.pe._mdf) && this.comp.threeDElements) {
                  for (
                    S = 0, D = this.comp.threeDElements.length;
                    S < D;
                    S += 1
                  )
                    if ('3d' === (V = this.comp.threeDElements[S]).type) {
                      if (R) {
                        var V,
                          O,
                          N,
                          G = this.mat.toCSS();
                        ((N = V.container.style).transform = G),
                          (N.webkitTransform = G);
                      }
                      this.pe._mdf &&
                        (((O = V.perspectiveElem.style).perspective =
                          this.pe.v + 'px'),
                        (O.webkitPerspective = this.pe.v + 'px'));
                    }
                  this.mat.clone(this._prevMat);
                }
              }
              this._isFirstFrame = !1;
            }),
            (HCameraElement.prototype.prepareFrame = function (u) {
              this.prepareProperties(u, !0);
            }),
            (HCameraElement.prototype.destroy = function () {}),
            (HCameraElement.prototype.getBaseElement = function () {
              return null;
            }),
            extendPrototype(
              [
                BaseElement,
                TransformElement,
                HBaseElement,
                HSolidElement,
                HierarchyElement,
                FrameElement,
                RenderableElement,
              ],
              HImageElement
            ),
            (HImageElement.prototype.createContent = function () {
              var u = this.globalData.getAssetsPath(this.assetData),
                P = new Image();
              this.data.hasMask
                ? ((this.imageElem = createNS('image')),
                  this.imageElem.setAttribute('width', this.assetData.w + 'px'),
                  this.imageElem.setAttribute(
                    'height',
                    this.assetData.h + 'px'
                  ),
                  this.imageElem.setAttributeNS(
                    'http://www.w3.org/1999/xlink',
                    'href',
                    u
                  ),
                  this.layerElement.appendChild(this.imageElem),
                  this.baseElement.setAttribute('width', this.assetData.w),
                  this.baseElement.setAttribute('height', this.assetData.h))
                : this.layerElement.appendChild(P),
                (P.crossOrigin = 'anonymous'),
                (P.src = u),
                this.data.ln &&
                  this.baseElement.setAttribute('id', this.data.ln);
            }),
            extendPrototype([BaseRenderer], HybridRendererBase),
            (HybridRendererBase.prototype.buildItem =
              SVGRenderer.prototype.buildItem),
            (HybridRendererBase.prototype.checkPendingElements = function () {
              for (; this.pendingElements.length; )
                this.pendingElements.pop().checkParenting();
            }),
            (HybridRendererBase.prototype.appendElementInPos = function (u, P) {
              var S = u.getBaseElement();
              if (S) {
                var D = this.layers[P];
                if (D.ddd && this.supports3d) this.addTo3dContainer(S, P);
                else if (this.threeDElements) this.addTo3dContainer(S, P);
                else {
                  for (var T, M, E = 0; E < P; )
                    this.elements[E] &&
                      !0 !== this.elements[E] &&
                      this.elements[E].getBaseElement &&
                      ((M = this.elements[E]),
                      (T =
                        (this.layers[E].ddd
                          ? this.getThreeDContainerByPos(E)
                          : M.getBaseElement()) || T)),
                      (E += 1);
                  T
                    ? (D.ddd && this.supports3d) ||
                      this.layerElement.insertBefore(S, T)
                    : (D.ddd && this.supports3d) ||
                      this.layerElement.appendChild(S);
                }
              }
            }),
            (HybridRendererBase.prototype.createShape = function (u) {
              return this.supports3d
                ? new HShapeElement(u, this.globalData, this)
                : new SVGShapeElement(u, this.globalData, this);
            }),
            (HybridRendererBase.prototype.createText = function (u) {
              return this.supports3d
                ? new HTextElement(u, this.globalData, this)
                : new SVGTextLottieElement(u, this.globalData, this);
            }),
            (HybridRendererBase.prototype.createCamera = function (u) {
              return (
                (this.camera = new HCameraElement(u, this.globalData, this)),
                this.camera
              );
            }),
            (HybridRendererBase.prototype.createImage = function (u) {
              return this.supports3d
                ? new HImageElement(u, this.globalData, this)
                : new IImageElement(u, this.globalData, this);
            }),
            (HybridRendererBase.prototype.createSolid = function (u) {
              return this.supports3d
                ? new HSolidElement(u, this.globalData, this)
                : new ISolidElement(u, this.globalData, this);
            }),
            (HybridRendererBase.prototype.createNull =
              SVGRenderer.prototype.createNull),
            (HybridRendererBase.prototype.getThreeDContainerByPos = function (
              u
            ) {
              for (var P = 0, S = this.threeDElements.length; P < S; ) {
                if (
                  this.threeDElements[P].startPos <= u &&
                  this.threeDElements[P].endPos >= u
                )
                  return this.threeDElements[P].perspectiveElem;
                P += 1;
              }
              return null;
            }),
            (HybridRendererBase.prototype.createThreeDContainer = function (
              u,
              P
            ) {
              var S,
                D,
                T = createTag('div');
              styleDiv(T);
              var M = createTag('div');
              if ((styleDiv(M), '3d' === P)) {
                ((S = T.style).width = this.globalData.compSize.w + 'px'),
                  (S.height = this.globalData.compSize.h + 'px');
                var E = '50% 50%';
                (S.webkitTransformOrigin = E),
                  (S.mozTransformOrigin = E),
                  (S.transformOrigin = E);
                var F = 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1)';
                ((D = M.style).transform = F), (D.webkitTransform = F);
              }
              T.appendChild(M);
              var I = {
                container: M,
                perspectiveElem: T,
                startPos: u,
                endPos: u,
                type: P,
              };
              return this.threeDElements.push(I), I;
            }),
            (HybridRendererBase.prototype.build3dContainers = function () {
              var u,
                P,
                S = this.layers.length,
                D = '';
              for (u = 0; u < S; u += 1)
                this.layers[u].ddd && 3 !== this.layers[u].ty
                  ? ('3d' !== D &&
                      ((D = '3d'), (P = this.createThreeDContainer(u, '3d'))),
                    (P.endPos = Math.max(P.endPos, u)))
                  : ('2d' !== D &&
                      ((D = '2d'), (P = this.createThreeDContainer(u, '2d'))),
                    (P.endPos = Math.max(P.endPos, u)));
              for (u = (S = this.threeDElements.length) - 1; u >= 0; u -= 1)
                this.resizerElem.appendChild(
                  this.threeDElements[u].perspectiveElem
                );
            }),
            (HybridRendererBase.prototype.addTo3dContainer = function (u, P) {
              for (var S = 0, D = this.threeDElements.length; S < D; ) {
                if (P <= this.threeDElements[S].endPos) {
                  for (var T, M = this.threeDElements[S].startPos; M < P; )
                    this.elements[M] &&
                      this.elements[M].getBaseElement &&
                      (T = this.elements[M].getBaseElement()),
                      (M += 1);
                  T
                    ? this.threeDElements[S].container.insertBefore(u, T)
                    : this.threeDElements[S].container.appendChild(u);
                  break;
                }
                S += 1;
              }
            }),
            (HybridRendererBase.prototype.configAnimation = function (u) {
              var P = createTag('div'),
                S = this.animationItem.wrapper,
                D = P.style;
              (D.width = u.w + 'px'),
                (D.height = u.h + 'px'),
                (this.resizerElem = P),
                styleDiv(P),
                (D.transformStyle = 'flat'),
                (D.mozTransformStyle = 'flat'),
                (D.webkitTransformStyle = 'flat'),
                this.renderConfig.className &&
                  P.setAttribute('class', this.renderConfig.className),
                S.appendChild(P),
                (D.overflow = 'hidden');
              var T = createNS('svg');
              T.setAttribute('width', '1'),
                T.setAttribute('height', '1'),
                styleDiv(T),
                this.resizerElem.appendChild(T);
              var M = createNS('defs');
              T.appendChild(M),
                (this.data = u),
                this.setupGlobalData(u, T),
                (this.globalData.defs = M),
                (this.layers = u.layers),
                (this.layerElement = this.resizerElem),
                this.build3dContainers(),
                this.updateContainerSize();
            }),
            (HybridRendererBase.prototype.destroy = function () {
              this.animationItem.wrapper &&
                (this.animationItem.wrapper.innerText = ''),
                (this.animationItem.container = null),
                (this.globalData.defs = null);
              var u,
                P = this.layers ? this.layers.length : 0;
              for (u = 0; u < P; u += 1)
                this.elements[u] &&
                  this.elements[u].destroy &&
                  this.elements[u].destroy();
              (this.elements.length = 0),
                (this.destroyed = !0),
                (this.animationItem = null);
            }),
            (HybridRendererBase.prototype.updateContainerSize = function () {
              var u,
                P,
                S,
                D,
                T = this.animationItem.wrapper.offsetWidth,
                M = this.animationItem.wrapper.offsetHeight,
                E = T / M;
              this.globalData.compSize.w / this.globalData.compSize.h > E
                ? ((u = T / this.globalData.compSize.w),
                  (P = T / this.globalData.compSize.w),
                  (S = 0),
                  (D =
                    (M -
                      this.globalData.compSize.h *
                        (T / this.globalData.compSize.w)) /
                    2))
                : ((u = M / this.globalData.compSize.h),
                  (P = M / this.globalData.compSize.h),
                  (S =
                    (T -
                      this.globalData.compSize.w *
                        (M / this.globalData.compSize.h)) /
                    2),
                  (D = 0));
              var F = this.resizerElem.style;
              (F.webkitTransform =
                'matrix3d(' +
                u +
                ',0,0,0,0,' +
                P +
                ',0,0,0,0,1,0,' +
                S +
                ',' +
                D +
                ',0,1)'),
                (F.transform = F.webkitTransform);
            }),
            (HybridRendererBase.prototype.renderFrame =
              SVGRenderer.prototype.renderFrame),
            (HybridRendererBase.prototype.hide = function () {
              this.resizerElem.style.display = 'none';
            }),
            (HybridRendererBase.prototype.show = function () {
              this.resizerElem.style.display = 'block';
            }),
            (HybridRendererBase.prototype.initItems = function () {
              if ((this.buildAllItems(), this.camera)) this.camera.setup();
              else {
                var u,
                  P = this.globalData.compSize.w,
                  S = this.globalData.compSize.h,
                  D = this.threeDElements.length;
                for (u = 0; u < D; u += 1) {
                  var T = this.threeDElements[u].perspectiveElem.style;
                  (T.webkitPerspective =
                    Math.sqrt(Math.pow(P, 2) + Math.pow(S, 2)) + 'px'),
                    (T.perspective = T.webkitPerspective);
                }
              }
            }),
            (HybridRendererBase.prototype.searchExtraCompositions = function (
              u
            ) {
              var P,
                S = u.length,
                D = createTag('div');
              for (P = 0; P < S; P += 1)
                if (u[P].xt) {
                  var T = this.createComp(u[P], D, this.globalData.comp, null);
                  T.initExpressions(),
                    this.globalData.projectInterface.registerComposition(T);
                }
            }),
            extendPrototype(
              [HybridRendererBase, ICompElement, HBaseElement],
              HCompElement
            ),
            (HCompElement.prototype._createBaseContainerElements =
              HCompElement.prototype.createContainerElements),
            (HCompElement.prototype.createContainerElements = function () {
              this._createBaseContainerElements(),
                this.data.hasMask
                  ? (this.svgElement.setAttribute('width', this.data.w),
                    this.svgElement.setAttribute('height', this.data.h),
                    (this.transformedElement = this.baseElement))
                  : (this.transformedElement = this.layerElement);
            }),
            (HCompElement.prototype.addTo3dContainer = function (u, P) {
              for (var S, D = 0; D < P; )
                this.elements[D] &&
                  this.elements[D].getBaseElement &&
                  (S = this.elements[D].getBaseElement()),
                  (D += 1);
              S
                ? this.layerElement.insertBefore(u, S)
                : this.layerElement.appendChild(u);
            }),
            (HCompElement.prototype.createComp = function (u) {
              return this.supports3d
                ? new HCompElement(u, this.globalData, this)
                : new SVGCompElement(u, this.globalData, this);
            }),
            extendPrototype([HybridRendererBase], HybridRenderer),
            (HybridRenderer.prototype.createComp = function (u) {
              return this.supports3d
                ? new HCompElement(u, this.globalData, this)
                : new SVGCompElement(u, this.globalData, this);
            });
          var CompExpressionInterface = (function () {
            return function (u) {
              function P(P) {
                for (var S = 0, D = u.layers.length; S < D; ) {
                  if (u.layers[S].nm === P || u.layers[S].ind === P)
                    return u.elements[S].layerInterface;
                  S += 1;
                }
                return null;
              }
              return (
                Object.defineProperty(P, '_name', { value: u.data.nm }),
                (P.layer = P),
                (P.pixelAspect = 1),
                (P.height = u.data.h || u.globalData.compSize.h),
                (P.width = u.data.w || u.globalData.compSize.w),
                (P.pixelAspect = 1),
                (P.frameDuration = 1 / u.globalData.frameRate),
                (P.displayStartTime = 0),
                (P.numLayers = u.layers.length),
                P
              );
            };
          })();
          function _typeof$2(u) {
            return (_typeof$2 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          function seedRandom(u, P) {
            var S,
              D = this,
              T = 256,
              M = 6,
              E = 52,
              F = 'random',
              I = P.pow(T, M),
              L = P.pow(2, E),
              R = 2 * L,
              V = T - 1;
            function O(S, D, E) {
              var V = [],
                O = Y(
                  W(
                    (D = !0 === D ? { entropy: !0 } : D || {}).entropy
                      ? [S, X(u)]
                      : null === S
                      ? H()
                      : S,
                    3
                  ),
                  V
                ),
                J = new N(V),
                K = function () {
                  for (var u = J.g(M), P = I, S = 0; u < L; )
                    (u = (u + S) * T), (P *= T), (S = J.g(1));
                  for (; u >= R; ) (u /= 2), (P /= 2), (S >>>= 1);
                  return (u + S) / P;
                };
              return (
                (K.int32 = function () {
                  return 0 | J.g(4);
                }),
                (K.quick = function () {
                  return J.g(4) / 4294967296;
                }),
                (K.double = K),
                Y(X(J.S), u),
                (
                  D.pass ||
                  E ||
                  function (u, S, D, T) {
                    return (T &&
                      (T.S && G(T, J),
                      (u.state = function () {
                        return G(J, {});
                      })),
                    D)
                      ? ((P[F] = u), S)
                      : u;
                  }
                )(K, O, 'global' in D ? D.global : this == P, D.state)
              );
            }
            function N(u) {
              var P,
                S = u.length,
                D = this,
                M = 0,
                E = (D.i = D.j = 0),
                F = (D.S = []);
              for (S || (u = [S++]); M < T; ) F[M] = M++;
              for (M = 0; M < T; M++)
                (F[M] = F[(E = V & (E + u[M % S] + (P = F[M])))]), (F[E] = P);
              D.g = function (u) {
                for (var P, S = 0, M = D.i, E = D.j, F = D.S; u--; )
                  (P = F[(M = V & (M + 1))]),
                    (S =
                      S * T +
                      F[V & ((F[M] = F[(E = V & (E + P))]) + (F[E] = P))]);
                return (D.i = M), (D.j = E), S;
              };
            }
            function G(u, P) {
              return (P.i = u.i), (P.j = u.j), (P.S = u.S.slice()), P;
            }
            function W(u, P) {
              var S,
                D = [],
                T = _typeof$2(u);
              if (P && 'object' == T)
                for (S in u)
                  try {
                    D.push(W(u[S], P - 1));
                  } catch (u) {}
              return D.length ? D : 'string' == T ? u : u + '\x00';
            }
            function Y(u, P) {
              for (var S, D = u + '', T = 0; T < D.length; )
                P[V & T] = V & ((S ^= 19 * P[V & T]) + D.charCodeAt(T++));
              return X(P);
            }
            function H() {
              try {
                if (S) return X(S.randomBytes(T));
                var P = new Uint8Array(T);
                return (D.crypto || D.msCrypto).getRandomValues(P), X(P);
              } catch (P) {
                var M = D.navigator,
                  E = M && M.plugins;
                return [+new Date(), D, E, D.screen, X(u)];
              }
            }
            function X(u) {
              return String.fromCharCode.apply(0, u);
            }
            (P['seed' + F] = O), Y(P.random(), u);
          }
          function initialize$2(u) {
            seedRandom([], u);
          }
          var propTypes = { SHAPE: 'shape' };
          function _typeof$1(u) {
            return (_typeof$1 =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var ExpressionManager = (function () {
              var ob = {},
                Math = BMMath,
                window = null,
                document = null,
                XMLHttpRequest = null,
                fetch = null,
                frames = null,
                _lottieGlobal = {};
              function resetFrame() {
                _lottieGlobal = {};
              }
              function $bm_isInstanceOfArray(u) {
                return (
                  u.constructor === Array || u.constructor === Float32Array
                );
              }
              function isNumerable(u, P) {
                return (
                  'number' === u ||
                  P instanceof Number ||
                  'boolean' === u ||
                  'string' === u
                );
              }
              function $bm_neg(u) {
                var P = _typeof$1(u);
                if ('number' === P || u instanceof Number || 'boolean' === P)
                  return -u;
                if ($bm_isInstanceOfArray(u)) {
                  var S,
                    D = u.length,
                    T = [];
                  for (S = 0; S < D; S += 1) T[S] = -u[S];
                  return T;
                }
                return u.propType ? u.v : -u;
              }
              initialize$2(BMMath);
              var easeInBez = BezierFactory.getBezierEasing(
                  0.333,
                  0,
                  0.833,
                  0.833,
                  'easeIn'
                ).get,
                easeOutBez = BezierFactory.getBezierEasing(
                  0.167,
                  0.167,
                  0.667,
                  1,
                  'easeOut'
                ).get,
                easeInOutBez = BezierFactory.getBezierEasing(
                  0.33,
                  0,
                  0.667,
                  1,
                  'easeInOut'
                ).get;
              function sum(u, P) {
                var S = _typeof$1(u),
                  D = _typeof$1(P);
                if (
                  (isNumerable(S, u) && isNumerable(D, P)) ||
                  'string' === S ||
                  'string' === D
                )
                  return u + P;
                if ($bm_isInstanceOfArray(u) && isNumerable(D, P))
                  return (u = u.slice(0)), (u[0] += P), u;
                if (isNumerable(S, u) && $bm_isInstanceOfArray(P))
                  return ((P = P.slice(0))[0] = u + P[0]), P;
                if ($bm_isInstanceOfArray(u) && $bm_isInstanceOfArray(P)) {
                  for (
                    var T = 0, M = u.length, E = P.length, F = [];
                    T < M || T < E;

                  )
                    ('number' == typeof u[T] || u[T] instanceof Number) &&
                    ('number' == typeof P[T] || P[T] instanceof Number)
                      ? (F[T] = u[T] + P[T])
                      : (F[T] = void 0 === P[T] ? u[T] : u[T] || P[T]),
                      (T += 1);
                  return F;
                }
                return 0;
              }
              var add = sum;
              function sub(u, P) {
                var S = _typeof$1(u),
                  D = _typeof$1(P);
                if (isNumerable(S, u) && isNumerable(D, P))
                  return (
                    'string' === S && (u = parseInt(u, 10)),
                    'string' === D && (P = parseInt(P, 10)),
                    u - P
                  );
                if ($bm_isInstanceOfArray(u) && isNumerable(D, P))
                  return (u = u.slice(0)), (u[0] -= P), u;
                if (isNumerable(S, u) && $bm_isInstanceOfArray(P))
                  return ((P = P.slice(0))[0] = u - P[0]), P;
                if ($bm_isInstanceOfArray(u) && $bm_isInstanceOfArray(P)) {
                  for (
                    var T = 0, M = u.length, E = P.length, F = [];
                    T < M || T < E;

                  )
                    ('number' == typeof u[T] || u[T] instanceof Number) &&
                    ('number' == typeof P[T] || P[T] instanceof Number)
                      ? (F[T] = u[T] - P[T])
                      : (F[T] = void 0 === P[T] ? u[T] : u[T] || P[T]),
                      (T += 1);
                  return F;
                }
                return 0;
              }
              function mul(u, P) {
                var S,
                  D,
                  T,
                  M = _typeof$1(u),
                  E = _typeof$1(P);
                if (isNumerable(M, u) && isNumerable(E, P)) return u * P;
                if ($bm_isInstanceOfArray(u) && isNumerable(E, P)) {
                  for (
                    D = 0, S = createTypedArray('float32', (T = u.length));
                    D < T;
                    D += 1
                  )
                    S[D] = u[D] * P;
                  return S;
                }
                if (isNumerable(M, u) && $bm_isInstanceOfArray(P)) {
                  for (
                    D = 0, S = createTypedArray('float32', (T = P.length));
                    D < T;
                    D += 1
                  )
                    S[D] = u * P[D];
                  return S;
                }
                return 0;
              }
              function div(u, P) {
                var S,
                  D,
                  T,
                  M = _typeof$1(u),
                  E = _typeof$1(P);
                if (isNumerable(M, u) && isNumerable(E, P)) return u / P;
                if ($bm_isInstanceOfArray(u) && isNumerable(E, P)) {
                  for (
                    D = 0, S = createTypedArray('float32', (T = u.length));
                    D < T;
                    D += 1
                  )
                    S[D] = u[D] / P;
                  return S;
                }
                if (isNumerable(M, u) && $bm_isInstanceOfArray(P)) {
                  for (
                    D = 0, S = createTypedArray('float32', (T = P.length));
                    D < T;
                    D += 1
                  )
                    S[D] = u / P[D];
                  return S;
                }
                return 0;
              }
              function mod(u, P) {
                return (
                  'string' == typeof u && (u = parseInt(u, 10)),
                  'string' == typeof P && (P = parseInt(P, 10)),
                  u % P
                );
              }
              var $bm_sum = sum,
                $bm_sub = sub,
                $bm_mul = mul,
                $bm_div = div,
                $bm_mod = mod;
              function clamp(u, P, S) {
                if (P > S) {
                  var D = S;
                  (S = P), (P = D);
                }
                return Math.min(Math.max(u, P), S);
              }
              function radiansToDegrees(u) {
                return u / degToRads;
              }
              var radians_to_degrees = radiansToDegrees;
              function degreesToRadians(u) {
                return u * degToRads;
              }
              var degrees_to_radians = radiansToDegrees,
                helperLengthArray = [0, 0, 0, 0, 0, 0];
              function length(u, P) {
                if ('number' == typeof u || u instanceof Number)
                  return (P = P || 0), Math.abs(u - P);
                P || (P = helperLengthArray);
                var S,
                  D = Math.min(u.length, P.length),
                  T = 0;
                for (S = 0; S < D; S += 1) T += Math.pow(P[S] - u[S], 2);
                return Math.sqrt(T);
              }
              function normalize(u) {
                return div(u, length(u));
              }
              function rgbToHsl(u) {
                var P,
                  S,
                  D = u[0],
                  T = u[1],
                  M = u[2],
                  E = Math.max(D, T, M),
                  F = Math.min(D, T, M),
                  I = (E + F) / 2;
                if (E === F) (P = 0), (S = 0);
                else {
                  var L = E - F;
                  switch (((S = I > 0.5 ? L / (2 - E - F) : L / (E + F)), E)) {
                    case D:
                      P = (T - M) / L + (T < M ? 6 : 0);
                      break;
                    case T:
                      P = (M - D) / L + 2;
                      break;
                    case M:
                      P = (D - T) / L + 4;
                  }
                  P /= 6;
                }
                return [P, S, I, u[3]];
              }
              function hue2rgb(u, P, S) {
                return (S < 0 && (S += 1), S > 1 && (S -= 1), S < 1 / 6)
                  ? u + (P - u) * 6 * S
                  : S < 0.5
                  ? P
                  : S < 2 / 3
                  ? u + (P - u) * (2 / 3 - S) * 6
                  : u;
              }
              function hslToRgb(u) {
                var P,
                  S,
                  D,
                  T = u[0],
                  M = u[1],
                  E = u[2];
                if (0 === M) (P = E), (D = E), (S = E);
                else {
                  var F = E < 0.5 ? E * (1 + M) : E + M - E * M,
                    I = 2 * E - F;
                  (P = hue2rgb(I, F, T + 1 / 3)),
                    (S = hue2rgb(I, F, T)),
                    (D = hue2rgb(I, F, T - 1 / 3));
                }
                return [P, S, D, u[3]];
              }
              function linear(u, P, S, D, T) {
                if (
                  ((void 0 === D || void 0 === T) &&
                    ((D = P), (T = S), (P = 0), (S = 1)),
                  S < P)
                ) {
                  var M,
                    E = S;
                  (S = P), (P = E);
                }
                if (u <= P) return D;
                if (u >= S) return T;
                var F = S === P ? 0 : (u - P) / (S - P);
                if (!D.length) return D + (T - D) * F;
                var I = D.length,
                  L = createTypedArray('float32', I);
                for (M = 0; M < I; M += 1) L[M] = D[M] + (T[M] - D[M]) * F;
                return L;
              }
              function random(u, P) {
                if (
                  (void 0 === P &&
                    (void 0 === u
                      ? ((u = 0), (P = 1))
                      : ((P = u), (u = void 0))),
                  P.length)
                ) {
                  var S,
                    D = P.length;
                  u || (u = createTypedArray('float32', D));
                  var T = createTypedArray('float32', D),
                    M = BMMath.random();
                  for (S = 0; S < D; S += 1) T[S] = u[S] + M * (P[S] - u[S]);
                  return T;
                }
                return void 0 === u && (u = 0), u + BMMath.random() * (P - u);
              }
              function createPath(u, P, S, D) {
                var T,
                  M,
                  E,
                  F = u.length,
                  I = shapePool.newElement();
                I.setPathData(!!D, F);
                var L = [0, 0];
                for (T = 0; T < F; T += 1)
                  (M = P && P[T] ? P[T] : L),
                    (E = S && S[T] ? S[T] : L),
                    I.setTripleAt(
                      u[T][0],
                      u[T][1],
                      E[0] + u[T][0],
                      E[1] + u[T][1],
                      M[0] + u[T][0],
                      M[1] + u[T][1],
                      T,
                      !0
                    );
                return I;
              }
              function initiateExpression(elem, data, property) {
                function noOp(u) {
                  return u;
                }
                if (!elem.globalData.renderConfig.runExpressions) return noOp;
                var transform,
                  $bm_transform,
                  content,
                  effect,
                  loopIn,
                  loop_in,
                  loopOut,
                  loop_out,
                  smooth,
                  toWorld,
                  fromWorld,
                  fromComp,
                  toComp,
                  fromCompToSurface,
                  position,
                  rotation,
                  anchorPoint,
                  scale,
                  thisLayer,
                  thisComp,
                  mask,
                  valueAtTime,
                  velocityAtTime,
                  scoped_bm_rt,
                  time,
                  velocity,
                  value,
                  text,
                  textIndex,
                  textTotal,
                  selectorValue,
                  parent,
                  val = data.x,
                  needsVelocity = /velocity(?![\w\d])/.test(val),
                  _needsRandom = -1 !== val.indexOf('random'),
                  elemType = elem.data.ty,
                  thisProperty = property;
                (thisProperty.valueAtTime = thisProperty.getValueAtTime),
                  Object.defineProperty(thisProperty, 'value', {
                    get: function () {
                      return thisProperty.v;
                    },
                  }),
                  (elem.comp.frameDuration =
                    1 / elem.comp.globalData.frameRate),
                  (elem.comp.displayStartTime = 0);
                var inPoint = elem.data.ip / elem.comp.globalData.frameRate,
                  outPoint = elem.data.op / elem.comp.globalData.frameRate,
                  width = elem.data.sw ? elem.data.sw : 0,
                  height = elem.data.sh ? elem.data.sh : 0,
                  name = elem.data.nm,
                  expression_function = eval(
                    '[function _expression_function(){' +
                      val +
                      ';scoped_bm_rt=$bm_rt}]'
                  )[0],
                  numKeys = property.kf ? data.k.length : 0,
                  active = !this.data || !0 !== this.data.hd,
                  wiggle = function (u, P) {
                    var S,
                      D,
                      T = this.pv.length ? this.pv.length : 1,
                      M = createTypedArray('float32', T);
                    u = 5;
                    var E = Math.floor(time * u);
                    for (S = 0, D = 0; S < E; ) {
                      for (D = 0; D < T; D += 1)
                        M[D] += -P + 2 * P * BMMath.random();
                      S += 1;
                    }
                    var F = time * u,
                      I = F - Math.floor(F),
                      L = createTypedArray('float32', T);
                    if (T > 1) {
                      for (D = 0; D < T; D += 1)
                        L[D] =
                          this.pv[D] +
                          M[D] +
                          (-P + 2 * P * BMMath.random()) * I;
                      return L;
                    }
                    return this.pv + M[0] + (-P + 2 * P * BMMath.random()) * I;
                  }.bind(this);
                function loopInDuration(u, P) {
                  return loopIn(u, P, !0);
                }
                function loopOutDuration(u, P) {
                  return loopOut(u, P, !0);
                }
                thisProperty.loopIn &&
                  (loop_in = loopIn = thisProperty.loopIn.bind(thisProperty)),
                  thisProperty.loopOut &&
                    (loop_out = loopOut =
                      thisProperty.loopOut.bind(thisProperty)),
                  thisProperty.smooth &&
                    (smooth = thisProperty.smooth.bind(thisProperty)),
                  this.getValueAtTime &&
                    (valueAtTime = this.getValueAtTime.bind(this)),
                  this.getVelocityAtTime &&
                    (velocityAtTime = this.getVelocityAtTime.bind(this));
                var comp = elem.comp.globalData.projectInterface.bind(
                  elem.comp.globalData.projectInterface
                );
                function lookAt(u, P) {
                  var S = [P[0] - u[0], P[1] - u[1], P[2] - u[2]],
                    D =
                      Math.atan2(S[0], Math.sqrt(S[1] * S[1] + S[2] * S[2])) /
                      degToRads;
                  return [-Math.atan2(S[1], S[2]) / degToRads, D, 0];
                }
                function easeOut(u, P, S, D, T) {
                  return applyEase(easeOutBez, u, P, S, D, T);
                }
                function easeIn(u, P, S, D, T) {
                  return applyEase(easeInBez, u, P, S, D, T);
                }
                function ease(u, P, S, D, T) {
                  return applyEase(easeInOutBez, u, P, S, D, T);
                }
                function applyEase(u, P, S, D, T, M) {
                  void 0 === T ? ((T = S), (M = D)) : (P = (P - S) / (D - S)),
                    P > 1 ? (P = 1) : P < 0 && (P = 0);
                  var E = u(P);
                  if ($bm_isInstanceOfArray(T)) {
                    var F,
                      I = T.length,
                      L = createTypedArray('float32', I);
                    for (F = 0; F < I; F += 1) L[F] = (M[F] - T[F]) * E + T[F];
                    return L;
                  }
                  return (M - T) * E + T;
                }
                function nearestKey(u) {
                  var P,
                    S,
                    D,
                    T = data.k.length;
                  if (data.k.length && 'number' != typeof data.k[0]) {
                    if (
                      ((S = -1),
                      (u *= elem.comp.globalData.frameRate) < data.k[0].t)
                    )
                      (S = 1), (D = data.k[0].t);
                    else {
                      for (P = 0; P < T - 1; P += 1) {
                        if (u === data.k[P].t) {
                          (S = P + 1), (D = data.k[P].t);
                          break;
                        }
                        if (u > data.k[P].t && u < data.k[P + 1].t) {
                          u - data.k[P].t > data.k[P + 1].t - u
                            ? ((S = P + 2), (D = data.k[P + 1].t))
                            : ((S = P + 1), (D = data.k[P].t));
                          break;
                        }
                      }
                      -1 === S && ((S = P + 1), (D = data.k[P].t));
                    }
                  } else (S = 0), (D = 0);
                  var M = {};
                  return (
                    (M.index = S),
                    (M.time = D / elem.comp.globalData.frameRate),
                    M
                  );
                }
                function key(u) {
                  if (!data.k.length || 'number' == typeof data.k[0])
                    throw Error('The property has no keyframe at index ' + u);
                  (u -= 1),
                    (P = {
                      time: data.k[u].t / elem.comp.globalData.frameRate,
                      value: [],
                    });
                  var P,
                    S,
                    D,
                    T = Object.prototype.hasOwnProperty.call(data.k[u], 's')
                      ? data.k[u].s
                      : data.k[u - 1].e;
                  for (S = 0, D = T.length; S < D; S += 1)
                    (P[S] = T[S]), (P.value[S] = T[S]);
                  return P;
                }
                function framesToTime(u, P) {
                  return P || (P = elem.comp.globalData.frameRate), u / P;
                }
                function timeToFrames(u, P) {
                  return (
                    u || 0 === u || (u = time),
                    P || (P = elem.comp.globalData.frameRate),
                    u * P
                  );
                }
                function seedRandom(u) {
                  BMMath.seedrandom(randSeed + u);
                }
                function sourceRectAtTime() {
                  return elem.sourceRectAtTime();
                }
                function substring(u, P) {
                  return 'string' == typeof value
                    ? void 0 === P
                      ? value.substring(u)
                      : value.substring(u, P)
                    : '';
                }
                function substr(u, P) {
                  return 'string' == typeof value
                    ? void 0 === P
                      ? value.substr(u)
                      : value.substr(u, P)
                    : '';
                }
                function posterizeTime(u) {
                  value = valueAtTime(
                    (time = 0 === u ? 0 : Math.floor(time * u) / u)
                  );
                }
                var index = elem.data.ind,
                  hasParent = !!(elem.hierarchy && elem.hierarchy.length),
                  randSeed = Math.floor(1e6 * Math.random()),
                  globalData = elem.globalData;
                function executeExpression(u) {
                  return ((value = u),
                  this.frameExpressionId === elem.globalData.frameId &&
                    'textSelector' !== this.propType)
                    ? value
                    : ('textSelector' === this.propType &&
                        ((textIndex = this.textIndex),
                        (textTotal = this.textTotal),
                        (selectorValue = this.selectorValue)),
                      thisLayer ||
                        ((text = elem.layerInterface.text),
                        (thisLayer = elem.layerInterface),
                        (thisComp = elem.comp.compInterface),
                        (toWorld = thisLayer.toWorld.bind(thisLayer)),
                        (fromWorld = thisLayer.fromWorld.bind(thisLayer)),
                        (fromComp = thisLayer.fromComp.bind(thisLayer)),
                        (toComp = thisLayer.toComp.bind(thisLayer)),
                        (mask = thisLayer.mask
                          ? thisLayer.mask.bind(thisLayer)
                          : null),
                        (fromCompToSurface = fromComp)),
                      !transform &&
                        (($bm_transform = transform =
                          elem.layerInterface('ADBE Transform Group')),
                        transform && (anchorPoint = transform.anchorPoint)),
                      4 !== elemType ||
                        content ||
                        (content = thisLayer('ADBE Root Vectors Group')),
                      effect || (effect = thisLayer(4)),
                      (hasParent = !!(
                        elem.hierarchy && elem.hierarchy.length
                      )) &&
                        !parent &&
                        (parent = elem.hierarchy[0].layerInterface),
                      (time =
                        this.comp.renderedFrame /
                        this.comp.globalData.frameRate),
                      _needsRandom && seedRandom(randSeed + time),
                      needsVelocity && (velocity = velocityAtTime(time)),
                      expression_function(),
                      (this.frameExpressionId = elem.globalData.frameId),
                      (scoped_bm_rt =
                        scoped_bm_rt.propType === propTypes.SHAPE
                          ? scoped_bm_rt.v
                          : scoped_bm_rt));
                }
                return (
                  (executeExpression.__preventDeadCodeRemoval = [
                    $bm_transform,
                    anchorPoint,
                    time,
                    velocity,
                    inPoint,
                    outPoint,
                    width,
                    height,
                    name,
                    loop_in,
                    loop_out,
                    smooth,
                    toComp,
                    fromCompToSurface,
                    toWorld,
                    fromWorld,
                    mask,
                    position,
                    rotation,
                    scale,
                    thisComp,
                    numKeys,
                    active,
                    wiggle,
                    loopInDuration,
                    loopOutDuration,
                    comp,
                    lookAt,
                    easeOut,
                    easeIn,
                    ease,
                    nearestKey,
                    key,
                    text,
                    textIndex,
                    textTotal,
                    selectorValue,
                    framesToTime,
                    timeToFrames,
                    sourceRectAtTime,
                    substring,
                    substr,
                    posterizeTime,
                    index,
                    globalData,
                  ]),
                  executeExpression
                );
              }
              return (
                (ob.initiateExpression = initiateExpression),
                (ob.__preventDeadCodeRemoval = [
                  window,
                  document,
                  XMLHttpRequest,
                  fetch,
                  frames,
                  $bm_neg,
                  add,
                  $bm_sum,
                  $bm_sub,
                  $bm_mul,
                  $bm_div,
                  $bm_mod,
                  clamp,
                  radians_to_degrees,
                  degreesToRadians,
                  degrees_to_radians,
                  normalize,
                  rgbToHsl,
                  hslToRgb,
                  linear,
                  random,
                  createPath,
                  _lottieGlobal,
                ]),
                (ob.resetFrame = resetFrame),
                ob
              );
            })(),
            Expressions = (function () {
              var u = {};
              function P(u) {
                var P = 0,
                  S = [];
                function D() {
                  P += 1;
                }
                function T() {
                  0 == (P -= 1) && E();
                }
                function M(u) {
                  -1 === S.indexOf(u) && S.push(u);
                }
                function E() {
                  var u,
                    P = S.length;
                  for (u = 0; u < P; u += 1) S[u].release();
                  S.length = 0;
                }
                (u.renderer.compInterface = CompExpressionInterface(
                  u.renderer
                )),
                  u.renderer.globalData.projectInterface.registerComposition(
                    u.renderer
                  ),
                  (u.renderer.globalData.pushExpression = D),
                  (u.renderer.globalData.popExpression = T),
                  (u.renderer.globalData.registerExpressionProperty = M);
              }
              return (
                (u.initExpressions = P),
                (u.resetFrame = ExpressionManager.resetFrame),
                u
              );
            })(),
            MaskManagerInterface = (function () {
              function u(u, P) {
                (this._mask = u), (this._data = P);
              }
              return (
                Object.defineProperty(u.prototype, 'maskPath', {
                  get: function () {
                    return (
                      this._mask.prop.k && this._mask.prop.getValue(),
                      this._mask.prop
                    );
                  },
                }),
                Object.defineProperty(u.prototype, 'maskOpacity', {
                  get: function () {
                    return (
                      this._mask.op.k && this._mask.op.getValue(),
                      100 * this._mask.op.v
                    );
                  },
                }),
                function (P) {
                  var S,
                    D = createSizedArray(P.viewData.length),
                    T = P.viewData.length;
                  for (S = 0; S < T; S += 1)
                    D[S] = new u(P.viewData[S], P.masksProperties[S]);
                  return function (u) {
                    for (S = 0; S < T; ) {
                      if (P.masksProperties[S].nm === u) return D[S];
                      S += 1;
                    }
                    return null;
                  };
                }
              );
            })(),
            ExpressionPropertyInterface = (function () {
              var u = { pv: 0, v: 0, mult: 1 },
                P = { pv: [0, 0, 0], v: [0, 0, 0], mult: 1 };
              function S(u, P, S) {
                Object.defineProperty(u, 'velocity', {
                  get: function () {
                    return P.getVelocityAtTime(P.comp.currentFrame);
                  },
                }),
                  (u.numKeys = P.keyframes ? P.keyframes.length : 0),
                  (u.key = function (D) {
                    if (!u.numKeys) return 0;
                    var T = '';
                    T =
                      's' in P.keyframes[D - 1]
                        ? P.keyframes[D - 1].s
                        : 'e' in P.keyframes[D - 2]
                        ? P.keyframes[D - 2].e
                        : P.keyframes[D - 2].s;
                    var M =
                      'unidimensional' === S
                        ? new Number(T)
                        : Object.assign({}, T);
                    return (
                      (M.time =
                        P.keyframes[D - 1].t /
                        P.elem.comp.globalData.frameRate),
                      (M.value = 'unidimensional' === S ? T[0] : T),
                      M
                    );
                  }),
                  (u.valueAtTime = P.getValueAtTime),
                  (u.speedAtTime = P.getSpeedAtTime),
                  (u.velocityAtTime = P.getVelocityAtTime),
                  (u.propertyGroup = P.propertyGroup);
              }
              function D(P) {
                (P && 'pv' in P) || (P = u);
                var D = 1 / P.mult,
                  T = P.pv * D,
                  M = new Number(T);
                return (
                  (M.value = T),
                  S(M, P, 'unidimensional'),
                  function () {
                    return (
                      P.k && P.getValue(),
                      (T = P.v * D),
                      M.value !== T &&
                        (((M = new Number(T)).value = T),
                        S(M, P, 'unidimensional')),
                      M
                    );
                  }
                );
              }
              function T(u) {
                (u && 'pv' in u) || (u = P);
                var D = 1 / u.mult,
                  T = (u.data && u.data.l) || u.pv.length,
                  M = createTypedArray('float32', T),
                  E = createTypedArray('float32', T);
                return (
                  (M.value = E),
                  S(M, u, 'multidimensional'),
                  function () {
                    u.k && u.getValue();
                    for (var P = 0; P < T; P += 1)
                      (E[P] = u.v[P] * D), (M[P] = E[P]);
                    return M;
                  }
                );
              }
              function M() {
                return u;
              }
              return function (u) {
                return u ? ('unidimensional' === u.propType ? D(u) : T(u)) : M;
              };
            })(),
            TransformExpressionInterface = (function () {
              return function (u) {
                var P, S, D, T;
                function M(u) {
                  switch (u) {
                    case 'scale':
                    case 'Scale':
                    case 'ADBE Scale':
                    case 6:
                      return M.scale;
                    case 'rotation':
                    case 'Rotation':
                    case 'ADBE Rotation':
                    case 'ADBE Rotate Z':
                    case 10:
                      return M.rotation;
                    case 'ADBE Rotate X':
                      return M.xRotation;
                    case 'ADBE Rotate Y':
                      return M.yRotation;
                    case 'position':
                    case 'Position':
                    case 'ADBE Position':
                    case 2:
                      return M.position;
                    case 'ADBE Position_0':
                      return M.xPosition;
                    case 'ADBE Position_1':
                      return M.yPosition;
                    case 'ADBE Position_2':
                      return M.zPosition;
                    case 'anchorPoint':
                    case 'AnchorPoint':
                    case 'Anchor Point':
                    case 'ADBE AnchorPoint':
                    case 1:
                      return M.anchorPoint;
                    case 'opacity':
                    case 'Opacity':
                    case 11:
                      return M.opacity;
                    default:
                      return null;
                  }
                }
                return (
                  Object.defineProperty(M, 'rotation', {
                    get: ExpressionPropertyInterface(u.r || u.rz),
                  }),
                  Object.defineProperty(M, 'zRotation', {
                    get: ExpressionPropertyInterface(u.rz || u.r),
                  }),
                  Object.defineProperty(M, 'xRotation', {
                    get: ExpressionPropertyInterface(u.rx),
                  }),
                  Object.defineProperty(M, 'yRotation', {
                    get: ExpressionPropertyInterface(u.ry),
                  }),
                  Object.defineProperty(M, 'scale', {
                    get: ExpressionPropertyInterface(u.s),
                  }),
                  u.p
                    ? (T = ExpressionPropertyInterface(u.p))
                    : ((P = ExpressionPropertyInterface(u.px)),
                      (S = ExpressionPropertyInterface(u.py)),
                      u.pz && (D = ExpressionPropertyInterface(u.pz))),
                  Object.defineProperty(M, 'position', {
                    get: function () {
                      return u.p ? T() : [P(), S(), D ? D() : 0];
                    },
                  }),
                  Object.defineProperty(M, 'xPosition', {
                    get: ExpressionPropertyInterface(u.px),
                  }),
                  Object.defineProperty(M, 'yPosition', {
                    get: ExpressionPropertyInterface(u.py),
                  }),
                  Object.defineProperty(M, 'zPosition', {
                    get: ExpressionPropertyInterface(u.pz),
                  }),
                  Object.defineProperty(M, 'anchorPoint', {
                    get: ExpressionPropertyInterface(u.a),
                  }),
                  Object.defineProperty(M, 'opacity', {
                    get: ExpressionPropertyInterface(u.o),
                  }),
                  Object.defineProperty(M, 'skew', {
                    get: ExpressionPropertyInterface(u.sk),
                  }),
                  Object.defineProperty(M, 'skewAxis', {
                    get: ExpressionPropertyInterface(u.sa),
                  }),
                  Object.defineProperty(M, 'orientation', {
                    get: ExpressionPropertyInterface(u.or),
                  }),
                  M
                );
              };
            })(),
            LayerExpressionInterface = (function () {
              function u(u) {
                var P = new Matrix();
                return (
                  void 0 !== u
                    ? this._elem.finalTransform.mProp.getValueAtTime(u).clone(P)
                    : this._elem.finalTransform.mProp.applyToMatrix(P),
                  P
                );
              }
              function P(u, P) {
                var S = this.getMatrix(P);
                return (
                  (S.props[12] = 0),
                  (S.props[13] = 0),
                  (S.props[14] = 0),
                  this.applyPoint(S, u)
                );
              }
              function S(u, P) {
                var S = this.getMatrix(P);
                return this.applyPoint(S, u);
              }
              function D(u, P) {
                var S = this.getMatrix(P);
                return (
                  (S.props[12] = 0),
                  (S.props[13] = 0),
                  (S.props[14] = 0),
                  this.invertPoint(S, u)
                );
              }
              function T(u, P) {
                var S = this.getMatrix(P);
                return this.invertPoint(S, u);
              }
              function M(u, P) {
                if (this._elem.hierarchy && this._elem.hierarchy.length) {
                  var S,
                    D = this._elem.hierarchy.length;
                  for (S = 0; S < D; S += 1)
                    this._elem.hierarchy[S].finalTransform.mProp.applyToMatrix(
                      u
                    );
                }
                return u.applyToPointArray(P[0], P[1], P[2] || 0);
              }
              function E(u, P) {
                if (this._elem.hierarchy && this._elem.hierarchy.length) {
                  var S,
                    D = this._elem.hierarchy.length;
                  for (S = 0; S < D; S += 1)
                    this._elem.hierarchy[S].finalTransform.mProp.applyToMatrix(
                      u
                    );
                }
                return u.inversePoint(P);
              }
              function F(u) {
                var P = new Matrix();
                if (
                  (P.reset(),
                  this._elem.finalTransform.mProp.applyToMatrix(P),
                  this._elem.hierarchy && this._elem.hierarchy.length)
                ) {
                  var S,
                    D = this._elem.hierarchy.length;
                  for (S = 0; S < D; S += 1)
                    this._elem.hierarchy[S].finalTransform.mProp.applyToMatrix(
                      P
                    );
                }
                return P.inversePoint(u);
              }
              function I() {
                return [1, 1, 1, 1];
              }
              return function (L) {
                function R(u) {
                  O.mask = new MaskManagerInterface(u, L);
                }
                function V(u) {
                  O.effect = u;
                }
                function O(u) {
                  switch (u) {
                    case 'ADBE Root Vectors Group':
                    case 'Contents':
                    case 2:
                      return O.shapeInterface;
                    case 1:
                    case 6:
                    case 'Transform':
                    case 'transform':
                    case 'ADBE Transform Group':
                      return N;
                    case 4:
                    case 'ADBE Effect Parade':
                    case 'effects':
                    case 'Effects':
                      return O.effect;
                    case 'ADBE Text Properties':
                      return O.textInterface;
                    default:
                      return null;
                  }
                }
                (O.getMatrix = u),
                  (O.invertPoint = E),
                  (O.applyPoint = M),
                  (O.toWorld = S),
                  (O.toWorldVec = P),
                  (O.fromWorld = T),
                  (O.fromWorldVec = D),
                  (O.toComp = S),
                  (O.fromComp = F),
                  (O.sampleImage = I),
                  (O.sourceRectAtTime = L.sourceRectAtTime.bind(L)),
                  (O._elem = L);
                var N,
                  G = getDescriptor(
                    (N = TransformExpressionInterface(L.finalTransform.mProp)),
                    'anchorPoint'
                  );
                return (
                  Object.defineProperties(O, {
                    hasParent: {
                      get: function () {
                        return L.hierarchy.length;
                      },
                    },
                    parent: {
                      get: function () {
                        return L.hierarchy[0].layerInterface;
                      },
                    },
                    rotation: getDescriptor(N, 'rotation'),
                    scale: getDescriptor(N, 'scale'),
                    position: getDescriptor(N, 'position'),
                    opacity: getDescriptor(N, 'opacity'),
                    anchorPoint: G,
                    anchor_point: G,
                    transform: {
                      get: function () {
                        return N;
                      },
                    },
                    active: {
                      get: function () {
                        return L.isInRange;
                      },
                    },
                  }),
                  (O.startTime = L.data.st),
                  (O.index = L.data.ind),
                  (O.source = L.data.refId),
                  (O.height = 0 === L.data.ty ? L.data.h : 100),
                  (O.width = 0 === L.data.ty ? L.data.w : 100),
                  (O.inPoint = L.data.ip / L.comp.globalData.frameRate),
                  (O.outPoint = L.data.op / L.comp.globalData.frameRate),
                  (O._name = L.data.nm),
                  (O.registerMaskInterface = R),
                  (O.registerEffectsInterface = V),
                  O
                );
              };
            })(),
            propertyGroupFactory = (function () {
              return function (u, P) {
                return function (S) {
                  return (S = void 0 === S ? 1 : S) <= 0 ? u : P(S - 1);
                };
              };
            })(),
            PropertyInterface = (function () {
              return function (u, P) {
                var S = { _name: u };
                return function (u) {
                  return (u = void 0 === u ? 1 : u) <= 0 ? S : P(u - 1);
                };
              };
            })(),
            EffectsExpressionInterface = (function () {
              function u(S, D, T, M) {
                function E(u) {
                  for (var P = S.ef, D = 0, T = P.length; D < T; ) {
                    if (u === P[D].nm || u === P[D].mn || u === P[D].ix) {
                      if (5 === P[D].ty) return L[D];
                      return L[D]();
                    }
                    D += 1;
                  }
                  throw Error();
                }
                var F,
                  I = propertyGroupFactory(E, T),
                  L = [],
                  R = S.ef.length;
                for (F = 0; F < R; F += 1)
                  5 === S.ef[F].ty
                    ? L.push(
                        u(
                          S.ef[F],
                          D.effectElements[F],
                          D.effectElements[F].propertyGroup,
                          M
                        )
                      )
                    : L.push(P(D.effectElements[F], S.ef[F].ty, M, I));
                return (
                  'ADBE Color Control' === S.mn &&
                    Object.defineProperty(E, 'color', {
                      get: function () {
                        return L[0]();
                      },
                    }),
                  Object.defineProperties(E, {
                    numProperties: {
                      get: function () {
                        return S.np;
                      },
                    },
                    _name: { value: S.nm },
                    propertyGroup: { value: I },
                  }),
                  (E.enabled = 0 !== S.en),
                  (E.active = E.enabled),
                  E
                );
              }
              function P(u, P, S, D) {
                var T = ExpressionPropertyInterface(u.p);
                function M() {
                  return 10 === P ? S.comp.compInterface(u.p.v) : T();
                }
                return (
                  u.p.setGroupProperty &&
                    u.p.setGroupProperty(PropertyInterface('', D)),
                  M
                );
              }
              return {
                createEffectsInterface: function (P, S) {
                  if (P.effectsManager) {
                    var D,
                      T = [],
                      M = P.data.ef,
                      E = P.effectsManager.effectElements.length;
                    for (D = 0; D < E; D += 1)
                      T.push(u(M[D], P.effectsManager.effectElements[D], S, P));
                    var F = P.data.ef || [],
                      I = function (u) {
                        for (D = 0, E = F.length; D < E; ) {
                          if (u === F[D].nm || u === F[D].mn || u === F[D].ix)
                            return T[D];
                          D += 1;
                        }
                        return null;
                      };
                    return (
                      Object.defineProperty(I, 'numProperties', {
                        get: function () {
                          return F.length;
                        },
                      }),
                      I
                    );
                  }
                  return null;
                },
              };
            })(),
            ShapePathInterface = (function () {
              return function (u, P, S) {
                var D = P.sh;
                function T(u) {
                  return 'Shape' === u ||
                    'shape' === u ||
                    'Path' === u ||
                    'path' === u ||
                    'ADBE Vector Shape' === u ||
                    2 === u
                    ? T.path
                    : null;
                }
                var M = propertyGroupFactory(T, S);
                return (
                  D.setGroupProperty(PropertyInterface('Path', M)),
                  Object.defineProperties(T, {
                    path: {
                      get: function () {
                        return D.k && D.getValue(), D;
                      },
                    },
                    shape: {
                      get: function () {
                        return D.k && D.getValue(), D;
                      },
                    },
                    _name: { value: u.nm },
                    ix: { value: u.ix },
                    propertyIndex: { value: u.ix },
                    mn: { value: u.mn },
                    propertyGroup: { value: S },
                  }),
                  T
                );
              };
            })(),
            ShapeExpressionInterface = (function () {
              function u(u, P, I) {
                var G,
                  W = [],
                  Y = u ? u.length : 0;
                for (G = 0; G < Y; G += 1)
                  'gr' === u[G].ty
                    ? W.push(S(u[G], P[G], I))
                    : 'fl' === u[G].ty
                    ? W.push(D(u[G], P[G], I))
                    : 'st' === u[G].ty
                    ? W.push(E(u[G], P[G], I))
                    : 'tm' === u[G].ty
                    ? W.push(F(u[G], P[G], I))
                    : 'tr' === u[G].ty ||
                      ('el' === u[G].ty
                        ? W.push(L(u[G], P[G], I))
                        : 'sr' === u[G].ty
                        ? W.push(R(u[G], P[G], I))
                        : 'sh' === u[G].ty
                        ? W.push(ShapePathInterface(u[G], P[G], I))
                        : 'rc' === u[G].ty
                        ? W.push(V(u[G], P[G], I))
                        : 'rd' === u[G].ty
                        ? W.push(O(u[G], P[G], I))
                        : 'rp' === u[G].ty
                        ? W.push(N(u[G], P[G], I))
                        : 'gf' === u[G].ty
                        ? W.push(T(u[G], P[G], I))
                        : W.push(M(u[G], P[G], I)));
                return W;
              }
              function P(P, S, D) {
                var T,
                  M = function (u) {
                    for (var P = 0, S = T.length; P < S; ) {
                      if (
                        T[P]._name === u ||
                        T[P].mn === u ||
                        T[P].propertyIndex === u ||
                        T[P].ix === u ||
                        T[P].ind === u
                      )
                        return T[P];
                      P += 1;
                    }
                    return 'number' == typeof u ? T[u - 1] : null;
                  };
                (M.propertyGroup = propertyGroupFactory(M, D)),
                  (T = u(P.it, S.it, M.propertyGroup)),
                  (M.numProperties = T.length);
                var E = I(
                  P.it[P.it.length - 1],
                  S.it[S.it.length - 1],
                  M.propertyGroup
                );
                return (
                  (M.transform = E),
                  (M.propertyIndex = P.cix),
                  (M._name = P.nm),
                  M
                );
              }
              function S(u, S, D) {
                var T = function (u) {
                  switch (u) {
                    case 'ADBE Vectors Group':
                    case 'Contents':
                    case 2:
                      return T.content;
                    default:
                      return T.transform;
                  }
                };
                T.propertyGroup = propertyGroupFactory(T, D);
                var M = P(u, S, T.propertyGroup),
                  E = I(
                    u.it[u.it.length - 1],
                    S.it[S.it.length - 1],
                    T.propertyGroup
                  );
                return (
                  (T.content = M),
                  (T.transform = E),
                  Object.defineProperty(T, '_name', {
                    get: function () {
                      return u.nm;
                    },
                  }),
                  (T.numProperties = u.np),
                  (T.propertyIndex = u.ix),
                  (T.nm = u.nm),
                  (T.mn = u.mn),
                  T
                );
              }
              function D(u, P, S) {
                function D(u) {
                  return 'Color' === u || 'color' === u
                    ? D.color
                    : 'Opacity' === u || 'opacity' === u
                    ? D.opacity
                    : null;
                }
                return (
                  Object.defineProperties(D, {
                    color: { get: ExpressionPropertyInterface(P.c) },
                    opacity: { get: ExpressionPropertyInterface(P.o) },
                    _name: { value: u.nm },
                    mn: { value: u.mn },
                  }),
                  P.c.setGroupProperty(PropertyInterface('Color', S)),
                  P.o.setGroupProperty(PropertyInterface('Opacity', S)),
                  D
                );
              }
              function T(u, P, S) {
                function D(u) {
                  return 'Start Point' === u || 'start point' === u
                    ? D.startPoint
                    : 'End Point' === u || 'end point' === u
                    ? D.endPoint
                    : 'Opacity' === u || 'opacity' === u
                    ? D.opacity
                    : null;
                }
                return (
                  Object.defineProperties(D, {
                    startPoint: { get: ExpressionPropertyInterface(P.s) },
                    endPoint: { get: ExpressionPropertyInterface(P.e) },
                    opacity: { get: ExpressionPropertyInterface(P.o) },
                    type: {
                      get: function () {
                        return 'a';
                      },
                    },
                    _name: { value: u.nm },
                    mn: { value: u.mn },
                  }),
                  P.s.setGroupProperty(PropertyInterface('Start Point', S)),
                  P.e.setGroupProperty(PropertyInterface('End Point', S)),
                  P.o.setGroupProperty(PropertyInterface('Opacity', S)),
                  D
                );
              }
              function M() {
                return function () {
                  return null;
                };
              }
              function E(u, P, S) {
                var D,
                  T = propertyGroupFactory(L, S),
                  M = propertyGroupFactory(I, T);
                function E(S) {
                  Object.defineProperty(I, u.d[S].nm, {
                    get: ExpressionPropertyInterface(P.d.dataProps[S].p),
                  });
                }
                var F = u.d ? u.d.length : 0,
                  I = {};
                for (D = 0; D < F; D += 1)
                  E(D), P.d.dataProps[D].p.setGroupProperty(M);
                function L(u) {
                  return 'Color' === u || 'color' === u
                    ? L.color
                    : 'Opacity' === u || 'opacity' === u
                    ? L.opacity
                    : 'Stroke Width' === u || 'stroke width' === u
                    ? L.strokeWidth
                    : null;
                }
                return (
                  Object.defineProperties(L, {
                    color: { get: ExpressionPropertyInterface(P.c) },
                    opacity: { get: ExpressionPropertyInterface(P.o) },
                    strokeWidth: { get: ExpressionPropertyInterface(P.w) },
                    dash: {
                      get: function () {
                        return I;
                      },
                    },
                    _name: { value: u.nm },
                    mn: { value: u.mn },
                  }),
                  P.c.setGroupProperty(PropertyInterface('Color', T)),
                  P.o.setGroupProperty(PropertyInterface('Opacity', T)),
                  P.w.setGroupProperty(PropertyInterface('Stroke Width', T)),
                  L
                );
              }
              function F(u, P, S) {
                function D(P) {
                  return P === u.e.ix || 'End' === P || 'end' === P
                    ? D.end
                    : P === u.s.ix
                    ? D.start
                    : P === u.o.ix
                    ? D.offset
                    : null;
                }
                var T = propertyGroupFactory(D, S);
                return (
                  (D.propertyIndex = u.ix),
                  P.s.setGroupProperty(PropertyInterface('Start', T)),
                  P.e.setGroupProperty(PropertyInterface('End', T)),
                  P.o.setGroupProperty(PropertyInterface('Offset', T)),
                  (D.propertyIndex = u.ix),
                  (D.propertyGroup = S),
                  Object.defineProperties(D, {
                    start: { get: ExpressionPropertyInterface(P.s) },
                    end: { get: ExpressionPropertyInterface(P.e) },
                    offset: { get: ExpressionPropertyInterface(P.o) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              function I(u, P, S) {
                function D(P) {
                  return u.a.ix === P || 'Anchor Point' === P
                    ? D.anchorPoint
                    : u.o.ix === P || 'Opacity' === P
                    ? D.opacity
                    : u.p.ix === P || 'Position' === P
                    ? D.position
                    : u.r.ix === P ||
                      'Rotation' === P ||
                      'ADBE Vector Rotation' === P
                    ? D.rotation
                    : u.s.ix === P || 'Scale' === P
                    ? D.scale
                    : (u.sk && u.sk.ix === P) || 'Skew' === P
                    ? D.skew
                    : (u.sa && u.sa.ix === P) || 'Skew Axis' === P
                    ? D.skewAxis
                    : null;
                }
                var T = propertyGroupFactory(D, S);
                return (
                  P.transform.mProps.o.setGroupProperty(
                    PropertyInterface('Opacity', T)
                  ),
                  P.transform.mProps.p.setGroupProperty(
                    PropertyInterface('Position', T)
                  ),
                  P.transform.mProps.a.setGroupProperty(
                    PropertyInterface('Anchor Point', T)
                  ),
                  P.transform.mProps.s.setGroupProperty(
                    PropertyInterface('Scale', T)
                  ),
                  P.transform.mProps.r.setGroupProperty(
                    PropertyInterface('Rotation', T)
                  ),
                  P.transform.mProps.sk &&
                    (P.transform.mProps.sk.setGroupProperty(
                      PropertyInterface('Skew', T)
                    ),
                    P.transform.mProps.sa.setGroupProperty(
                      PropertyInterface('Skew Angle', T)
                    )),
                  P.transform.op.setGroupProperty(
                    PropertyInterface('Opacity', T)
                  ),
                  Object.defineProperties(D, {
                    opacity: {
                      get: ExpressionPropertyInterface(P.transform.mProps.o),
                    },
                    position: {
                      get: ExpressionPropertyInterface(P.transform.mProps.p),
                    },
                    anchorPoint: {
                      get: ExpressionPropertyInterface(P.transform.mProps.a),
                    },
                    scale: {
                      get: ExpressionPropertyInterface(P.transform.mProps.s),
                    },
                    rotation: {
                      get: ExpressionPropertyInterface(P.transform.mProps.r),
                    },
                    skew: {
                      get: ExpressionPropertyInterface(P.transform.mProps.sk),
                    },
                    skewAxis: {
                      get: ExpressionPropertyInterface(P.transform.mProps.sa),
                    },
                    _name: { value: u.nm },
                  }),
                  (D.ty = 'tr'),
                  (D.mn = u.mn),
                  (D.propertyGroup = S),
                  D
                );
              }
              function L(u, P, S) {
                function D(P) {
                  return u.p.ix === P
                    ? D.position
                    : u.s.ix === P
                    ? D.size
                    : null;
                }
                var T = propertyGroupFactory(D, S);
                D.propertyIndex = u.ix;
                var M = 'tm' === P.sh.ty ? P.sh.prop : P.sh;
                return (
                  M.s.setGroupProperty(PropertyInterface('Size', T)),
                  M.p.setGroupProperty(PropertyInterface('Position', T)),
                  Object.defineProperties(D, {
                    size: { get: ExpressionPropertyInterface(M.s) },
                    position: { get: ExpressionPropertyInterface(M.p) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              function R(u, P, S) {
                function D(P) {
                  return u.p.ix === P
                    ? D.position
                    : u.r.ix === P
                    ? D.rotation
                    : u.pt.ix === P
                    ? D.points
                    : u.or.ix === P || 'ADBE Vector Star Outer Radius' === P
                    ? D.outerRadius
                    : u.os.ix === P
                    ? D.outerRoundness
                    : u.ir &&
                      (u.ir.ix === P || 'ADBE Vector Star Inner Radius' === P)
                    ? D.innerRadius
                    : u.is && u.is.ix === P
                    ? D.innerRoundness
                    : null;
                }
                var T = propertyGroupFactory(D, S),
                  M = 'tm' === P.sh.ty ? P.sh.prop : P.sh;
                return (
                  (D.propertyIndex = u.ix),
                  M.or.setGroupProperty(PropertyInterface('Outer Radius', T)),
                  M.os.setGroupProperty(
                    PropertyInterface('Outer Roundness', T)
                  ),
                  M.pt.setGroupProperty(PropertyInterface('Points', T)),
                  M.p.setGroupProperty(PropertyInterface('Position', T)),
                  M.r.setGroupProperty(PropertyInterface('Rotation', T)),
                  u.ir &&
                    (M.ir.setGroupProperty(
                      PropertyInterface('Inner Radius', T)
                    ),
                    M.is.setGroupProperty(
                      PropertyInterface('Inner Roundness', T)
                    )),
                  Object.defineProperties(D, {
                    position: { get: ExpressionPropertyInterface(M.p) },
                    rotation: { get: ExpressionPropertyInterface(M.r) },
                    points: { get: ExpressionPropertyInterface(M.pt) },
                    outerRadius: { get: ExpressionPropertyInterface(M.or) },
                    outerRoundness: { get: ExpressionPropertyInterface(M.os) },
                    innerRadius: { get: ExpressionPropertyInterface(M.ir) },
                    innerRoundness: { get: ExpressionPropertyInterface(M.is) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              function V(u, P, S) {
                function D(P) {
                  return u.p.ix === P
                    ? D.position
                    : u.r.ix === P
                    ? D.roundness
                    : u.s.ix === P ||
                      'Size' === P ||
                      'ADBE Vector Rect Size' === P
                    ? D.size
                    : null;
                }
                var T = propertyGroupFactory(D, S),
                  M = 'tm' === P.sh.ty ? P.sh.prop : P.sh;
                return (
                  (D.propertyIndex = u.ix),
                  M.p.setGroupProperty(PropertyInterface('Position', T)),
                  M.s.setGroupProperty(PropertyInterface('Size', T)),
                  M.r.setGroupProperty(PropertyInterface('Rotation', T)),
                  Object.defineProperties(D, {
                    position: { get: ExpressionPropertyInterface(M.p) },
                    roundness: { get: ExpressionPropertyInterface(M.r) },
                    size: { get: ExpressionPropertyInterface(M.s) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              function O(u, P, S) {
                function D(P) {
                  return u.r.ix === P || 'Round Corners 1' === P
                    ? D.radius
                    : null;
                }
                var T = propertyGroupFactory(D, S),
                  M = P;
                return (
                  (D.propertyIndex = u.ix),
                  M.rd.setGroupProperty(PropertyInterface('Radius', T)),
                  Object.defineProperties(D, {
                    radius: { get: ExpressionPropertyInterface(M.rd) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              function N(u, P, S) {
                function D(P) {
                  return u.c.ix === P || 'Copies' === P
                    ? D.copies
                    : u.o.ix === P || 'Offset' === P
                    ? D.offset
                    : null;
                }
                var T = propertyGroupFactory(D, S),
                  M = P;
                return (
                  (D.propertyIndex = u.ix),
                  M.c.setGroupProperty(PropertyInterface('Copies', T)),
                  M.o.setGroupProperty(PropertyInterface('Offset', T)),
                  Object.defineProperties(D, {
                    copies: { get: ExpressionPropertyInterface(M.c) },
                    offset: { get: ExpressionPropertyInterface(M.o) },
                    _name: { value: u.nm },
                  }),
                  (D.mn = u.mn),
                  D
                );
              }
              return function (P, S, D) {
                var T;
                function M(u) {
                  if ('number' == typeof u)
                    return 0 === (u = void 0 === u ? 1 : u) ? D : T[u - 1];
                  for (var P = 0, S = T.length; P < S; ) {
                    if (T[P]._name === u) return T[P];
                    P += 1;
                  }
                  return null;
                }
                function E() {
                  return D;
                }
                return (
                  (M.propertyGroup = propertyGroupFactory(M, E)),
                  (T = u(P, S, M.propertyGroup)),
                  (M.numProperties = T.length),
                  (M._name = 'Contents'),
                  M
                );
              };
            })(),
            TextExpressionInterface = (function () {
              return function (u) {
                var P;
                function S(u) {
                  return 'ADBE Text Document' === u ? S.sourceText : null;
                }
                return (
                  Object.defineProperty(S, 'sourceText', {
                    get: function () {
                      u.textProperty.getValue();
                      var S = u.textProperty.currentData.t;
                      return (
                        (P && S === P.value) ||
                          (((P = new String(S)).value = S || new String(S)),
                          Object.defineProperty(P, 'style', {
                            get: function () {
                              return {
                                fillColor: u.textProperty.currentData.fc,
                              };
                            },
                          })),
                        P
                      );
                    },
                  }),
                  S
                );
              };
            })();
          function _typeof(u) {
            return (_typeof =
              'function' == typeof Symbol && 'symbol' == typeof Symbol.iterator
                ? function (u) {
                    return typeof u;
                  }
                : function (u) {
                    return u &&
                      'function' == typeof Symbol &&
                      u.constructor === Symbol &&
                      u !== Symbol.prototype
                      ? 'symbol'
                      : typeof u;
                  })(u);
          }
          var FootageInterface = (function () {
              var u = function (u) {
                  var P = '',
                    S = u.getFootageData();
                  function D(u) {
                    if (S[u])
                      return ((P = u), 'object' === _typeof((S = S[u])))
                        ? D
                        : S;
                    var T = u.indexOf(P);
                    return -1 !== T
                      ? 'object' ===
                        _typeof((S = S[parseInt(u.substr(T + P.length), 10)]))
                        ? D
                        : S
                      : '';
                  }
                  return function () {
                    return (P = ''), (S = u.getFootageData()), D;
                  };
                },
                P = function (P) {
                  function S(u) {
                    return 'Outline' === u ? S.outlineInterface() : null;
                  }
                  return (S._name = 'Outline'), (S.outlineInterface = u(P)), S;
                };
              return function (u) {
                function S(u) {
                  return 'Data' === u ? S.dataInterface : null;
                }
                return (S._name = 'Data'), (S.dataInterface = P(u)), S;
              };
            })(),
            interfaces = {
              layer: LayerExpressionInterface,
              effects: EffectsExpressionInterface,
              comp: CompExpressionInterface,
              shape: ShapeExpressionInterface,
              text: TextExpressionInterface,
              footage: FootageInterface,
            };
          function getInterface(u) {
            return interfaces[u] || null;
          }
          var expressionHelpers = (function () {
            return {
              searchExpressions: function (u, P, S) {
                P.x &&
                  ((S.k = !0),
                  (S.x = !0),
                  (S.initiateExpression = ExpressionManager.initiateExpression),
                  S.effectsSequence.push(
                    S.initiateExpression(u, P, S).bind(S)
                  ));
              },
              getSpeedAtTime: function (u) {
                var P,
                  S = -0.01,
                  D = this.getValueAtTime(u),
                  T = this.getValueAtTime(u + S),
                  M = 0;
                if (D.length) {
                  for (P = 0; P < D.length; P += 1)
                    M += Math.pow(T[P] - D[P], 2);
                  M = 100 * Math.sqrt(M);
                } else M = 0;
                return M;
              },
              getVelocityAtTime: function (u) {
                if (void 0 !== this.vel) return this.vel;
                var P,
                  S,
                  D = -0.001,
                  T = this.getValueAtTime(u),
                  M = this.getValueAtTime(u + D);
                if (T.length)
                  for (
                    S = 0, P = createTypedArray('float32', T.length);
                    S < T.length;
                    S += 1
                  )
                    P[S] = (M[S] - T[S]) / D;
                else P = (M - T) / D;
                return P;
              },
              getValueAtTime: function (u) {
                return (
                  (u *= this.elem.globalData.frameRate),
                  (u -= this.offsetTime) !== this._cachingAtTime.lastFrame &&
                    ((this._cachingAtTime.lastIndex =
                      this._cachingAtTime.lastFrame < u
                        ? this._cachingAtTime.lastIndex
                        : 0),
                    (this._cachingAtTime.value = this.interpolateValue(
                      u,
                      this._cachingAtTime
                    )),
                    (this._cachingAtTime.lastFrame = u)),
                  this._cachingAtTime.value
                );
              },
              getStaticValueAtTime: function () {
                return this.pv;
              },
              setGroupProperty: function (u) {
                this.propertyGroup = u;
              },
            };
          })();
          function addPropertyDecorator() {
            function u(u, P, S) {
              if (!this.k || !this.keyframes) return this.pv;
              u = u ? u.toLowerCase() : '';
              var D,
                T,
                M,
                E,
                F,
                I = this.comp.renderedFrame,
                L = this.keyframes,
                R = L[L.length - 1].t;
              if (I <= R) return this.pv;
              if (
                (S
                  ? ((D = P
                      ? Math.abs(R - this.elem.comp.globalData.frameRate * P)
                      : Math.max(0, R - this.elem.data.ip)),
                    (T = R - D))
                  : ((!P || P > L.length - 1) && (P = L.length - 1),
                    (D = R - (T = L[L.length - 1 - P].t))),
                'pingpong' === u)
              ) {
                if (Math.floor((I - T) / D) % 2 != 0)
                  return this.getValueAtTime(
                    (D - ((I - T) % D) + T) / this.comp.globalData.frameRate,
                    0
                  );
              } else if ('offset' === u) {
                var V = this.getValueAtTime(
                    T / this.comp.globalData.frameRate,
                    0
                  ),
                  O = this.getValueAtTime(
                    R / this.comp.globalData.frameRate,
                    0
                  ),
                  N = this.getValueAtTime(
                    (((I - T) % D) + T) / this.comp.globalData.frameRate,
                    0
                  ),
                  G = Math.floor((I - T) / D);
                if (this.pv.length) {
                  for (M = 0, E = (F = Array(V.length)).length; M < E; M += 1)
                    F[M] = (O[M] - V[M]) * G + N[M];
                  return F;
                }
                return (O - V) * G + N;
              } else if ('continue' === u) {
                var W = this.getValueAtTime(
                    R / this.comp.globalData.frameRate,
                    0
                  ),
                  Y = this.getValueAtTime(
                    (R - 0.001) / this.comp.globalData.frameRate,
                    0
                  );
                if (this.pv.length) {
                  for (M = 0, E = (F = Array(W.length)).length; M < E; M += 1)
                    F[M] =
                      W[M] +
                      ((W[M] - Y[M]) *
                        ((I - R) / this.comp.globalData.frameRate)) /
                        5e-4;
                  return F;
                }
                return W + (W - Y) * ((I - R) / 0.001);
              }
              return this.getValueAtTime(
                (((I - T) % D) + T) / this.comp.globalData.frameRate,
                0
              );
            }
            function P(u, P, S) {
              if (!this.k) return this.pv;
              u = u ? u.toLowerCase() : '';
              var D,
                T,
                M,
                E,
                F,
                I = this.comp.renderedFrame,
                L = this.keyframes,
                R = L[0].t;
              if (I >= R) return this.pv;
              if (
                (S
                  ? ((D = P
                      ? Math.abs(this.elem.comp.globalData.frameRate * P)
                      : Math.max(0, this.elem.data.op - R)),
                    (T = R + D))
                  : ((!P || P > L.length - 1) && (P = L.length - 1),
                    (D = (T = L[P].t) - R)),
                'pingpong' === u)
              ) {
                if (Math.floor((R - I) / D) % 2 == 0)
                  return this.getValueAtTime(
                    (((R - I) % D) + R) / this.comp.globalData.frameRate,
                    0
                  );
              } else if ('offset' === u) {
                var V = this.getValueAtTime(
                    R / this.comp.globalData.frameRate,
                    0
                  ),
                  O = this.getValueAtTime(
                    T / this.comp.globalData.frameRate,
                    0
                  ),
                  N = this.getValueAtTime(
                    (D - ((R - I) % D) + R) / this.comp.globalData.frameRate,
                    0
                  ),
                  G = Math.floor((R - I) / D) + 1;
                if (this.pv.length) {
                  for (M = 0, E = (F = Array(V.length)).length; M < E; M += 1)
                    F[M] = N[M] - (O[M] - V[M]) * G;
                  return F;
                }
                return N - (O - V) * G;
              } else if ('continue' === u) {
                var W = this.getValueAtTime(
                    R / this.comp.globalData.frameRate,
                    0
                  ),
                  Y = this.getValueAtTime(
                    (R + 0.001) / this.comp.globalData.frameRate,
                    0
                  );
                if (this.pv.length) {
                  for (M = 0, E = (F = Array(W.length)).length; M < E; M += 1)
                    F[M] = W[M] + ((W[M] - Y[M]) * (R - I)) / 0.001;
                  return F;
                }
                return W + ((W - Y) * (R - I)) / 0.001;
              }
              return this.getValueAtTime(
                (D - (((R - I) % D) + R)) / this.comp.globalData.frameRate,
                0
              );
            }
            function S(u, P) {
              if (
                !this.k ||
                ((u = 0.5 * (u || 0.4)), (P = Math.floor(P || 5)) <= 1)
              )
                return this.pv;
              var S,
                D,
                T = this.comp.renderedFrame / this.comp.globalData.frameRate,
                M = T - u,
                E = T + u,
                F = P > 1 ? (E - M) / (P - 1) : 1,
                I = 0,
                L = 0;
              for (
                S = this.pv.length
                  ? createTypedArray('float32', this.pv.length)
                  : 0;
                I < P;

              ) {
                if (((D = this.getValueAtTime(M + I * F)), this.pv.length))
                  for (L = 0; L < this.pv.length; L += 1) S[L] += D[L];
                else S += D;
                I += 1;
              }
              if (this.pv.length)
                for (L = 0; L < this.pv.length; L += 1) S[L] /= P;
              else S /= P;
              return S;
            }
            function D(u) {
              this._transformCachingAtTime ||
                (this._transformCachingAtTime = { v: new Matrix() });
              var P = this._transformCachingAtTime.v;
              if (
                (P.cloneFromProps(this.pre.props),
                this.appliedTransformations < 1)
              ) {
                var S = this.a.getValueAtTime(u);
                P.translate(
                  -S[0] * this.a.mult,
                  -S[1] * this.a.mult,
                  S[2] * this.a.mult
                );
              }
              if (this.appliedTransformations < 2) {
                var D = this.s.getValueAtTime(u);
                P.scale(
                  D[0] * this.s.mult,
                  D[1] * this.s.mult,
                  D[2] * this.s.mult
                );
              }
              if (this.sk && this.appliedTransformations < 3) {
                var T = this.sk.getValueAtTime(u),
                  M = this.sa.getValueAtTime(u);
                P.skewFromAxis(-T * this.sk.mult, M * this.sa.mult);
              }
              if (this.r && this.appliedTransformations < 4) {
                var E = this.r.getValueAtTime(u);
                P.rotate(-E * this.r.mult);
              } else if (!this.r && this.appliedTransformations < 4) {
                var F = this.rz.getValueAtTime(u),
                  I = this.ry.getValueAtTime(u),
                  L = this.rx.getValueAtTime(u),
                  R = this.or.getValueAtTime(u);
                P.rotateZ(-F * this.rz.mult)
                  .rotateY(I * this.ry.mult)
                  .rotateX(L * this.rx.mult)
                  .rotateZ(-R[2] * this.or.mult)
                  .rotateY(R[1] * this.or.mult)
                  .rotateX(R[0] * this.or.mult);
              }
              if (this.data.p && this.data.p.s) {
                var V = this.px.getValueAtTime(u),
                  O = this.py.getValueAtTime(u);
                if (this.data.p.z) {
                  var N = this.pz.getValueAtTime(u);
                  P.translate(
                    V * this.px.mult,
                    O * this.py.mult,
                    -N * this.pz.mult
                  );
                } else P.translate(V * this.px.mult, O * this.py.mult, 0);
              } else {
                var G = this.p.getValueAtTime(u);
                P.translate(
                  G[0] * this.p.mult,
                  G[1] * this.p.mult,
                  -G[2] * this.p.mult
                );
              }
              return P;
            }
            function T() {
              return this.v.clone(new Matrix());
            }
            var M = TransformPropertyFactory.getTransformProperty;
            TransformPropertyFactory.getTransformProperty = function (u, P, S) {
              var E = M(u, P, S);
              return (
                E.dynamicProperties.length
                  ? (E.getValueAtTime = D.bind(E))
                  : (E.getValueAtTime = T.bind(E)),
                (E.setGroupProperty = expressionHelpers.setGroupProperty),
                E
              );
            };
            var E = PropertyFactory.getProp;
            function F(u) {
              return (
                this._cachingAtTime ||
                  (this._cachingAtTime = {
                    shapeValue: shapePool.clone(this.pv),
                    lastIndex: 0,
                    lastTime: initialDefaultFrame,
                  }),
                (u *= this.elem.globalData.frameRate),
                (u -= this.offsetTime) !== this._cachingAtTime.lastTime &&
                  ((this._cachingAtTime.lastIndex =
                    this._cachingAtTime.lastTime < u
                      ? this._caching.lastIndex
                      : 0),
                  (this._cachingAtTime.lastTime = u),
                  this.interpolateShape(
                    u,
                    this._cachingAtTime.shapeValue,
                    this._cachingAtTime
                  )),
                this._cachingAtTime.shapeValue
              );
            }
            PropertyFactory.getProp = function (D, T, M, F, I) {
              var L = E(D, T, M, F, I);
              L.kf
                ? (L.getValueAtTime = expressionHelpers.getValueAtTime.bind(L))
                : (L.getValueAtTime =
                    expressionHelpers.getStaticValueAtTime.bind(L)),
                (L.setGroupProperty = expressionHelpers.setGroupProperty),
                (L.loopOut = u),
                (L.loopIn = P),
                (L.smooth = S),
                (L.getVelocityAtTime =
                  expressionHelpers.getVelocityAtTime.bind(L)),
                (L.getSpeedAtTime = expressionHelpers.getSpeedAtTime.bind(L)),
                (L.numKeys = 1 === T.a ? T.k.length : 0),
                (L.propertyIndex = T.ix);
              var R = 0;
              return (
                0 !== M &&
                  (R = createTypedArray(
                    'float32',
                    1 === T.a ? T.k[0].s.length : T.k.length
                  )),
                (L._cachingAtTime = {
                  lastFrame: initialDefaultFrame,
                  lastIndex: 0,
                  value: R,
                }),
                expressionHelpers.searchExpressions(D, T, L),
                L.k && I.addDynamicProperty(L),
                L
              );
            };
            var I = ShapePropertyFactory.getConstructorFunction(),
              L = ShapePropertyFactory.getKeyframedConstructorFunction();
            function R() {}
            (R.prototype = {
              vertices: function (u, P) {
                this.k && this.getValue();
                var S,
                  D = this.v;
                void 0 !== P && (D = this.getValueAtTime(P, 0));
                var T = D._length,
                  M = D[u],
                  E = D.v,
                  F = createSizedArray(T);
                for (S = 0; S < T; S += 1)
                  'i' === u || 'o' === u
                    ? (F[S] = [M[S][0] - E[S][0], M[S][1] - E[S][1]])
                    : (F[S] = [M[S][0], M[S][1]]);
                return F;
              },
              points: function (u) {
                return this.vertices('v', u);
              },
              inTangents: function (u) {
                return this.vertices('i', u);
              },
              outTangents: function (u) {
                return this.vertices('o', u);
              },
              isClosed: function () {
                return this.v.c;
              },
              pointOnPath: function (u, P) {
                var S,
                  D = this.v;
                void 0 !== P && (D = this.getValueAtTime(P, 0)),
                  this._segmentsLength ||
                    (this._segmentsLength = bez.getSegmentsLength(D));
                for (
                  var T = this._segmentsLength,
                    M = T.lengths,
                    E = T.totalLength * u,
                    F = 0,
                    I = M.length,
                    L = 0;
                  F < I;

                ) {
                  if (L + M[F].addedLength > E) {
                    var R = F,
                      V = D.c && F === I - 1 ? 0 : F + 1,
                      O = (E - L) / M[F].addedLength;
                    S = bez.getPointInSegment(
                      D.v[R],
                      D.v[V],
                      D.o[R],
                      D.i[V],
                      O,
                      M[F]
                    );
                    break;
                  }
                  (L += M[F].addedLength), (F += 1);
                }
                return (
                  S ||
                    (S = D.c
                      ? [D.v[0][0], D.v[0][1]]
                      : [D.v[D._length - 1][0], D.v[D._length - 1][1]]),
                  S
                );
              },
              vectorOnPath: function (u, P, S) {
                1 == u ? (u = this.v.c) : 0 == u && (u = 0.999);
                var D = this.pointOnPath(u, P),
                  T = this.pointOnPath(u + 0.001, P),
                  M = T[0] - D[0],
                  E = T[1] - D[1],
                  F = Math.sqrt(Math.pow(M, 2) + Math.pow(E, 2));
                return 0 === F
                  ? [0, 0]
                  : 'tangent' === S
                  ? [M / F, E / F]
                  : [-E / F, M / F];
              },
              tangentOnPath: function (u, P) {
                return this.vectorOnPath(u, P, 'tangent');
              },
              normalOnPath: function (u, P) {
                return this.vectorOnPath(u, P, 'normal');
              },
              setGroupProperty: expressionHelpers.setGroupProperty,
              getValueAtTime: expressionHelpers.getStaticValueAtTime,
            }),
              extendPrototype([R], I),
              extendPrototype([R], L),
              (L.prototype.getValueAtTime = F),
              (L.prototype.initiateExpression =
                ExpressionManager.initiateExpression);
            var V = ShapePropertyFactory.getShapeProp;
            ShapePropertyFactory.getShapeProp = function (u, P, S, D, T) {
              var M = V(u, P, S, D, T);
              return (
                (M.propertyIndex = P.ix),
                (M.lock = !1),
                3 === S
                  ? expressionHelpers.searchExpressions(u, P.pt, M)
                  : 4 === S && expressionHelpers.searchExpressions(u, P.ks, M),
                M.k && u.addDynamicProperty(M),
                M
              );
            };
          }
          function initialize$1() {
            addPropertyDecorator();
          }
          function addDecorator() {
            function u() {
              return this.data.d.x
                ? ((this.calculateExpression =
                    ExpressionManager.initiateExpression.bind(this)(
                      this.elem,
                      this.data.d,
                      this
                    )),
                  this.addEffect(this.getExpressionValue.bind(this)),
                  !0)
                : null;
            }
            (TextProperty.prototype.getExpressionValue = function (u, P) {
              var S = this.calculateExpression(P);
              if (u.t !== S) {
                var D = {};
                return (
                  this.copyData(D, u),
                  (D.t = S.toString()),
                  (D.__complete = !1),
                  D
                );
              }
              return u;
            }),
              (TextProperty.prototype.searchProperty = function () {
                var u = this.searchKeyframes(),
                  P = this.searchExpressions();
                return (this.kf = u || P), this.kf;
              }),
              (TextProperty.prototype.searchExpressions = u);
          }
          function initialize() {
            addDecorator();
          }
          function SVGComposableEffect() {}
          SVGComposableEffect.prototype = {
            createMergeNode: function (u, P) {
              var S,
                D,
                T = createNS('feMerge');
              for (T.setAttribute('result', u), D = 0; D < P.length; D += 1)
                (S = createNS('feMergeNode')).setAttribute('in', P[D]),
                  T.appendChild(S),
                  T.appendChild(S);
              return T;
            },
          };
          var linearFilterValue =
            '0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0';
          function SVGTintFilter(u, P, S, D, T) {
            this.filterManager = P;
            var M = createNS('feColorMatrix');
            M.setAttribute('type', 'matrix'),
              M.setAttribute('color-interpolation-filters', 'linearRGB'),
              M.setAttribute('values', linearFilterValue + ' 1 0'),
              (this.linearFilter = M),
              M.setAttribute('result', D + '_tint_1'),
              u.appendChild(M),
              (M = createNS('feColorMatrix')).setAttribute('type', 'matrix'),
              M.setAttribute('color-interpolation-filters', 'sRGB'),
              M.setAttribute(
                'values',
                '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'
              ),
              M.setAttribute('result', D + '_tint_2'),
              u.appendChild(M),
              (this.matrixFilter = M);
            var E = this.createMergeNode(D, [T, D + '_tint_1', D + '_tint_2']);
            u.appendChild(E);
          }
          function SVGFillFilter(u, P, S, D) {
            this.filterManager = P;
            var T = createNS('feColorMatrix');
            T.setAttribute('type', 'matrix'),
              T.setAttribute('color-interpolation-filters', 'sRGB'),
              T.setAttribute(
                'values',
                '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0'
              ),
              T.setAttribute('result', D),
              u.appendChild(T),
              (this.matrixFilter = T);
          }
          function SVGStrokeEffect(u, P, S) {
            (this.initialized = !1),
              (this.filterManager = P),
              (this.elem = S),
              (this.paths = []);
          }
          function SVGTritoneFilter(u, P, S, D) {
            this.filterManager = P;
            var T = createNS('feColorMatrix');
            T.setAttribute('type', 'matrix'),
              T.setAttribute('color-interpolation-filters', 'linearRGB'),
              T.setAttribute(
                'values',
                '0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0.3333 0.3333 0.3333 0 0 0 0 0 1 0'
              ),
              u.appendChild(T);
            var M = createNS('feComponentTransfer');
            M.setAttribute('color-interpolation-filters', 'sRGB'),
              M.setAttribute('result', D),
              (this.matrixFilter = M);
            var E = createNS('feFuncR');
            E.setAttribute('type', 'table'),
              M.appendChild(E),
              (this.feFuncR = E);
            var F = createNS('feFuncG');
            F.setAttribute('type', 'table'),
              M.appendChild(F),
              (this.feFuncG = F);
            var I = createNS('feFuncB');
            I.setAttribute('type', 'table'),
              M.appendChild(I),
              (this.feFuncB = I),
              u.appendChild(M);
          }
          function SVGProLevelsFilter(u, P, S, D) {
            this.filterManager = P;
            var T = this.filterManager.effectElements,
              M = createNS('feComponentTransfer');
            (T[10].p.k ||
              0 !== T[10].p.v ||
              T[11].p.k ||
              1 !== T[11].p.v ||
              T[12].p.k ||
              1 !== T[12].p.v ||
              T[13].p.k ||
              0 !== T[13].p.v ||
              T[14].p.k ||
              1 !== T[14].p.v) &&
              (this.feFuncR = this.createFeFunc('feFuncR', M)),
              (T[17].p.k ||
                0 !== T[17].p.v ||
                T[18].p.k ||
                1 !== T[18].p.v ||
                T[19].p.k ||
                1 !== T[19].p.v ||
                T[20].p.k ||
                0 !== T[20].p.v ||
                T[21].p.k ||
                1 !== T[21].p.v) &&
                (this.feFuncG = this.createFeFunc('feFuncG', M)),
              (T[24].p.k ||
                0 !== T[24].p.v ||
                T[25].p.k ||
                1 !== T[25].p.v ||
                T[26].p.k ||
                1 !== T[26].p.v ||
                T[27].p.k ||
                0 !== T[27].p.v ||
                T[28].p.k ||
                1 !== T[28].p.v) &&
                (this.feFuncB = this.createFeFunc('feFuncB', M)),
              (T[31].p.k ||
                0 !== T[31].p.v ||
                T[32].p.k ||
                1 !== T[32].p.v ||
                T[33].p.k ||
                1 !== T[33].p.v ||
                T[34].p.k ||
                0 !== T[34].p.v ||
                T[35].p.k ||
                1 !== T[35].p.v) &&
                (this.feFuncA = this.createFeFunc('feFuncA', M)),
              (this.feFuncR || this.feFuncG || this.feFuncB || this.feFuncA) &&
                (M.setAttribute('color-interpolation-filters', 'sRGB'),
                u.appendChild(M)),
              (T[3].p.k ||
                0 !== T[3].p.v ||
                T[4].p.k ||
                1 !== T[4].p.v ||
                T[5].p.k ||
                1 !== T[5].p.v ||
                T[6].p.k ||
                0 !== T[6].p.v ||
                T[7].p.k ||
                1 !== T[7].p.v) &&
                ((M = createNS('feComponentTransfer')).setAttribute(
                  'color-interpolation-filters',
                  'sRGB'
                ),
                M.setAttribute('result', D),
                u.appendChild(M),
                (this.feFuncRComposed = this.createFeFunc('feFuncR', M)),
                (this.feFuncGComposed = this.createFeFunc('feFuncG', M)),
                (this.feFuncBComposed = this.createFeFunc('feFuncB', M)));
          }
          function SVGDropShadowEffect(u, P, S, D, T) {
            var M = P.container.globalData.renderConfig.filterSize,
              E = P.data.fs || M;
            u.setAttribute('x', E.x || M.x),
              u.setAttribute('y', E.y || M.y),
              u.setAttribute('width', E.width || M.width),
              u.setAttribute('height', E.height || M.height),
              (this.filterManager = P);
            var F = createNS('feGaussianBlur');
            F.setAttribute('in', 'SourceAlpha'),
              F.setAttribute('result', D + '_drop_shadow_1'),
              F.setAttribute('stdDeviation', '0'),
              (this.feGaussianBlur = F),
              u.appendChild(F);
            var I = createNS('feOffset');
            I.setAttribute('dx', '25'),
              I.setAttribute('dy', '0'),
              I.setAttribute('in', D + '_drop_shadow_1'),
              I.setAttribute('result', D + '_drop_shadow_2'),
              (this.feOffset = I),
              u.appendChild(I);
            var L = createNS('feFlood');
            L.setAttribute('flood-color', '#00ff00'),
              L.setAttribute('flood-opacity', '1'),
              L.setAttribute('result', D + '_drop_shadow_3'),
              (this.feFlood = L),
              u.appendChild(L);
            var R = createNS('feComposite');
            R.setAttribute('in', D + '_drop_shadow_3'),
              R.setAttribute('in2', D + '_drop_shadow_2'),
              R.setAttribute('operator', 'in'),
              R.setAttribute('result', D + '_drop_shadow_4'),
              u.appendChild(R);
            var V = this.createMergeNode(D, [D + '_drop_shadow_4', T]);
            u.appendChild(V);
          }
          extendPrototype([SVGComposableEffect], SVGTintFilter),
            (SVGTintFilter.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                var P = this.filterManager.effectElements[0].p.v,
                  S = this.filterManager.effectElements[1].p.v,
                  D = this.filterManager.effectElements[2].p.v / 100;
                this.linearFilter.setAttribute(
                  'values',
                  linearFilterValue + ' ' + D + ' 0'
                ),
                  this.matrixFilter.setAttribute(
                    'values',
                    S[0] -
                      P[0] +
                      ' 0 0 0 ' +
                      P[0] +
                      ' ' +
                      (S[1] - P[1]) +
                      ' 0 0 0 ' +
                      P[1] +
                      ' ' +
                      (S[2] - P[2]) +
                      ' 0 0 0 ' +
                      P[2] +
                      ' 0 0 0 1 0'
                  );
              }
            }),
            (SVGFillFilter.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                var P = this.filterManager.effectElements[2].p.v,
                  S = this.filterManager.effectElements[6].p.v;
                this.matrixFilter.setAttribute(
                  'values',
                  '0 0 0 0 ' +
                    P[0] +
                    ' 0 0 0 0 ' +
                    P[1] +
                    ' 0 0 0 0 ' +
                    P[2] +
                    ' 0 0 0 ' +
                    S +
                    ' 0'
                );
              }
            }),
            (SVGStrokeEffect.prototype.initialize = function () {
              var u,
                P,
                S,
                D,
                T =
                  this.elem.layerElement.children ||
                  this.elem.layerElement.childNodes;
              for (
                1 === this.filterManager.effectElements[1].p.v
                  ? ((D = this.elem.maskManager.masksProperties.length),
                    (S = 0))
                  : (D =
                      (S = this.filterManager.effectElements[0].p.v - 1) + 1),
                  (P = createNS('g')).setAttribute('fill', 'none'),
                  P.setAttribute('stroke-linecap', 'round'),
                  P.setAttribute('stroke-dashoffset', 1);
                S < D;
                S += 1
              )
                (u = createNS('path')),
                  P.appendChild(u),
                  this.paths.push({ p: u, m: S });
              if (3 === this.filterManager.effectElements[10].p.v) {
                var M = createNS('mask'),
                  E = createElementID();
                M.setAttribute('id', E),
                  M.setAttribute('mask-type', 'alpha'),
                  M.appendChild(P),
                  this.elem.globalData.defs.appendChild(M);
                var F = createNS('g');
                for (
                  F.setAttribute(
                    'mask',
                    'url(' + getLocationHref() + '#' + E + ')'
                  );
                  T[0];

                )
                  F.appendChild(T[0]);
                this.elem.layerElement.appendChild(F),
                  (this.masker = M),
                  P.setAttribute('stroke', '#fff');
              } else if (
                1 === this.filterManager.effectElements[10].p.v ||
                2 === this.filterManager.effectElements[10].p.v
              ) {
                if (2 === this.filterManager.effectElements[10].p.v)
                  for (
                    T =
                      this.elem.layerElement.children ||
                      this.elem.layerElement.childNodes;
                    T.length;

                  )
                    this.elem.layerElement.removeChild(T[0]);
                this.elem.layerElement.appendChild(P),
                  this.elem.layerElement.removeAttribute('mask'),
                  P.setAttribute('stroke', '#fff');
              }
              (this.initialized = !0), (this.pathMasker = P);
            }),
            (SVGStrokeEffect.prototype.renderFrame = function (u) {
              this.initialized || this.initialize();
              var P = this.paths.length;
              for (S = 0; S < P; S += 1)
                if (
                  -1 !== this.paths[S].m &&
                  ((D = this.elem.maskManager.viewData[this.paths[S].m]),
                  (T = this.paths[S].p),
                  (u || this.filterManager._mdf || D.prop._mdf) &&
                    T.setAttribute('d', D.lastPath),
                  u ||
                    this.filterManager.effectElements[9].p._mdf ||
                    this.filterManager.effectElements[4].p._mdf ||
                    this.filterManager.effectElements[7].p._mdf ||
                    this.filterManager.effectElements[8].p._mdf ||
                    D.prop._mdf)
                ) {
                  if (
                    0 !== this.filterManager.effectElements[7].p.v ||
                    100 !== this.filterManager.effectElements[8].p.v
                  ) {
                    var S,
                      D,
                      T,
                      M,
                      E,
                      F =
                        0.01 *
                        Math.min(
                          this.filterManager.effectElements[7].p.v,
                          this.filterManager.effectElements[8].p.v
                        ),
                      I =
                        0.01 *
                        Math.max(
                          this.filterManager.effectElements[7].p.v,
                          this.filterManager.effectElements[8].p.v
                        ),
                      L = T.getTotalLength();
                    M = '0 0 0 ' + L * F + ' ';
                    var R = Math.floor(
                      (L * (I - F)) /
                        (1 +
                          2 *
                            this.filterManager.effectElements[4].p.v *
                            this.filterManager.effectElements[9].p.v *
                            0.01)
                    );
                    for (E = 0; E < R; E += 1)
                      M +=
                        '1 ' +
                        2 *
                          this.filterManager.effectElements[4].p.v *
                          this.filterManager.effectElements[9].p.v *
                          0.01 +
                        ' ';
                    M += '0 ' + 10 * L + ' 0 0';
                  } else
                    M =
                      '1 ' +
                      2 *
                        this.filterManager.effectElements[4].p.v *
                        this.filterManager.effectElements[9].p.v *
                        0.01;
                  T.setAttribute('stroke-dasharray', M);
                }
              if (
                ((u || this.filterManager.effectElements[4].p._mdf) &&
                  this.pathMasker.setAttribute(
                    'stroke-width',
                    2 * this.filterManager.effectElements[4].p.v
                  ),
                (u || this.filterManager.effectElements[6].p._mdf) &&
                  this.pathMasker.setAttribute(
                    'opacity',
                    this.filterManager.effectElements[6].p.v
                  ),
                (1 === this.filterManager.effectElements[10].p.v ||
                  2 === this.filterManager.effectElements[10].p.v) &&
                  (u || this.filterManager.effectElements[3].p._mdf))
              ) {
                var V = this.filterManager.effectElements[3].p.v;
                this.pathMasker.setAttribute(
                  'stroke',
                  'rgb(' +
                    bmFloor(255 * V[0]) +
                    ',' +
                    bmFloor(255 * V[1]) +
                    ',' +
                    bmFloor(255 * V[2]) +
                    ')'
                );
              }
            }),
            (SVGTritoneFilter.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                var P = this.filterManager.effectElements[0].p.v,
                  S = this.filterManager.effectElements[1].p.v,
                  D = this.filterManager.effectElements[2].p.v,
                  T = D[0] + ' ' + S[0] + ' ' + P[0],
                  M = D[1] + ' ' + S[1] + ' ' + P[1],
                  E = D[2] + ' ' + S[2] + ' ' + P[2];
                this.feFuncR.setAttribute('tableValues', T),
                  this.feFuncG.setAttribute('tableValues', M),
                  this.feFuncB.setAttribute('tableValues', E);
              }
            }),
            (SVGProLevelsFilter.prototype.createFeFunc = function (u, P) {
              var S = createNS(u);
              return S.setAttribute('type', 'table'), P.appendChild(S), S;
            }),
            (SVGProLevelsFilter.prototype.getTableValue = function (
              u,
              P,
              S,
              D,
              T
            ) {
              for (
                var M,
                  E,
                  F = 0,
                  I = 256,
                  L = Math.min(u, P),
                  R = Math.max(u, P),
                  V = Array.call(null, { length: 256 }),
                  O = 0,
                  N = T - D,
                  G = P - u;
                F <= 256;

              )
                (E =
                  (M = F / 256) <= L
                    ? G < 0
                      ? T
                      : D
                    : M >= R
                    ? G < 0
                      ? D
                      : T
                    : D + N * Math.pow((M - u) / G, 1 / S)),
                  (V[O] = E),
                  (O += 1),
                  (F += 256 / (I - 1));
              return V.join(' ');
            }),
            (SVGProLevelsFilter.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                var P,
                  S = this.filterManager.effectElements;
                this.feFuncRComposed &&
                  (u ||
                    S[3].p._mdf ||
                    S[4].p._mdf ||
                    S[5].p._mdf ||
                    S[6].p._mdf ||
                    S[7].p._mdf) &&
                  ((P = this.getTableValue(
                    S[3].p.v,
                    S[4].p.v,
                    S[5].p.v,
                    S[6].p.v,
                    S[7].p.v
                  )),
                  this.feFuncRComposed.setAttribute('tableValues', P),
                  this.feFuncGComposed.setAttribute('tableValues', P),
                  this.feFuncBComposed.setAttribute('tableValues', P)),
                  this.feFuncR &&
                    (u ||
                      S[10].p._mdf ||
                      S[11].p._mdf ||
                      S[12].p._mdf ||
                      S[13].p._mdf ||
                      S[14].p._mdf) &&
                    ((P = this.getTableValue(
                      S[10].p.v,
                      S[11].p.v,
                      S[12].p.v,
                      S[13].p.v,
                      S[14].p.v
                    )),
                    this.feFuncR.setAttribute('tableValues', P)),
                  this.feFuncG &&
                    (u ||
                      S[17].p._mdf ||
                      S[18].p._mdf ||
                      S[19].p._mdf ||
                      S[20].p._mdf ||
                      S[21].p._mdf) &&
                    ((P = this.getTableValue(
                      S[17].p.v,
                      S[18].p.v,
                      S[19].p.v,
                      S[20].p.v,
                      S[21].p.v
                    )),
                    this.feFuncG.setAttribute('tableValues', P)),
                  this.feFuncB &&
                    (u ||
                      S[24].p._mdf ||
                      S[25].p._mdf ||
                      S[26].p._mdf ||
                      S[27].p._mdf ||
                      S[28].p._mdf) &&
                    ((P = this.getTableValue(
                      S[24].p.v,
                      S[25].p.v,
                      S[26].p.v,
                      S[27].p.v,
                      S[28].p.v
                    )),
                    this.feFuncB.setAttribute('tableValues', P)),
                  this.feFuncA &&
                    (u ||
                      S[31].p._mdf ||
                      S[32].p._mdf ||
                      S[33].p._mdf ||
                      S[34].p._mdf ||
                      S[35].p._mdf) &&
                    ((P = this.getTableValue(
                      S[31].p.v,
                      S[32].p.v,
                      S[33].p.v,
                      S[34].p.v,
                      S[35].p.v
                    )),
                    this.feFuncA.setAttribute('tableValues', P));
              }
            }),
            extendPrototype([SVGComposableEffect], SVGDropShadowEffect),
            (SVGDropShadowEffect.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                if (
                  ((u || this.filterManager.effectElements[4].p._mdf) &&
                    this.feGaussianBlur.setAttribute(
                      'stdDeviation',
                      this.filterManager.effectElements[4].p.v / 4
                    ),
                  u || this.filterManager.effectElements[0].p._mdf)
                ) {
                  var P = this.filterManager.effectElements[0].p.v;
                  this.feFlood.setAttribute(
                    'flood-color',
                    rgbToHex(
                      Math.round(255 * P[0]),
                      Math.round(255 * P[1]),
                      Math.round(255 * P[2])
                    )
                  );
                }
                if (
                  ((u || this.filterManager.effectElements[1].p._mdf) &&
                    this.feFlood.setAttribute(
                      'flood-opacity',
                      this.filterManager.effectElements[1].p.v / 255
                    ),
                  u ||
                    this.filterManager.effectElements[2].p._mdf ||
                    this.filterManager.effectElements[3].p._mdf)
                ) {
                  var S = this.filterManager.effectElements[3].p.v,
                    D =
                      (this.filterManager.effectElements[2].p.v - 90) *
                      degToRads,
                    T = S * Math.cos(D),
                    M = S * Math.sin(D);
                  this.feOffset.setAttribute('dx', T),
                    this.feOffset.setAttribute('dy', M);
                }
              }
            });
          var _svgMatteSymbols = [];
          function SVGMatte3Effect(u, P, S) {
            (this.initialized = !1),
              (this.filterManager = P),
              (this.filterElem = u),
              (this.elem = S),
              (S.matteElement = createNS('g')),
              S.matteElement.appendChild(S.layerElement),
              S.matteElement.appendChild(S.transformedElement),
              (S.baseElement = S.matteElement);
          }
          function SVGGaussianBlurEffect(u, P, S, D) {
            u.setAttribute('x', '-100%'),
              u.setAttribute('y', '-100%'),
              u.setAttribute('width', '300%'),
              u.setAttribute('height', '300%'),
              (this.filterManager = P);
            var T = createNS('feGaussianBlur');
            T.setAttribute('result', D),
              u.appendChild(T),
              (this.feGaussianBlur = T);
          }
          function TransformEffect() {}
          function SVGTransformEffect(u, P) {
            this.init(P);
          }
          function CVTransformEffect(u) {
            this.init(u);
          }
          return (
            (SVGMatte3Effect.prototype.findSymbol = function (u) {
              for (var P = 0, S = _svgMatteSymbols.length; P < S; ) {
                if (_svgMatteSymbols[P] === u) return _svgMatteSymbols[P];
                P += 1;
              }
              return null;
            }),
            (SVGMatte3Effect.prototype.replaceInParent = function (u, P) {
              var S,
                D = u.layerElement.parentNode;
              if (D) {
                for (
                  var T = D.children, M = 0, E = T.length;
                  M < E && T[M] !== u.layerElement;

                )
                  M += 1;
                M <= E - 2 && (S = T[M + 1]);
                var F = createNS('use');
                F.setAttribute('href', '#' + P),
                  S ? D.insertBefore(F, S) : D.appendChild(F);
              }
            }),
            (SVGMatte3Effect.prototype.setElementAsMask = function (u, P) {
              if (!this.findSymbol(P)) {
                var S = createElementID(),
                  D = createNS('mask');
                D.setAttribute('id', P.layerId),
                  D.setAttribute('mask-type', 'alpha'),
                  _svgMatteSymbols.push(P);
                var T = u.globalData.defs;
                T.appendChild(D);
                var M = createNS('symbol');
                M.setAttribute('id', S),
                  this.replaceInParent(P, S),
                  M.appendChild(P.layerElement),
                  T.appendChild(M);
                var E = createNS('use');
                E.setAttribute('href', '#' + S),
                  D.appendChild(E),
                  (P.data.hd = !1),
                  P.show();
              }
              u.setMatte(P.layerId);
            }),
            (SVGMatte3Effect.prototype.initialize = function () {
              for (
                var u = this.filterManager.effectElements[0].p.v,
                  P = this.elem.comp.elements,
                  S = 0,
                  D = P.length;
                S < D;

              )
                P[S] &&
                  P[S].data.ind === u &&
                  this.setElementAsMask(this.elem, P[S]),
                  (S += 1);
              this.initialized = !0;
            }),
            (SVGMatte3Effect.prototype.renderFrame = function () {
              this.initialized || this.initialize();
            }),
            (SVGGaussianBlurEffect.prototype.renderFrame = function (u) {
              if (u || this.filterManager._mdf) {
                var P = 0.3,
                  S = this.filterManager.effectElements[0].p.v * P,
                  D = this.filterManager.effectElements[1].p.v,
                  T = 3 == D ? 0 : S,
                  M = 2 == D ? 0 : S;
                this.feGaussianBlur.setAttribute('stdDeviation', T + ' ' + M);
                var E =
                  1 == this.filterManager.effectElements[2].p.v
                    ? 'wrap'
                    : 'duplicate';
                this.feGaussianBlur.setAttribute('edgeMode', E);
              }
            }),
            (TransformEffect.prototype.init = function (u) {
              (this.effectsManager = u),
                (this.type = effectTypes.TRANSFORM_EFFECT),
                (this.matrix = new Matrix()),
                (this.opacity = -1),
                (this._mdf = !1),
                (this._opMdf = !1);
            }),
            (TransformEffect.prototype.renderFrame = function (u) {
              if (
                ((this._opMdf = !1),
                (this._mdf = !1),
                u || this.effectsManager._mdf)
              ) {
                var P = this.effectsManager.effectElements,
                  S = P[0].p.v,
                  D = P[1].p.v,
                  T = 1 === P[2].p.v,
                  M = P[3].p.v,
                  E = T ? M : P[4].p.v,
                  F = P[5].p.v,
                  I = P[6].p.v,
                  L = P[7].p.v;
                this.matrix.reset(),
                  this.matrix.translate(-S[0], -S[1], S[2]),
                  this.matrix.scale(0.01 * E, 0.01 * M, 1),
                  this.matrix.rotate(-L * degToRads),
                  this.matrix.skewFromAxis(
                    -F * degToRads,
                    (I + 90) * degToRads
                  ),
                  this.matrix.translate(D[0], D[1], 0),
                  (this._mdf = !0),
                  this.opacity !== P[8].p.v &&
                    ((this.opacity = P[8].p.v), (this._opMdf = !0));
              }
            }),
            extendPrototype([TransformEffect], SVGTransformEffect),
            extendPrototype([TransformEffect], CVTransformEffect),
            registerRenderer('canvas', CanvasRenderer),
            registerRenderer('html', HybridRenderer),
            registerRenderer('svg', SVGRenderer),
            ShapeModifiers.registerModifier('tm', TrimModifier),
            ShapeModifiers.registerModifier('pb', PuckerAndBloatModifier),
            ShapeModifiers.registerModifier('rp', RepeaterModifier),
            ShapeModifiers.registerModifier('rd', RoundCornersModifier),
            ShapeModifiers.registerModifier('zz', ZigZagModifier),
            ShapeModifiers.registerModifier('op', OffsetPathModifier),
            setExpressionsPlugin(Expressions),
            setExpressionInterfaces(getInterface),
            initialize$1(),
            initialize(),
            registerEffect$1(20, SVGTintFilter, !0),
            registerEffect$1(21, SVGFillFilter, !0),
            registerEffect$1(22, SVGStrokeEffect, !1),
            registerEffect$1(23, SVGTritoneFilter, !0),
            registerEffect$1(24, SVGProLevelsFilter, !0),
            registerEffect$1(25, SVGDropShadowEffect, !0),
            registerEffect$1(28, SVGMatte3Effect, !1),
            registerEffect$1(29, SVGGaussianBlurEffect, !0),
            registerEffect$1(35, SVGTransformEffect, !1),
            registerEffect(35, CVTransformEffect),
            lottie
          );
        });
    },
  },
]);
//# sourceMappingURL=94a7ad86.3f011836de9541b9.js.map
