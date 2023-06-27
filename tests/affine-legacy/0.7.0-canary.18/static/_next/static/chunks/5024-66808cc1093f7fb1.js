'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [5024],
  {
    9288: function (t, e, n) {
      n.d(e, {
        e: function () {
          return i;
        },
        y: function () {
          return o;
        },
      });
      var r = n(55467);
      class i {
        constructor() {
          (this.activeSlot = new r.g()),
            (this.clearActive = () => {
              void 0 != this.activeElement &&
                ((this.activeElement = void 0), this.activeSlot.emit(void 0));
            });
        }
        isActive(t) {
          return !!this.activeElement && this.activeElement.contains(t);
        }
        setActive(t) {
          t !== this.activeElement &&
            ((this.activeElement = t), this.activeSlot.emit(t));
        }
        setIfNoActive(t) {
          this.activeElement || this.setActive(t);
        }
        getActiveEditor() {
          return this.activeElement;
        }
      }
      let o = new i();
    },
    903: function (t, e, n) {
      n.d(e, {
        I: function () {
          return h;
        },
        JO: function () {
          return d;
        },
        Wc: function () {
          return f;
        },
        cO: function () {
          return s;
        },
        mD: function () {
          return g;
        },
        vq: function () {
          return c;
        },
        y3: function () {
          return a;
        },
        yd: function () {
          return u;
        },
        zE: function () {
          return l;
        },
      });
      var r = n(13246),
        i = n(48616),
        o = n(63989);
      function l(t) {
        let e = (0, i.U6)(t);
        if (e) {
          let t = e.selection.state.selectedBlocks,
            n = e.selection.state.selectedEmbeds,
            r = [...t, ...n].map(t => (0, i.mt)(t)).filter(Boolean);
          if (r.length)
            return {
              type: 'Block',
              startOffset: 0,
              endOffset: r[r.length - 1].text?.length ?? 0,
              models: r,
            };
        }
        if ((0, o.hasNativeSelection)()) {
          let t = (0, o.getCurrentNativeRange)(),
            e = s(t);
          return e ? { ...e, nativeRange: t } : null;
        }
        return null;
      }
      function u(t) {
        if ('Title' === t.type) {
          let e = t.models[0].page,
            n = (0, i.U6)(e);
          if (!n) return null;
          let r = n.titleVEditor,
            [o, l] = r.getTextPoint(t.startOffset),
            [u, s] = r.getTextPoint(t.endOffset),
            a = new Range();
          return a.setStart(o, l), a.setEnd(u, s), a;
        }
        let e = t.models.filter(t => t.text);
        if (!e.length) return null;
        let [n, r] = h(e[0], t.startOffset),
          [o, l] = h(e[e.length - 1], t.endOffset),
          u = new Range();
        return u.setStart(n, r), u.setEnd(o, l), u;
      }
      function s(t) {
        let e = (0, i.pS)(t);
        if (!e.length) return null;
        let n = d(t.startContainer),
          r = d(t.endContainer);
        if (!n || !r) return null;
        let o = n.index,
          l = r.index + r.length;
        return { type: 'Native', startOffset: o, endOffset: l, models: e };
      }
      function a(t, e, n) {
        return (t.models = t.models.map(t => (t === e ? n : t))), t;
      }
      function c(t) {
        if (!t.models.length)
          throw Error("Can't restore selection, blockRange.models is empty");
        let e = t.models[0].page,
          n = (0, i.U6)(e);
        if ('Native' === t.type) {
          let e = u(t);
          (0, o.resetNativeSelection)(e),
            n &&
              (n.selection.state.clearBlockSelection(),
              (n.selection.state.type = 'native'));
          return;
        }
        if ('Block' === t.type) {
          n &&
            ((n.selection.state.type = 'block'),
            n.selection.refreshSelectedBlocksRectsByModels(t.models)),
            (0, o.resetNativeSelection)(null),
            document.activeElement.blur();
          return;
        }
        if (n && 'Title' === t.type) {
          (0, o.focusTitle)(e, t.startOffset, t.endOffset - t.startOffset);
          return;
        }
        throw Error('Invalid block range type: ' + t.type);
      }
      function f(t) {
        let e = l(t);
        if (e) return e;
        if (!(0, o.hasNativeSelection)()) return null;
        let n = (0, o.getCurrentNativeRange)(),
          u = (0, i.zv)(n.startContainer) && (0, i.zv)(n.endContainer);
        if (u) {
          let e = t.root;
          return (
            (0, r.kP)(e),
            {
              type: 'Title',
              startOffset: n.startOffset,
              endOffset: n.endOffset,
              models: [e],
            }
          );
        }
        return null;
      }
      function d(t) {
        if (!t.parentElement) return null;
        let e =
            t.parentElement.closest('[data-virgo-root="true"]') ||
            (t instanceof HTMLElement
              ? t.querySelector('[data-virgo-root="true"]')
              : null),
          n = e?.virgoEditor;
        return n ? n.getVRange() : null;
      }
      function h(t, e = 0) {
        let n = t.text;
        if (!n) throw Error("Failed to get block's text!");
        e > n.length && (e = n.length);
        let o = (0, i.gj)(t);
        (0, r.kP)(o);
        let [l, u] = o.getTextPoint(e);
        return [l, u];
      }
      let g = t => {
        let e = t instanceof Range ? t : null,
          n = t instanceof Range ? s(t) : t;
        if (!n) return null;
        if (!n.models.length)
          throw Error('Block range must have at least one model.');
        let r = () => e || (e = u(n));
        return {
          ...n,
          startModel: n.models[0],
          endModel: n.models[n.models.length - 1],
          betweenModels: n.models.slice(1, n.models.length - 1),
          get range() {
            return r();
          },
          collapsed: 1 === n.models.length && n.startOffset === n.endOffset,
          apply() {
            c(n);
          },
        };
      };
    },
    68389: function (t, e, n) {
      n.d(e, {
        AE: function () {
          return c;
        },
        GK: function () {
          return d;
        },
        Sf: function () {
          return a;
        },
        WP: function () {
          return f;
        },
        a6: function () {
          return l;
        },
        k: function () {
          return s;
        },
        kH: function () {
          return o;
        },
        uI: function () {
          return u;
        },
      });
      var r = n(31054),
        i = n(48616);
      async function o(t, e) {
        let n = await (0, i.w_)(t);
        return (
          n?.vEditor?.setVRange(e),
          new Promise(t => {
            n?.vEditor?.slots.rangeUpdated.once(() => {
              t();
            });
          })
        );
      }
      function l(t, e, n = { index: 0, length: 0 }) {
        let i = t.getBlockById(e);
        if (((0, r.kP)(i), !(0, r.h$)(i, ['affine:divider']))) return o(i, n);
      }
      function u(t) {
        let e = t.getVRange();
        return e?.index === 0 && e?.length === 0;
      }
      function s(t, e, n) {
        let r;
        if (e === n) return !0;
        for (;;) {
          if (null === (r = t.getParent(e))) return !1;
          if (r.id === n.id) return !0;
          e = r;
        }
      }
      function a(t, e, n, i, o) {
        if ((0, r.h$)(e, ['affine:list']) && e.type === n) return !1;
        if ((0, r.h$)(e, ['affine:paragraph'])) {
          let r = t.getParent(e);
          if (!r) return !1;
          let u = r.children.indexOf(e);
          e.text?.insert(' ', i.length),
            t.captureSync(),
            e.text?.delete(0, i.length + 1);
          let s = {
            type: n,
            text: e.text?.clone(),
            children: e.children,
            ...o,
          };
          t.deleteBlock(e);
          let a = t.addBlock('affine:list', s, r, u);
          l(t, a);
        } else
          (0, r.h$)(e, ['affine:list']) &&
            e.type !== n &&
            (e.text?.insert(' ', i.length),
            t.captureSync(),
            e.text?.delete(0, i.length + 1),
            t.updateBlock(e, { type: n }),
            l(t, e.id));
        return !0;
      }
      function c(t, e, n, o) {
        if ((0, r.h$)(e, ['affine:paragraph']) && e.type === n) return !1;
        if ((0, r.h$)(e, ['affine:paragraph'])) {
          if ((0, r.h$)(e, ['affine:paragraph']) && e.type !== n) {
            e.text?.insert(' ', o.length),
              t.captureSync(),
              e.text?.delete(0, o.length + 1);
            let r = (0, i.gj)(e);
            r && r.setVRange({ index: 0, length: 0 }),
              t.updateBlock(e, { type: n });
          }
        } else {
          let r = t.getParent(e);
          if (!r) return !1;
          let i = r.children.indexOf(e);
          e.text?.insert(' ', o.length),
            t.captureSync(),
            e.text?.delete(0, o.length + 1);
          let u = { type: n, text: e.text?.clone(), children: e.children };
          t.deleteBlock(e);
          let s = t.addBlock('affine:paragraph', u, r, i);
          l(t, s);
        }
        return !0;
      }
      function f(t, e, n) {
        if ((0, r.h$)(e, ['affine:divider']) || 'quote' === e.type) return !1;
        if (!(0, r.h$)(e, ['affine:divider'])) {
          let r = t.getParent(e);
          if (!r) return !1;
          let i = r.children.indexOf(e);
          e.text?.insert(' ', n.length),
            t.captureSync(),
            e.text?.delete(0, n.length + 1);
          let o = { children: e.children };
          t.addBlock('affine:divider', o, r, i);
          let u = r.children[i + 1];
          if (u) l(t, u.id);
          else {
            let e = t.addBlock('affine:paragraph', {}, r);
            l(t, e);
          }
        }
        return !0;
      }
      function d(t, e) {
        let { page: n } = t,
          r = n.addBlock('affine:bookmark', { url: '' }, t.id, e);
        return (
          requestAnimationFrame(() => {
            let t = n.getBlockById(r),
              e = (0, i._b)(t);
            e.slots.openInitialModal.emit();
          }),
          r
        );
      }
    },
    50972: function (t, e, n) {
      n.d(e, {
        i: function () {
          return i;
        },
        m: function () {
          return o;
        },
      });
      var r = n(31054);
      let i = () => {
          let t = document.createElement('input');
          return (
            (t.type = 'file'),
            (t.multiple = !0),
            (t.accept = 'image/*'),
            (t.style.position = 'fixed'),
            (t.style.left = '0'),
            (t.style.top = '0'),
            (t.style.opacity = '0.001'),
            t
          );
        },
        o = async (t, e) => {
          let n;
          let o = { flavour: 'affine:embed', type: 'image' },
            l = i();
          document.body.appendChild(l);
          let u = new Promise(t => {
              n = t;
            }),
            s = async () => {
              if (!l.files) return;
              let i = await t.blobs;
              (0, r.kP)(i);
              let u = l.files;
              if (1 === u.length) {
                let t = u[0];
                e &&
                  e(
                    await new Promise(e => {
                      let n = 0,
                        r = 0,
                        i = new FileReader();
                      i.addEventListener('load', t => {
                        let o = new Image();
                        (o.onload = () => {
                          (n = o.width),
                            (r = o.height),
                            (i = null),
                            e({ width: n, height: r });
                        }),
                          (o.src = i?.result);
                      }),
                        i.addEventListener('error', t => {
                          (i = null), e({ width: n, height: r });
                        }),
                        i.readAsDataURL(t);
                    })
                  );
                let r = await i.set(t);
                n([{ ...o, sourceId: r }]);
              } else {
                let t = [];
                for (let e = 0; e < u.length; e++) {
                  let n = u[e],
                    r = await i.set(n);
                  t.push({ ...o, sourceId: r });
                }
                n(t);
              }
              l.removeEventListener('change', s), l.remove();
            };
          return l.addEventListener('change', s), l.click(), await u;
        };
    },
    95033: function (t, e, n) {
      n.d(e, {
        G: function () {
          return A;
        },
        A: function () {
          return P;
        },
      });
      var r =
        'undefined' != typeof navigator &&
        navigator.userAgent.toLowerCase().indexOf('firefox') > 0;
      function i(t, e, n, r) {
        t.addEventListener
          ? t.addEventListener(e, n, r)
          : t.attachEvent &&
            t.attachEvent('on'.concat(e), function () {
              n(window.event);
            });
      }
      function o(t, e) {
        for (var n = e.slice(0, e.length - 1), r = 0; r < n.length; r++)
          n[r] = t[n[r].toLowerCase()];
        return n;
      }
      function l(t) {
        'string' != typeof t && (t = '');
        for (
          var e = (t = t.replace(/\s/g, '')).split(','), n = e.lastIndexOf('');
          n >= 0;

        )
          (e[n - 1] += ','), e.splice(n, 1), (n = e.lastIndexOf(''));
        return e;
      }
      for (
        var u = {
            backspace: 8,
            '⌫': 8,
            tab: 9,
            clear: 12,
            enter: 13,
            '↩': 13,
            return: 13,
            esc: 27,
            escape: 27,
            space: 32,
            left: 37,
            up: 38,
            right: 39,
            down: 40,
            del: 46,
            delete: 46,
            ins: 45,
            insert: 45,
            home: 36,
            end: 35,
            pageup: 33,
            pagedown: 34,
            capslock: 20,
            num_0: 96,
            num_1: 97,
            num_2: 98,
            num_3: 99,
            num_4: 100,
            num_5: 101,
            num_6: 102,
            num_7: 103,
            num_8: 104,
            num_9: 105,
            num_multiply: 106,
            num_add: 107,
            num_enter: 108,
            num_subtract: 109,
            num_decimal: 110,
            num_divide: 111,
            '⇪': 20,
            ',': 188,
            '.': 190,
            '/': 191,
            '`': 192,
            '-': r ? 173 : 189,
            '=': r ? 61 : 187,
            ';': r ? 59 : 186,
            "'": 222,
            '[': 219,
            ']': 221,
            '\\': 220,
          },
          s = {
            '⇧': 16,
            shift: 16,
            '⌥': 18,
            alt: 18,
            option: 18,
            '⌃': 17,
            ctrl: 17,
            control: 17,
            '⌘': 91,
            cmd: 91,
            command: 91,
          },
          a = {
            16: 'shiftKey',
            18: 'altKey',
            17: 'ctrlKey',
            91: 'metaKey',
            shiftKey: 16,
            ctrlKey: 17,
            altKey: 18,
            metaKey: 91,
          },
          c = { 16: !1, 18: !1, 17: !1, 91: !1 },
          f = {},
          d = 1;
        d < 20;
        d++
      )
        u['f'.concat(d)] = 111 + d;
      var h = [],
        g = !1,
        m = 'all',
        p = [],
        y = function (t) {
          return (
            u[t.toLowerCase()] ||
            s[t.toLowerCase()] ||
            t.toUpperCase().charCodeAt(0)
          );
        };
      function v(t) {
        m = t || 'all';
      }
      function x() {
        return m || 'all';
      }
      var b = function (t) {
        var e = t.key,
          n = t.scope,
          r = t.method,
          i = t.splitKey,
          u = void 0 === i ? '+' : i;
        l(e).forEach(function (t) {
          var e = t.split(u),
            i = e.length,
            l = e[i - 1],
            a = '*' === l ? '*' : y(l);
          if (f[a]) {
            n || (n = x());
            var c = i > 1 ? o(s, e) : [];
            f[a] = f[a].filter(function (t) {
              return !(
                (!r || t.method === r) &&
                t.scope === n &&
                (function (t, e) {
                  for (
                    var n = t.length >= e.length ? t : e,
                      r = t.length >= e.length ? e : t,
                      i = !0,
                      o = 0;
                    o < n.length;
                    o++
                  )
                    -1 === r.indexOf(n[o]) && (i = !1);
                  return i;
                })(t.mods, c)
              );
            });
          }
        });
      };
      function E(t, e, n, r) {
        var i;
        if (e.element === r && (e.scope === n || 'all' === e.scope)) {
          for (var o in ((i = e.mods.length > 0), c))
            Object.prototype.hasOwnProperty.call(c, o) &&
              ((!c[o] && e.mods.indexOf(+o) > -1) ||
                (c[o] && -1 === e.mods.indexOf(+o))) &&
              (i = !1);
          ((0 !== e.mods.length || c[16] || c[18] || c[17] || c[91]) &&
            !i &&
            '*' !== e.shortcut) ||
            !1 !== e.method(t, e) ||
            (t.preventDefault ? t.preventDefault() : (t.returnValue = !1),
            t.stopPropagation && t.stopPropagation(),
            t.cancelBubble && (t.cancelBubble = !0));
        }
      }
      function _(t, e) {
        var n = f['*'],
          r = t.keyCode || t.which || t.charCode;
        if (S.filter.call(this, t)) {
          if (
            ((93 === r || 224 === r) && (r = 91),
            -1 === h.indexOf(r) && 229 !== r && h.push(r),
            ['ctrlKey', 'altKey', 'shiftKey', 'metaKey'].forEach(function (e) {
              var n = a[e];
              t[e] && -1 === h.indexOf(n)
                ? h.push(n)
                : !t[e] && h.indexOf(n) > -1
                ? h.splice(h.indexOf(n), 1)
                : 'metaKey' === e &&
                  t[e] &&
                  3 === h.length &&
                  !(t.ctrlKey || t.shiftKey || t.altKey) &&
                  (h = h.slice(h.indexOf(n)));
            }),
            r in c)
          ) {
            for (var i in ((c[r] = !0), s)) s[i] === r && (S[i] = !0);
            if (!n) return;
          }
          for (var o in c)
            Object.prototype.hasOwnProperty.call(c, o) && (c[o] = t[a[o]]);
          t.getModifierState &&
            !(t.altKey && !t.ctrlKey) &&
            t.getModifierState('AltGraph') &&
            (-1 === h.indexOf(17) && h.push(17),
            -1 === h.indexOf(18) && h.push(18),
            (c[17] = !0),
            (c[18] = !0));
          var l = x();
          if (n)
            for (var u = 0; u < n.length; u++)
              n[u].scope === l &&
                (('keydown' === t.type && n[u].keydown) ||
                  ('keyup' === t.type && n[u].keyup)) &&
                E(t, n[u], l, e);
          if (r in f) {
            for (var d = 0; d < f[r].length; d++)
              if (
                (('keydown' === t.type && f[r][d].keydown) ||
                  ('keyup' === t.type && f[r][d].keyup)) &&
                f[r][d].key
              ) {
                for (
                  var g = f[r][d],
                    m = g.splitKey,
                    p = g.key.split(m),
                    v = [],
                    b = 0;
                  b < p.length;
                  b++
                )
                  v.push(y(p[b]));
                v.sort().join('') === h.sort().join('') && E(t, g, l, e);
              }
          }
        }
      }
      function S(t, e, n) {
        h = [];
        var r,
          u = l(t),
          a = [],
          d = 'all',
          m = document,
          v = 0,
          x = !1,
          b = !0,
          E = '+',
          k = !1;
        for (
          void 0 === n && 'function' == typeof e && (n = e),
            '[object Object]' === Object.prototype.toString.call(e) &&
              (e.scope && (d = e.scope),
              e.element && (m = e.element),
              e.keyup && (x = e.keyup),
              void 0 !== e.keydown && (b = e.keydown),
              void 0 !== e.capture && (k = e.capture),
              'string' == typeof e.splitKey && (E = e.splitKey)),
            'string' == typeof e && (d = e);
          v < u.length;
          v++
        )
          (t = u[v].split(E)),
            (a = []),
            t.length > 1 && (a = o(s, t)),
            (t = '*' === (t = t[t.length - 1]) ? '*' : y(t)) in f ||
              (f[t] = []),
            f[t].push({
              keyup: x,
              keydown: b,
              scope: d,
              mods: a,
              shortcut: u[v],
              method: n,
              key: u[v],
              splitKey: E,
              element: m,
            });
        void 0 !== m &&
          ((r = m), !(p.indexOf(r) > -1)) &&
          window &&
          (p.push(m),
          i(
            m,
            'keydown',
            function (t) {
              _(t, m);
            },
            k
          ),
          g ||
            ((g = !0),
            i(
              window,
              'focus',
              function () {
                h = [];
              },
              k
            )),
          i(
            m,
            'keyup',
            function (t) {
              _(t, m),
                (function (t) {
                  var e = t.keyCode || t.which || t.charCode,
                    n = h.indexOf(e);
                  if (
                    (n >= 0 && h.splice(n, 1),
                    t.key &&
                      'meta' === t.key.toLowerCase() &&
                      h.splice(0, h.length),
                    (93 === e || 224 === e) && (e = 91),
                    e in c)
                  )
                    for (var r in ((c[e] = !1), s)) s[r] === e && (S[r] = !1);
                })(t);
            },
            k
          ));
      }
      var k = {
        getPressedKeyString: function () {
          return h.map(function (t) {
            return (
              Object.keys(u).find(function (e) {
                return u[e] === t;
              }) ||
              Object.keys(s).find(function (e) {
                return s[e] === t;
              }) ||
              String.fromCharCode(t)
            );
          });
        },
        setScope: v,
        getScope: x,
        deleteScope: function (t, e) {
          var n, r;
          for (var i in (t || (t = x()), f))
            if (Object.prototype.hasOwnProperty.call(f, i))
              for (r = 0, n = f[i]; r < n.length; )
                n[r].scope === t ? n.splice(r, 1) : r++;
          x() === t && v(e || 'all');
        },
        getPressedKeyCodes: function () {
          return h.slice(0);
        },
        isPressed: function (t) {
          return 'string' == typeof t && (t = y(t)), -1 !== h.indexOf(t);
        },
        filter: function (t) {
          var e = t.target || t.srcElement,
            n = e.tagName,
            r = !0;
          return (
            (e.isContentEditable ||
              (('INPUT' === n || 'TEXTAREA' === n || 'SELECT' === n) &&
                !e.readOnly)) &&
              (r = !1),
            r
          );
        },
        trigger: function (t) {
          var e =
            arguments.length > 1 && void 0 !== arguments[1]
              ? arguments[1]
              : 'all';
          Object.keys(f).forEach(function (n) {
            f[n]
              .filter(function (n) {
                return n.scope === e && n.shortcut === t;
              })
              .forEach(function (t) {
                t && t.method && t.method();
              });
          });
        },
        unbind: function (t) {
          if (void 0 === t)
            Object.keys(f).forEach(function (t) {
              return delete f[t];
            });
          else if (Array.isArray(t))
            t.forEach(function (t) {
              t.key && b(t);
            });
          else if ('object' == typeof t) t.key && b(t);
          else if ('string' == typeof t) {
            for (
              var e = arguments.length, n = Array(e > 1 ? e - 1 : 0), r = 1;
              r < e;
              r++
            )
              n[r - 1] = arguments[r];
            var i = n[0],
              o = n[1];
            'function' == typeof i && ((o = i), (i = '')),
              b({ key: t, scope: i, method: o, splitKey: '+' });
          }
        },
        keyMap: u,
        modifier: s,
        modifierMap: a,
      };
      for (var w in k)
        Object.prototype.hasOwnProperty.call(k, w) && (S[w] = k[w]);
      if ('undefined' != typeof window) {
        var C = window.hotkeys;
        (S.noConflict = function (t) {
          return t && window.hotkeys === S && (window.hotkeys = C), S;
        }),
          (window.hotkeys = S);
      }
      var R = n(48616);
      function T(t) {
        return (!!t.ctrlKey || !!t.metaKey) && !t.altKey && 'z' === t.key;
      }
      S.filter = t =>
        !(function (t) {
          let e = t.target;
          return (
            !e ||
            (!(0, R.zg)(t.target) &&
              !(
                ((0, R.Fe)(t.target) && 'Enter' === t.key) ||
                ((0, R.zv)(t.target) && T(t)) ||
                (((0, R.Yb)(t.target) || (0, R.Rn)(t.target)) && T(t)) ||
                ((0, R.ok)(t.target) && T(t))
              ) &&
              t.target !== document.body)
          );
        })(t);
      let A = {
          AFFINE_PAGE: 'affine:page',
          AFFINE_EDGELESS: 'affine:edgeless',
        },
        N = 'hotkey_disabled',
        P = new (class {
          constructor() {
            (this._scope = N),
              (this._disabled = !1),
              (this.counter = 0),
              (this._hotkeys = S);
          }
          get disabled() {
            return this._disabled;
          }
          newScope(t) {
            return `${t}-${this.counter++}`;
          }
          setScope(t) {
            (this._scope = t), this._hotkeys.setScope(t);
          }
          deleteScope(t) {
            this._hotkeys.deleteScope(t);
          }
          addListener(t, e, n = {}) {
            this._hotkeys(t, { ...n, scope: this._scope }, e);
          }
          removeListener(t) {
            this._hotkeys.unbind(
              (Array.isArray(t) ? t : [t]).join(','),
              this._scope
            );
          }
          disableHotkey() {
            (this._disabled = !0), this._hotkeys.setScope(N);
          }
          enableHotkey() {
            (this._disabled = !1), this._hotkeys.setScope(this._scope);
          }
          async withDisabledHotkey(t) {
            this.disableHotkey();
            try {
              return await t();
            } finally {
              this.enableHotkey();
            }
          }
          withDisabledHotkeyFn(t) {
            return (...e) => this.withDisabledHotkey(() => t(...e));
          }
          withScope(t, e) {
            let n = this._scope;
            try {
              (this._scope = t), e();
            } finally {
              this._scope = n;
            }
          }
        })();
    },
    65024: function (t, e, n) {
      n.d(e, {
        nF: function () {
          return s.n;
        },
        hY: function () {
          return s.h;
        },
        GF: function () {
          return g.G;
        },
        E9: function () {
          return u.E;
        },
        UL: function () {
          return u.U;
        },
        dA: function () {
          return b.dA;
        },
        a6: function () {
          return i.a6;
        },
        jo: function () {
          return l.jo;
        },
        w_: function () {
          return l.w_;
        },
        _E: function () {
          return l._E;
        },
        kH: function () {
          return i.kH;
        },
        yd: function () {
          return r.yd;
        },
        jR: function () {
          return m;
        },
        Lb: function () {
          return a;
        },
        uZ: function () {
          return b.uZ;
        },
        MO: function () {
          return x.clearSelection;
        },
        r3: function () {
          return l.r3;
        },
        WP: function () {
          return i.WP;
        },
        Sf: function () {
          return i.Sf;
        },
        AE: function () {
          return i.AE;
        },
        GK: function () {
          return i.GK;
        },
        Ye: function () {
          return d;
        },
        yM: function () {
          return b.yM;
        },
        Ds: function () {
          return b.Ds;
        },
        $x: function () {
          return x.focusBlockByModel;
        },
        rq: function () {
          return x.focusNextBlock;
        },
        CL: function () {
          return x.focusPreviousBlock;
        },
        $k: function () {
          return x.focusTitle;
        },
        cP: function () {
          return l.cP;
        },
        _b: function () {
          return l._b;
        },
        rr: function () {
          return l.rr;
        },
        rc: function () {
          return l.rc;
        },
        Mb: function () {
          return l.Mb;
        },
        I8: function () {
          return l.I8;
        },
        cy: function () {
          return l.cy;
        },
        lK: function () {
          return l.lK;
        },
        zE: function () {
          return r.zE;
        },
        bR: function () {
          return x.getCurrentNativeRange;
        },
        U6: function () {
          return l.U6;
        },
        VA: function () {
          return l.VA;
        },
        Ne: function () {
          return l.Ne;
        },
        ev: function () {
          return l.ev;
        },
        gc: function () {
          return l.gc;
        },
        mt: function () {
          return l.mt;
        },
        De: function () {
          return l.De;
        },
        nt: function () {
          return l.nt;
        },
        az: function () {
          return l.az;
        },
        Et: function () {
          return l.Et;
        },
        fl: function () {
          return l.fl;
        },
        lN: function () {
          return l.dK;
        },
        gj: function () {
          return l.gj;
        },
        bQ: function () {
          return x.handleNativeRangeAtPoint;
        },
        tq: function () {
          return x.handleNativeRangeClick;
        },
        jx: function () {
          return x.handleNativeRangeDblClick;
        },
        cS: function () {
          return x.handleNativeRangeDragMove;
        },
        nE: function () {
          return x.handleNativeRangeTripleClick;
        },
        E7: function () {
          return x.hasNativeSelection;
        },
        AL: function () {
          return g.A;
        },
        YK: function () {
          return x.isBlankArea;
        },
        uI: function () {
          return i.uI;
        },
        d2: function () {
          return x.isCollapsedNativeSelection;
        },
        e1: function () {
          return l.e1;
        },
        Jc: function () {
          return b.Jc;
        },
        Rn: function () {
          return l.Rn;
        },
        hK: function () {
          return l.hK;
        },
        kK: function () {
          return l.kK;
        },
        P2: function () {
          return x.isEmbed;
        },
        xb: function () {
          return b.xb;
        },
        Qn: function () {
          return b.Qn;
        },
        Or: function () {
          return l.Or;
        },
        k: function () {
          return i.k;
        },
        ok: function () {
          return l.ok;
        },
        zv: function () {
          return l.zv;
        },
        zl: function () {
          return x.isMultiBlockRange;
        },
        us: function () {
          return x.isMultiLineRange;
        },
        im: function () {
          return l.im;
        },
        KO: function () {
          return f;
        },
        Ty: function () {
          return b.Ty;
        },
        IE: function () {
          return l.IE;
        },
        ZT: function () {
          return b.ZT;
        },
        FV: function () {
          return l.FV;
        },
        HP: function () {
          return v;
        },
        YT: function () {
          return y;
        },
        xT: function () {
          return x.resetNativeSelection;
        },
        JP: function () {
          return p;
        },
        Il: function () {
          return b.P2;
        },
        mw: function () {
          return h.m;
        },
      });
      var r = n(903),
        i = n(68389),
        o = n(31054),
        l = n(48616),
        u = n(45145),
        s = n(62624);
      function a(t, e, n, r, i, s = null) {
        let a = e.page.getSchemaByFlavour('affine:database');
        (0, o.kP)(a);
        let c = a.model.children ?? [],
          f = !0;
        if (
          (c.length &&
            (r.length
              ? (f = r.map(l.gc).every(t => c.includes(t.flavour)))
              : s && (f = c.includes(s))),
          !f && !(0, o.h$)(e, ['affine:database']))
        ) {
          let t = n.closest('affine-database');
          t && ((n = t), (e = (0, l.gc)(n)));
        }
        let d = 'none',
          h = 3 * i,
          { rect: g, flag: m } = (0, l.XZ)(t, e, n);
        if (m === l.pw.EmptyDatabase) {
          let t = u.U.fromDOMRect(g);
          return (
            (t.top -= h / 2),
            (t.height = h),
            {
              type: (d = 'database'),
              rect: t,
              modelState: { model: e, rect: g, element: n },
            }
          );
        }
        if (m === l.pw.Database) {
          let r = Math.abs(g.top - t.y),
            i = Math.abs(g.bottom - t.y),
            o = r < i;
          return {
            type: (d = o ? 'before' : 'after'),
            rect: u.U.fromLWTH(
              g.left,
              g.width,
              (o ? g.top - 1 : g.bottom) - h / 2,
              h
            ),
            modelState: { model: e, rect: g, element: n },
          };
        }
        let p = Math.abs(g.top - t.y),
          y = Math.abs(g.bottom - t.y),
          v = 4;
        if ('before' == (d = p < y ? 'before' : 'after')) {
          let t, e;
          (t = n.previousElementSibling)
            ? t === r[r.length - 1]
              ? (d = 'none')
              : (e = (0, l.az)(t))
            : (t = n.parentElement?.previousElementSibling) &&
              (e = t.getBoundingClientRect()),
            e && (v = (g.top - e.bottom) / 2);
        } else {
          let t;
          (t = n.nextElementSibling)
            ? t === r[0] && ((d = 'none'), (t = null))
            : (t = l.I8(n.parentElement)?.nextElementSibling),
            t && (v = ((0, l.az)(t).top - g.bottom) / 2);
        }
        if ('none' === d) return null;
        let x = g.top;
        return (
          'before' === d ? (x -= v) : (x += g.height + v),
          {
            type: d,
            rect: u.U.fromLWTH(g.left, g.width, x - h / 2, h),
            modelState: { model: e, rect: g, element: n },
          }
        );
      }
      var c = n(6635);
      function f(t) {
        return c.cj || c.Mq ? t.ctrlKey || t.metaKey : t.ctrlKey;
      }
      function d(t, e) {
        let n = { dataTransfer: new DataTransfer() };
        if (e) {
          let { clientX: t, clientY: r, screenX: i, screenY: o } = e;
          Object.assign(n, { clientX: t, clientY: r, screenX: i, screenY: o });
        }
        return new DragEvent(t, n);
      }
      var h = n(50972),
        g = n(95033);
      function m(t, e) {
        let n = t.length;
        for (; n; ) {
          n--;
          let { start: r, end: i } = t[n],
            o = e.splice(r, i + 1 - r);
          e.splice(r + 1, 0, ...o);
        }
      }
      function p(t, e) {
        let n = 0,
          r = t.length;
        for (; n < r; n++) {
          let { start: r, end: i } = t[n];
          if (0 === r) continue;
          let o = e.splice(r, i + 1 - r);
          e.splice(r - 1, 0, ...o);
        }
      }
      function y(t, e, n, r, i) {
        if (!t.length) return;
        t.sort(e);
        let { start: o, end: l } = n(t),
          u = r(o, l, t.length);
        i(u, t);
      }
      function v(t, e, n, r, i, o, l) {
        if (!t.length) return;
        t.sort(e);
        let u = n().sort(e),
          { start: s, end: a } = r(u),
          c = t.map(t => u.findIndex(e => e === t)),
          f = (function (t) {
            let e;
            let n = 1,
              r = t[0],
              i = t[0],
              o = [{ start: r, end: i }],
              l = t.length;
            for (; n < l; n++)
              (e = t[n]) - i == 1
                ? (o[o.length - 1].end = i = e)
                : ((r = i = e), o.push({ start: r, end: i }));
            return o;
          })(c);
        i(f, u);
        let d = o(s, a, u.length);
        l(d, u);
      }
      var x = n(63989),
        b = n(70263);
    },
    48616: function (t, e, n) {
      n.d(e, {
        De: function () {
          return h;
        },
        Dw: function () {
          return q;
        },
        EM: function () {
          return _;
        },
        Et: function () {
          return S;
        },
        FV: function () {
          return ts;
        },
        Fe: function () {
          return F;
        },
        I8: function () {
          return Z;
        },
        IE: function () {
          return ty;
        },
        IV: function () {
          return K;
        },
        KO: function () {
          return B;
        },
        Lq: function () {
          return H;
        },
        Mb: function () {
          return tl;
        },
        Mg: function () {
          return $;
        },
        Ne: function () {
          return y;
        },
        OZ: function () {
          return D;
        },
        Or: function () {
          return Y;
        },
        Rn: function () {
          return I;
        },
        U6: function () {
          return g;
        },
        UR: function () {
          return m;
        },
        VA: function () {
          return p;
        },
        XZ: function () {
          return tg;
        },
        YS: function () {
          return W;
        },
        Yb: function () {
          return L;
        },
        _E: function () {
          return C;
        },
        _b: function () {
          return b;
        },
        az: function () {
          return tr;
        },
        cP: function () {
          return te;
        },
        cu: function () {
          return j;
        },
        cy: function () {
          return Q;
        },
        dK: function () {
          return x;
        },
        e1: function () {
          return U;
        },
        ev: function () {
          return ta;
        },
        fl: function () {
          return ti;
        },
        gc: function () {
          return J;
        },
        gj: function () {
          return w;
        },
        hK: function () {
          return tv;
        },
        hf: function () {
          return z;
        },
        im: function () {
          return v;
        },
        jo: function () {
          return E;
        },
        kE: function () {
          return th;
        },
        kK: function () {
          return tp;
        },
        lK: function () {
          return tn;
        },
        mt: function () {
          return T;
        },
        nc: function () {
          return tc;
        },
        nt: function () {
          return function t(e, n = {}) {
            if (e.id in n)
              throw Error(
                "Can't get previous block! There's a loop in the block tree!"
              );
            n[e.id] = !0;
            let r = e.page,
              i = r.getParent(e);
            if (!i) return null;
            let o = r.getPreviousSibling(e);
            if (!o)
              return (0, l.h$)(i, [
                'affine:frame',
                'affine:page',
                'affine:database',
              ])
                ? t(i)
                : i;
            if (o.children.length) {
              let t = o.children[o.children.length - 1];
              for (; t.children.length; ) t = t.children[t.children.length - 1];
              return t;
            }
            return o;
          };
        },
        ok: function () {
          return M;
        },
        pS: function () {
          return R;
        },
        pw: function () {
          return i;
        },
        r3: function () {
          return V;
        },
        rc: function () {
          return to;
        },
        rr: function () {
          return tt;
        },
        st: function () {
          return function t(e, n = {}) {
            if (e.id in n)
              throw Error(
                "Can't get next block! There's a loop in the block tree!"
              );
            n[e.id] = !0;
            let r = e.page;
            if (e.children.length) return e.children[0];
            let i = e;
            for (; i; ) {
              let e = r.getNextSibling(i);
              if (e) {
                if ((0, l.h$)(e, ['affine:frame'])) return t(e);
                return e;
              }
              i = r.getParent(i);
            }
            return null;
          };
        },
        vF: function () {
          return N;
        },
        ve: function () {
          return td;
        },
        wA: function () {
          return tx;
        },
        w_: function () {
          return k;
        },
        wl: function () {
          return d;
        },
        zd: function () {
          return tf;
        },
        zg: function () {
          return P;
        },
        zv: function () {
          return O;
        },
      });
      var r,
        i,
        o = n(67072),
        l = n(31054),
        u = n(9288);
      n(62624);
      var s = n(45145),
        a = n(63989),
        c = n(70263);
      let f = `[${o.SF}]`;
      function d(t, e = document.body) {
        let n = te(t, e);
        return n?.parentElement?.closest(f) || null;
      }
      function h(t) {
        return (
          (0, l.kP)(t.page.root),
          document.querySelector(`[${o.SF}="${t.page.root.id}"]`)
        );
      }
      function g(t) {
        let e = p(t);
        if ('page' !== e.mode) return null;
        let n = e.querySelector('affine-default-page');
        return n;
      }
      function m(t) {
        let e = p(t);
        if ('edgeless' !== e.mode) return null;
        let n = e.querySelector('affine-edgeless-page');
        return n;
      }
      function p(t) {
        (0, l.kP)(
          t.root,
          'Failed to check page mode! Page root is not exists!'
        );
        let e = te(t.root.id),
          n = e?.closest('editor-container');
        return (0, l.kP)(n), n;
      }
      function y(t) {
        let e = t.closest('editor-container');
        return (0, l.kP)(e), e;
      }
      function v(t) {
        let e = p(t);
        if (!('mode' in e))
          throw Error('Failed to check page mode! Editor mode is not exists!');
        return 'page' === e.mode;
      }
      function x(t) {
        let e = v(t);
        if (!e) return null;
        (0, l.kP)(t.root);
        let n = document.querySelector(`[${o.SF}="${t.root.id}"]`);
        if (!n || n.closest('affine-default-page') !== n)
          throw Error('Failed to get viewport element!');
        return n.viewportElement;
      }
      function b(t) {
        (0, l.kP)(t.page.root);
        let e = u.y.getActiveEditor(),
          n = (e ?? document).querySelector(`[${o.SF}="${t.page.root.id}"]`);
        return n
          ? t.id === t.page.root.id
            ? n
            : n.querySelector(`[${o.SF}="${t.id}"]`)
          : null;
      }
      function E(t) {
        (0, l.kP)(t.page.root);
        let e = u.y.getActiveEditor(),
          n = (e ?? document).querySelector(`[${o.SF}="${t.page.root.id}"]`);
        if (!n) return Promise.resolve(null);
        if (t.id === t.page.root.id) return Promise.resolve(n);
        let r = !1;
        return new Promise((e, i) => {
          let l = t => {
              (r = !0), s.disconnect(), e(t);
            },
            u = () => {
              s.disconnect(),
                i(
                  Error(
                    `Cannot find block element by model: ${t.flavour} id: ${t.id}`
                  )
                );
            },
            s = new MutationObserver(() => {
              let e = n.querySelector(`[${o.SF}="${t.id}"]`);
              e && l(e);
            });
          s.observe(n, { childList: !0, subtree: !0 }),
            requestAnimationFrame(() => {
              if (!r) {
                let e = b(t);
                e ? l(e) : u();
              }
            });
        });
      }
      function _(t = (0, a.getCurrentNativeRange)()) {
        let e =
            t.startContainer instanceof Text
              ? t.startContainer.parentElement
              : t.startContainer,
          n = e.closest(`[${o.SF}]`);
        if (!n) return null;
        let r = n.model;
        return (0, l.h$)(r, ['affine:frame', 'affine:page']) ? null : r;
      }
      function S(t) {
        let e = b(t),
          n = e?.querySelector('rich-text');
        return n || null;
      }
      async function k(t) {
        let e = await E(t),
          n = e?.querySelector('rich-text');
        return n || null;
      }
      function w(t) {
        if ((0, l.h$)(t, ['affine:database'])) return null;
        let e = S(t);
        return e ? e.vEditor : null;
      }
      async function C(t) {
        if ((0, l.h$)(t, ['affine:database']))
          throw Error('Cannot get virgo by database model!');
        let e = await k(t);
        return e ? e.vEditor : null;
      }
      function R(t) {
        if (
          t.startContainer.nodeType === Node.COMMENT_NODE ||
          t.endContainer.nodeType === Node.COMMENT_NODE ||
          t.commonAncestorContainer.nodeType === Node.COMMENT_NODE
        )
          return [];
        let e = t.commonAncestorContainer;
        if (e.nodeType === Node.TEXT_NODE) {
          let e = _(t);
          return e ? [e] : [];
        }
        if (e.attributes && !e.attributes.getNamedItem(o.SF)) {
          let t = e.closest(f)?.parentElement;
          null != t && (e = t);
        }
        let n = [],
          r = e.querySelectorAll(f);
        if (!r.length) return [];
        if (1 === r.length) {
          let e = _(t);
          return e ? [e] : [];
        }
        return (
          Array.from(r)
            .filter(t => 'model' in t)
            .forEach(e => {
              if (!e.model) return;
              let r = (0, l.h$)(e.model, ['affine:page'])
                ? e?.querySelector('.affine-default-page-block-title-container')
                : e?.querySelector('rich-text') || e?.querySelector('img');
              r &&
                t.intersectsNode(r) &&
                !(0, l.h$)(e.model, ['affine:frame', 'affine:page']) &&
                n.push(e.model);
            }),
          n
        );
      }
      function T(t) {
        let e = t.closest(f);
        return (0, l.kP)(e, 'Cannot find block element by element'), J(e);
      }
      function A(t, e) {
        return new DOMRect(
          Math.min(t.left, e.left),
          Math.min(t.top, e.top),
          Math.max(t.right, e.right) - Math.min(t.left, e.left),
          Math.max(t.bottom, e.bottom) - Math.min(t.top, e.top)
        );
      }
      function N(t, e) {
        let n = Array.from(t);
        if ('first' === e) {
          let t = 0;
          for (
            let e = 0;
            e < n.length &&
            (!(n[e].left < 0) || !(n[e].right < 0) || 1 !== n[e].height);
            e++
          )
            t = e;
          let e = n.slice(0, t + 1);
          return e.reduce(A);
        }
        {
          let t = n.length - 1;
          for (let e = n.length - 1; e >= 0 && 0 !== n[e].height; e--) t = e;
          let e = n.slice(t);
          return e.reduce(A);
        }
      }
      function P(t) {
        if (t instanceof Event) throw Error('Did you mean "event.target"?');
        if (!t || !(t instanceof Element)) return !1;
        let e = t.closest('rich-text');
        return !!e;
      }
      function O(t) {
        let e = u.y.getActiveEditor(),
          n = (e ?? document).querySelector('[data-block-is-title="true"]');
        return !!n && n.contains(t);
      }
      function M(t) {
        let e = u.y.getActiveEditor(),
          n = (e ?? document).querySelector('surface-text-editor');
        return !!n && n.contains(t);
      }
      function D(t) {
        return (
          t instanceof SVGPathElement &&
          'true' === t.getAttribute('data-is-toggle-icon')
        );
      }
      function I(t) {
        return (
          t instanceof HTMLElement &&
          'true' === t.getAttribute('data-virgo-root') &&
          !!t.closest('affine-database')
        );
      }
      function B(t) {
        return t instanceof HTMLInputElement && !!t.closest('affine-database');
      }
      function L(t) {
        let e = document.querySelector('[data-block-is-database-title="true"]');
        return !!e && e.contains(t);
      }
      function F(t) {
        return (
          t instanceof Element &&
          t.classList.contains('affine-embed-wrapper-caption')
        );
      }
      function $(t) {
        return t
          ? t instanceof Element
            ? t
            : (t instanceof Node && t.parentElement, null)
          : null;
      }
      function V(t, e) {
        return (
          t.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_CONTAINED_BY
        );
      }
      function U(t, e) {
        return t.some(t => V(t, e));
      }
      function q(t) {
        return t.hasAttribute(o.SF);
      }
      function K({ tagName: t }) {
        return 'AFFINE-DEFAULT-PAGE' === t;
      }
      function j({ tagName: t }) {
        return 'AFFINE-EDGELESS-PAGE' === t;
      }
      function z(t) {
        return (
          K(t) ||
          j(t) ||
          G(t) ||
          (function ({ tagName: t }) {
            return 'AFFINE-SURFACE' === t;
          })(t)
        );
      }
      function H(t) {
        return !z(t);
      }
      function Y({ tagName: t, firstElementChild: e }) {
        return 'AFFINE-EMBED' === t && e?.tagName === 'AFFINE-IMAGE';
      }
      function G({ tagName: t }) {
        return 'AFFINE-FRAME' === t;
      }
      function X({ tagName: t }) {
        return 'AFFINE-DATABASE-TABLE' === t || 'AFFINE-DATABASE' === t;
      }
      function W({ classList: t }) {
        return t.contains('affine-edgeless-block-child');
      }
      function Q(t, e = null, n = 1) {
        let r;
        let { y: i } = t,
          u = null,
          s = null,
          a = null,
          f = 0,
          d = 1;
        if (e) {
          let { snapToEdge: i = { x: !0, y: !1 } } = e;
          r = e.container;
          let l = e.rect || r?.getBoundingClientRect();
          l &&
            (i.x &&
              (t.x = Math.min(
                Math.max(t.x, l.left) + o.qL * n - 1,
                l.right - o.qL * n - 1
              )),
            i.y &&
              (1 !== n && console.warn('scale is not supported yet'),
              (t.y = (0, c.uZ)(t.y, l.top + 1, l.bottom - 1))));
        }
        if ((u = tu(document.elementsFromPoint(t.x, t.y), r))) {
          if (X(u)) {
            s = u.getBoundingClientRect();
            let e = th(u);
            if (
              ((0, l.kP)(e),
              !(a = e.getBoundingClientRect()).height ||
                t.y < a.top ||
                t.y > a.bottom)
            )
              return u;
            a = null;
          } else {
            if (
              ((s = tr(u)),
              !(a = u
                .querySelector('.affine-block-children-container')
                ?.firstElementChild?.getBoundingClientRect()) ||
                !a.height ||
                (s.x < t.x && t.x <= a.x))
            )
              return u;
            a = null;
          }
          (s = null), (u = null);
        }
        do
          if (
            ((t.y = i - 2 * d),
            d < 0 && d--,
            (d *= -1),
            (u = tu(document.elementsFromPoint(t.x, t.y), r)))
          ) {
            if (
              ((f = (s = tr(u)).bottom - t.y) >= 0 && f <= 16) ||
              ((f = t.y - s.top) >= 0 && f <= 16)
            )
              return u;
            (s = null), (u = null);
          }
        while (d <= 8);
        return u;
      }
      function Z(t) {
        return t && ((q(t) && H(t)) || ((t = t.closest(f)) && H(t))) ? t : null;
      }
      function J(t) {
        return 'hostModel' in t
          ? ((0, l.kP)(t.hostModel), t.hostModel)
          : ((0, l.kP)(t.model), t.model);
      }
      function tt(t = document) {
        return Array.from(t.querySelectorAll(f)).filter(H);
      }
      function te(t, e = u.y.getActiveEditor() ?? document) {
        return e.querySelector(`[${o.SF}="${t}"]`);
      }
      function tn(t, e = document) {
        let n = te(t, e);
        return n ? (G(n) ? n : n.closest('affine-frame')) : null;
      }
      function tr(t) {
        return X(t)
          ? t.getBoundingClientRect()
          : (t.firstElementChild ?? t).getBoundingClientRect();
      }
      function ti(t) {
        if (Y(t)) {
          let e = t.querySelector('.affine-image-wrapper'),
            n = t.querySelector('.resizable-img');
          (0, l.kP)(e), (0, l.kP)(n);
          let r = s.U.fromDOM(e),
            i = s.U.fromDOM(n),
            o = r.intersect(i);
          return o.toDOMRect();
        }
        return tr(t);
      }
      function to(t) {
        if (t.length <= 1) return t;
        let e = t[0];
        return t.filter((t, n) => 0 === n || (!V(e, t) && ((e = t), !0)));
      }
      function tl(t) {
        return t.reduce(
          (t, e) => (X(e) ? t.push(e) : t.push(e, ...tt(e)), t),
          []
        );
      }
      function tu(t, e) {
        let n = t.length,
          r = null,
          i = 0;
        for (; i < n; )
          if (((r = t[i]), i++, !e || V(e, r))) {
            if (q(r) && H(r)) return r;
            if (
              (function ({ tagName: t }) {
                return 'AFFINE-EMBED' === t;
              })(r)
            ) {
              if (i < n && q(t[i]) && H(t[i])) return t[i];
              return Z(r);
            }
          }
        return null;
      }
      function ts() {
        let t = getComputedStyle(document.documentElement).getPropertyValue(
          '--affine-theme-mode'
        );
        return 'dark' === t.trim() ? 'dark' : 'light';
      }
      function ta(t) {
        return document.elementsFromPoint(t.x, t.y).find(W) || null;
      }
      function tc(t) {
        return (0, l.h$)(t, ['affine:database']) && t.isEmpty();
      }
      function tf(t) {
        return t.querySelector('.affine-database-block-table');
      }
      function td(t) {
        return t.querySelector('.affine-database-column-header');
      }
      function th(t) {
        return t.querySelector('.affine-database-block-rows');
      }
      function tg(t, e, n) {
        let r = { rect: tr(n), flag: i.Normal },
          o = (0, l.h$)(e, ['affine:database']);
        if (o) {
          let o = tf(n);
          (0, l.kP)(o);
          let u = o.getBoundingClientRect();
          if (e.isEmpty()) {
            if (((r.flag = i.EmptyDatabase), t.y < u.top)) return r;
            let e = td(n);
            (0, l.kP)(e),
              (u = e.getBoundingClientRect()),
              (r.rect = new DOMRect(r.rect.left, u.bottom, r.rect.width, 1));
          } else {
            let e;
            r.flag = i.Database;
            let o = th(n);
            (0, l.kP)(o);
            let s = o.getBoundingClientRect();
            if (t.y < s.top || t.y > s.bottom) return r;
            let a = document.elementsFromPoint(t.x, t.y),
              c = a.length,
              d = 0;
            for (; d < c; d++) {
              if (
                (e = a[d]).classList.contains(
                  'affine-database-block-row-cell-content'
                )
              ) {
                r.rect = tm(e, u);
                break;
              }
              if (e.classList.contains('affine-database-block-row')) {
                (e = e.querySelector(f)), (0, l.kP)(e), (r.rect = tm(e, u));
                break;
              }
            }
          }
        } else {
          let t = n.parentElement;
          t?.classList.contains('affine-database-block-row-cell-content') &&
            ((r.flag = i.Database), (r.rect = tm(t)));
        }
        return r;
      }
      function tm(t, e) {
        if (!e) {
          let n = t.closest('.affine-database-block-table');
          (0, l.kP)(n), (e = n.getBoundingClientRect());
        }
        let n = t.parentElement;
        (0, l.kP)(n);
        let r = n.parentElement;
        (0, l.kP)(r);
        let i = n.getBoundingClientRect(),
          o = r.getBoundingClientRect();
        return new DOMRect(e.left, o.top, i.right - e.left, i.height);
      }
      function tp(t) {
        return t && t instanceof Element;
      }
      function ty(t) {
        return 'AFFINE-SELECTED-BLOCKS' === t.tagName;
      }
      function tv(t) {
        return 'AFFINE-DRAG-HANDLE' === t.tagName;
      }
      function tx(t) {
        return t.some(X);
      }
      ((r = i || (i = {}))[(r.Normal = 0)] = 'Normal'),
        (r[(r.Database = 1)] = 'Database'),
        (r[(r.EmptyDatabase = 2)] = 'EmptyDatabase');
    },
    45145: function (t, e, n) {
      n.d(e, {
        E: function () {
          return i;
        },
        U: function () {
          return o;
        },
      });
      var r = n(70263);
      class i {
        constructor(t = 0, e = 0) {
          (this.x = t), (this.y = e);
        }
        set(t, e) {
          (this.x = t), (this.y = e);
        }
        equals({ x: t, y: e }) {
          return this.x === t && this.y === e;
        }
        add(t) {
          return new i(this.x + t.x, this.y + t.y);
        }
        scale(t) {
          return new i(this.x * t, this.y * t);
        }
        subtract(t) {
          return new i(this.x - t.x, this.y - t.y);
        }
        clone() {
          return new i(this.x, this.y);
        }
        static min(t, e) {
          return new i(Math.min(t.x, e.x), Math.min(t.y, e.y));
        }
        static max(t, e) {
          return new i(Math.max(t.x, e.x), Math.max(t.y, e.y));
        }
        static clamp(t, e, n) {
          return new i((0, r.uZ)(t.x, e.x, n.x), (0, r.uZ)(t.y, e.y, n.y));
        }
      }
      class o {
        constructor(t, e, n, r) {
          let [o, l] = t <= n ? [t, n] : [n, t],
            [u, s] = e <= r ? [e, r] : [r, e];
          (this.min = new i(o, u)), (this.max = new i(l, s));
        }
        get width() {
          return this.max.x - this.min.x;
        }
        set width(t) {
          this.max.x = this.min.x + t;
        }
        get height() {
          return this.max.y - this.min.y;
        }
        set height(t) {
          this.max.y = this.min.y + t;
        }
        get left() {
          return this.min.x;
        }
        set left(t) {
          this.min.x = t;
        }
        get top() {
          return this.min.y;
        }
        set top(t) {
          this.min.y = t;
        }
        get right() {
          return this.max.x;
        }
        set right(t) {
          this.max.x = t;
        }
        get bottom() {
          return this.max.y;
        }
        set bottom(t) {
          this.max.y = t;
        }
        center() {
          return new i(
            (this.left + this.right) / 2,
            (this.top + this.bottom) / 2
          );
        }
        extend_with(t) {
          (this.min = i.min(this.min, t)), (this.max = i.max(this.max, t));
        }
        extend_with_x(t) {
          (this.min.x = Math.min(this.min.x, t)),
            (this.max.x = Math.max(this.max.x, t));
        }
        extend_with_y(t) {
          (this.min.y = Math.min(this.min.y, t)),
            (this.max.y = Math.max(this.max.y, t));
        }
        equals({ min: t, max: e }) {
          return this.min.equals(t) && this.max.equals(e);
        }
        contains({ min: t, max: e }) {
          return this.isPointIn(t) && this.isPointIn(e);
        }
        intersects({ left: t, top: e, right: n, bottom: r }) {
          return (
            this.left <= n &&
            t <= this.right &&
            this.top <= r &&
            e <= this.bottom
          );
        }
        isPointIn({ x: t, y: e }) {
          return (
            this.left <= t &&
            t <= this.right &&
            this.top <= e &&
            e <= this.bottom
          );
        }
        isPointDown({ x: t, y: e }) {
          return this.bottom < e && this.left <= t && this.right >= t;
        }
        isPointUp({ x: t, y: e }) {
          return e < this.top && this.left <= t && this.right >= t;
        }
        isPointLeft({ x: t, y: e }) {
          return t < this.left && this.top <= e && this.bottom >= e;
        }
        isPointRight({ x: t, y: e }) {
          return t > this.right && this.top <= e && this.bottom >= e;
        }
        intersect(t) {
          return o.fromPoints(i.max(this.min, t.min), i.min(this.max, t.max));
        }
        clamp(t) {
          return i.clamp(t, this.min, this.max);
        }
        clone() {
          let { left: t, top: e, right: n, bottom: r } = this;
          return new o(t, e, n, r);
        }
        toDOMRect() {
          let { left: t, top: e, width: n, height: r } = this;
          return new DOMRect(t, e, n, r);
        }
        static fromLTRB(t, e, n, r) {
          return new o(t, e, n, r);
        }
        static fromLWTH(t, e, n, r) {
          return new o(t, n, t + e, n + r);
        }
        static fromXY(t, e) {
          return o.fromPoint(new i(t, e));
        }
        static fromPoint(t) {
          return o.fromPoints(t.clone(), t);
        }
        static fromPoints(t, e) {
          let n = Math.abs(e.x - t.x),
            r = Math.abs(e.y - t.y),
            i = Math.min(e.x, t.x),
            l = Math.min(e.y, t.y);
          return o.fromLWTH(i, n, l, r);
        }
        static fromDOMRect({ left: t, top: e, right: n, bottom: r }) {
          return o.fromLTRB(t, e, n, r);
        }
        static fromDOM(t) {
          return o.fromDOMRect(t.getBoundingClientRect());
        }
      }
    },
    63989: function (t, e, n) {
      n.r(e),
        n.d(e, {
          clearSelection: function () {
            return E;
          },
          focusBlockByModel: function () {
            return y;
          },
          focusNextBlock: function () {
            return x;
          },
          focusPreviousBlock: function () {
            return v;
          },
          focusRichText: function () {
            return p;
          },
          focusTitle: function () {
            return m;
          },
          getClosestEditor: function () {
            return V;
          },
          getClosestFrame: function () {
            return U;
          },
          getCurrentNativeRange: function () {
            return R;
          },
          getFirstTextNode: function () {
            return I;
          },
          getHorizontalClosestElement: function () {
            return $;
          },
          getLastTextNode: function () {
            return D;
          },
          getSplicedTitle: function () {
            return B;
          },
          handleNativeRangeAtPoint: function () {
            return P;
          },
          handleNativeRangeClick: function () {
            return N;
          },
          handleNativeRangeDblClick: function () {
            return O;
          },
          handleNativeRangeDragMove: function () {
            return T;
          },
          handleNativeRangeTripleClick: function () {
            return q;
          },
          hasNativeSelection: function () {
            return _;
          },
          isBlankArea: function () {
            return A;
          },
          isCollapsedNativeSelection: function () {
            return S;
          },
          isDatabase: function () {
            return F;
          },
          isEmbed: function () {
            return L;
          },
          isMultiBlockRange: function () {
            return w;
          },
          isMultiLineRange: function () {
            return C;
          },
          isRangeNativeSelection: function () {
            return k;
          },
          leftFirstSearchLeafNodes: function () {
            return M;
          },
          resetNativeSelection: function () {
            return b;
          },
        });
      var r = n(67072),
        i = n(53905),
        o = n(31054),
        l = n(29113),
        u = n(68389),
        s = n(48616),
        a = n(45145);
      let c = /[^\p{Alpha}\p{M}\p{Nd}\p{Pc}\p{Join_C}]/u,
        f = /[^\p{Alpha}\p{M}\p{Nd}\p{Pc}\p{Join_C}\s]/u;
      function d(t) {
        let e = document.createRange(),
          n = t.firstChild;
        for (; n?.firstChild; ) n = n.firstChild;
        return n && (e.setStart(n, 0), e.setEnd(n, 0)), e;
      }
      function h(t) {
        let e = document.createRange(),
          n = t.lastChild;
        for (; n?.lastChild; ) n = n.lastChild;
        return (
          n &&
            (e.setStart(n, n.textContent?.length || 0),
            e.setEnd(n, n.textContent?.length || 0)),
          e
        );
      }
      async function g(t, e, n = 1) {
        let i = e.closest('.affine-default-viewport'),
          { top: o, bottom: l } = a.U.fromDOM(e),
          { clientHeight: u } = document.documentElement,
          s =
            (Number(
              window.getComputedStyle(e).lineHeight.replace(/\D+$/, '')
            ) || 16) * n;
        switch (l < t) {
          case !0: {
            let t = l;
            return (
              l < r.zQ &&
                i &&
                ((i.scrollTop = i.scrollTop - r.zQ + l),
                requestAnimationFrame(() => {
                  t = e.getBoundingClientRect().bottom;
                })),
              t - s / 2
            );
          }
          case !1: {
            let t = o;
            return (
              i &&
                o > u - r.zQ &&
                ((i.scrollTop = i.scrollTop + (o + r.zQ - u)),
                requestAnimationFrame(() => {
                  t = e.getBoundingClientRect().top;
                })),
              t + s / 2
            );
          }
        }
      }
      function m(t, e = 1 / 0, n = 0) {
        let r = (0, s.U6)(t);
        if (!r) throw Error("Can't find page component!");
        if (!r.titleVEditor) throw Error("Can't find title vEditor!");
        e > r.titleVEditor.yText.length && (e = r.titleVEditor.yText.length),
          r.titleVEditor.setVRange({ index: e, length: n });
      }
      async function p(t, e = 'end', n = 1) {
        let { left: r, right: o } = a.U.fromDOM(t);
        t.querySelector('v-line')?.scrollIntoView({ block: 'nearest' });
        let l = null;
        switch (e) {
          case 'start':
            l = d(t);
            break;
          case 'end':
            l = h(t);
            break;
          default: {
            let { x: u, y: s } = e,
              a = u,
              c = await g(s, t, n);
            u <= r && (a = r + 1), u >= o && (a = o - 1), (l = (0, i.Qo)(a, c));
          }
        }
        b(l);
      }
      function y(t, e = 'end', n = 1) {
        if ((0, o.h$)(t, ['affine:frame', 'affine:page']))
          throw Error("Can't focus frame or page!");
        let r = (0, s.De)(t);
        (0, o.kP)(r);
        let i = 'AFFINE-DEFAULT-PAGE' === r.tagName;
        if (
          i &&
          (0, o.h$)(t, [
            'affine:embed',
            'affine:divider',
            'affine:code',
            'affine:database',
            'affine:bookmark',
          ])
        ) {
          r.selection.state.clearSelection();
          let e = s._b(t)?.getBoundingClientRect();
          e && r.slots.selectedRectsUpdated.emit([e]);
          let n = (0, s._b)(t);
          if (
            ((0, o.kP)(n),
            r.selection.state.selectedBlocks.push(n),
            (0, o.h$)(t, ['affine:database']))
          ) {
            let e = t.children.map(t => (0, s._b)(t)).filter(t => null !== t);
            r.selection.state.selectedBlocks.push(...e);
          }
          (r.selection.state.type = 'block'),
            b(null),
            document.activeElement.blur();
          return;
        }
        let l = (0, s._b)(t),
          u = l?.querySelector('[contenteditable]');
        u &&
          (i &&
            (r.selection.state.clearSelection(),
            r.selection.setFocusedBlock(l)),
          p(u, e, n));
      }
      function v(t, e = 'start', n = 1) {
        let r = (0, s.De)(t);
        (0, o.kP)(r);
        let i = e;
        'AFFINE-DEFAULT-PAGE' === r.tagName &&
          (i
            ? (r.lastSelectionPosition = i)
            : r.lastSelectionPosition && (i = r.lastSelectionPosition));
        let l = (0, s.nt)(t);
        l && i && y(l, i, n);
      }
      function x(t, e = 'start', n = 1) {
        let r = (0, s.De)(t);
        (0, o.kP)(r);
        let i = e;
        'AFFINE-DEFAULT-PAGE' === r.tagName &&
          (i
            ? (r.lastSelectionPosition = i)
            : r.lastSelectionPosition && (i = r.lastSelectionPosition));
        let l = (0, s.st)(t);
        l && y(l, i, n);
      }
      function b(t) {
        let e = window.getSelection();
        (0, o.kP)(e), e.removeAllRanges(), t && e.addRange(t);
      }
      function E(t) {
        t.root && s.De(t.root)?.selection.clear();
      }
      function _() {
        let t = window.getSelection();
        return !!t && !!t.rangeCount;
      }
      function S() {
        let t = window.getSelection();
        return !!t && t.isCollapsed;
      }
      function k() {
        let t = window.getSelection();
        return !!t && !t.isCollapsed;
      }
      function w(t = R()) {
        return (0, s.pS)(t).length > 1;
      }
      function C(t = R()) {
        let { height: e } = t.getBoundingClientRect(),
          n = document.createRange();
        n.setStart(t.startContainer, t.startOffset);
        let { height: r } = n.getBoundingClientRect();
        return e > r;
      }
      function R(t = window.getSelection()) {
        if (!t) throw Error('Failed to get current range, selection is null');
        if (0 === t.rangeCount)
          throw Error('Failed to get current range, rangeCount is 0');
        return (
          t.rangeCount > 1 &&
            console.warn('getCurrentRange may be wrong, rangeCount > 1'),
          t.getRangeAt(0)
        );
      }
      function T(t, e) {
        var n;
        let r = !!document.querySelector('affine-edgeless-page'),
          { clientX: l, clientY: u, target: s } = e.raw,
          a = (0, i.Qo)(l, u);
        if (!a) return;
        (0, o.kP)(t);
        let {
            startContainer: c,
            startOffset: f,
            endContainer: d,
            endOffset: h,
          } = t,
          g = c.nodeType === Node.TEXT_NODE ? c.parentElement : c,
          m = g.closest('affine-frame');
        if (!m) return;
        let p = null,
          y = !1;
        if (r) (p = m), (y = !0);
        else {
          let t = document.elementFromPoint(l, u);
          if (t?.classList.contains('virgo-editor')) return;
          p = t?.closest('affine-frame');
          let e = t?.closest('.virgo-editor');
          (y = !p || !e), p ?? (p = U(u));
        }
        if (!p) return;
        if (y) {
          let t = null;
          if (
            (s && 'closest' in s && (t = s.closest('.virgo-editor')),
            t || (t = V(u, p)),
            !t)
          )
            return;
          let e = (function (t, e) {
            let {
                top: n,
                left: r,
                right: i,
                bottom: o,
              } = e.getBoundingClientRect(),
              l = { ...t },
              { x: u, y: s } = t;
            return (
              s < n
                ? ((l.y = n + 4), (l.x = r + 4))
                : s > o
                ? ((l.y = o - 4), (l.x = i - 4))
                : u < r
                ? (l.x = r)
                : u > i && (l.x = i),
              l
            );
          })({ x: l, y: u }, t);
          if (
            !(a = (0, i.Qo)(e.x, e.y)) ||
            a.endContainer.nodeType !== Node.TEXT_NODE ||
            !p.contains(a.endContainer)
          )
            return;
        }
        let v = 1 === a.comparePoint(d, h);
        (n = a), v ? n.setEnd(d, h) : n.setStart(c, f), b(n);
      }
      function A(t) {
        let { cursor: e } = window.getComputedStyle(t.raw.target);
        return 'text' !== e;
      }
      function N(t, e, n) {
        e.button ||
          (P(e.raw.clientX, e.raw.clientY),
          (function (t, e, n) {
            let i = (0, s.Mg)(e.raw.target),
              l = i?.closest(`[${r.SF}]`),
              a = l?.model || l?.pageModel;
            if (!a) return;
            let c = (0, o.h$)(a, ['affine:frame', 'affine:page']);
            if (!c) return;
            let { clientX: f, clientY: g } = e.raw,
              m = V(g, n);
            if (m?.closest('affine-database') || !m) return;
            let p = (0, s.mt)(m),
              y = m.getBoundingClientRect();
            if ((0, o.h$)(p, o.G8) && g > y.bottom) {
              let e = t.getParent(p);
              (0, o.kP)(e);
              let n = t.addBlock('affine:paragraph', {}, e.id);
              (0, u.a6)(t, n);
              return;
            }
            if (f < y.left) {
              let t = d(m);
              b(t);
            } else {
              let t = h(m);
              b(t);
            }
          })(t, e, n));
      }
      function P(t, e) {
        let n = (0, i.Qo)(t, e),
          r = n?.startContainer;
        r instanceof Node && b(n);
      }
      function O() {
        let t = window.getSelection();
        if (t && t.isCollapsed && t.anchorNode) {
          let e = t.anchorNode.parentElement?.closest('[contenteditable]');
          if (e)
            return (function (t, e) {
              let n = M(e);
              if (!n.length) return null;
              let [r, i, o] = (function (t, e) {
                  let n = t[0],
                    r = 0,
                    i = t[t.length - 1],
                    o = i.textContent?.length || 0,
                    l =
                      e.anchorNode instanceof Element
                        ? e.anchorNode.firstChild
                        : e.anchorNode,
                    u = l?.textContent?.[e.anchorOffset] || '',
                    s = t.findIndex(t => t === l);
                  if (u && f.test(u) && l)
                    (n = l),
                      (i = l),
                      (r = e.anchorOffset),
                      (o = e.anchorOffset + 1);
                  else {
                    let l = c;
                    /\s/.test(u) && (l = /\S/), /\w/.test(u) && (l = /\W/);
                    let [a, f, d, h] = (function (t, e, n, r) {
                      let i = e[0],
                        o = 0,
                        l = e[e.length - 1],
                        u = l.textContent?.length || 0;
                      for (let l = t; l >= 0; l--) {
                        let u = e[l];
                        if (u instanceof Text) {
                          let e = u.textContent?.slice(
                            0,
                            l === t ? n.anchorOffset : void 0
                          );
                          if (e) {
                            let t = Array.from(e).reverse().join(''),
                              n = t.search(r);
                            if (-1 !== n) {
                              (i = u), (o = t.length - n);
                              break;
                            }
                          }
                        }
                      }
                      for (let i = t; i < e.length; i++) {
                        let o = e[i];
                        if (o instanceof Text) {
                          let e = o.textContent?.slice(
                            i === t ? n.anchorOffset : void 0
                          );
                          if (e) {
                            let s = e.search(r);
                            if (-1 !== s) {
                              (l = o), (u = i === t ? n.anchorOffset + s : s);
                              break;
                            }
                          }
                        }
                      }
                      return [i, o, l, u];
                    })(s, t, e, l);
                    (n = a), (r = f), (i = d), (o = h);
                  }
                  let a = document.createRange();
                  return a.setStart(n, r), a.setEnd(i, o), [a, u, s];
                })(n, t),
                l = (function (t, e, n, r, i) {
                  if (Intl.Segmenter && !f.test(n) && !/\w/.test(n)) {
                    let [o, l] = (function (t, e, n, r) {
                      let i = t.toString(),
                        o = new Intl.Segmenter([], { granularity: 'word' }),
                        l = o.segment(i)[Symbol.iterator](),
                        u = Array.from(l);
                      if (0 === u.length) return [-1, ''];
                      let s = 0,
                        a = !1;
                      for (let r = 0; r < e.length; r++) {
                        let i = e[r];
                        if (a || i === t.startContainer) {
                          if (((a = !0), i !== n.anchorNode))
                            s += i.textContent?.length || 0;
                          else {
                            s = s + n.anchorOffset - t.startOffset;
                            break;
                          }
                        }
                      }
                      let c = u[u.length - 1].segment;
                      for (let t = 0; t < u.length; t++) {
                        let e = u[t];
                        if (s === e.index) {
                          c = e.segment;
                          break;
                        }
                        if (s < e.index) {
                          c = u[t - 1].segment;
                          break;
                        }
                      }
                      let f = c.indexOf(r);
                      return [f, c];
                    })(e, r, t, n);
                    if (-1 === o || -1 === i) return null;
                    let u = o,
                      s = l.length - o;
                    for (let n = i; n >= 0; n--) {
                      let o = r[n],
                        l =
                          n === i ? t.anchorOffset : o.textContent?.length || 0;
                      if (u <= l) {
                        e.setStart(o, l - u);
                        break;
                      }
                      u -= l;
                    }
                    for (let n = i; n < r.length; n++) {
                      let o = r[n],
                        l = o.textContent?.length || 0,
                        u = n === i ? l - t.anchorOffset : l;
                      if (s <= u) {
                        e.setEnd(o, l - u + s);
                        break;
                      }
                      s -= u;
                    }
                  }
                  return e;
                })(t, r, i, n, o);
              return l && b(l), l;
            })(t, e);
        }
        return null;
      }
      function M(t, e = []) {
        if (t.nodeType === Node.TEXT_NODE) e.push(t);
        else {
          let n = t.childNodes;
          for (let t = 0; t < n.length; t++) M(n[t], e);
        }
        return e;
      }
      function D(t) {
        return M(t).pop();
      }
      function I(t) {
        return M(t)[0];
      }
      function B(t) {
        let e = [...t.value];
        return (
          (0, o.kP)(t.selectionStart),
          (0, o.kP)(t.selectionEnd),
          e.splice(t.selectionStart, t.selectionEnd - t.selectionStart),
          e.join('')
        );
      }
      function L(t) {
        return !!t.raw.target.classList.contains('resize');
      }
      function F(t) {
        let e = t.raw.target;
        return e instanceof HTMLElement && !!e.closest('affine-database-table');
      }
      function $(t, e, n = document.body) {
        let r = Array.from(n.querySelectorAll(e)).sort((t, e) =>
            t.getBoundingClientRect().top > e.getBoundingClientRect().top
              ? 1
              : -1
          ),
          i = r.length;
        if (0 === i) return null;
        if (1 === i || t < r[0].getBoundingClientRect().top) return r[0];
        if (t > r[i - 1].getBoundingClientRect().bottom) return r[i - 1];
        let o = 0,
          l = i - 1;
        for (; o <= l; ) {
          let e = Math.floor((o + l) / 2),
            n = r[e];
          if (
            t <= n.getBoundingClientRect().bottom &&
            (0 === e || t > r[e - 1].getBoundingClientRect().bottom)
          )
            return r[e];
          n.getBoundingClientRect().top > t ? (l = e - 1) : (o = e + 1);
        }
        return null;
      }
      function V(t, e = document.body) {
        return $(t, '.virgo-editor', e);
      }
      function U(t) {
        return $(t, 'affine-frame');
      }
      function q(t) {
        let {
            raw: { clientX: e, clientY: n },
          } = t,
          r = document.elementFromPoint(e, n)?.closest('.virgo-editor');
        if (!r) return null;
        let i = (0, l.IP)(r),
          o = i[0],
          u = i[i.length - 1],
          s = new Range();
        return (
          s.setStart(o, 0), s.setEnd(u, Number(u.textContent?.length)), b(s), s
        );
      }
    },
    70263: function (t, e, n) {
      n.d(e, {
        $v: function () {
          return i;
        },
        Ds: function () {
          return a;
        },
        Jc: function () {
          return h;
        },
        Ky: function () {
          return m;
        },
        Le: function () {
          return b;
        },
        NC: function () {
          return v;
        },
        P2: function () {
          return s;
        },
        Qn: function () {
          return y;
        },
        Ty: function () {
          return g;
        },
        UT: function () {
          return d;
        },
        VF: function () {
          return f;
        },
        ZT: function () {
          return u;
        },
        dA: function () {
          return o;
        },
        kC: function () {
          return x;
        },
        uZ: function () {
          return c;
        },
        vM: function () {
          return p;
        },
        xb: function () {
          return function t(e) {
            if (0 !== e.children.length) {
              let n = e.children.find(e => !t(e));
              return !n;
            }
            return (
              !e.text?.length && !e.sourceId && 'affine:code' !== e.flavour
            );
          };
        },
        yM: function () {
          return l;
        },
      });
      var r = n(31054);
      function i(t) {
        return !(
          (0, r.h$)(t, ['affine:embed', 'affine:divider', 'affine:code']) ||
          ((0, r.h$)(t, ['affine:paragraph']) &&
            ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'quote'].includes(
              t.type ?? ''
            ))
        );
      }
      function o(t, e) {
        return 1e-4 > Math.abs(t - e);
      }
      function l(t, e) {
        return new CustomEvent(t, { detail: e });
      }
      function u() {}
      function s(t, e, { leading: n = !0, trailing: r = !0 } = {}) {
        let i = null,
          o = null,
          l = () => {
            o && r ? (t(...o), (o = null), (i = setTimeout(l, e))) : (i = null);
          };
        return function (...r) {
          if (i) {
            o = r;
            return;
          }
          n && t.apply(this, r), (i = setTimeout(l, e));
        };
      }
      let a = (t, e, { leading: n = !0, trailing: r = !0 } = {}) => {
          let i = null,
            o = null,
            l = () => {
              o && r
                ? (t(...o), (o = null), (i = setTimeout(l, e)))
                : (i = null);
            };
          return function (...r) {
            i && ((o = r), clearTimeout(i)),
              n && !i && t(...r),
              (i = setTimeout(l, e));
          };
        },
        c = (t, e, n) => (t < e ? e : t > n ? n : t);
      function f(t, e) {
        let n = {};
        return (
          t.forEach(t => {
            let r = e(t);
            n[r] || (n[r] = 0), (n[r] += 1);
          }),
          n
        );
      }
      function d(t, e) {
        if (!t.length) return null;
        let n = t[0],
          r = e(n);
        for (let i = 1; i < t.length; i++) {
          let o = t[i],
            l = e(o);
          l > r && ((r = l), (n = o));
        }
        return n;
      }
      function h(t) {
        return t.ctrlKey || t.metaKey || t.altKey;
      }
      function g(t) {
        return 1 === t.key.length && !h(t);
      }
      function m(t, e, n) {
        let r = 0;
        for (let i = 0; i < t.length; i++) if (e(t[i]) && ++r >= n) return !0;
        return !1;
      }
      function p(t, e) {
        let n = {};
        for (let r of t) {
          let t = 'function' == typeof e ? e(r) : r[e];
          n[t] || (n[t] = []), n[t].push(r);
        }
        return n;
      }
      function y(t, e) {
        let n = t
            .trim()
            .toLowerCase()
            .split('')
            .filter(t => ' ' !== t)
            .join(''),
          r = RegExp(
            e
              .split('')
              .filter(t => ' ' !== t)
              .map(t => `${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*`)
              .join(''),
            'i'
          );
        return r.test(n);
      }
      function v(t) {
        let e, n, r;
        if (t.startsWith('#'))
          3 === (t = t.substr(1)).length && (t = t.replace(/./g, '$&$&')),
            ([e, n, r] = t.match(/.{2}/g)?.map(t => parseInt(t, 16)) ?? []);
        else if (t.startsWith('rgba'))
          [e, n, r] = t.match(/\d+/g)?.map(Number) ?? [];
        else if (t.startsWith('rgb'))
          [e, n, r] = t.match(/\d+/g)?.map(Number) ?? [];
        else throw Error('Invalid color format');
        if (void 0 === e || void 0 === n || void 0 === r)
          throw Error('Invalid color format');
        let i = ((e << 16) | (n << 8) | r).toString(16);
        return '#' + '0'.repeat(6 - i.length) + i;
      }
      function x(t) {
        return t.length ? t[0].toUpperCase() + t.slice(1) : t;
      }
      function b(t) {
        return t.length ? t[0].toLowerCase() + t.slice(1) : t;
      }
    },
    62624: function (t, e, n) {
      n.d(e, {
        h: function () {
          return i;
        },
        n: function () {
          return l;
        },
      });
      var r,
        i,
        o = n(13246);
      ((r = i || (i = {}))[(r.Thin = 4)] = 'Thin'),
        (r[(r.Thick = 10)] = 'Thick');
      class l {
        constructor(t, e) {
          (this._disposables = new o.SJ()),
            (this.container = t),
            (this._dispatcher = e);
        }
        get page() {
          return this.container.page;
        }
      }
    },
    29113: function (t, e, n) {
      n.d(e, {
        gX: function () {
          return K;
        },
        Jj: function () {
          return g;
        },
        Sj: function () {
          return l;
        },
        $m: function () {
          return o;
        },
        mq: function () {
          return p;
        },
        IP: function () {
          return x;
        },
      });
      var r = n(15486),
        i = n(32916);
      let o = '​',
        l = '‌';
      var u = n(91827);
      let s = () => t => {
        var e;
        let n, i;
        let o = t.attributes
          ? ((e = t.attributes),
            (n = ''),
            e.underline && (n += 'underline'),
            e.strike && (n += ' line-through'),
            (i = {}),
            e.code &&
              (i = {
                'font-family':
                  '"SFMono-Regular", Menlo, Consolas, "PT Mono", "Liberation Mono", Courier, monospace',
                'line-height': 'normal',
                background: 'rgba(135,131,120,0.15)',
                color: '#EB5757',
                'border-radius': '3px',
                'font-size': '85%',
                padding: '0.2em 0.4em',
              }),
            (0, u.V)({
              'word-wrap': 'break-word',
              'white-space': 'break-spaces',
              'font-weight': e.bold ? 'bold' : 'normal',
              'font-style': e.italic ? 'italic' : 'normal',
              'text-decoration': n.length > 0 ? n : 'none',
              ...i,
            }))
          : (0, u.V)({});
        return r.dy`<span style=${o}
      ><v-text .str=${t.insert}></v-text
    ></span>`;
      };
      var a = function (t, e, n, r) {
        var i,
          o = arguments.length,
          l =
            o < 3
              ? e
              : null === r
              ? (r = Object.getOwnPropertyDescriptor(e, n))
              : r;
        if ('object' == typeof Reflect && 'function' == typeof Reflect.decorate)
          l = Reflect.decorate(t, e, n, r);
        else
          for (var u = t.length - 1; u >= 0; u--)
            (i = t[u]) &&
              (l = (o < 3 ? i(l) : o > 3 ? i(e, n, l) : i(e, n)) || l);
        return o > 3 && l && Object.defineProperty(e, n, l), l;
      };
      let c = class extends r.oi {
        constructor() {
          super(...arguments),
            (this.delta = { insert: o }),
            (this.attributeRenderer = s());
        }
        render() {
          return r.dy`<span data-virgo-element="true"
      >${this.attributeRenderer(this.delta)}</span
    >`;
        }
        createRenderRoot() {
          return this;
        }
      };
      a([(0, i.Cb)({ type: Object })], c.prototype, 'delta', void 0),
        a(
          [(0, i.Cb)({ type: Function, attribute: !1 })],
          c.prototype,
          'attributeRenderer',
          void 0
        ),
        (c = a([(0, i.Mo)('v-element')], c));
      var f = function (t, e, n, r) {
        var i,
          o = arguments.length,
          l =
            o < 3
              ? e
              : null === r
              ? (r = Object.getOwnPropertyDescriptor(e, n))
              : r;
        if ('object' == typeof Reflect && 'function' == typeof Reflect.decorate)
          l = Reflect.decorate(t, e, n, r);
        else
          for (var u = t.length - 1; u >= 0; u--)
            (i = t[u]) &&
              (l = (o < 3 ? i(l) : o > 3 ? i(e, n, l) : i(e, n)) || l);
        return o > 3 && l && Object.defineProperty(e, n, l), l;
      };
      let d = class extends r.oi {
        constructor() {
          super(...arguments), (this.elements = []);
        }
        get vElements() {
          return Array.from(this.querySelectorAll('v-element'));
        }
        get textLength() {
          return this.vElements.reduce((t, e) => t + e.delta.insert.length, 0);
        }
        get textContent() {
          return this.vElements.reduce((t, e) => t + e.delta.insert, '');
        }
        async getUpdateComplete() {
          let t = await super.getUpdateComplete();
          return (
            await Promise.all(this.vElements.map(t => t.updateComplete)), t
          );
        }
        firstUpdated() {
          this.style.display = 'block';
        }
        render() {
          return 0 === this.elements.length
            ? r.dy`<div><v-text .str=${o}></v-text></div>`
            : r.dy`<div>${this.elements}</div>`;
        }
        createRenderRoot() {
          return this;
        }
      };
      f([(0, i.Cb)({ attribute: !1 })], d.prototype, 'elements', void 0),
        (d = f([(0, i.Mo)('v-line')], d));
      var h = function (t, e, n, r) {
        var i,
          o = arguments.length,
          l =
            o < 3
              ? e
              : null === r
              ? (r = Object.getOwnPropertyDescriptor(e, n))
              : r;
        if ('object' == typeof Reflect && 'function' == typeof Reflect.decorate)
          l = Reflect.decorate(t, e, n, r);
        else
          for (var u = t.length - 1; u >= 0; u--)
            (i = t[u]) &&
              (l = (o < 3 ? i(l) : o > 3 ? i(e, n, l) : i(e, n)) || l);
        return o > 3 && l && Object.defineProperty(e, n, l), l;
      };
      let g = class extends r.oi {
        constructor() {
          super(...arguments),
            (this.str = o),
            (this.styles = (0, u.V)({
              'word-wrap': 'break-word',
              'white-space': 'break-spaces',
            }));
        }
        render() {
          return r.dy`<span style=${this.styles} data-virgo-text="true"
      >${this.str}</span
    >`;
        }
        createRenderRoot() {
          return this;
        }
      };
      h([(0, i.Cb)()], g.prototype, 'str', void 0),
        h([(0, i.Cb)()], g.prototype, 'styles', void 0),
        (g = h([(0, i.Mo)('v-text')], g));
      var m = n(30195);
      let p = m.z.object({
        bold: m.z
          .literal(!0)
          .optional()
          .catch(void 0),
        italic: m.z
          .literal(!0)
          .optional()
          .catch(void 0),
        underline: m.z
          .literal(!0)
          .optional()
          .catch(void 0),
        strike: m.z
          .literal(!0)
          .optional()
          .catch(void 0),
        code: m.z
          .literal(!0)
          .optional()
          .catch(void 0),
        link: m.z
          .string()
          .optional()
          .catch(void 0),
      });
      function y(t) {
        let e = [],
          n = t.insert;
        for (; n.length > 0; ) {
          let r = n.indexOf('\n');
          if (-1 === r) {
            e.push({ insert: n, attributes: t.attributes });
            break;
          }
          n.slice(0, r).length > 0 &&
            e.push({ insert: n.slice(0, r), attributes: t.attributes }),
            e.push('\n'),
            (n = n.slice(r + 1));
        }
        return e;
      }
      function v(t) {
        return t.wholeText === o ? 0 : t.wholeText.length;
      }
      function x(t) {
        let e = Array.from(t.querySelectorAll('[data-virgo-text="true"]')),
          n = e.map(t => {
            let e = Array.from(t.childNodes).find(t => t instanceof Text);
            if (!e) throw Error('text node not found');
            return e;
          });
        return n;
      }
      function b(t, e) {
        if (t instanceof Text && 'true' === t.parentElement?.dataset.virgoText)
          return [t, e];
        if (t instanceof HTMLElement && 'true' === t.dataset.virgoElement) {
          let n = x(t),
            r = e;
          for (let t of n) {
            if (e <= t.length) return [t, r];
            r -= t.length;
          }
          return null;
        }
        if (
          (t instanceof HTMLElement &&
            (t instanceof d || t.parentElement instanceof d)) ||
          (t instanceof HTMLElement && 'true' === t.dataset.virgoRoot)
        )
          return _(t, e, !0);
        if (!(t instanceof Node)) return null;
        let n = (function (t) {
          let e = t.parentElement?.closest('v-line');
          if (e) return Array.from(e.querySelectorAll('v-element'));
          let n =
            t instanceof Element
              ? t.closest('[data-virgo-root="true"]')
              : t.parentElement?.closest('[data-virgo-root="true"]');
          return n ? Array.from(n.querySelectorAll('v-line')) : null;
        })(t);
        return n
          ? (function (t, e, n) {
              let r = t[0];
              for (let i = 0; i < t.length; i++) {
                let o = t[i];
                if (0 === i && S(e, o)) return _(r, n, !0);
                if (
                  o.compareDocumentPosition(e) ===
                    Node.DOCUMENT_POSITION_CONTAINED_BY ||
                  o.compareDocumentPosition(e) ===
                    (Node.DOCUMENT_POSITION_CONTAINED_BY |
                      Node.DOCUMENT_POSITION_FOLLOWING)
                )
                  return _(r, n, !1);
                if (
                  (i === t.length - 1 && k(e, o)) ||
                  (i < t.length - 1 && k(e, o) && S(e, t[i + 1]))
                )
                  return (function (t) {
                    let e = x(t);
                    if (0 === e.length) return null;
                    let n = e[e.length - 1];
                    return [n, v(n)];
                  })(o);
              }
              return null;
            })(n, t, e)
          : null;
      }
      function E(t, e, n) {
        if ('true' !== n.dataset.virgoRoot)
          throw Error(
            'textRangeToDomPoint should be called with editor root element'
          );
        if (!n.contains(t)) return null;
        let r = x(n),
          i = r.indexOf(t),
          l = 0;
        for (let t of r.slice(0, i)) l += v(t);
        t.wholeText !== o && (l += e);
        let u = t.parentElement;
        if (!u) throw Error('text element parent not found');
        let s = u.closest('v-line');
        if (!s) throw Error('line element not found');
        let a = Array.from(n.querySelectorAll('v-line')).indexOf(s);
        return { text: t, index: l + a };
      }
      function _(t, e, n) {
        let r = x(t);
        if (0 === r.length) return null;
        let i = n ? r[0] : r[r.length - 1];
        return [i, 0 === e ? e : i.length];
      }
      function S(t, e) {
        return (
          t.compareDocumentPosition(e) === Node.DOCUMENT_POSITION_FOLLOWING
        );
      }
      function k(t, e) {
        return (
          t.compareDocumentPosition(e) === Node.DOCUMENT_POSITION_PRECEDING
        );
      }
      function w(t) {
        let e = t.rootElement;
        if (!e) throw Error('editor root element not found');
        let n = e.getRootNode();
        return (n instanceof Document || n instanceof ShadowRoot) &&
          'getSelection' in n
          ? n
          : e.ownerDocument;
      }
      function C(t) {
        let e = !1;
        if (!t.isCollapsed && t.anchorNode && t.focusNode) {
          let n = document.createRange();
          n.setStart(t.anchorNode, t.anchorOffset),
            n.setEnd(t.focusNode, t.focusOffset),
            (e = n.collapsed),
            n.detach();
        }
        return e;
      }
      let R = ({ rootElement: t, anchorText: e, focusText: n }) =>
          t.contains(e) && t.contains(n),
        T = ({
          rootElement: t,
          anchorText: e,
          focusText: n,
          anchorTextOffset: r,
          focusTextOffset: i,
        }) => {
          let o = E(e, r, t),
            l = E(n, i, t);
          return o && l
            ? {
                index: Math.min(o.index, l.index),
                length: Math.abs(o.index - l.index),
              }
            : null;
        },
        A = ({ rootElement: t, anchorText: e, focusText: n }) =>
          !t.contains(e) && t.contains(n),
        N = ({
          selection: t,
          yText: e,
          rootElement: n,
          anchorText: r,
          focusText: i,
          anchorTextOffset: o,
          focusTextOffset: l,
        }) => {
          if (C(t)) {
            let t = E(r, o, n);
            return t ? { index: t.index, length: e.length - t.index } : null;
          }
          {
            let t = E(i, l, n);
            return t ? { index: 0, length: t.index } : null;
          }
        },
        P = ({ rootElement: t, anchorText: e, focusText: n }) =>
          t.contains(e) && !t.contains(n),
        O = ({
          selection: t,
          yText: e,
          rootElement: n,
          anchorText: r,
          focusText: i,
          anchorTextOffset: o,
          focusTextOffset: l,
        }) => {
          if (C(t)) {
            let t = E(i, l, n);
            return t ? { index: 0, length: t.index } : null;
          }
          {
            let t = E(r, o, n);
            return t ? { index: t.index, length: e.length - t.index } : null;
          }
        },
        M = ({ rootElement: t, anchorText: e, focusText: n }) =>
          !t.contains(e) && !t.contains(n),
        D = ({ yText: t }) => ({ index: 0, length: t.length }),
        I = (t, e, n) => {
          let {
              anchorNode: r,
              anchorOffset: i,
              focusNode: o,
              focusOffset: l,
            } = t,
            u = b(r, i),
            s = b(o, l);
          if (!u || !s) return null;
          let [a, c] = u,
            [f, d] = s;
          return {
            rootElement: e,
            selection: t,
            yText: n,
            anchorNode: r,
            anchorOffset: i,
            focusNode: o,
            focusOffset: l,
            anchorText: a,
            anchorTextOffset: c,
            focusText: f,
            focusTextOffset: d,
          };
        };
      class B {
        constructor(t) {
          (this._marks = null),
            (this._attributeRenderer = s()),
            (this._attributeSchema = p),
            (this.setMarks = t => {
              this._marks = t;
            }),
            (this.resetMarks = () => {
              this._marks = null;
            }),
            (this.setAttributeSchema = t => {
              this._attributeSchema = t;
            }),
            (this.setAttributeRenderer = t => {
              this._attributeRenderer = t;
            }),
            (this.getFormat = (t, e = !1) => {
              let n = this._editor.deltaService
                  .getDeltasByVRange(t)
                  .filter(
                    ([e, n]) =>
                      n.index + n.length > t.index &&
                      n.index <= t.index + t.length
                  ),
                r = n.map(([t]) => t.attributes);
              return e
                ? r.reduce((t, e) => ({ ...t, ...e }), {})
                : !r.length || r.some(t => !t)
                ? {}
                : r.reduce((t, e) => {
                    let n = {};
                    for (let r in t) {
                      let i = r;
                      t[i] === e[i] && (n[i] = t[i]);
                    }
                    return n;
                  });
            }),
            (this.normalizeAttributes = t => {
              if (!t) return;
              let e = this._attributeSchema.safeParse(t);
              if (!e.success) {
                console.error(e.error);
                return;
              }
              return Object.fromEntries(
                Object.entries(e.data).filter(([t, e]) => e)
              );
            }),
            (this._editor = t);
        }
        get marks() {
          return this._marks;
        }
        get attributeRenderer() {
          return this._attributeRenderer;
        }
      }
      var L = n(57891);
      class F {
        constructor(t) {
          (this.mapDeltasInVRange = (t, e) => {
            let n = this.deltas,
              r = [];
            return (
              n.reduce((n, i) => {
                let o = i.insert.length,
                  l = t.index - o,
                  u = t.index + t.length,
                  s = n >= l && (n < u || (0 === t.length && n === t.index));
                if (s) {
                  let t = e(i, n);
                  r.push(t);
                }
                return n + o;
              }, 0),
              r
            );
          }),
            (this.getDeltaByRangeIndex = t => {
              let e = this.deltas,
                n = 0;
              for (let r of e) {
                if (n + r.insert.length >= t) return r;
                n += r.insert.length;
              }
              return null;
            }),
            (this.getDeltasByVRange = t =>
              this.mapDeltasInVRange(t, (t, e) => [
                t,
                { index: e, length: t.insert.length },
              ])),
            (this.render = async () => {
              let t = this._editor.rootElement,
                e = this.deltas,
                n = (function (t) {
                  if (0 === t.length) return [[]];
                  let e = t.flatMap(y);
                  return [
                    ...(function* (t) {
                      let e = 0;
                      for (let n = 0; n < t.length; n++)
                        if ('\n' === t[n]) {
                          let r = t.slice(e, n);
                          (e = n + 1), yield r;
                        } else n === t.length - 1 && (yield t.slice(e));
                      '\n' === t.at(-1) && (yield []);
                    })(e),
                  ];
                })(e),
                i = n.map(t => {
                  let e = [];
                  return (
                    t.length > 0 &&
                      t.forEach(t => {
                        let n = r.dy`<v-element
    .delta=${{
      insert: t.insert,
      attributes: this._editor.attributeService.normalizeAttributes(
        t.attributes
      ),
    }}
    .attributeRenderer=${this._editor.attributeService.attributeRenderer}
  ></v-element>`;
                        e.push(n);
                      }),
                    r.dy`<v-line .elements=${e}></v-line>`
                  );
                });
              try {
                (0, r.sY)(
                  (0, L.r)(
                    i.map((t, e) => ({ line: t, index: e })),
                    t => t.index,
                    t => t.line
                  ),
                  t
                );
              } catch (e) {
                (0, r.sY)(r.dy`<div></div>`, t), this._editor.requestUpdate();
              }
              let o = Array.from(t.querySelectorAll('v-line'));
              await Promise.all(o.map(t => t.updateComplete)),
                this._editor.rangeService.syncVRange(),
                this._editor.slots.updated.emit();
            }),
            (this._editor = t);
        }
        get deltas() {
          return this._editor.yText.toDelta();
        }
      }
      var $ = n(31054);
      class V {
        constructor(t) {
          (this._mountAbortController = null),
            (this._handlerAbortController = null),
            (this._isComposing = !1),
            (this._handlers = {}),
            (this._previousAnchor = null),
            (this._previousFocus = null),
            (this.defaultHandlers = {
              paste: t => {
                let e = t.clipboardData?.getData('text/plain');
                if (e) {
                  let t = this._editor.getVRange(),
                    n = e.replace(/(\r\n|\r|\n)/g, '\n');
                  t &&
                    (this._editor.insertText(t, n),
                    this._editor.setVRange({
                      index: t.index + n.length,
                      length: 0,
                    }));
                }
              },
            }),
            (this.mount = () => {
              let t = this._editor.rootElement;
              (this._mountAbortController = new AbortController()),
                document.addEventListener(
                  'selectionchange',
                  this._onSelectionChange
                );
              let e = this._mountAbortController.signal;
              t.addEventListener('beforeinput', this._onBeforeInput, {
                signal: e,
              }),
                t.querySelectorAll('[data-virgo-text="true"]').forEach(t => {
                  t.addEventListener('dragstart', t => {
                    t.preventDefault();
                  });
                }),
                t.addEventListener(
                  'compositionstart',
                  this._onCompositionStart,
                  { signal: e }
                ),
                t.addEventListener('compositionend', this._onCompositionEnd, {
                  signal: e,
                }),
                t.addEventListener('scroll', this._onScroll),
                this.bindHandlers();
            }),
            (this.unmount = () => {
              document.removeEventListener(
                'selectionchange',
                this._onSelectionChange
              ),
                this._mountAbortController &&
                  (this._mountAbortController.abort(),
                  (this._mountAbortController = null)),
                this._handlerAbortController &&
                  (this._handlerAbortController.abort(),
                  (this._handlerAbortController = null)),
                (this._handlers = this.defaultHandlers);
            }),
            (this.bindHandlers = (t = this.defaultHandlers) => {
              (this._handlers = t),
                this._handlerAbortController &&
                  this._handlerAbortController.abort(),
                (this._handlerAbortController = new AbortController()),
                this._handlers.paste &&
                  this._editor.rootElement.addEventListener(
                    'paste',
                    this._handlers.paste,
                    { signal: this._handlerAbortController.signal }
                  ),
                this._handlers.keydown &&
                  this._editor.rootElement.addEventListener(
                    'keydown',
                    this._handlers.keydown,
                    { signal: this._handlerAbortController.signal }
                  );
            }),
            (this._onSelectionChange = () => {
              let t = this._editor.rootElement;
              if (this._isComposing) return;
              let e = w(this._editor),
                n = e.getSelection();
              if (!n || 0 === n.rangeCount) return;
              let r = n.getRangeAt(0);
              if (
                r.startContainer === r.endContainer &&
                r.startContainer.textContent === o &&
                1 === r.startOffset
              ) {
                r.setStart(r.startContainer, 0),
                  r.setEnd(r.endContainer, 0),
                  n.removeAllRanges(),
                  n.addRange(r);
                return;
              }
              if (!r) return;
              if (!r.intersectsNode(t)) {
                if (
                  !(
                    r.endContainer.contains(t) &&
                    1 ===
                      Array.from(r.endContainer.childNodes).filter(
                        t => t instanceof HTMLElement
                      ).length &&
                    r.startContainer.contains(t)
                  ) ||
                  1 !==
                    Array.from(r.startContainer.childNodes).filter(
                      t => t instanceof HTMLElement
                    ).length
                )
                  return;
                this._editor.focusEnd();
              }
              (this._previousAnchor = [r.startContainer, r.startOffset]),
                (this._previousFocus = [r.endContainer, r.endOffset]);
              let i = this._editor.toVRange(n);
              i && this._editor.slots.vRangeUpdated.emit([i, 'native']),
                (((r.startContainer.nodeType !== Node.TEXT_NODE ||
                  r.endContainer.nodeType !== Node.TEXT_NODE) &&
                  r.startContainer !== this._previousAnchor[0] &&
                  r.endContainer !== this._previousFocus[0] &&
                  r.startOffset !== this._previousAnchor[1] &&
                  r.endOffset !== this._previousFocus[1]) ||
                  r.startContainer.nodeType === Node.COMMENT_NODE ||
                  r.endContainer.nodeType === Node.COMMENT_NODE) &&
                  this._editor.syncVRange();
            }),
            (this._onCompositionStart = () => {
              this._isComposing = !0;
            }),
            (this._onCompositionEnd = t => {
              if (((this._isComposing = !1), this._editor.isReadonly)) return;
              let e = this._editor.getVRange();
              if (!e) return;
              let n = {
                event: t,
                data: t.data,
                vRange: e,
                skipDefault: !1,
                attributes: null,
              };
              if (
                (this._handlers.virgoCompositionEnd &&
                  (n = this._handlers.virgoCompositionEnd(n)),
                n.skipDefault)
              )
                return;
              let { data: r, vRange: i } = n;
              if (i.index >= 0) {
                let t = window.getSelection();
                if (t && 0 !== t.rangeCount) {
                  let e = t.getRangeAt(0),
                    n = e.startContainer;
                  if (n instanceof Text) {
                    if ('true' !== n.parentElement?.dataset.virgoText)
                      n.remove();
                    else {
                      let [t] = this._editor.getTextPoint(i.index),
                        e = t.parentElement?.closest('v-text');
                      if (e) e.str !== t.textContent && (t.textContent = e.str);
                      else {
                        let e = t.parentElement?.closest(
                          '[data-virgo-text="true"]'
                        );
                        if (e instanceof HTMLElement) {
                          if (e.dataset.virgoTextValue)
                            e.dataset.virgoTextValue !== t.textContent &&
                              (t.textContent = e.dataset.virgoTextValue);
                          else
                            throw Error(
                              'We detect a forged v-text node but it has no data-virgo-text-value attribute.'
                            );
                        }
                      }
                    }
                    let e = this._editor.toDomRange(i);
                    e && ((0, $.kP)(e), t.removeAllRanges(), t.addRange(e));
                  }
                }
                r &&
                  r.length > 0 &&
                  (this._editor.insertText(i, r, n.attributes ?? {}),
                  this._editor.slots.vRangeUpdated.emit([
                    { index: i.index + r.length, length: 0 },
                    'input',
                  ]));
              }
            }),
            (this._firstRecomputeInFrame = !0),
            (this._onBeforeInput = t => {
              if (
                (t.preventDefault(),
                this._editor.isReadonly || this._isComposing)
              )
                return;
              this._firstRecomputeInFrame &&
                ((this._firstRecomputeInFrame = !1),
                this._onSelectionChange(),
                requestAnimationFrame(() => {
                  this._firstRecomputeInFrame = !0;
                }));
              let e = this._editor.getVRange();
              if (!e) return;
              let n = {
                event: t,
                data: t.data,
                vRange: e,
                skipDefault: !1,
                attributes: null,
              };
              if (
                (this._handlers.virgoInput &&
                  (n = this._handlers.virgoInput(n)),
                n.skipDefault)
              )
                return;
              let { event: r, data: i, vRange: o } = n;
              !(function (t, e, n, r, i) {
                switch (t) {
                  case 'insertText':
                    r.index >= 0 &&
                      e &&
                      (i.slots.vRangeUpdated.emit([
                        { index: r.index + e.length, length: 0 },
                        'input',
                      ]),
                      i.insertText(r, e, n));
                    return;
                  case 'insertParagraph':
                    r.index >= 0 &&
                      (i.slots.vRangeUpdated.emit([
                        { index: r.index + 1, length: 0 },
                        'input',
                      ]),
                      i.insertLineBreak(r));
                    return;
                  case 'deleteContentBackward':
                  case 'deleteByCut':
                    !(function (t, e) {
                      if (t.index >= 0) {
                        if (t.length > 0) {
                          e.slots.vRangeUpdated.emit([
                            { index: t.index, length: 0 },
                            'input',
                          ]),
                            e.deleteText(t);
                          return;
                        }
                        if (t.index > 0) {
                          let n = e.yText.toString().slice(0, t.index),
                            r = [...new Intl.Segmenter().segment(n)],
                            i = r[r.length - 1].segment.length;
                          e.slots.vRangeUpdated.emit([
                            { index: t.index - i, length: 0 },
                            'input',
                          ]),
                            e.deleteText({ index: t.index - i, length: i });
                        }
                      }
                    })(r, i);
                    return;
                  case 'deleteWordBackward':
                    !(function (t, e) {
                      let n = /\S+\s*$/.exec(
                        t.yText.toString().slice(0, e.index)
                      );
                      if (n) {
                        let r = n[0].length;
                        t.slots.vRangeUpdated.emit([
                          { index: e.index - r, length: 0 },
                          'input',
                        ]),
                          t.deleteText({ index: e.index - r, length: r });
                      }
                    })(i, r);
                    return;
                  case 'deleteHardLineBackward':
                  case 'deleteSoftLineBackward':
                    !(function (t, e) {
                      if (e.length > 0) {
                        t.slots.vRangeUpdated.emit([
                          { index: e.index, length: 0 },
                          'input',
                        ]),
                          t.deleteText(e);
                        return;
                      }
                      if (e.index > 0) {
                        let n = t.yText.toString(),
                          r =
                            e.index -
                            Math.max(0, n.slice(0, e.index).lastIndexOf('\n'));
                        t.slots.vRangeUpdated.emit([
                          { index: e.index - r, length: 0 },
                          'input',
                        ]),
                          t.deleteText({ index: e.index - r, length: r });
                      }
                    })(i, r);
                    return;
                  case 'deleteContentForward':
                    !(function (t, e) {
                      if (e.index < t.yText.length) {
                        let n = t.yText.toString(),
                          r = [...new Intl.Segmenter().segment(n)],
                          i = n.slice(0, e.index),
                          o = [...new Intl.Segmenter().segment(i)],
                          l = r[o.length].segment.length;
                        t.slots.vRangeUpdated.emit([
                          { index: e.index, length: 0 },
                          'input',
                        ]),
                          t.deleteText({ index: e.index, length: l });
                      }
                    })(i, r);
                    return;
                }
              })(r.inputType, i, n.attributes ?? {}, o, this._editor);
            }),
            (this._onScroll = t => {
              this._editor.slots.scrollUpdated.emit(
                this._editor.rootElement.scrollLeft
              );
            }),
            (this._editor = t);
        }
      }
      class U {
        constructor(t) {
          (this._vRange = null),
            (this._lastScrollLeft = 0),
            (this.onVRangeUpdated = ([t, e]) => {
              if (
                ((this._vRange = t),
                document.dispatchEvent(new CustomEvent('virgo-vrange-updated')),
                'other' !== e)
              )
                return;
              let n = () => {
                this._vRange && this._applyVRange(this._vRange);
              };
              requestAnimationFrame(n);
            }),
            (this.getVRange = () => this._vRange),
            (this.setVRange = t => {
              this._editor.slots.vRangeUpdated.emit([t, 'other']);
            }),
            (this.syncVRange = () => {
              this._vRange && this._applyVRange(this._vRange);
            }),
            (this.toDomRange = t => {
              let e = this._editor.rootElement;
              return (function (t, e) {
                let n = Array.from(t.querySelectorAll('v-line')),
                  r = null,
                  i = null,
                  o = 0,
                  l = 0,
                  u = 0;
                for (let t = 0; t < n.length && (!r || !i); t++) {
                  let s = x(n[t]);
                  for (let t of s) {
                    let n = v(t);
                    if (
                      (!r && u + n >= e.index && ((r = t), (o = e.index - u)),
                      !i &&
                        u + n >= e.index + e.length &&
                        ((i = t), (l = e.index + e.length - u)),
                      r && i)
                    )
                      break;
                    u += n;
                  }
                  u += 1;
                }
                if (!r || !i) return null;
                let s = document.createRange();
                return s.setStart(r, o), s.setEnd(i, l), s;
              })(e, t);
            }),
            (this.toVRange = t => {
              let { rootElement: e, yText: n } = this._editor;
              return (function (t, e, n) {
                let r = I(t, e, n);
                return r
                  ? R(r)
                    ? T(r)
                    : A(r)
                    ? N(r)
                    : P(r)
                    ? O(r)
                    : M(r)
                    ? D(r)
                    : null
                  : null;
              })(t, e, n);
            }),
            (this.mergeRanges = (t, e) => ({
              index: Math.max(t.index, e.index),
              length:
                Math.min(t.index + t.length, e.index + e.length) -
                Math.max(t.index, e.index),
            })),
            (this.onScrollUpdated = t => {
              this._lastScrollLeft = t;
            }),
            (this._applyVRange = t => {
              if (!this._editor.isActive) return;
              let e = w(this._editor),
                n = e.getSelection();
              if (!n) return;
              let r = this.toDomRange(t);
              r &&
                (n.removeAllRanges(),
                n.addRange(r),
                this._scrollLineIntoViewIfNeeded(r),
                this._scrollCursorIntoViewIfNeeded(r),
                this._editor.slots.rangeUpdated.emit(r));
            }),
            (this._scrollLineIntoViewIfNeeded = t => {
              if (this._editor.shouldLineScrollIntoView) {
                let e = t.endContainer.parentElement;
                for (; !(e instanceof d); ) e = e?.parentElement ?? null;
                e?.scrollIntoView({ block: 'nearest' });
              }
            }),
            (this._scrollCursorIntoViewIfNeeded = t => {
              if (this._editor.shouldCursorScrollIntoView) {
                let e = this._editor.rootElement,
                  n = e.getBoundingClientRect(),
                  r = t.getBoundingClientRect(),
                  i = 0;
                r.left > n.left &&
                  (i = Math.max(this._lastScrollLeft, r.left - n.right)),
                  (e.scrollLeft = i),
                  (this._lastScrollLeft = i);
              }
            }),
            (this._editor = t);
        }
      }
      var q = n(55467);
      class K {
        get yText() {
          return this._yText;
        }
        get rootElement() {
          return (0, $.kP)(this._rootElement), this._rootElement;
        }
        get eventService() {
          return this._eventService;
        }
        get rangeService() {
          return this._rangeService;
        }
        get attributeService() {
          return this._attributeService;
        }
        get deltaService() {
          return this._deltaService;
        }
        get marks() {
          return this._attributeService.marks;
        }
        constructor(t, e) {
          if (
            ((this._rootElement = null),
            (this._isReadonly = !1),
            (this._eventService = new V(this)),
            (this._rangeService = new U(this)),
            (this._attributeService = new B(this)),
            (this._deltaService = new F(this)),
            (this.shouldLineScrollIntoView = !0),
            (this.shouldCursorScrollIntoView = !0),
            (this.setAttributeSchema =
              this._attributeService.setAttributeSchema),
            (this.setAttributeRenderer =
              this._attributeService.setAttributeRenderer),
            (this.setMarks = this._attributeService.setMarks),
            (this.resetMarks = this._attributeService.resetMarks),
            (this.getFormat = this._attributeService.getFormat),
            (this.bindHandlers = this._eventService.bindHandlers),
            (this.toDomRange = this.rangeService.toDomRange),
            (this.toVRange = this.rangeService.toVRange),
            (this.getVRange = this.rangeService.getVRange),
            (this.setVRange = this.rangeService.setVRange),
            (this.syncVRange = this.rangeService.syncVRange),
            (this.getDeltasByVRange = this.deltaService.getDeltasByVRange),
            (this.getDeltaByRangeIndex =
              this.deltaService.getDeltaByRangeIndex),
            (this.mapDeltasInVRange = this.deltaService.mapDeltasInVRange),
            (this._onYTextChange = () => {
              if (this.yText.toString().includes('\r'))
                throw Error(
                  'yText must not contain \r because it will break the range synchronization'
                );
              Promise.resolve().then(() => {
                (0, $.kP)(this._rootElement), this.deltaService.render();
              });
            }),
            !t.doc)
          )
            throw Error('yText must be attached to a Y.Doc');
          if (t.toString().includes('\r'))
            throw Error(
              'yText must not contain \r because it will break the range synchronization'
            );
          (this._yText = t),
            (this._isActive = e?.active ?? (() => !0)),
            (this.slots = {
              mounted: new q.g(),
              unmounted: new q.g(),
              updated: new q.g(),
              vRangeUpdated: new q.g(),
              rangeUpdated: new q.g(),
              scrollUpdated: new q.g(),
            }),
            this.slots.vRangeUpdated.on(this.rangeService.onVRangeUpdated),
            this.slots.scrollUpdated.on(this.rangeService.onScrollUpdated);
        }
        mount(t) {
          let e = t;
          (e.virgoEditor = this),
            (this._rootElement = e),
            this._rootElement.replaceChildren(),
            (this._rootElement.contentEditable = 'true'),
            (this._rootElement.dataset.virgoRoot = 'true'),
            this.yText.observe(this._onYTextChange),
            this._deltaService.render(),
            this._eventService.mount(),
            this.slots.mounted.emit();
        }
        unmount() {
          this._eventService.unmount(),
            this.yText.unobserve(this._onYTextChange),
            this._rootElement?.replaceChildren(),
            (this._rootElement = null),
            this.slots.unmounted.emit();
        }
        requestUpdate() {
          Promise.resolve().then(() => {
            (0, $.kP)(this._rootElement), this._deltaService.render();
          });
        }
        getNativeSelection() {
          let t = w(this),
            e = t.getSelection();
          return e && 0 !== e.rangeCount ? e : null;
        }
        getTextPoint(t) {
          (0, $.kP)(this._rootElement);
          let e = Array.from(this._rootElement.querySelectorAll('v-line')),
            n = 0;
          for (let r of e) {
            let e = K.getTextNodesFromElement(r);
            for (let r of e) {
              if (!r.textContent)
                throw Error('text element should have textContent');
              if (n + r.textContent.length >= t) return [r, t - n];
              n += v(r);
            }
            n += 1;
          }
          throw Error('failed to find leaf');
        }
        getLine(t) {
          (0, $.kP)(this._rootElement);
          let e = Array.from(this._rootElement.querySelectorAll('v-line')),
            n = 0;
          for (let r of e) {
            if (
              (t >= n && t <= n + r.textLength) ||
              (t === n + r.textLength && t === this.yText.length)
            )
              return [r, t - n];
            n += r.textLength + 1;
          }
          throw Error('failed to find line');
        }
        setReadonly(t) {
          (this.rootElement.contentEditable = t ? 'false' : 'true'),
            (this._isReadonly = t);
        }
        get isReadonly() {
          return this._isReadonly;
        }
        get isActive() {
          return this._isActive();
        }
        focusEnd() {
          this.rangeService.setVRange({ index: this.yText.length, length: 0 });
        }
        deleteText(t) {
          this._transact(() => {
            this.yText.delete(t.index, t.length);
          });
        }
        insertText(t, e, n = {}) {
          this._attributeService.marks &&
            (n = { ...n, ...this._attributeService.marks });
          let r = this._attributeService.normalizeAttributes(n);
          if (!e || !e.length) throw Error('text must not be empty');
          this._transact(() => {
            this.yText.delete(t.index, t.length),
              this.yText.insert(t.index, e, r);
          });
        }
        insertLineBreak(t) {
          this._transact(() => {
            this.yText.delete(t.index, t.length),
              this.yText.insert(t.index, '\n');
          });
        }
        formatText(t, e, n = {}) {
          let { match: r = () => !0, mode: i = 'merge' } = n,
            o = this._deltaService.getDeltasByVRange(t);
          o.filter(([t, e]) => r(t, e)).forEach(([n, r]) => {
            let o = this._rangeService.mergeRanges(t, r);
            'replace' === i && this.resetText(o),
              this._transact(() => {
                this.yText.format(o.index, o.length, e);
              });
          });
        }
        resetText(t) {
          let e = [];
          for (let n = t.index; n <= t.index + t.length; n++) {
            let t = this.getDeltaByRangeIndex(n);
            t && e.push(t);
          }
          let n = Object.fromEntries(
            e.flatMap(t =>
              t.attributes ? Object.keys(t.attributes).map(t => [t, null]) : []
            )
          );
          this._transact(() => {
            this.yText.format(t.index, t.length, { ...n });
          });
        }
        setText(t, e = {}) {
          this._transact(() => {
            this.yText.delete(0, this.yText.length), this.yText.insert(0, t, e);
          });
        }
        _transact(t) {
          let e = this.yText.doc;
          if (!e) throw Error('yText is not attached to a doc');
          e.transact(t, e.clientID);
        }
      }
      (K.nativePointToTextPoint = b),
        (K.textPointToDomPoint = E),
        (K.getTextNodesFromElement = x);
    },
    68707: function (t, e, n) {
      n.d(e, {
        _Y: function () {
          return l;
        },
        fk: function () {
          return u;
        },
        hl: function () {
          return a;
        },
        i9: function () {
          return c;
        },
        ws: function () {
          return f;
        },
      });
      var r = n(93311);
      /**
       * @license
       * Copyright 2020 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let { I: i } = r.Al,
        o = () => document.createComment(''),
        l = (t, e, n) => {
          var r;
          let l = t._$AA.parentNode,
            u = void 0 === e ? t._$AB : e._$AA;
          if (void 0 === n) {
            let e = l.insertBefore(o(), u),
              r = l.insertBefore(o(), u);
            n = new i(e, r, t, t.options);
          } else {
            let e = n._$AB.nextSibling,
              i = n._$AM,
              o = i !== t;
            if (o) {
              let e;
              null === (r = n._$AQ) || void 0 === r || r.call(n, t),
                (n._$AM = t),
                void 0 !== n._$AP && (e = t._$AU) !== i._$AU && n._$AP(e);
            }
            if (e !== u || o) {
              let t = n._$AA;
              for (; t !== e; ) {
                let e = t.nextSibling;
                l.insertBefore(t, u), (t = e);
              }
            }
          }
          return n;
        },
        u = (t, e, n = t) => (t._$AI(e, n), t),
        s = {},
        a = (t, e = s) => (t._$AH = e),
        c = t => t._$AH,
        f = t => {
          var e;
          null === (e = t._$AP) || void 0 === e || e.call(t, !1, !0);
          let n = t._$AA,
            r = t._$AB.nextSibling;
          for (; n !== r; ) {
            let t = n.nextSibling;
            n.remove(), (n = t);
          }
        };
    },
    47514: function (t, e, n) {
      n.d(e, {
        XM: function () {
          return i;
        },
        Xe: function () {
          return o;
        },
        pX: function () {
          return r;
        },
      });
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let r = {
          ATTRIBUTE: 1,
          CHILD: 2,
          PROPERTY: 3,
          BOOLEAN_ATTRIBUTE: 4,
          EVENT: 5,
          ELEMENT: 6,
        },
        i =
          t =>
          (...e) => ({ _$litDirective$: t, values: e });
      class o {
        constructor(t) {}
        get _$AU() {
          return this._$AM._$AU;
        }
        _$AT(t, e, n) {
          (this._$Ct = t), (this._$AM = e), (this._$Ci = n);
        }
        _$AS(t, e) {
          return this.update(t, e);
        }
        update(t, e) {
          return this.render(...e);
        }
      }
    },
    32916: function (t, e, n) {
      var r;
      n.d(e, {
        Mo: function () {
          return i;
        },
        Cb: function () {
          return l;
        },
        IO: function () {
          return a;
        },
        Kt: function () {
          return c;
        },
        SB: function () {
          return u;
        },
      });
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let i = t => e =>
          'function' == typeof e
            ? (customElements.define(t, e), e)
            : ((t, e) => {
                let { kind: n, elements: r } = e;
                return {
                  kind: n,
                  elements: r,
                  finisher(e) {
                    customElements.define(t, e);
                  },
                };
              })(t, e),
        o = (t, e) =>
          'method' !== e.kind || !e.descriptor || 'value' in e.descriptor
            ? {
                kind: 'field',
                key: Symbol(),
                placement: 'own',
                descriptor: {},
                originalKey: e.key,
                initializer() {
                  'function' == typeof e.initializer &&
                    (this[e.key] = e.initializer.call(this));
                },
                finisher(n) {
                  n.createProperty(e.key, t);
                },
              }
            : {
                ...e,
                finisher(n) {
                  n.createProperty(e.key, t);
                },
              };
      function l(t) {
        return (e, n) =>
          void 0 !== n
            ? ((t, e, n) => {
                e.constructor.createProperty(n, t);
              })(t, e, n)
            : o(t, e);
      }
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ function u(t) {
        return l({ ...t, state: !0 });
      }
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let s =
        ({ finisher: t, descriptor: e }) =>
        (n, r) => {
          var i;
          if (void 0 === r) {
            let r = null !== (i = n.originalKey) && void 0 !== i ? i : n.key,
              o =
                null != e
                  ? {
                      kind: 'method',
                      placement: 'prototype',
                      key: r,
                      descriptor: e(n.key),
                    }
                  : { ...n, key: r };
            return (
              null != t &&
                (o.finisher = function (e) {
                  t(e, r);
                }),
              o
            );
          }
          {
            let i = n.constructor;
            void 0 !== e && Object.defineProperty(n, r, e(r)),
              null == t || t(i, r);
          }
        };
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ function a(t, e) {
        return s({
          descriptor: n => {
            let r = {
              get() {
                var e, n;
                return null !==
                  (n =
                    null === (e = this.renderRoot) || void 0 === e
                      ? void 0
                      : e.querySelector(t)) && void 0 !== n
                  ? n
                  : null;
              },
              enumerable: !0,
              configurable: !0,
            };
            if (e) {
              let e = 'symbol' == typeof n ? Symbol() : '__' + n;
              r.get = function () {
                var n, r;
                return (
                  void 0 === this[e] &&
                    (this[e] =
                      null !==
                        (r =
                          null === (n = this.renderRoot) || void 0 === n
                            ? void 0
                            : n.querySelector(t)) && void 0 !== r
                        ? r
                        : null),
                  this[e]
                );
              };
            }
            return r;
          },
        });
      }
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ function c(t) {
        return s({
          descriptor: e => ({
            get() {
              var e, n;
              return null !==
                (n =
                  null === (e = this.renderRoot) || void 0 === e
                    ? void 0
                    : e.querySelectorAll(t)) && void 0 !== n
                ? n
                : [];
            },
            enumerable: !0,
            configurable: !0,
          }),
        });
      }
      null !=
        (null === (r = window.HTMLSlotElement) || void 0 === r
          ? void 0
          : r.prototype.assignedElements) ||
        ((t, e) =>
          t.assignedNodes(e).filter(t => t.nodeType === Node.ELEMENT_NODE));
    },
    57891: function (t, e, n) {
      n.d(e, {
        r: function () {
          return u;
        },
      });
      var r = n(93311),
        i = n(47514),
        o = n(68707);
      /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let l = (t, e, n) => {
          let r = new Map();
          for (let i = e; i <= n; i++) r.set(t[i], i);
          return r;
        },
        u = (0, i.XM)(
          class extends i.Xe {
            constructor(t) {
              if ((super(t), t.type !== i.pX.CHILD))
                throw Error('repeat() can only be used in text expressions');
            }
            dt(t, e, n) {
              let r;
              void 0 === n ? (n = e) : void 0 !== e && (r = e);
              let i = [],
                o = [],
                l = 0;
              for (let e of t) (i[l] = r ? r(e, l) : l), (o[l] = n(e, l)), l++;
              return { values: o, keys: i };
            }
            render(t, e, n) {
              return this.dt(t, e, n).values;
            }
            update(t, [e, n, i]) {
              var u;
              let s = (0, o.i9)(t),
                { values: a, keys: c } = this.dt(e, n, i);
              if (!Array.isArray(s)) return (this.ht = c), a;
              let f =
                  null !== (u = this.ht) && void 0 !== u ? u : (this.ht = []),
                d = [],
                h,
                g,
                m = 0,
                p = s.length - 1,
                y = 0,
                v = a.length - 1;
              for (; m <= p && y <= v; )
                if (null === s[m]) m++;
                else if (null === s[p]) p--;
                else if (f[m] === c[y])
                  (d[y] = (0, o.fk)(s[m], a[y])), m++, y++;
                else if (f[p] === c[v])
                  (d[v] = (0, o.fk)(s[p], a[v])), p--, v--;
                else if (f[m] === c[v])
                  (d[v] = (0, o.fk)(s[m], a[v])),
                    (0, o._Y)(t, d[v + 1], s[m]),
                    m++,
                    v--;
                else if (f[p] === c[y])
                  (d[y] = (0, o.fk)(s[p], a[y])),
                    (0, o._Y)(t, s[m], s[p]),
                    p--,
                    y++;
                else if (
                  (void 0 === h && ((h = l(c, y, v)), (g = l(f, m, p))),
                  h.has(f[m]))
                ) {
                  if (h.has(f[p])) {
                    let e = g.get(c[y]),
                      n = void 0 !== e ? s[e] : null;
                    if (null === n) {
                      let e = (0, o._Y)(t, s[m]);
                      (0, o.fk)(e, a[y]), (d[y] = e);
                    } else
                      (d[y] = (0, o.fk)(n, a[y])),
                        (0, o._Y)(t, s[m], n),
                        (s[e] = null);
                    y++;
                  } else (0, o.ws)(s[p]), p--;
                } else (0, o.ws)(s[m]), m++;
              for (; y <= v; ) {
                let e = (0, o._Y)(t, d[v + 1]);
                (0, o.fk)(e, a[y]), (d[y++] = e);
              }
              for (; m <= p; ) {
                let t = s[m++];
                null !== t && (0, o.ws)(t);
              }
              return (this.ht = c), (0, o.hl)(t, d), r.Jb;
            }
          }
        );
    },
    91827: function (t, e, n) {
      n.d(e, {
        V: function () {
          return u;
        },
      });
      var r = n(93311),
        i = n(47514);
      /**
       * @license
       * Copyright 2018 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let o = 'important',
        l = ' !' + o,
        u = (0, i.XM)(
          class extends i.Xe {
            constructor(t) {
              var e;
              if (
                (super(t),
                t.type !== i.pX.ATTRIBUTE ||
                  'style' !== t.name ||
                  (null === (e = t.strings) || void 0 === e
                    ? void 0
                    : e.length) > 2)
              )
                throw Error(
                  'The `styleMap` directive must be used in the `style` attribute and must be the only part in the attribute.'
                );
            }
            render(t) {
              return Object.keys(t).reduce((e, n) => {
                let r = t[n];
                return null == r
                  ? e
                  : e +
                      `${(n = n.includes('-')
                        ? n
                        : n
                            .replace(/(?:^(webkit|moz|ms|o)|)(?=[A-Z])/g, '-$&')
                            .toLowerCase())}:${r};`;
              }, '');
            }
            update(t, [e]) {
              let { style: n } = t.element;
              if (void 0 === this.ut) {
                for (let t in ((this.ut = new Set()), e)) this.ut.add(t);
                return this.render(e);
              }
              for (let t in (this.ut.forEach(t => {
                null == e[t] &&
                  (this.ut.delete(t),
                  t.includes('-') ? n.removeProperty(t) : (n[t] = ''));
              }),
              e)) {
                let r = e[t];
                if (null != r) {
                  this.ut.add(t);
                  let e = 'string' == typeof r && r.endsWith(l);
                  t.includes('-') || e
                    ? n.setProperty(t, e ? r.slice(0, -11) : r, e ? o : '')
                    : (n[t] = r);
                }
              }
              return r.Jb;
            }
          }
        );
    },
  },
]);
//# sourceMappingURL=5024-66808cc1093f7fb1.js.map
