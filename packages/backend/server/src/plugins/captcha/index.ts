import { AuthModule } from '../../core/auth';
import { ServerFeature } from '../../core/config';
import { Plugin } from '../registry';
import { CaptchaController } from './controller';
import { CaptchaGuardProvider } from './guard';
import { CaptchaService } from './service';

@Plugin({
  name: 'captcha',
  imports: [AuthModule],
  providers: [CaptchaService, CaptchaGuardProvider],
  controllers: [CaptchaController],
  contributesTo: ServerFeature.Captcha,
  requires: ['plugins.captcha.turnstile.secret'],
})
export class CaptchaModule {}

export type { CaptchaConfig } from './types';
