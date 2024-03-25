import { builtInTemplates } from '@affine/templates/edgeless';
import type { TemplateManager } from '@blocksuite/blocks';
import { EdgelessTemplatePanel } from '@blocksuite/blocks';

EdgelessTemplatePanel.templates.extend(builtInTemplates as TemplateManager);
