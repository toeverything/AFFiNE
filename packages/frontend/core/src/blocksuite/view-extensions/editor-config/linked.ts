import { AtMenuConfigService } from '@affine/core/modules/at-menu-config/services';
import type { LinkedWidgetConfig } from '@blocksuite/affine/widgets/linked-doc';
import { type FrameworkProvider } from '@toeverything/infra';

export function createLinkedWidgetConfig(
  framework: FrameworkProvider
): Partial<LinkedWidgetConfig> | undefined {
  const service = framework.getOptional(AtMenuConfigService);
  if (!service) return;
  return service.getConfig();
}
