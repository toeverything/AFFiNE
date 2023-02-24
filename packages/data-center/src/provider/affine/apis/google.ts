import { DebugLogger } from '@affine/debug';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, User } from 'firebase/auth';
import {
  type Auth as FirebaseAuth,
  getAuth as getFirebaseAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { decode } from 'js-base64';
import { KyInstance } from 'ky/distribution/types/ky';

import { MessageCenter } from '../../../message';
import { storage } from '../storage';
import { RequestError } from './request-error';

export interface AccessTokenMessage {
  created_at: number;
  exp: number;
  email: string;
  id: string;
  name: string;
  avatar_url: string;
}

export type Callback = (user: AccessTokenMessage | null) => void;

type LoginParams = {
  type: 'Google' | 'Refresh';
  token: string;
};

type LoginResponse = {
  // access token, expires in a very short time
  token: string;
  // Refresh token
  refresh: string;
};

// TODO: organize storage keys in a better way
const AFFINE_LOGIN_STORAGE_KEY = 'affine:login';
const messageCenter = MessageCenter.getInstance();
const sendMessage = messageCenter.getMessageSender('affine');
const { messageCode } = MessageCenter;

/**
 * Use refresh token to get a new access token (JWT)
 * The returned token also contains the user info payload.
 */
const createDoLogin =
  (bareClient: KyInstance) =>
  (params: LoginParams): Promise<LoginResponse> =>
    bareClient.post('api/user/token', { json: params }).json();

export class GoogleAuth {
  private readonly _logger;
  private _accessToken = ''; // idtoken (JWT)
  private _refreshToken = '';

  private _user: AccessTokenMessage | null = null;
  private _padding?: Promise<LoginResponse>;
  private readonly _doLogin: ReturnType<typeof createDoLogin>;

  constructor(bareClient: KyInstance) {
    this._logger = new DebugLogger('token');
    this._logger.enabled = true;
    this._doLogin = createDoLogin(bareClient);

    this.restoreLogin();
  }

  setLogin(login: LoginResponse) {
    this._accessToken = login.token;
    this._refreshToken = login.refresh;
    this._user = GoogleAuth.parseIdToken(this._accessToken);

    this.triggerChange(this._user);
    this.storeLogin();
  }

  private storeLogin() {
    if (this.refresh) {
      const { token, refresh } = this;
      storage.setItem(
        AFFINE_LOGIN_STORAGE_KEY,
        JSON.stringify({ token, refresh })
      );
    }
  }

  private restoreLogin() {
    const loginStr = storage.getItem(AFFINE_LOGIN_STORAGE_KEY);
    if (!loginStr) {
      return;
    }
    try {
      const login: LoginResponse = JSON.parse(loginStr);
      this.setLogin(login);
    } catch (err) {
      this._logger.warn('Failed to parse login info', err);
    }
  }

  async initToken(token: string) {
    try {
      const res = await this._doLogin({
        token,
        type: 'Google',
      });
      this.setLogin(res);
      return this._user;
    } catch (error) {
      sendMessage(messageCode.loginError);
      throw new RequestError('Login failed', error);
    }
  }

  async refreshToken(refreshToken?: string) {
    if (!this._padding) {
      this._padding = this._doLogin({
        type: 'Refresh',
        token: refreshToken || this._refreshToken,
      });
      this._refreshToken = refreshToken || this._refreshToken;
    }
    try {
      const res = await this._padding;
      if (res && (!refreshToken || refreshToken !== this._refreshToken)) {
        this.setLogin(res);
      }
      return true;
    } catch (error) {
      sendMessage(messageCode.refreshTokenError);
      throw new RequestError('Refresh token failed', error);
    } finally {
      // clear on settled
      this._padding = undefined;
    }
    return false;
  }

  get user() {
    // computed through access token
    return this._user;
  }

  get token() {
    return this._accessToken;
  }

  get refresh() {
    return this._refreshToken;
  }

  get isLogin() {
    return !!this._refreshToken;
  }

  get isExpired() {
    if (!this._user) return true;
    // exp is in seconds
    return Date.now() > this._user.exp * 1000;
  }

  static parseIdToken(token: string): AccessTokenMessage | null {
    try {
      return JSON.parse(decode(token.split('.')[1]));
    } catch (error) {
      // todo: log errors?
      return null;
    }
  }

  private callbacks: Callback[] = [];
  private lastState: AccessTokenMessage | null = null;

  triggerChange(user: AccessTokenMessage | null) {
    this.lastState = user;
    this.callbacks.forEach(callback => callback(user));
  }

  onChange(callback: Callback) {
    this.callbacks.push(callback);
    callback(this.lastState);
  }

  offChange(callback: Callback) {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  clear() {
    this._accessToken = '';
    this._refreshToken = '';
    storage.removeItem(AFFINE_LOGIN_STORAGE_KEY);
  }
}

export function createGoogleAuth(bareAuth: KyInstance): GoogleAuth {
  return new GoogleAuth(bareAuth);
}

// Connect emulators based on env vars
const envConnectEmulators = process.env.REACT_APP_FIREBASE_EMULATORS === 'true';

export const getAuthorizer = (googleAuth: GoogleAuth) => {
  let _firebaseAuth: FirebaseAuth | null = null;
  const logger = new DebugLogger('authorizer');

  // getAuth will send requests on calling thus we can lazy init it
  const getAuth = () => {
    try {
      if (!_firebaseAuth) {
        const app = initializeApp({
          apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
          messagingSenderId:
            process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
          appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
          measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        });
        _firebaseAuth = getFirebaseAuth(app);
      }
      if (envConnectEmulators && !(window as any).firebaseAuthEmulatorStarted) {
        connectAuthEmulator(_firebaseAuth, 'http://localhost:9099', {
          disableWarnings: true,
        });
        (window as any).firebaseAuthEmulatorStarted = true;
      }
      return _firebaseAuth;
    } catch (error) {
      logger.error('Failed to initialize firebase', error);
      return null;
    }
  };

  const getToken = async () => {
    const currentUser = getAuth()?.currentUser;
    if (currentUser) {
      await currentUser.getIdTokenResult(true);
      if (!currentUser.isAnonymous) {
        return currentUser.getIdToken();
      }
    }
    return;
  };

  const signInWithGoogle = async () => {
    const idToken = await getToken();
    let loginUser: AccessTokenMessage | null = null;
    if (idToken) {
      loginUser = await googleAuth.initToken(idToken);
    } else {
      const firebaseAuth = getAuth();
      if (firebaseAuth) {
        const googleAuthProvider = new GoogleAuthProvider();
        // make sure the user has a chance to select an account
        // https://developers.google.com/identity/openid-connect/openid-connect#prompt
        googleAuthProvider.setCustomParameters({
          prompt: 'select_account',
        });
        const user = await signInWithPopup(firebaseAuth, googleAuthProvider);
        const idToken = await user.user.getIdToken();
        loginUser = await googleAuth.initToken(idToken);
      }
    }
    return loginUser;
  };

  const onAuthStateChanged = (callback: (user: User | null) => void) => {
    getAuth()?.onAuthStateChanged(callback);
  };

  const signOutFirebase = async () => {
    const firebaseAuth = getAuth();
    if (firebaseAuth?.currentUser) {
      await signOut(firebaseAuth);
    }
  };

  return [signInWithGoogle, onAuthStateChanged, signOutFirebase] as const;
};
