import { z } from 'zod';

export const workbenchViewIconNameSchema = z.enum([
  'trash',
  'allDocs',
  'collection',
  'tag',
  'doc', // refers to a doc whose mode is not yet being resolved
  'page',
  'edgeless',
  'journal',
  'attachment',
  'pdf',
  'ai',
]);

export const workbenchViewMetaSchema = z.object({
  id: z.string(),
  path: z
    .object({
      pathname: z.string().optional(),
      hash: z.string().optional(),
      search: z.string().optional(),
    })
    .optional(),
  // todo: move title/module to cached stated
  title: z.string().optional(),
  iconName: workbenchViewIconNameSchema.optional(),
});

export const workbenchMetaSchema = z.object({
  id: z.string(),
  activeViewIndex: z.number(),
  pinned: z.boolean().optional(),
  basename: z.string(),
  views: z.array(workbenchViewMetaSchema),
});

export const tabViewsMetaSchema = z.object({
  activeWorkbenchId: z.string().optional(),
  workbenches: z.array(workbenchMetaSchema).default([]),
});

export const TabViewsMetaKey = 'tabViewsMetaSchema';
export type TabViewsMetaSchema = z.infer<typeof tabViewsMetaSchema>;
export type WorkbenchMeta = z.infer<typeof workbenchMetaSchema>;
export type WorkbenchViewMeta = z.infer<typeof workbenchViewMetaSchema>;
export type WorkbenchViewModule = z.infer<typeof workbenchViewIconNameSchema>;

export const SpellCheckStateSchema = z.object({
  enabled: z.boolean().optional(),
});

export const SpellCheckStateKey = 'spellCheckState' as const;
// oxlint-disable-next-line no-redeclare
export type SpellCheckStateSchema = z.infer<typeof SpellCheckStateSchema>;

export const MenubarStateKey = 'menubarState' as const;
export const MenubarStateSchema = z.object({
  enabled: z.boolean().default(true),
  openOnLeftClick: z.boolean().default(false),
  minimizeToTray: z.boolean().default(false),
  closeToTray: z.boolean().default(false),
  startMinimized: z.boolean().default(false),
});

export type MenubarStateSchema = z.infer<typeof MenubarStateSchema>;

export const MeetingSettingsKey = 'meetingSettings' as const;
export const MeetingSettingsSchema = z.object({
  // global meeting feature control
  enabled: z.boolean().default(false),

  // if false (and enabled = false), show a prompt page
  betaDisclaimerAccepted: z.boolean().default(false),

  // when recording is saved, where to create the recording block
  recordingSavingMode: z.enum(['new-doc', 'journal-today']).default('new-doc'),

  // whether to enable generation of summary for new meeting recordings
  autoTranscriptionSummary: z.boolean().default(true),

  // whether to enable generation of todo list for new meeting recordings
  autoTranscriptionTodo: z.boolean().default(true),

  // recording reactions to new meeting events
  recordingMode: z.enum(['none', 'prompt', 'auto-start']).default('prompt'),
});

export type MeetingSettingsSchema = z.infer<typeof MeetingSettingsSchema>;
