import { Global } from '@nestjs/common';

import { Plugin } from '../registry';
import { GCloudMetrics } from './metrics';

@Global()
@Plugin({
  name: 'gcloud',
  imports: [GCloudMetrics],
})
export class GCloudModule {}
