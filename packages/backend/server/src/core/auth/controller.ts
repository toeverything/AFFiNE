import { randomUUID } from 'node:crypto';

import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  Config,
  EarlyAccessRequired,
  EmailTokenNotFound,
  InternalServerError,
  InvalidEmailToken,
  SignUpForbidden,
  Throttle,
  URLHelper,
} from '../../fundamentals';
import { UserService } from '../user';
import { validators } from '../utils/validators';
import { CurrentUser } from './current-user';
import { Public } from './guard';
import { AuthService, parseAuthUserSeqNum } from './service';
import { TokenService, TokenType } from './token';

class SignInCredential {
  email!: string;
  password?: string;
}

class MagicLinkCredential {
  email!: string;
  token!: string;
}

@Throttle('strict')
@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly user: UserService,
    private readonly token: TokenService,
    private readonly config: Config
  ) {}

  @Public()
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential,
    @Query('redirect_uri') redirectUri = this.url.home
  ) {
    validators.assertValidEmail(credential.email);
    const canSignIn = await this.auth.canSignIn(credential.email);
    if (!canSignIn) {
      throw new EarlyAccessRequired();
    }

    if (credential.password) {
      const user = await this.auth.signIn(
        credential.email,
        credential.password
      );

      await this.auth.setCookie(req, res, user);
      res.status(HttpStatus.OK).send(user);
    } else {
      // send email magic link
      const user = await this.user.findUserByEmail(credential.email);
      if (!user) {
        const allowSignup = await this.config.runtime.fetch('auth/allowSignup');
        if (!allowSignup) {
          throw new SignUpForbidden();
        }
      }

      const result = await this.sendSignInEmail(
        { email: credential.email, signUp: !user },
        redirectUri
      );

      if (result.rejected.length) {
        throw new InternalServerError('Failed to send sign-in email.');
      }

      res.status(HttpStatus.OK).send({
        email: credential.email,
      });
    }
  }

  async sendSignInEmail(
    { email, signUp }: { email: string; signUp: boolean },
    redirectUri: string
  ) {
    const token = await this.token.createToken(TokenType.SignIn, email);

    const magicLink = this.url.link('/magic-link', {
      token,
      email,
      redirect_uri: redirectUri,
    });

    const result = await this.auth.sendSignInEmail(email, magicLink, signUp);

    return result;
  }

  @Get('/sign-out')
  async signOut(
    @Req() req: Request,
    @Res() res: Response,
    @Query('redirect_uri') redirectUri?: string
  ) {
    const session = await this.auth.signOut(
      req.cookies[AuthService.sessionCookieName],
      parseAuthUserSeqNum(req.headers[AuthService.authUserSeqHeaderName])
    );

    if (session) {
      res.cookie(AuthService.sessionCookieName, session.id, {
        expires: session.expiresAt ?? void 0, // expiredAt is `string | null`
        ...this.auth.cookieOptions,
      });
    } else {
      res.clearCookie(AuthService.sessionCookieName);
    }

    if (redirectUri) {
      return this.url.safeRedirect(res, redirectUri);
    } else {
      return res.send(null);
    }
  }

  @Public()
  @Post('/magic-link')
  async magicLinkSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() { email, token }: MagicLinkCredential
  ) {
    if (!token || !email) {
      throw new EmailTokenNotFound();
    }

    validators.assertValidEmail(email);

    const valid = await this.token.verifyToken(TokenType.SignIn, token, {
      credential: email,
    });

    if (!valid) {
      throw new InvalidEmailToken();
    }

    const user = await this.user.fulfillUser(email, {
      emailVerifiedAt: new Date(),
      registered: true,
    });

    await this.auth.setCookie(req, res, user);

    res.send({ id: user.id, email: user.email, name: user.name });
  }

  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/session')
  async currentSessionUser(@CurrentUser() user?: CurrentUser) {
    return {
      user,
    };
  }

  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/sessions')
  async currentSessionUsers(@Req() req: Request) {
    const token = req.cookies[AuthService.sessionCookieName];
    if (!token) {
      return {
        users: [],
      };
    }

    return {
      users: await this.auth.getUserList(token),
    };
  }

  @Public()
  @Get('/challenge')
  async challenge() {
    // TODO(@darksky): impl in following PR
    return {
      challenge: randomUUID(),
      resource: randomUUID(),
    };
  }
}
