import { setServers } from 'node:dns/promises';

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
  ActionForbidden,
  Config,
  EmailTokenNotFound,
  getRequestCookie,
  InvalidAuthState,
  InvalidEmail,
  Throttle,
  UseNamedGuard,
  WrongSignInCredentials,
} from '../../base';
import { Models } from '../../models';
import { validators } from '../utils/validators';
import { getAbuseRequestSource } from '../workspaces/abuse';
import { Public } from './guard';
import { MagicLinkAuthService } from './magic-link';
import { AuthMethodsService } from './methods';
import { SessionExchangeService } from './native-exchange';
import { OpenAppAuthService } from './open-app';
import { AuthService, sessionUser } from './service';
import { CurrentUser, Session } from './session';
import { SessionIssuer } from './session-issuer';

interface PreflightResponse {
  registered: boolean;
  methods: {
    password: { available: boolean };
    magicLink: { available: boolean };
    oauth: { available: boolean; providers: string[] };
    passkey: { available: boolean; discoverable: boolean };
  };
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

interface OpenAppSignInCredential {
  code: string;
}

interface NativeSessionExchangeCredential {
  code: string;
}

type SignInResponse = CurrentUser & {
  exchangeCode?: string;
};

@Throttle('strict')
@Controller('/api/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionIssuer: SessionIssuer,
    private readonly magicLink: MagicLinkAuthService,
    private readonly openApp: OpenAppAuthService,
    private readonly authMethods: AuthMethodsService,
    private readonly sessionExchange: SessionExchangeService,
    private readonly models: Models,
    private readonly config: Config
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

    return this.authMethods.loginPreflight(params.email);
  }

  @UseNamedGuard('version')
  @Get('/methods')
  async boundMethods(@CurrentUser() user: CurrentUser) {
    return this.authMethods.boundMethods(user.id);
  }

  @Public()
  @UseNamedGuard('version', 'captcha')
  @Post('/sign-in')
  @Header('content-type', 'application/json')
  async signIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: SignInCredential
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
    const identity = await this.auth.verifyPassword(email, password);

    const { exchangeCode } = await this.sessionIssuer.issue(req, res, identity);
    const user = await this.models.user.get(identity.userId);
    if (!user) {
      throw new WrongSignInCredentials({ email });
    }
    res.status(HttpStatus.OK).send({
      ...sessionUser(user),
      exchangeCode,
    } satisfies SignInResponse);
  }

  async sendMagicLink(
    req: Request,
    res: Response,
    email: string,
    callbackUrl = '/magic-link',
    clientNonce?: string
  ) {
    const payload = await this.magicLink.send(email, callbackUrl, clientNonce, {
      source: getAbuseRequestSource(req, this.config),
    });
    res.status(HttpStatus.OK).send(payload);
  }

  @Post('/sign-out')
  async signOut(
    @Req() req: Request,
    @Res() res: Response,
    @Session() session: Session | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    if (!session) {
      res.status(HttpStatus.OK).send({});
      return;
    }

    if (req.authType === 'jwt') {
      await this.auth.signOut(session.sessionId, session.user.id);
      res.status(HttpStatus.OK).send({});
      return;
    }

    const csrfCookie = getRequestCookie(req, AuthService.csrfCookieName);
    const csrfHeader = req.get('x-affine-csrf-token');
    if (!csrfHeader || !csrfCookie || csrfCookie !== csrfHeader) {
      throw new ActionForbidden();
    }

    await this.auth.signOut(session.sessionId, userId);
    await this.auth.refreshCookies(res, session.sessionId);

    res.status(HttpStatus.OK).send({});
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/open-app/sign-in-code')
  async openAppSignInCode(@CurrentUser() user?: CurrentUser) {
    if (!user) throw new ActionForbidden();
    const code = await this.openApp.createSignInCode(user);
    return { code };
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/open-app/sign-in')
  async openAppSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() credential: OpenAppSignInCredential
  ) {
    if (!credential?.code) throw new InvalidAuthState();
    const identity = await this.openApp.verifySignInCode(credential.code);
    const { exchangeCode } = await this.sessionIssuer.issue(req, res, identity);
    res.send({ id: identity.userId, exchangeCode });
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/native/exchange')
  async exchangeSession(
    @Req() req: Request,
    @Body() credential: NativeSessionExchangeCredential
  ) {
    if (!credential?.code) throw new InvalidAuthState();
    return await this.sessionExchange.exchange(req, credential.code);
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
    if (!otp || !email) throw new EmailTokenNotFound();
    validators.assertValidEmail(email);
    const identity = await this.magicLink.verify(email, otp, clientNonce);
    const { exchangeCode } = await this.sessionIssuer.issue(req, res, identity);
    res.send({ id: identity.userId, exchangeCode });
  }

  @UseNamedGuard('version')
  @Throttle('default', { limit: 1200 })
  @Public()
  @Get('/session')
  @Header('Cache-Control', 'no-store')
  async currentSessionUser(@CurrentUser() user?: CurrentUser) {
    return { user };
  }
}
