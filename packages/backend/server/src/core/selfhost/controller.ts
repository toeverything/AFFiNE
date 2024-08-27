import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';

import {
  ActionForbidden,
  EventEmitter,
  InternalServerError,
  Mutex,
  PasswordRequired,
} from '../../fundamentals';
import { AuthService, Public } from '../auth';
import { ServerService } from '../config';
import { UserService } from '../user/service';

interface CreateUserInput {
  email: string;
  password: string;
}

@Controller('/api/setup')
export class CustomSetupController {
  constructor(
    private readonly user: UserService,
    private readonly auth: AuthService,
    private readonly event: EventEmitter,
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
    if (!input.password) {
      throw new PasswordRequired();
    }

    await using lock = await this.mutex.lock('createFirstAdmin');

    if (!lock) {
      throw new InternalServerError();
    }

    if (await this.server.initialized()) {
      throw new ActionForbidden('First user already created');
    }

    const user = await this.user.createUser({
      email: input.email,
      password: input.password,
      registered: true,
    });

    try {
      await this.event.emitAsync('user.admin.created', user);
      await this.auth.setCookies(req, res, user.id);
      res.send({ id: user.id, email: user.email, name: user.name });
    } catch (e) {
      await this.user.deleteUser(user.id);
      throw e;
    }
  }
}
