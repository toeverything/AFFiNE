(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [5804],
  {
    81323: function () {},
    29686: function () {},
    22066: function (e, t, a) {
      'use strict';
      a.r(t),
        a.d(t, {
          EditorContainer: function () {
            return y;
          },
          SimpleAffineEditor: function () {
            return w;
          },
          checkEditorElementActive: function () {
            return h;
          },
          createBlockHub: function () {
            return k;
          },
        });
      var o = a(59799),
        r = a(50634),
        i = a(13246),
        l = a(15486),
        s = a(32916),
        n = a(93311),
        d = a(47514),
        c = a(68707);
      /**
       * @license
       * Copyright 2021 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */ let f = (0, d.XM)(
        class extends d.Xe {
          constructor() {
            super(...arguments), (this.key = n.Ld);
          }
          render(e, t) {
            return (this.key = e), t;
          }
          update(e, [t, a]) {
            return t !== this.key && ((0, c.hl)(e), (this.key = t)), a;
          }
        }
      );
      var p = a(29045),
        g = a(67072),
        u = a(31054);
      let h = () => null != document.activeElement?.closest('editor-container'),
        k = (e, t) => {
          let a = new o.BlockHub({
            mouseRoot: e,
            enableDatabase: !!t.awarenessStore.getFlag('enable_database'),
            onClickCard: async e => {
              let a = [],
                r = 'affine:database' === e.flavour;
              if (r && !t.awarenessStore.getFlag('enable_database')) {
                console.warn('database block is not enabled');
                return;
              }
              'affine:embed' === e.flavour && 'image' === e.type
                ? a.push(...(await (0, o.uploadImageFromLocal)(t)))
                : a.push(e);
              let i = t.root?.lastItem(),
                l = (0, p.zE)(t);
              if (l) {
                let r = l.models[l.models.length - 1];
                if ('affine:bookmark' === e.flavour) {
                  let e = t.getParent(r);
                  (0, u.kP)(e);
                  let a = e.children.indexOf(r);
                  (0, o.createBookmarkBlock)(e, a + 1);
                  return;
                }
                let i = t.addSiblingBlocks(r, a, 'after'),
                  s = i[i.length - 1];
                (0, o.asyncFocusRichText)(t, s);
              } else if (i) {
                if ('affine:bookmark' === e.flavour) {
                  (0, o.createBookmarkBlock)(t.root?.lastItem());
                  return;
                }
                let r = t.root?.lastItem()?.id;
                a.forEach(e => {
                  r = t.addBlock(
                    e.flavour ?? 'affine:paragraph',
                    e,
                    t.root?.lastItem()
                  );
                }),
                  r && (0, o.asyncFocusRichText)(t, r);
              }
            },
            onDrop: async (a, r, i, l) => {
              let s, n, d;
              let c = a.dataTransfer;
              (0, u.kP)(c);
              let f = c.getData('affine/block-hub'),
                g = [],
                h = JSON.parse(f),
                k = 'affine:database' === h.flavour;
              if (k && !t.awarenessStore.getFlag('enable_database')) {
                console.warn('database block is not enabled');
                return;
              }
              if (
                ('affine:embed' === h.flavour && 'image' === h.type
                  ? g.push(...(await (0, o.uploadImageFromLocal)(t)))
                  : g.push(h),
                i && 'none' !== l)
              ) {
                let { model: e } = i;
                if ((t.captureSync(), 'database' === l)) {
                  let a = t.addBlocks(g, e);
                  (n = a[0]), (s = e.id);
                } else if ('affine:bookmark' === h.flavour) {
                  let a = t.getParent(e);
                  (0, u.kP)(a);
                  let r = a.children.indexOf(e);
                  (n = (0, o.createBookmarkBlock)(a, r + 1)), (s = a.id);
                } else {
                  let a = t.getParent(e);
                  (0, u.kP)(a);
                  let o = t.addSiblingBlocks(e, g, l);
                  (n = o[0]), (s = a.id);
                }
                if (k) {
                  let a = await (0, o.getServiceOrRegister)(h.flavour);
                  a.initDatabaseBlock(t, e, n);
                }
              }
              if ('page' === e.mode) {
                n &&
                  ((0, o.asyncFocusRichText)(t, n),
                  (0, o.tryUpdateFrameSize)(t, 1));
                return;
              }
              let m = (0, o.getEdgelessPage)(t);
              if (((0, u.kP)(m), n && s)) {
                let e = (0, p.lK)(s, m);
                (0, u.kP)(e), (d = e.model.id);
              } else {
                let e = m.addNewFrame(g, r);
                (d = e.frameId), (n = e.ids[0]);
              }
              m.setSelection(d, !0, n, r);
            },
            onDragStart: () => {
              if ('page' === e.mode) {
                let t = e.querySelector('affine-default-page');
                (0, u.kP)(t), t.selection.clear();
              }
            },
            getAllowedBlocks: () => {
              if ('page' === e.mode) {
                let t = e.querySelector('affine-default-page');
                return (0, u.kP)(t), (0, o.getAllowSelectedBlocks)(t.model);
              }
              {
                let t = e.querySelector('affine-edgeless-page');
                return (0, u.kP)(t), (0, o.getAllowSelectedBlocks)(t.model);
              }
            },
            getHoveringFrameState: t => {
              let a = { scale: 1 };
              if ('page' === e.mode) {
                let t = e.querySelector('affine-default-page');
                (0, u.kP)(t);
                let o = p.UL.fromDOMRect(
                  t.pageBlockContainer.getBoundingClientRect()
                );
                (o.height -= g.rj), (a.rect = o);
              } else {
                let o = e.querySelector('affine-edgeless-page');
                (0, u.kP)(o), (a.scale = o.surface.viewport.zoom);
                let r = (0, p.ev)(t);
                r && ((a.rect = p.UL.fromDOM(r)), (a.container = r));
              }
              return a;
            },
            page: t,
          });
          return a;
        };
      var m = function (e, t, a, o) {
        var r,
          i = arguments.length,
          l =
            i < 3
              ? t
              : null === o
              ? (o = Object.getOwnPropertyDescriptor(t, a))
              : o;
        if ('object' == typeof Reflect && 'function' == typeof Reflect.decorate)
          l = Reflect.decorate(e, t, a, o);
        else
          for (var s = e.length - 1; s >= 0; s--)
            (r = e[s]) &&
              (l = (i < 3 ? r(l) : i > 3 ? r(t, a, l) : r(t, a)) || l);
        return i > 3 && l && Object.defineProperty(t, a, l), l;
      };
      function b(e, t) {
        Object.entries(e).forEach(([e, a]) => {
          let o = t[e];
          o && a.pipe(o);
        });
      }
      r.zN;
      let y = class extends (0, r.$T)(r.Zi) {
        constructor() {
          super(...arguments),
            (this.mode = 'page'),
            (this.autofocus = !1),
            (this.themeObserver = new o.ThemeObserver()),
            (this.slots = {
              pageLinkClicked: new i.g7(),
              pageModeSwitched: new i.g7(),
            });
        }
        get model() {
          return this.page.root;
        }
        connectedCallback() {
          super.connectedCallback(), o.activeEditorManager.setIfNoActive(this);
          let e = e => {
            if (
              (e.altKey && e.metaKey && 'KeyC' === e.code && e.preventDefault(),
              'Escape' !== e.code)
            )
              return;
            let t = this.model;
            if (!t) return;
            'page' === this.mode && o.getPageBlock(t)?.selection.clear();
            let a = getSelection();
            a && !a.isCollapsed && h() && a.removeAllRanges();
          };
          if (
            (i.vU
              ? this._disposables.addFromEvent(document.body, 'keydown', e)
              : this._disposables.addFromEvent(window, 'keydown', e),
            !this.page)
          )
            throw Error('Missing page for EditorContainer!');
          this._disposables.add(
            this.page.slots.rootAdded.on(() => {
              this.requestUpdate('page');
            })
          ),
            this._disposables.add(
              this.page.slots.blockUpdated.on(async ({ type: e, id: t }) => {
                let a = this.page.getBlockById(t);
                if (a && 'update' === e) {
                  let e = await (0, o.getServiceOrRegister)(a.flavour);
                  e.updateEffect(a);
                }
              })
            ),
            this.themeObserver.observer(document.documentElement),
            this._disposables.add(this.themeObserver);
        }
        disconnectedCallback() {
          super.disconnectedCallback(),
            o.activeEditorManager.clearActive(),
            this.page.awarenessStore.setLocalRange(this.page, null);
        }
        firstUpdated() {
          (0, o.getServiceOrRegister)('affine:code'),
            'page' === this.mode &&
              setTimeout(() => {
                let e = this.querySelector('affine-default-page');
                this.autofocus && e?.titleVEditor.focusEnd();
              });
        }
        updated(e) {
          e.has('mode') && this.slots.pageModeSwitched.emit(this.mode),
            (e.has('page') || e.has('mode')) &&
              requestAnimationFrame(() => {
                this._defaultPageBlock &&
                  b(this._defaultPageBlock.slots, this.slots),
                  this._edgelessPageBlock &&
                    b(this._edgelessPageBlock.slots, this.slots);
              });
        }
        async createBlockHub() {
          return (
            await this.updateComplete,
            this.page.root ||
              (await new Promise(e => this.page.slots.rootAdded.once(e))),
            k(this, this.page)
          );
        }
        render() {
          if (!this.model) return null;
          let e = f(
              this.model.id,
              l.dy`<block-suite-root
        .page=${this.page}
        .componentMap=${'page' === this.mode ? o.pagePreset : o.edgelessPreset}
      ></block-suite-root>`
            ),
            t = l.dy`
      <remote-selection .page=${this.page}></remote-selection>
    `;
          return l.dy`
      <style>
        editor-container * {
          box-sizing: border-box;
        }
        editor-container,
        .affine-editor-container {
          display: block;
          height: 100%;
          position: relative;
          overflow: hidden;
          font-family: var(--affine-font-family);
          background: var(--affine-background-primary-color);
        }
        @media print {
          editor-container,
          .affine-editor-container {
            height: auto;
          }
        }
      </style>
      ${e} ${t}
    `;
        }
      };
      m([(0, s.Cb)()], y.prototype, 'page', void 0),
        m([(0, s.Cb)()], y.prototype, 'mode', void 0),
        m([(0, s.Cb)()], y.prototype, 'autofocus', void 0),
        m(
          [(0, s.IO)('affine-default-page')],
          y.prototype,
          '_defaultPageBlock',
          void 0
        ),
        m(
          [(0, s.IO)('affine-edgeless-page')],
          y.prototype,
          '_edgelessPageBlock',
          void 0
        ),
        (y = m([(0, s.Mo)('editor-container')], y));
      var v = a(79765);
      let w = class extends l.oi {
        constructor() {
          super(),
            (this.workspace = new i.j$({ id: 'test' }).register(v.P)),
            (this.page = this.workspace.createPage({ id: 'page0' }));
          let e = this.page.addBlock('affine:page'),
            t = this.page.addBlock('affine:frame', {}, e);
          this.page.addBlock('affine:paragraph', {}, t);
        }
        connectedCallback() {
          let e = new y();
          (e.page = this.page), this.appendChild(e);
        }
        disconnectedCallback() {
          this.removeChild(this.children[0]);
        }
      };
      w = (function (e, t, a, o) {
        var r,
          i = arguments.length,
          l =
            i < 3
              ? t
              : null === o
              ? (o = Object.getOwnPropertyDescriptor(t, a))
              : o;
        if ('object' == typeof Reflect && 'function' == typeof Reflect.decorate)
          l = Reflect.decorate(e, t, a, o);
        else
          for (var s = e.length - 1; s >= 0; s--)
            (r = e[s]) &&
              (l = (i < 3 ? r(l) : i > 3 ? r(t, a, l) : r(t, a)) || l);
        return i > 3 && l && Object.defineProperty(t, a, l), l;
      })([(0, s.Mo)('simple-affine-editor')], w);
      let B =
          'undefined' != typeof globalThis
            ? globalThis
            : 'undefined' != typeof window
            ? window
            : 'undefined' != typeof global
            ? global
            : {},
        P = '__ $BLOCKSUITE_EDITOR$ __';
      if (
        (!0 === B[P] &&
          console.error(
            '@blocksuite/editor was already imported. This breaks constructor checks and will lead to issues!'
          ),
        'undefined' == typeof window)
      )
        throw Error(
          'Seems like you are importing @blocksuite/editor in SSR mode. Which is not supported for now.'
        );
      B[P] = !0;
    },
  },
]);
//# sourceMappingURL=5804.3daa2ab305152ecf.js.map
