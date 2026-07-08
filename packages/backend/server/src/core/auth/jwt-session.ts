import { Injectable } from '@nestjs/common';
import jwt, { type JwtPayload } from 'jsonwebtoken';

import { AuthenticationRequired, Config, CryptoHelper } from '../../base';
import { Models } from '../../models';
import { sessionUser } from './service';
import type { CurrentUser, Session } from './session';

const JWT_SESSION_TYPE = 'user_session';
const JWT_SESSION_ISSUER = 'affine';
const JWT_SESSION_AUDIENCE = 'affine-client';

export interface SignedJwtSession {
  token: string;
  expiresAt: Date;
}

interface UserSessionJwtPayload extends JwtPayload {
  sub: string;
  sid: string;
  typ: typeof JWT_SESSION_TYPE;
}

function isUserSessionJwtPayload(
  payload: string | JwtPayload
): payload is UserSessionJwtPayload {
  return (
    typeof payload !== 'string' &&
    typeof payload.sub === 'string' &&
    typeof payload.sid === 'string' &&
    payload.typ === JWT_SESSION_TYPE
  );
}

@Injectable()
export class JwtSessionService {
  constructor(
    private readonly crypto: CryptoHelper,
    private readonly models: Models,
    private readonly config: Config
  ) {}

  private get currentKey() {
    return Buffer.concat([
      Buffer.from('affine:user-session-jwt:v1:'),
      this.crypto.keyPair.sha256.privateKey,
    ]);
  }

  sign(userId: string, sessionId: string): SignedJwtSession {
    const ttl = this.config.auth.session.ttl;
    const expiresAt = new Date(Date.now() + ttl * 1000);
    const token = jwt.sign(
      { sid: sessionId, typ: JWT_SESSION_TYPE },
      this.currentKey,
      {
        algorithm: 'HS256',
        audience: JWT_SESSION_AUDIENCE,
        expiresIn: ttl,
        issuer: JWT_SESSION_ISSUER,
        subject: userId,
      }
    );

    return { token, expiresAt };
  }

  async verify(token: string): Promise<Session> {
    let payload: string | JwtPayload;
    try {
      payload = jwt.verify(token, this.currentKey, {
        algorithms: ['HS256'],
        audience: JWT_SESSION_AUDIENCE,
        issuer: JWT_SESSION_ISSUER,
      });
    } catch {
      throw new AuthenticationRequired();
    }

    if (!isUserSessionJwtPayload(payload)) throw new AuthenticationRequired();
    const userSession = await this.models.session
      .findUserSessionsBySessionId(payload.sid)
      .then(sessions => sessions.find(s => s.userId === payload.sub));
    if (!userSession) throw new AuthenticationRequired();
    const user = await this.models.user.get(payload.sub);
    if (!user) throw new AuthenticationRequired();
    return { ...userSession, user: sessionUser(user) as CurrentUser };
  }
}

export function isLikelyJwt(token: string) {
  return token.split('.').length === 3;
}
