import { tool } from 'ai';
import { z } from 'zod';

import { DocReader } from '../../../core/doc';
import { AccessController } from '../../../core/permission';
import { type PromptService } from '../prompt';
import type { CopilotChatOptions, CopilotProviderFactory } from '../providers';

const CodeEditSchema = z
  .array(
    z.object({
      op: z
        .string()
        .describe(
          'A short description of the change, such as "Bold intro name"'
        ),
      updates: z
        .string()
        .describe(
          'Markdown block fragments that represent the change, including the block_id and type'
        ),
    })
  )
  .describe(
    'An array of independent semantic changes to apply to the document.'
  );

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
  prompt: PromptService,
  getContent: (targetId?: string) => Promise<string | undefined>
) => {
  return tool({
    description: `
Use this tool to propose an edit to a structured Markdown document with identifiable blocks. 
Each block begins with a comment like <!-- block_id=... -->, and represents a unit of editable content such as a heading, paragraph, list, or code snippet.
This will be read by a less intelligent model, which will quickly apply the edit. You should make it clear what the edit is, while also minimizing the unchanged code you write.

If you receive a markdown without block_id comments, you should call \`doc_read\` tool to get the content.

Your task is to return a list of block-level changes needed to fulfill the user's intent. **Each change in code_edit must be completely independent: each code_edit entry should only perform a single, isolated change, and must not include the effects of other changes. For example, the updates for a delete operation should only show the context related to the deletion, and must not include any content modified by other operations (such as bolding or insertion). This ensures that each change can be applied independently and in any order.**

Each change should correspond to a specific user instruction and be represented by one of the following operations:

replace: Replace the content of a block with updated Markdown.

delete: Remove a block entirely.

insert: Add a new block, and specify its block_id and content.

Important Instructions:
- Use the existing block structure as-is. Do not reformat or reorder blocks unless explicitly asked.
- When inserting, follow the same format as a replacement, but ensure the new block_id does not conflict with existing IDs.
- When replacing content, always keep the original block_id unchanged.
- When deleting content, only use the format <!-- delete block_id=xxx -->, and only for valid block_id present in the original <code> content.
- Each top-level list item should be a block. Like this:
  \`\`\`markdown
  <!-- block_id=001 flavour=affine:list -->
  * Item 1
    * SubItem 1
  <!-- block_id=002 flavour=affine:list -->
  1. Item 1
    1. SubItem 1
  \`\`\`
- Your task is to return a list of block-level changes needed to fulfill the user's intent. 
- **Each change in code_edit must be completely independent: each code_edit entry should only perform a single, isolated change, and must not include the effects of other changes. For example, the updates for a delete operation should only show the context related to the deletion, and must not include any content modified by other operations (such as bolding or insertion). This ensures that each change can be applied independently and in any order.**

Original Content:
\`\`\`markdown
<!-- block_id=001 flavour=paragraph -->
# Andriy Shevchenko

<!-- block_id=002 flavour=paragraph -->
## Player Profile

<!-- block_id=003 flavour=paragraph -->
Andriy Shevchenko is a legendary Ukrainian striker, best known for his time at AC Milan and Dynamo Kyiv. He won the Ballon d'Or in 2004.

<!-- block_id=004 flavour=paragraph -->
## Career Overview

<!-- block_id=005 flavour=list -->
- Born in 1976 in Ukraine.
<!-- block_id=006 flavour=list -->
- Rose to fame at Dynamo Kyiv in the 1990s.
<!-- block_id=007 flavour=list -->
- Starred at AC Milan (1999–2006), scoring over 170 goals.
<!-- block_id=008 flavour=list -->
- Played for Chelsea (2006–2009) before returning to Kyiv.
<!-- block_id=009 flavour=list -->
- Coached Ukraine national team, reaching Euro 2020 quarter-finals.
\`\`\`

User Request：
\`\`\`
Bold the player’s name in the intro, add a summary section at the end, and remove the career overview.
\`\`\`

Example response:
\`\`\`json
[
  {
    "op": "Bold the player's name in the introduction",
    "updates": "
      <!-- block_id=003 flavour=paragraph -->
      **Andriy Shevchenko** is a legendary Ukrainian striker, best known for his time at AC Milan and Dynamo Kyiv. He won the Ballon d'Or in 2004.
    "
  },
  {
    "op": "Add a summary section at the end",
    "updates": "
      <!-- block_id=new-abc123 flavour=paragraph -->
      ## Summary
      <!-- block_id=new-def456 flavour=paragraph -->
      Shevchenko is celebrated as one of the greatest Ukrainian footballers of all time. Known for his composure, strength, and goal-scoring instinct, he left a lasting legacy both on and off the pitch.
    "
  },
  {
    "op": "Delete the career overview section",
    "updates": "
      <!-- delete block_id=004 -->
      <!-- delete block_id=005 -->
      <!-- delete block_id=006 -->
      <!-- delete block_id=007 -->
      <!-- delete block_id=008 -->
      <!-- delete block_id=009 -->
    "
  }
]
\`\`\`
You should specify the following arguments before the others: [doc_id], [origin_content]

    `,
    inputSchema: z.object({
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

      code_edit: z.preprocess(val => {
        // BACKGROUND: LLM sometimes returns a JSON string instead of an array.
        if (typeof val === 'string') {
          return JSON.parse(val);
        }
        return val;
      }, CodeEditSchema) as unknown as typeof CodeEditSchema,
    }),
    execute: async ({ doc_id, origin_content, code_edit }) => {
      try {
        const applyPrompt = await prompt.get('Apply Updates');
        if (!applyPrompt) {
          return 'Prompt not found';
        }
        const model = applyPrompt.model;
        const provider = await factory.getProviderByModel(model);
        if (!provider) {
          return 'Editing docs is not supported';
        }

        const content = origin_content || (await getContent(doc_id));
        if (!content) {
          return 'Doc not found or doc is empty';
        }

        const changedContents = await Promise.all(
          code_edit.map(async edit => {
            return await provider.text({ modelId: model }, [
              ...applyPrompt.finish({
                content,
                op: edit.op,
                updates: edit.updates,
              }),
            ]);
          })
        );

        return {
          result: changedContents.map((changedContent, index) => ({
            op: code_edit[index].op,
            updates: code_edit[index].updates,
            originalContent: content,
            changedContent,
          })),
        };
      } catch {
        return 'Failed to apply edit to the doc';
      }
    },
  });
};
