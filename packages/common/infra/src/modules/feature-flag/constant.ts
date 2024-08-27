import type { FlagInfo } from './types';

const isNotStableBuild = runtimeConfig.appBuildType !== 'stable';
const isDesktopEnvironment = environment.isDesktop;
const isCanaryBuild = runtimeConfig.appBuildType === 'canary';

export const AFFINE_FLAGS = {
  enable_database_attachment_note: {
    category: 'blocksuite',
    bsFlag: 'enable_database_attachment_note',
    displayName: 'Database Attachment Note',
    description: 'Allows adding notes to database attachments.',
    configurable: isNotStableBuild,
  },
  enable_database_statistics: {
    category: 'blocksuite',
    bsFlag: 'enable_database_statistics',
    displayName: 'Database Block Statistics',
    description: 'Shows statistics for database blocks.',
    configurable: isNotStableBuild,
  },
  enable_block_query: {
    category: 'blocksuite',
    bsFlag: 'enable_block_query',
    displayName: 'Todo Block Query',
    description: 'Enables querying of todo blocks.',
    configurable: isNotStableBuild,
  },
  enable_synced_doc_block: {
    category: 'blocksuite',
    bsFlag: 'enable_synced_doc_block',
    displayName: 'Synced Doc Block',
    description: 'Enables syncing of doc blocks.',
    configurable: false,
    defaultState: true,
  },
  enable_edgeless_text: {
    category: 'blocksuite',
    bsFlag: 'enable_edgeless_text',
    displayName: 'Edgeless Text',
    description: 'Enables edgeless text blocks.',
    configurable: false,
    defaultState: true,
  },
  enable_color_picker: {
    category: 'blocksuite',
    bsFlag: 'enable_color_picker',
    displayName: 'Color Picker',
    description: 'Enables color picker blocks.',
    configurable: false,
    defaultState: true,
  },
  enable_ai_chat_block: {
    category: 'blocksuite',
    bsFlag: 'enable_ai_chat_block',
    displayName: 'AI Chat Block',
    description: 'Enables AI chat blocks.',
    configurable: false,
    defaultState: true,
  },
  enable_ai_onboarding: {
    category: 'blocksuite',
    bsFlag: 'enable_ai_onboarding',
    displayName: 'AI Onboarding',
    description: 'Enables AI onboarding.',
    configurable: false,
    defaultState: true,
  },
  enable_expand_database_block: {
    category: 'blocksuite',
    bsFlag: 'enable_expand_database_block',
    displayName: 'Expand Database Block',
    description: 'Enables expanding of database blocks.',
    configurable: false,
    defaultState: false,
  },
  enable_multi_view: {
    category: 'affine',
    displayName: 'Split View',
    description:
      'The Split View feature in AFFiNE allows users to divide their workspace into multiple sections, enabling simultaneous viewing and editing of different documents.The Split View feature in AFFiNE allows users to divide their workspace into multiple sections, enabling simultaneous viewing and editing of different documents.',
    feedbackType: 'discord',
    configurable: isDesktopEnvironment,
    defaultState: isCanaryBuild,
  },
  enable_emoji_folder_icon: {
    category: 'affine',
    displayName: 'Emoji Folder Icon',
    description:
      'Once enabled, you can use an emoji as the folder icon. When the first character of the folder name is an emoji, it will be extracted and used as its icon.',
    configurable: true,
    defaultState: false,
  },
  enable_editor_settings: {
    category: 'affine',
    displayName: 'Editor Settings',
    description: 'Enables editor settings.',
    configurable: isCanaryBuild,
    defaultState: false,
  },
} satisfies { [key in string]: FlagInfo };

export type AFFINE_FLAGS = typeof AFFINE_FLAGS;
