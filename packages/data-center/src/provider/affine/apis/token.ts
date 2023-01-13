import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import type { User } from 'firebase/auth';

import { getLogger } from '../../../logger.js';
import { bareClient } from './request.js';

export interface AccessTokenMessage {
  create_at: number;
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

const login = (params: LoginParams): Promise<LoginResponse> =>
  bareClient.post('api/user/token', { json: params }).json();

class Token {
  private readonly _logger;
  private _accessToken!: string;
  private _refreshToken!: string;

  private _user!: AccessTokenMessage | null;
  private _padding?: Promise<LoginResponse>;

  constructor() {
    this._logger = getLogger('token');
    this._logger.enabled = true;

    this._setToken(); // fill with default value
  }

  get user() {
    return this._user;
  }

  private _setToken(login?: LoginResponse) {
    this._accessToken = login?.token || '';
    this._refreshToken = login?.refresh || '';

    this._user = Token.parse(this._accessToken);
    if (login) {
      this._logger('set login', login);
      this.triggerChange(this._user);
    } else {
      this._logger('empty login');
    }
  }

  async initToken(token: string) {
    const tokens = await login({ token, type: 'Google' });
    this._setToken(tokens);
    return this._user;
  }

  async refreshToken(token?: string) {
    if (!this._padding) {
      this._padding = login({
        type: 'Refresh',
        token: this._refreshToken || token!,
      });
    }
    this._setToken(await this._padding);
    this._padding = undefined;
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
    return Date.now() - this._user.create_at > this._user.exp;
  }

  static parse(token: string): AccessTokenMessage | null {
    try {
      return JSON.parse(
        String.fromCharCode.apply(
          null,
          Array.from(
            Uint8Array.from(
              window.atob(
                // split jwt
                token.split('.')[1]
              ),
              c => c.charCodeAt(0)
            )
          )
        )
      );
    } catch (error) {
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
    this._setToken();
  }
}

export const token = new Token();

export const getAuthorizer = () => {
  const app = initializeApp({
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  });
  try {
    const firebaseAuth = getAuth(app);

    const googleAuthProvider = new GoogleAuthProvider();

    const getToken = async () => {
      const currentUser = firebaseAuth.currentUser;
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
        loginUser = await token.initToken(idToken);
      } else {
        const user = await signInWithPopup(firebaseAuth, googleAuthProvider);
        const idToken = await user.user.getIdToken();
        loginUser = await token.initToken(idToken);
      }
      return loginUser;
    };

    const onAuthStateChanged = (callback: (user: User | null) => void) => {
      firebaseAuth.onAuthStateChanged(callback);
    };

    return [signInWithGoogle, onAuthStateChanged] as const;
  } catch (e) {
    getLogger('getAuthorizer')(e);
    console.error('getAuthorizer', e);
    return [] as const;
  }
};
