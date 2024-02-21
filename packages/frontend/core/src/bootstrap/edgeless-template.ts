import { builtInTemplates } from '@affine/templates/edgeless';
import {
  EdgelessTemplatePanel,
  type TemplateManager,
} from '@blocksuite/blocks';

EdgelessTemplatePanel.templates.extend(builtInTemplates as TemplateManager);
