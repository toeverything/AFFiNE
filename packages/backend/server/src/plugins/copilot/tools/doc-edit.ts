import { tool } from 'ai';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import type { CopilotChatOptions, CopilotProviderFactory } from '../providers';

export const buildContentGetter = (ac: AccessController, doc: DocReader) => {
  const getDocContent = async (options: CopilotChatOptions, docId?: string) => {
    if (!options || !docId || !options.user || !options.workspace) {
      return undefined;
    }
    const canAccess = await ac
      .user(options.user)
      .workspace(options.workspace)
      .doc(docId)
      .can('Doc.Read');
    if (!canAccess) return undefined;
    const content = await doc.getFullDocContent(options.workspace, docId);
    return content?.summary.trim() || undefined;
  };
  return getDocContent;
};

export const createDocEditTool = (
  factory: CopilotProviderFactory,
  getContent: (targetId?: string) => Promise<string | undefined>
) => {
  return tool({
    description:
      "Use this tool to propose an edit to an existing doc.\n\nThis will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.\nWhen writing the edit, you should specify each edit in sequence, with the special comment // ... existing code ... to represent unchanged code in between edited lines.\n\nYou should bias towards repeating as few lines of the original doc as possible to convey the change.\nEach edit should contain sufficient context of unchanged lines around the code you're editing to resolve ambiguity.\nIf you plan on deleting a section, you must provide surrounding context to indicate the deletion.\nDO NOT omit spans of pre-existing code without using the // ... existing code ... comment to indicate its absence.\n\nYou should specify the following arguments before the others: [target_id], [origin_content]",
    parameters: z.object({
      doc_id: z
        .string()
        .describe(
          'The target doc to modify. Always specify the target doc as the first argument. If the content to be modified does not include a specific document, the full text should be provided through origin_content.'
        )
        .optional(),
      origin_content: z
        .string()
        .describe(
          'The original content of the doc you are editing. If the original text is from a specific document, the target_id should be provided instead of this parameter.'
        )
        .optional(),
      instructions: z
        .string()
        .describe(
          'A single sentence instruction describing what you are going to do for the sketched edit. This is used to assist the less intelligent model in applying the edit. Please use the first person to describe what you are going to do. Dont repeat what you have said previously in normal messages. And use it to disambiguate uncertainty in the edit.'
        ),
      code_edit: z
        .string()
        .describe(
          "Specify ONLY the precise lines of code that you wish to edit. NEVER specify or write out unchanged code. Instead, represent all unchanged code using the comment of the language you're editing in - example: // ... existing code ..."
        ),
    }),
    execute: async ({ doc_id, origin_content, code_edit }) => {
      try {
        const provider = await factory.getProviderByModel('morph-v2');
        if (!provider) {
          return 'Editing docs is not supported';
        }

        const content = origin_content || (await getContent(doc_id));
        if (!content) {
          return 'Doc not found or doc is empty';
        }
        const result = await provider.text({ modelId: 'morph-v2' }, [
          {
            role: 'user',
            content: `<code>${content}</code>\n<update>${code_edit}</update>`,
          },
        ]);
        return { result };
      } catch {
        return 'Failed to apply edit to the doc';
      }
    },
  });
};
