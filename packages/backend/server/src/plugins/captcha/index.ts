import { AuthModule } from '../../core/auth';
import { ServerFeature } from '../../core/config';
import { Plugin } from '../registry';
import { CaptchaService } from './service';

@Plugin({
  name: 'captcha',
  imports: [AuthModule],
  providers: [CaptchaService],
  controllers: [],
  contributesTo: ServerFeature.Captcha,
  if: config => !!config.plugins.captcha,
})
export class CaptchaModule {}

export type { CaptchaConfig } from './types';
