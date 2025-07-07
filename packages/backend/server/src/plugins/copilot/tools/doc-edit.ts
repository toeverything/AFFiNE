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
    const content = await doc.getDocMarkdown(options.workspace, docId, true);
    return content?.markdown.trim() || undefined;
  };
  return getDocContent;
};

export const createDocEditTool = (
  factory: CopilotProviderFactory,
  getContent: (targetId?: string) => Promise<string | undefined>
) => {
  return tool({
    description: `
Use this tool to propose an edit to a structured Markdown document with identifiable blocks. Each block begins with a comment like <!-- block_id=... -->, and represents a unit of editable content such as a heading, paragraph, list, or code snippet.
This will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

Your task is to return a list of block-level changes needed to fulfill the user's intent. Each change should correspond to a specific user instruction and be represented by one of the following operations:

replace: Replace the content of a block with updated Markdown.

delete: Remove a block entirely.

insert: Add a new block, and specify its block_id and content.

Important Instructions:
- Use the existing block structure as-is. Do not reformat or reorder blocks unless explicitly asked.
- Always preserve block_id and type in your replacements.
- When replacing a block, use the full new block including <!-- block_id=... type=... --> and the updated content.
- When inserting, follow the same format as a replacement, but ensure the new block_id does not conflict with existing IDs.
- Each list item should be a block.
- Use <!-- existing blocks ... --> for unchanged sections.
- If you plan on deleting a section, you must provide surrounding context to indicate the deletion.

Example Input Document:
\`\`\`md
<!-- block_id=block-001 type=h1 -->
# My Holiday Plan

<!-- block_id=block-002 type=paragraph -->
I plan to travel to Paris, France, where I will visit the Eiffel Tower, the Louvre, and the Champs-Élysées.

<!-- block_id=block-003 type=paragraph -->
I love Paris.

<!-- block_id=block-004 type=paragraph -->
This plan has been brewing for a long time, but I always postponed it because I was too busy with work.

<!-- block_id=block-005 type=paragraph -->
- Book flight tickets
- Reserve a hotel
- Prepare visa documents
- Plan the itinerary

<!-- block_id=block-006 type=paragraph -->
Additionally, I plan to learn some basic French to make communication easier during the trip.
\`\`\`

Example User Request:

\`\`\`
Translate the trip steps to Chinese, remove the reason for the delay, and bold the final paragraph.
\`\`\`

Expected Output:

\`\`\`md
<!-- existing blocks ... -->

<!-- block_id=block-002 type=paragraph -->
I plan to travel to Paris, France, where I will visit the Eiffel Tower, the Louvre, and the Champs-Élysées.

<!-- block_id=block-003 type=paragraph -->
I love Paris.

<!-- delete block-004 -->

<!-- block_id=block-005 type=paragraph -->
- 订机票
- 预定酒店
- 准备签证材料
- 规划行程

<!-- existing blocks ... -->

<!-- block_id=block-006 type=paragraph -->
**Additionally, I plan to learn some basic French to make communication easier during the trip.**
\`\`\`
You should specify the following arguments before the others: [doc_id], [origin_content]

    `,
    parameters: z.object({
      doc_id: z
        .string()
        .describe(
          'The unique ID of the document being edited. Required when editing an existing document stored in the system. If you are editing ad-hoc Markdown content instead, leave this empty and use origin_content.'
        )
        .optional(),

      origin_content: z
        .string()
        .describe(
          'The full original Markdown content, including all block_id comments (e.g., <!-- block_id=block-001 type=paragraph -->). Required when doc_id is not provided. This content will be parsed into discrete editable blocks.'
        )
        .optional(),

      instructions: z
        .string()
        .describe(
          'A short, first-person description of the intended edit, clearly summarizing what I will change. For example: "I will translate the steps into English and delete the paragraph explaining the delay." This helps the downstream system understand the purpose of the changes.'
        ),

      code_edit: z
        .string()
        .describe(
          'Specify only the necessary Markdown block-level changes. Return a list of inserted, replaced, or deleted blocks. Each block must start with its <!-- block_id=... type=... --> comment. Use <!-- existing blocks ... --> for unchanged sections.If you plan on deleting a section, you must provide surrounding context to indicate the deletion.'
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
