import { setServers } from 'node:dns/promises';

import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpStatus,
  Param,
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
  getClientVersionFromRequest,
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
import { AuthSessionService } from './auth-session';
import { Public } from './guard';
import {
  AuthPreflightBodySchema,
  AuthSessionExchangeBodySchema,
  AuthSessionRefreshBodySchema,
  isNativeClientRequest,
  MagicLinkBodySchema,
  OpenAppSignInBodySchema,
  SessionIdSchema,
  SignInBodySchema,
} from './input';
import { MagicLinkAuthService } from './magic-link';
import { AuthMethodsService } from './methods';
import { OpenAppAuthService } from './open-app';
import { AuthService, sessionUser } from './service';
import { AuthSessionPrincipal, CurrentUser, Session } from './session';
import { SessionExchangeService } from './session-exchange';
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
    private readonly authSessions: AuthSessionService,
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
  async preflight(@Body() body?: unknown): Promise<PreflightResponse> {
    const input = AuthPreflightBodySchema.safeParse(body);
    if (!input.success) {
      throw new InvalidEmail({ email: 'not provided' });
    }
    validators.assertValidEmail(input.data.email);

    return this.authMethods.loginPreflight(input.data.email);
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
    @Body() body?: unknown
  ) {
    const credential = SignInBodySchema.parse(body);
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
    @Session() session: Session | AuthSessionPrincipal | undefined,
    @Query('user_id') userId: string | undefined
  ) {
    if (!session) {
      res.status(HttpStatus.OK).send({});
      return;
    }

    if (req.authType === 'jwt') {
      const authSessionId = (session as Partial<AuthSessionPrincipal>)
        .authSessionId;
      if (authSessionId) {
        await this.authSessions.revoke(
          authSessionId,
          'current_device_sign_out',
          session.user.id
        );
      }
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
    @Body() body?: unknown
  ) {
    const credential = OpenAppSignInBodySchema.safeParse(body);
    if (!credential.success) throw new InvalidAuthState();
    const identity = await this.openApp.verifySignInCode(credential.data.code);
    const { exchangeCode } = await this.sessionIssuer.issue(req, res, identity);
    res.send({ id: identity.userId, exchangeCode });
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/session/exchange')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async exchangeSession(@Req() req: Request, @Body() body?: unknown) {
    const input = AuthSessionExchangeBodySchema.parse(body);
    return await this.sessionExchange.exchange(req, input.code, {
      installationId: input.installationId,
      platform: input.platform,
      deviceName: input.deviceName,
      appVersion: getClientVersionFromRequest(req) ?? undefined,
    });
  }

  @Public()
  @UseNamedGuard('version')
  @Throttle('default', { limit: 120, ttl: 60_000 })
  @Post('/session/refresh')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async refreshAuthSession(@Req() req: Request, @Body() body?: unknown) {
    const input = AuthSessionRefreshBodySchema.parse(body);
    return await this.sessionExchange.refresh(
      req,
      input.refreshToken,
      getClientVersionFromRequest(req) ?? undefined
    );
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/session/revoke')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async revokeCurrentAuthSession(@Req() req: Request, @Body() body?: unknown) {
    if (!isNativeClientRequest(req)) {
      throw new ActionForbidden();
    }
    const input = AuthSessionRefreshBodySchema.parse(body);
    await this.authSessions.revokeWithRefreshToken(input.refreshToken);
    return {};
  }

  @Get('/sessions')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async listAuthSessions(
    @CurrentUser() user: CurrentUser,
    @Session() session: Session | AuthSessionPrincipal | undefined
  ) {
    const currentId = (session as Partial<AuthSessionPrincipal> | undefined)
      ?.authSessionId;
    return (await this.authSessions.list(user.id)).map(item => ({
      ...item,
      current: item.id === currentId,
    }));
  }

  @Post('/sessions/revoke-all')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async revokeAllAuthSessions(
    @Req() req: Request,
    @CurrentUser() user: CurrentUser,
    @Session() session: Session | AuthSessionPrincipal | undefined
  ) {
    this.assertSessionMutationAuthorized(req, session);
    await this.auth.revokeUserSessions(user.id);
    return {};
  }

  @Delete('/sessions/:id')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  async revokeAuthSession(
    @Req() req: Request,
    @CurrentUser() user: CurrentUser,
    @Session() session: Session | AuthSessionPrincipal | undefined,
    @Param('id') authSessionId: string
  ) {
    const parsedSessionId = SessionIdSchema.safeParse(authSessionId);
    if (!parsedSessionId.success) throw new InvalidAuthState();
    this.assertSessionMutationAuthorized(req, session);
    await this.authSessions.revoke(
      parsedSessionId.data,
      'user_action',
      user.id
    );
    return {};
  }

  @Public()
  @UseNamedGuard('version')
  @Post('/magic-link')
  async magicLinkSignIn(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body?: unknown
  ) {
    const credential = MagicLinkBodySchema.safeParse(body);
    if (!credential.success) throw new EmailTokenNotFound();
    const { email, token: otp, client_nonce: clientNonce } = credential.data;
    if (!email) throw new EmailTokenNotFound();
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

  private assertSessionMutationAuthorized(
    req: Request,
    session: Session | AuthSessionPrincipal | undefined
  ) {
    if (req.authType === 'jwt') {
      const principal = session as Partial<AuthSessionPrincipal> | undefined;
      if (principal?.authSessionId) return;
    } else if (req.authType === 'session') {
      const csrfCookie = getRequestCookie(req, AuthService.csrfCookieName);
      const csrfHeader = req.get('x-affine-csrf-token');
      if (csrfHeader && csrfCookie && csrfCookie === csrfHeader) return;
    }
    throw new ActionForbidden();
  }
}
