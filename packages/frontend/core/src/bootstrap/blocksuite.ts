import { builtInTemplates as builtInEdgelessTemplates } from '@affine/templates/edgeless';
import { builtInTemplates as builtInStickersTemplates } from '@affine/templates/stickers';
import type { TemplateManager } from '@blocksuite/blocks';
import { EdgelessTemplatePanel } from '@blocksuite/blocks';

export function setupBlocksuite() {
  EdgelessTemplatePanel.templates.extend(
    builtInStickersTemplates as TemplateManager
  );
  EdgelessTemplatePanel.templates.extend(
    builtInEdgelessTemplates as TemplateManager
  );
}
