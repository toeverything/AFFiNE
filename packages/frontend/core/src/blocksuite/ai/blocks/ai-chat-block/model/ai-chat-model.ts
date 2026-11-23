import {
  type GfxCommonBlockProps,
  GfxCompatible,
} from '@blocksuite/affine/std/gfx';
import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/affine/store';

type AIChatProps = {
  messages: string; // JSON string of ChatMessage[]
  sessionId: string; // forked session id
  rootWorkspaceId: string; // workspace id of root chat session
  rootDocId: string; // doc id of root chat session
} & Omit<GfxCommonBlockProps, 'rotate'>;

export const AIChatBlockSchema = defineBlockSchema({
  flavour: 'affine:embed-ai-chat',
  props: (): AIChatProps => ({
    xywh: '[0,0,0,0]',
    index: 'a0',
    lockedBySelf: false,
    scale: 1,
    messages: '',
    sessionId: '',
    rootWorkspaceId: '',
    rootDocId: '',
  }),
  metadata: {
    version: 1,
    role: 'content',
    children: [],
  },
  toModel: () => {
    return new AIChatBlockModel();
  },
});

export const AIChatBlockSchemaExtension =
  BlockSchemaExtension(AIChatBlockSchema);

export class AIChatBlockModel extends GfxCompatible<AIChatProps>(BlockModel) {}
