import { resolveMx, resolveTxt, setServers } from 'node:dns/promises';

import {
  Body,
  Controller,
  Get,
  Header,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  Cache,
  Config,
  CryptoHelper,
  EmailTokenNotFound,
  InvalidAuthState,
  InvalidEmail,
  InvalidEmailToken,
  SignUpForbidden,
  Throttle,
  URLHelper,
  UseNamedGuard,
  WrongSignInCredentials,
} from '../../base';
import { Models, TokenType } from '../../models';
import { validators } from '../utils/validators';
import { Public } from './guard';
import { AuthService } from './service';
import { CurrentUser, Session } from './session';

interface PreflightResponse {
  registered: boolean;
  hasPassword: boolean;
}

interface SignInCredential {
  email: string;
  password?: string;
  callbackUrl?: string;
  client_nonce?: string;
}

interface MagicLinkCredential {
  email: string;
  token: string;
  client_nonce?: string;
}

const OTP_CACHE_KEY = (otp: string) => `magic-link-otp:${otp}`;

@Throttle('strict')
@Controller('/api/auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly url: URLHelper,
    private readonly auth: AuthService,
    private readonly models: Models,
    private readonly config: Config,
    private readonly cache: Cache,
    private readonly crypto: CryptoHelper
  ) {
    if (env.dev) {
      // set DNS servers in dev mode
      // NOTE: some network debugging software uses DNS hijacking
      // to better debug traffic, but their DNS servers may not
      // handle the non dns query(like txt, mx) correctly, so we
      // set a public DNS server here to avoid this issue.
      setServers(['1.1.1.1', '8.8.8.8']);
    }
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/preflight')
  async preflight(
    @Body() params?: { email: string }
  ): Promise<PreflightResponse> {
    if (!params?.email) {
      throw new InvalidEmail({ email: 'not provided' });
    }
    validators.assertValidEmail(params.email);

    const user = await this.models.user.getUserByEmail(params.email);

    if (!user) {
      return {
        registered: false,
        hasPassword: false,
      };
    }

    return {
      registered: user.registered,
      hasPassword: !!user.password,
    };
  }

  @Public()
  @UseNamedGuard('version', 'captcha')
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential,
    /**
     * @deprecated
     */
    @Query('redirect_uri') redirectUri?: string
  ) {
    validators.assertValidEmail(credential.email);
    const canSignIn = await this.auth.canSignIn(credential.email);
    if (!canSignIn) {
      throw new ActionForbidden();
    }

    if (credential.password) {
      await this.passwordSignIn(
        req,
        res,
        credential.email,
        credential.password
      );
    } else {
      await this.sendMagicLink(
        req,
        res,
        credential.email,
        credential.callbackUrl,
        redirectUri,
        credential.client_nonce
      );
    }
  }

  async passwordSignIn(
    req: Request,
    res: Response,
    email: string,
    password: string
  ) {
    const user = await this.auth.signIn(email, password);

    await this.auth.setCookies(req, res, user.id);
    res.status(HttpStatus.OK).send(user);
  }

  async sendMagicLink(
    _req: Request,
    res: Response,
    email: string,
    callbackUrl = '/magic-link',
    redirectUrl?: string,
    clientNonce?: string
  ) {
    // send email magic link
    const user = await this.models.user.getUserByEmail(email, {
      withDisabled: true,
    });

    if (!user) {
      if (!this.config.auth.allowSignup) {
        throw new SignUpForbidden();
      }

      if (this.config.auth.requireEmailDomainVerification) {
        // verify domain has MX, SPF, DMARC records
        const [name, domain, ...rest] = email.split('@');
        if (rest.length || !domain) {
          throw new InvalidEmail({ email });
        }
        const [mx, spf, dmarc] = await Promise.allSettled([
          resolveMx(domain).then(t => t.map(mx => mx.exchange).filter(Boolean)),
          resolveTxt(domain).then(t =>
            t.map(([k]) => k).filter(txt => txt.includes('v=spf1'))
          ),
          resolveTxt('_dmarc.' + domain).then(t =>
            t.map(([k]) => k).filter(txt => txt.includes('v=DMARC1'))
          ),
        ]).then(t => t.filter(t => t.status === 'fulfilled').map(t => t.value));
        if (!mx?.length || !spf?.length || !dmarc?.length) {
          throw new InvalidEmail({ email });
        }
        // filter out alias emails
        if (name.includes('+')) {
          throw new InvalidEmail({ email });
        }
      }
    } else if (user.disabled) {
      throw new WrongSignInCredentials({ email });
    }

    const ttlInSec = 30 * 60;
    const token = await this.models.verificationToken.create(
      TokenType.SignIn,
      email,
      ttlInSec
    );

    const otp = this.crypto.otp();
    // TODO(@forehalo): this is a temporary solution, we should not rely on cache to store the otp
    const cacheKey = OTP_CACHE_KEY(otp);
    await this.cache.set(
      cacheKey,
      { token, clientNonce },
      { ttl: ttlInSec * 1000 }
    );

    const magicLink = this.url.link(callbackUrl, {
      token: otp,
      email,
      ...(redirectUrl
        ? {
            redirect_uri: redirectUrl,
          }
        : {}),
    });
    if (env.dev) {
      // make it easier to test in dev mode
      this.logger.debug(`Magic link: ${magicLink}`);
    }

    await this.auth.sendSignInEmail(email, magicLink, otp, !user);

    res.status(HttpStatus.OK).send({
      email: email,
    });
  }

  @Public()
  @Get('/sign-out')
  async signOut(
    @Res() res: Response,
    @Session() session: Session | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    if (!session) {
      res.status(HttpStatus.OK).send({});
      return;
    }

    await this.auth.signOut(session.sessionId, userId);
    await this.auth.refreshCookies(res, session.sessionId);

    res.status(HttpStatus.OK).send({});
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/magic-link')
  async magicLinkSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body()
    { email, token: otp, client_nonce: clientNonce }: MagicLinkCredential
  ) {
    if (!otp || !email) {
      throw new EmailTokenNotFound();
    }

    validators.assertValidEmail(email);

    const cacheKey = OTP_CACHE_KEY(otp);
    const cachedToken = await this.cache.get<{
      token: string;
      clientNonce: string;
    }>(cacheKey);
    let token: string | undefined;
    if (cachedToken && typeof cachedToken === 'object') {
      token = cachedToken.token;
      if (cachedToken.clientNonce && cachedToken.clientNonce !== clientNonce) {
        throw new InvalidAuthState();
      }
    }

    if (!token) {
      throw new InvalidEmailToken();
    }

    const tokenRecord = await this.models.verificationToken.verify(
      TokenType.SignIn,
      token,
      {
        credential: email,
      }
    );

    if (!tokenRecord) {
      throw new InvalidEmailToken();
    }

    const user = await this.models.user.fulfill(email);

    await this.auth.setCookies(req, res, user.id);
    res.send({ id: user.id });
  }

  @UseNamedGuard('version')
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
}
