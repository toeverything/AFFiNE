import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  Config,
  InternalServerError,
  Mutex,
  PasswordRequired,
  UseNamedGuard,
} from '../../base';
import { Models } from '../../models';
import { AuthService, Public } from '../auth';
import { ServerService } from '../config';
import { validators } from '../utils/validators';

interface CreateUserInput {
  name?: string;
  email: string;
  password: string;
}

@UseNamedGuard('selfhost')
@Controller('/api/setup')
export class CustomSetupController {
  constructor(
    private readonly config: Config,
    private readonly models: Models,
    private readonly auth: AuthService,
    private readonly mutex: Mutex,
    private readonly server: ServerService
  ) {}

  @Public()
  @Post('/create-admin-user')
  async createAdmin(
    @Req() req: Request,
    @Res() res: Response,
    @Body() input: CreateUserInput
  ) {
    if (await this.server.initialized()) {
      throw new ActionForbidden('First user already created');
    }

    validators.assertValidEmail(input.email);

    if (!input.password) {
      throw new PasswordRequired();
    }

    validators.assertValidPassword(
      input.password,
      this.config.auth.passwordRequirements
    );

    await using lock = await this.mutex.acquire('createFirstAdmin');

    if (!lock) {
      throw new InternalServerError();
    }
    const user = await this.models.user.create({
      name: input.name || undefined,
      email: input.email,
      password: input.password,
      registered: true,
    });

    try {
      await this.models.userFeature.add(
        user.id,
        'administrator',
        'selfhost setup'
      );

      await this.auth.setCookies(req, res, user.id);
      res.send({ id: user.id, email: user.email, name: user.name });
    } catch (e) {
      await this.models.user.delete(user.id);
      throw e;
    }
  }
}
