(self.webpackChunk_N_E = self.webpackChunk_N_E || []).push([
  [6435],
  {
    67673: function (t, e, s) {
      'use strict';
      let n;
      s.d(e, {
        u: function () {
          return T;
        },
      });
      var i,
        r,
        o = s(90063);
      function a() {
        let t = o.n2,
          e = t.crypto || t.msCrypto;
        if (e && e.randomUUID) return e.randomUUID().replace(/-/g, '');
        let s =
          e && e.getRandomValues
            ? () => e.getRandomValues(new Uint8Array(1))[0]
            : () => 16 * Math.random();
        return '10000000100040008000100000000000'.replace(/[018]/g, t =>
          (t ^ ((15 & s()) >> (t / 4))).toString(16)
        );
      }
      var _ = s(7790);
      let h = ['debug', 'info', 'warn', 'error', 'log', 'assert', 'trace'];
      function u(t) {
        if (!('console' in o.n2)) return t();
        let e = o.n2.console,
          s = {};
        h.forEach(t => {
          let n = e[t] && e[t].__sentry_original__;
          t in e && n && ((s[t] = e[t]), (e[t] = n));
        });
        try {
          return t();
        } finally {
          Object.keys(s).forEach(t => {
            e[t] = s[t];
          });
        }
      }
      function c() {
        let t = !1,
          e = {
            enable: () => {
              t = !0;
            },
            disable: () => {
              t = !1;
            },
          };
        return (
          'undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__
            ? h.forEach(s => {
                e[s] = (...e) => {
                  t &&
                    u(() => {
                      o.n2.console[s](`Sentry Logger [${s}]:`, ...e);
                    });
                };
              })
            : h.forEach(t => {
                e[t] = () => void 0;
              }),
          e
        );
      }
      n =
        'undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__
          ? (0, o.YO)('logger', c)
          : c();
      let l = Object.prototype.toString;
      function d(t) {
        return '[object Object]' === l.call(t);
      }
      function p(t) {
        return !!(t && t.then && 'function' == typeof t.then);
      }
      ((i = r || (r = {}))[(i.PENDING = 0)] = 'PENDING'),
        (i[(i.RESOLVED = 1)] = 'RESOLVED'),
        (i[(i.REJECTED = 2)] = 'REJECTED');
      class g {
        __init() {
          this._state = r.PENDING;
        }
        __init2() {
          this._handlers = [];
        }
        constructor(t) {
          g.prototype.__init.call(this),
            g.prototype.__init2.call(this),
            g.prototype.__init3.call(this),
            g.prototype.__init4.call(this),
            g.prototype.__init5.call(this),
            g.prototype.__init6.call(this);
          try {
            t(this._resolve, this._reject);
          } catch (t) {
            this._reject(t);
          }
        }
        then(t, e) {
          return new g((s, n) => {
            this._handlers.push([
              !1,
              e => {
                if (t)
                  try {
                    s(t(e));
                  } catch (t) {
                    n(t);
                  }
                else s(e);
              },
              t => {
                if (e)
                  try {
                    s(e(t));
                  } catch (t) {
                    n(t);
                  }
                else n(t);
              },
            ]),
              this._executeHandlers();
          });
        }
        catch(t) {
          return this.then(t => t, t);
        }
        finally(t) {
          return new g((e, s) => {
            let n, i;
            return this.then(
              e => {
                (i = !1), (n = e), t && t();
              },
              e => {
                (i = !0), (n = e), t && t();
              }
            ).then(() => {
              if (i) {
                s(n);
                return;
              }
              e(n);
            });
          });
        }
        __init3() {
          this._resolve = t => {
            this._setResult(r.RESOLVED, t);
          };
        }
        __init4() {
          this._reject = t => {
            this._setResult(r.REJECTED, t);
          };
        }
        __init5() {
          this._setResult = (t, e) => {
            if (this._state === r.PENDING) {
              if (p(e)) {
                e.then(this._resolve, this._reject);
                return;
              }
              (this._state = t), (this._value = e), this._executeHandlers();
            }
          };
        }
        __init6() {
          this._executeHandlers = () => {
            if (this._state === r.PENDING) return;
            let t = this._handlers.slice();
            (this._handlers = []),
              t.forEach(t => {
                t[0] ||
                  (this._state === r.RESOLVED && t[1](this._value),
                  this._state === r.REJECTED && t[2](this._value),
                  (t[0] = !0));
              });
          };
        }
      }
      function f(t, e = {}) {
        if (
          (!e.user ||
            (!t.ipAddress &&
              e.user.ip_address &&
              (t.ipAddress = e.user.ip_address),
            t.did ||
              e.did ||
              (t.did = e.user.id || e.user.email || e.user.username)),
          (t.timestamp = e.timestamp || (0, _.ph)()),
          e.ignoreDuration && (t.ignoreDuration = e.ignoreDuration),
          e.sid && (t.sid = 32 === e.sid.length ? e.sid : a()),
          void 0 !== e.init && (t.init = e.init),
          !t.did && e.did && (t.did = `${e.did}`),
          'number' == typeof e.started && (t.started = e.started),
          t.ignoreDuration)
        )
          t.duration = void 0;
        else if ('number' == typeof e.duration) t.duration = e.duration;
        else {
          let e = t.timestamp - t.started;
          t.duration = e >= 0 ? e : 0;
        }
        e.release && (t.release = e.release),
          e.environment && (t.environment = e.environment),
          !t.ipAddress && e.ipAddress && (t.ipAddress = e.ipAddress),
          !t.userAgent && e.userAgent && (t.userAgent = e.userAgent),
          'number' == typeof e.errors && (t.errors = e.errors),
          e.status && (t.status = e.status);
      }
      class S {
        constructor() {
          (this._notifyingListeners = !1),
            (this._scopeListeners = []),
            (this._eventProcessors = []),
            (this._breadcrumbs = []),
            (this._attachments = []),
            (this._user = {}),
            (this._tags = {}),
            (this._extra = {}),
            (this._contexts = {}),
            (this._sdkProcessingMetadata = {});
        }
        static clone(t) {
          let e = new S();
          return (
            t &&
              ((e._breadcrumbs = [...t._breadcrumbs]),
              (e._tags = { ...t._tags }),
              (e._extra = { ...t._extra }),
              (e._contexts = { ...t._contexts }),
              (e._user = t._user),
              (e._level = t._level),
              (e._span = t._span),
              (e._session = t._session),
              (e._transactionName = t._transactionName),
              (e._fingerprint = t._fingerprint),
              (e._eventProcessors = [...t._eventProcessors]),
              (e._requestSession = t._requestSession),
              (e._attachments = [...t._attachments]),
              (e._sdkProcessingMetadata = { ...t._sdkProcessingMetadata })),
            e
          );
        }
        addScopeListener(t) {
          this._scopeListeners.push(t);
        }
        addEventProcessor(t) {
          return this._eventProcessors.push(t), this;
        }
        setUser(t) {
          return (
            (this._user = t || {}),
            this._session && f(this._session, { user: t }),
            this._notifyScopeListeners(),
            this
          );
        }
        getUser() {
          return this._user;
        }
        getRequestSession() {
          return this._requestSession;
        }
        setRequestSession(t) {
          return (this._requestSession = t), this;
        }
        setTags(t) {
          return (
            (this._tags = { ...this._tags, ...t }),
            this._notifyScopeListeners(),
            this
          );
        }
        setTag(t, e) {
          return (
            (this._tags = { ...this._tags, [t]: e }),
            this._notifyScopeListeners(),
            this
          );
        }
        setExtras(t) {
          return (
            (this._extra = { ...this._extra, ...t }),
            this._notifyScopeListeners(),
            this
          );
        }
        setExtra(t, e) {
          return (
            (this._extra = { ...this._extra, [t]: e }),
            this._notifyScopeListeners(),
            this
          );
        }
        setFingerprint(t) {
          return (this._fingerprint = t), this._notifyScopeListeners(), this;
        }
        setLevel(t) {
          return (this._level = t), this._notifyScopeListeners(), this;
        }
        setTransactionName(t) {
          return (
            (this._transactionName = t), this._notifyScopeListeners(), this
          );
        }
        setContext(t, e) {
          return (
            null === e ? delete this._contexts[t] : (this._contexts[t] = e),
            this._notifyScopeListeners(),
            this
          );
        }
        setSpan(t) {
          return (this._span = t), this._notifyScopeListeners(), this;
        }
        getSpan() {
          return this._span;
        }
        getTransaction() {
          let t = this.getSpan();
          return t && t.transaction;
        }
        setSession(t) {
          return (
            t ? (this._session = t) : delete this._session,
            this._notifyScopeListeners(),
            this
          );
        }
        getSession() {
          return this._session;
        }
        update(t) {
          if (!t) return this;
          if ('function' == typeof t) {
            let e = t(this);
            return e instanceof S ? e : this;
          }
          return (
            t instanceof S
              ? ((this._tags = { ...this._tags, ...t._tags }),
                (this._extra = { ...this._extra, ...t._extra }),
                (this._contexts = { ...this._contexts, ...t._contexts }),
                t._user &&
                  Object.keys(t._user).length &&
                  (this._user = t._user),
                t._level && (this._level = t._level),
                t._fingerprint && (this._fingerprint = t._fingerprint),
                t._requestSession && (this._requestSession = t._requestSession))
              : d(t) &&
                ((this._tags = { ...this._tags, ...t.tags }),
                (this._extra = { ...this._extra, ...t.extra }),
                (this._contexts = { ...this._contexts, ...t.contexts }),
                t.user && (this._user = t.user),
                t.level && (this._level = t.level),
                t.fingerprint && (this._fingerprint = t.fingerprint),
                t.requestSession && (this._requestSession = t.requestSession)),
            this
          );
        }
        clear() {
          return (
            (this._breadcrumbs = []),
            (this._tags = {}),
            (this._extra = {}),
            (this._user = {}),
            (this._contexts = {}),
            (this._level = void 0),
            (this._transactionName = void 0),
            (this._fingerprint = void 0),
            (this._requestSession = void 0),
            (this._span = void 0),
            (this._session = void 0),
            this._notifyScopeListeners(),
            (this._attachments = []),
            this
          );
        }
        addBreadcrumb(t, e) {
          let s = 'number' == typeof e ? e : 100;
          if (s <= 0) return this;
          let n = { timestamp: (0, _.yW)(), ...t };
          return (
            (this._breadcrumbs = [...this._breadcrumbs, n].slice(-s)),
            this._notifyScopeListeners(),
            this
          );
        }
        getLastBreadcrumb() {
          return this._breadcrumbs[this._breadcrumbs.length - 1];
        }
        clearBreadcrumbs() {
          return (this._breadcrumbs = []), this._notifyScopeListeners(), this;
        }
        addAttachment(t) {
          return this._attachments.push(t), this;
        }
        getAttachments() {
          return this._attachments;
        }
        clearAttachments() {
          return (this._attachments = []), this;
        }
        applyToEvent(t, e = {}) {
          if (
            (this._extra &&
              Object.keys(this._extra).length &&
              (t.extra = { ...this._extra, ...t.extra }),
            this._tags &&
              Object.keys(this._tags).length &&
              (t.tags = { ...this._tags, ...t.tags }),
            this._user &&
              Object.keys(this._user).length &&
              (t.user = { ...this._user, ...t.user }),
            this._contexts &&
              Object.keys(this._contexts).length &&
              (t.contexts = { ...this._contexts, ...t.contexts }),
            this._level && (t.level = this._level),
            this._transactionName && (t.transaction = this._transactionName),
            this._span)
          ) {
            t.contexts = { trace: this._span.getTraceContext(), ...t.contexts };
            let e = this._span.transaction;
            if (e) {
              t.sdkProcessingMetadata = {
                dynamicSamplingContext: e.getDynamicSamplingContext(),
                ...t.sdkProcessingMetadata,
              };
              let s = e.name;
              s && (t.tags = { transaction: s, ...t.tags });
            }
          }
          return (
            this._applyFingerprint(t),
            (t.breadcrumbs = [...(t.breadcrumbs || []), ...this._breadcrumbs]),
            (t.breadcrumbs = t.breadcrumbs.length > 0 ? t.breadcrumbs : void 0),
            (t.sdkProcessingMetadata = {
              ...t.sdkProcessingMetadata,
              ...this._sdkProcessingMetadata,
            }),
            this._notifyEventProcessors(
              [
                ...(0, o.YO)('globalEventProcessors', () => []),
                ...this._eventProcessors,
              ],
              t,
              e
            )
          );
        }
        setSDKProcessingMetadata(t) {
          return (
            (this._sdkProcessingMetadata = {
              ...this._sdkProcessingMetadata,
              ...t,
            }),
            this
          );
        }
        _notifyEventProcessors(t, e, s, i = 0) {
          return new g((r, o) => {
            let a = t[i];
            if (null === e || 'function' != typeof a) r(e);
            else {
              let _ = a({ ...e }, s);
              ('undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__) &&
                a.id &&
                null === _ &&
                n.log(`Event processor "${a.id}" dropped event`),
                p(_)
                  ? _.then(e =>
                      this._notifyEventProcessors(t, e, s, i + 1).then(r)
                    ).then(null, o)
                  : this._notifyEventProcessors(t, _, s, i + 1)
                      .then(r)
                      .then(null, o);
            }
          });
        }
        _notifyScopeListeners() {
          this._notifyingListeners ||
            ((this._notifyingListeners = !0),
            this._scopeListeners.forEach(t => {
              t(this);
            }),
            (this._notifyingListeners = !1));
        }
        _applyFingerprint(t) {
          var e;
          (t.fingerprint = t.fingerprint
            ? Array.isArray((e = t.fingerprint))
              ? e
              : [e]
            : []),
            this._fingerprint &&
              (t.fingerprint = t.fingerprint.concat(this._fingerprint)),
            t.fingerprint && !t.fingerprint.length && delete t.fingerprint;
        }
      }
      class E {
        constructor(t, e = new S(), s = 4) {
          (this._version = s),
            (this._stack = [{ scope: e }]),
            t && this.bindClient(t);
        }
        isOlderThan(t) {
          return this._version < t;
        }
        bindClient(t) {
          let e = this.getStackTop();
          (e.client = t), t && t.setupIntegrations && t.setupIntegrations();
        }
        pushScope() {
          let t = S.clone(this.getScope());
          return (
            this.getStack().push({ client: this.getClient(), scope: t }), t
          );
        }
        popScope() {
          return !(this.getStack().length <= 1) && !!this.getStack().pop();
        }
        withScope(t) {
          let e = this.pushScope();
          try {
            t(e);
          } finally {
            this.popScope();
          }
        }
        getClient() {
          return this.getStackTop().client;
        }
        getScope() {
          return this.getStackTop().scope;
        }
        getStack() {
          return this._stack;
        }
        getStackTop() {
          return this._stack[this._stack.length - 1];
        }
        captureException(t, e) {
          let s = (this._lastEventId = e && e.event_id ? e.event_id : a()),
            n = Error('Sentry syntheticException');
          return (
            this._withClient((i, r) => {
              i.captureException(
                t,
                {
                  originalException: t,
                  syntheticException: n,
                  ...e,
                  event_id: s,
                },
                r
              );
            }),
            s
          );
        }
        captureMessage(t, e, s) {
          let n = (this._lastEventId = s && s.event_id ? s.event_id : a()),
            i = Error(t);
          return (
            this._withClient((r, o) => {
              r.captureMessage(
                t,
                e,
                {
                  originalException: t,
                  syntheticException: i,
                  ...s,
                  event_id: n,
                },
                o
              );
            }),
            n
          );
        }
        captureEvent(t, e) {
          let s = e && e.event_id ? e.event_id : a();
          return (
            t.type || (this._lastEventId = s),
            this._withClient((n, i) => {
              n.captureEvent(t, { ...e, event_id: s }, i);
            }),
            s
          );
        }
        lastEventId() {
          return this._lastEventId;
        }
        addBreadcrumb(t, e) {
          let { scope: s, client: n } = this.getStackTop();
          if (!n) return;
          let { beforeBreadcrumb: i = null, maxBreadcrumbs: r = 100 } =
            (n.getOptions && n.getOptions()) || {};
          if (r <= 0) return;
          let o = (0, _.yW)(),
            a = { timestamp: o, ...t },
            h = i ? u(() => i(a, e)) : a;
          null !== h &&
            (n.emit && n.emit('beforeAddBreadcrumb', h, e),
            s.addBreadcrumb(h, r));
        }
        setUser(t) {
          this.getScope().setUser(t);
        }
        setTags(t) {
          this.getScope().setTags(t);
        }
        setExtras(t) {
          this.getScope().setExtras(t);
        }
        setTag(t, e) {
          this.getScope().setTag(t, e);
        }
        setExtra(t, e) {
          this.getScope().setExtra(t, e);
        }
        setContext(t, e) {
          this.getScope().setContext(t, e);
        }
        configureScope(t) {
          let { scope: e, client: s } = this.getStackTop();
          s && t(e);
        }
        run(t) {
          let e = y(this);
          try {
            t(this);
          } finally {
            y(e);
          }
        }
        getIntegration(t) {
          let e = this.getClient();
          if (!e) return null;
          try {
            return e.getIntegration(t);
          } catch (e) {
            return (
              ('undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__) &&
                n.warn(
                  `Cannot retrieve integration ${t.id} from the current Hub`
                ),
              null
            );
          }
        }
        startTransaction(t, e) {
          let s = this._callExtensionMethod('startTransaction', t, e);
          return (
            ('undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__) &&
              !s &&
              console.warn(`Tracing extension 'startTransaction' has not been added. Call 'addTracingExtensions' before calling 'init':
Sentry.addTracingExtensions();
Sentry.init({...});
`),
            s
          );
        }
        traceHeaders() {
          return this._callExtensionMethod('traceHeaders');
        }
        captureSession(t = !1) {
          if (t) return this.endSession();
          this._sendSessionUpdate();
        }
        endSession() {
          let t = this.getStackTop(),
            e = t.scope,
            s = e.getSession();
          if (s) {
            var n;
            let t;
            (t = {}),
              n
                ? (t = { status: n })
                : 'ok' === s.status && (t = { status: 'exited' }),
              f(s, t);
          }
          this._sendSessionUpdate(), e.setSession();
        }
        startSession(t) {
          let { scope: e, client: s } = this.getStackTop(),
            { release: n, environment: i = 'production' } =
              (s && s.getOptions()) || {},
            { userAgent: r } = o.n2.navigator || {},
            h = (function (t) {
              let e = (0, _.ph)(),
                s = {
                  sid: a(),
                  init: !0,
                  timestamp: e,
                  started: e,
                  duration: 0,
                  status: 'ok',
                  errors: 0,
                  ignoreDuration: !1,
                  toJSON: () =>
                    (function (t) {
                      let e = new Map();
                      return (function t(e, s) {
                        if (d(e)) {
                          let n = s.get(e);
                          if (void 0 !== n) return n;
                          let i = {};
                          for (let n of (s.set(e, i), Object.keys(e)))
                            void 0 !== e[n] && (i[n] = t(e[n], s));
                          return i;
                        }
                        if (Array.isArray(e)) {
                          let n = s.get(e);
                          if (void 0 !== n) return n;
                          let i = [];
                          return (
                            s.set(e, i),
                            e.forEach(e => {
                              i.push(t(e, s));
                            }),
                            i
                          );
                        }
                        return e;
                      })(t, e);
                    })({
                      sid: `${s.sid}`,
                      init: s.init,
                      started: new Date(1e3 * s.started).toISOString(),
                      timestamp: new Date(1e3 * s.timestamp).toISOString(),
                      status: s.status,
                      errors: s.errors,
                      did:
                        'number' == typeof s.did || 'string' == typeof s.did
                          ? `${s.did}`
                          : void 0,
                      duration: s.duration,
                      attrs: {
                        release: s.release,
                        environment: s.environment,
                        ip_address: s.ipAddress,
                        user_agent: s.userAgent,
                      },
                    }),
                };
              return t && f(s, t), s;
            })({
              release: n,
              environment: i,
              user: e.getUser(),
              ...(r && { userAgent: r }),
              ...t,
            }),
            u = e.getSession && e.getSession();
          return (
            u && 'ok' === u.status && f(u, { status: 'exited' }),
            this.endSession(),
            e.setSession(h),
            h
          );
        }
        shouldSendDefaultPii() {
          let t = this.getClient(),
            e = t && t.getOptions();
          return !!(e && e.sendDefaultPii);
        }
        _sendSessionUpdate() {
          let { scope: t, client: e } = this.getStackTop(),
            s = t.getSession();
          s && e && e.captureSession && e.captureSession(s);
        }
        _withClient(t) {
          let { scope: e, client: s } = this.getStackTop();
          s && t(s, e);
        }
        _callExtensionMethod(t, ...e) {
          let s = m(),
            i = s.__SENTRY__;
          if (i && i.extensions && 'function' == typeof i.extensions[t])
            return i.extensions[t].apply(this, e);
          ('undefined' == typeof __SENTRY_DEBUG__ || __SENTRY_DEBUG__) &&
            n.warn(`Extension method ${t} couldn't be found, doing nothing.`);
        }
      }
      function m() {
        return (
          (o.n2.__SENTRY__ = o.n2.__SENTRY__ || {
            extensions: {},
            hub: void 0,
          }),
          o.n2
        );
      }
      function y(t) {
        let e = m(),
          s = b(e);
        return x(e, t), s;
      }
      function v() {
        let t = m();
        if (t.__SENTRY__ && t.__SENTRY__.acs) {
          let e = t.__SENTRY__.acs.getCurrentHub();
          if (e) return e;
        }
        return (function (t = m()) {
          return (
            (!(t && t.__SENTRY__ && t.__SENTRY__.hub) || b(t).isOlderThan(4)) &&
              x(t, new E()),
            b(t)
          );
        })(t);
      }
      function b(t) {
        return (0, o.YO)('hub', () => new E(), t);
      }
      function x(t, e) {
        if (!t) return !1;
        let s = (t.__SENTRY__ = t.__SENTRY__ || {});
        return (s.hub = e), !0;
      }
      async function T(t) {
        var e;
        let { req: s, res: n, err: i } = t,
          r = (n && n.statusCode) || t.statusCode;
        if ((r && r < 500) || !t.pathname) return Promise.resolve();
        (e = t => {
          var e;
          t.addEventProcessor(
            t => (
              (function (t, e) {
                let s =
                  t.exception && t.exception.values
                    ? t.exception.values[0]
                    : void 0;
                if (!s) return;
                let n = s.mechanism;
                if (
                  ((s.mechanism = { type: 'generic', handled: !0, ...n, ...e }),
                  e && 'data' in e)
                ) {
                  let t = { ...(n && n.data), ...e.data };
                  s.mechanism.data = t;
                }
              })(t, {
                type: 'instrument',
                handled: !0,
                data: { function: '_error.getInitialProps' },
              }),
              t
            )
          ),
            s && t.setSDKProcessingMetadata({ request: s }),
            (e = i || `_error.js called with falsy error (${i})`),
            v().captureException(e, { captureContext: void 0 });
        }),
          v().withScope(e),
          await (function (t) {
            let e = v().getClient();
            return e ? e.flush(2e3) : Promise.resolve(!1);
          })(0);
      }
    },
    4266: function (t, e, s) {
      'use strict';
      s.d(e, {
        l$: function () {
          return r;
        },
        KV: function () {
          return i;
        },
      }),
        (t = s.hmd(t));
      var n = s(34406);
      function i() {
        return (
          !(
            'undefined' != typeof __SENTRY_BROWSER_BUNDLE__ &&
            __SENTRY_BROWSER_BUNDLE__
          ) &&
          '[object process]' ===
            Object.prototype.toString.call(void 0 !== n ? n : 0)
        );
      }
      function r(t, e) {
        return t.require(e);
      }
    },
    7790: function (t, e, s) {
      'use strict';
      s.d(e, {
        ph: function () {
          return u;
        },
        yW: function () {
          return h;
        },
      });
      var n = s(4266),
        i = s(90063);
      t = s.hmd(t);
      let r = (0, i.Rf)(),
        o = { nowSeconds: () => Date.now() / 1e3 },
        a = (0, n.KV)()
          ? (function () {
              try {
                let e = (0, n.l$)(t, 'perf_hooks');
                return e.performance;
              } catch (t) {
                return;
              }
            })()
          : (function () {
              let { performance: t } = r;
              if (!t || !t.now) return;
              let e = Date.now() - t.now();
              return { now: () => t.now(), timeOrigin: e };
            })(),
        _ =
          void 0 === a
            ? o
            : { nowSeconds: () => (a.timeOrigin + a.now()) / 1e3 },
        h = o.nowSeconds.bind(o),
        u = _.nowSeconds.bind(_);
      (() => {
        let { performance: t } = r;
        if (!t || !t.now) return;
        let e = t.now(),
          s = Date.now(),
          n = t.timeOrigin ? Math.abs(t.timeOrigin + e - s) : 36e5,
          i = t.timing && t.timing.navigationStart,
          o = 'number' == typeof i ? Math.abs(i + e - s) : 36e5;
        if (n < 36e5 || o < 36e5) return n <= o ? t.timeOrigin : void 0;
      })();
    },
    90063: function (t, e, s) {
      'use strict';
      function n(t) {
        return t && t.Math == Math ? t : void 0;
      }
      s.d(e, {
        Rf: function () {
          return r;
        },
        YO: function () {
          return o;
        },
        n2: function () {
          return i;
        },
      });
      let i =
        ('object' == typeof globalThis && n(globalThis)) ||
        ('object' == typeof window && n(window)) ||
        ('object' == typeof self && n(self)) ||
        ('object' == typeof s.g && n(s.g)) ||
        (function () {
          return this;
        })() ||
        {};
      function r() {
        return i;
      }
      function o(t, e, s) {
        let n = s || i,
          r = (n.__SENTRY__ = n.__SENTRY__ || {}),
          o = r[t] || (r[t] = e());
        return o;
      }
    },
    70689: function (t, e, s) {
      t.exports = s(29144);
    },
  },
]);
//# sourceMappingURL=6435-4b6f63cefc9f8093.js.map
