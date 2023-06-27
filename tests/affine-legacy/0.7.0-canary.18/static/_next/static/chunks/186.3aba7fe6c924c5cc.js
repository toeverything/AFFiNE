'use strict';
(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [186],
  {
    10186: function (e, t, n) {
      let r;
      function u(e) {
        return new Promise((t, n) => {
          (e.oncomplete = e.onsuccess = () => t(e.result)),
            (e.onabort = e.onerror = () => n(e.error));
        });
      }
      function o(e, t) {
        let n = indexedDB.open(e);
        n.onupgradeneeded = () => n.result.createObjectStore(t);
        let r = u(n);
        return (e, n) => r.then(r => n(r.transaction(t, e).objectStore(t)));
      }
      function i() {
        return r || (r = o('keyval-store', 'keyval')), r;
      }
      function c(e, t = i()) {
        return t('readonly', t => u(t.get(e)));
      }
      function a(e, t, n = i()) {
        return n('readwrite', n => (n.put(t, e), u(n.transaction)));
      }
      function l(e, t = i()) {
        return t(
          'readwrite',
          t => (e.forEach(e => t.put(e[1], e[0])), u(t.transaction))
        );
      }
      function s(e, t = i()) {
        return t('readonly', t => Promise.all(e.map(e => u(t.get(e)))));
      }
      function f(e, t, n = i()) {
        return n(
          'readwrite',
          n =>
            new Promise((r, o) => {
              n.get(e).onsuccess = function () {
                try {
                  n.put(t(this.result), e), r(u(n.transaction));
                } catch (e) {
                  o(e);
                }
              };
            })
        );
      }
      function d(e, t = i()) {
        return t('readwrite', t => (t.delete(e), u(t.transaction)));
      }
      function y(e, t = i()) {
        return t(
          'readwrite',
          t => (e.forEach(e => t.delete(e)), u(t.transaction))
        );
      }
      function h(e = i()) {
        return e('readwrite', e => (e.clear(), u(e.transaction)));
      }
      function p(e, t) {
        return (
          (e.openCursor().onsuccess = function () {
            this.result && (t(this.result), this.result.continue());
          }),
          u(e.transaction)
        );
      }
      function g(e = i()) {
        return e('readonly', e => {
          if (e.getAllKeys) return u(e.getAllKeys());
          let t = [];
          return p(e, e => t.push(e.key)).then(() => t);
        });
      }
      function w(e = i()) {
        return e('readonly', e => {
          if (e.getAll) return u(e.getAll());
          let t = [];
          return p(e, e => t.push(e.value)).then(() => t);
        });
      }
      function k(e = i()) {
        return e('readonly', t => {
          if (t.getAll && t.getAllKeys)
            return Promise.all([u(t.getAllKeys()), u(t.getAll())]).then(
              ([e, t]) => e.map((e, n) => [e, t[n]])
            );
          let n = [];
          return e('readonly', e =>
            p(e, e => n.push([e.key, e.value])).then(() => n)
          );
        });
      }
      n.r(t),
        n.d(t, {
          clear: function () {
            return h;
          },
          createStore: function () {
            return o;
          },
          del: function () {
            return d;
          },
          delMany: function () {
            return y;
          },
          entries: function () {
            return k;
          },
          get: function () {
            return c;
          },
          getMany: function () {
            return s;
          },
          keys: function () {
            return g;
          },
          promisifyRequest: function () {
            return u;
          },
          set: function () {
            return a;
          },
          setMany: function () {
            return l;
          },
          update: function () {
            return f;
          },
          values: function () {
            return w;
          },
        });
    },
  },
]);
//# sourceMappingURL=186.3aba7fe6c924c5cc.js.map
