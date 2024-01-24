import type { AvailablePlugins } from '../fundamentals/config';
import { PaymentModule } from './payment';
import { RedisModule } from './redis';

export const pluginsMap = new Map<AvailablePlugins, AFFiNEModule>([
  ['payment', PaymentModule],
  ['redis', RedisModule],
]);
