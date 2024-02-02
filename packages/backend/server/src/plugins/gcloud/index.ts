import { Global } from '@nestjs/common';

import { OptionalModule } from '../../fundamentals';
import { GCloudMetrics } from './metrics';

@Global()
@OptionalModule({
  imports: [GCloudMetrics],
})
export class GCloudModule {}
