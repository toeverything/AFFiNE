import { join } from 'node:path';

import { resourcesPath } from '../../shared/utils';

export const icons = {
  record: join(resourcesPath, 'icons/waveform.png'),
  recording: join(resourcesPath, 'icons/waveform-recording.png'),
  tray: join(resourcesPath, 'icons/tray-icon.png'),
  journal: join(resourcesPath, 'icons/journal-today.png'),
  page: join(resourcesPath, 'icons/doc-page.png'),
  edgeless: join(resourcesPath, 'icons/doc-edgeless.png'),
  monitor: join(resourcesPath, 'icons/monitor.png'),
};
