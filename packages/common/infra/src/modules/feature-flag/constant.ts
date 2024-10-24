import type { FlagInfo } from './types';

const isNotStableBuild = BUILD_CONFIG.appBuildType !== 'stable';
const isDesktopEnvironment = BUILD_CONFIG.isElectron;
const isCanaryBuild = BUILD_CONFIG.appBuildType === 'canary';

export const AFFINE_FLAGS = {
  enable_ai: {
    category: 'affine',
    displayName: 'Enable AI',
    description: 'Enable or disable ALL AI features.',
    hide: true,
    configurable: true,
    defaultState: true,
  },
  enable_database_full_width: {
    category: 'blocksuite',
    bsFlag: 'enable_database_full_width',
    displayName: 'Database Full Width',
    description: 'The database will be displayed in full-width mode.',
    configurable: isNotStableBuild,
  },
  enable_database_attachment_note: {
    category: 'blocksuite',
    bsFlag: 'enable_database_attachment_note',
    displayName: 'Database Attachment Note',
    description: 'Allows adding notes to database attachments.',
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
  enable_mind_map_import: {
    category: 'blocksuite',
    bsFlag: 'enable_mind_map_import',
    displayName: 'Mind Map Import',
    description: 'Enables mind map import.',
    configurable: false,
    defaultState: true,
  },
  enable_multi_view: {
    category: 'affine',
    displayName: 'Split View',
    description:
      'The Split View feature enables you to divide your tab into multiple sections for simultaneous viewing and editing of different documents.',
    feedbackType: 'discord',
    feedbackLink:
      'https://discord.com/channels/959027316334407691/1280009690004324405',
    configurable: isDesktopEnvironment,
    defaultState: isCanaryBuild,
  },
  enable_emoji_folder_icon: {
    category: 'affine',
    displayName: 'Emoji Folder Icon',
    description:
      'Once enabled, you can use an emoji as the folder icon. When the first character of the folder name is an emoji, it will be extracted and used as its icon.',
    feedbackType: 'discord',
    feedbackLink:
      'https://discord.com/channels/959027316334407691/1280014319865696351/1280014319865696351',
    configurable: true,
    defaultState: true,
  },
  enable_emoji_doc_icon: {
    category: 'affine',
    displayName: 'Emoji Doc Icon',
    description:
      'Once enabled, you can use an emoji as the page icon. When the first character of the folder name is an emoji, it will be extracted and used as its icon.',
    feedbackType: 'discord',
    feedbackLink:
      'https://discord.com/channels/959027316334407691/1280014319865696351',
    configurable: true,
    defaultState: true,
  },
  enable_editor_settings: {
    category: 'affine',
    displayName: 'Editor Settings',
    description: 'Enables editor settings.',
    configurable: false,
    defaultState: true,
  },
  enable_offline_mode: {
    category: 'affine',
    displayName: 'Offline Mode',
    description:
      'Stop Connecting to the Internet. Even with AFFiNE Cloud, enabling this toggle stops internet connection and keeps everything local, but syncing will be disabled.',
    configurable: isDesktopEnvironment,
    defaultState: false,
  },
  enable_theme_editor: {
    category: 'affine',
    displayName: 'Theme Editor',
    description: 'Enables theme editor.',
    configurable: isCanaryBuild,
    defaultState: isCanaryBuild,
  },
  enable_local_workspace: {
    category: 'affine',
    displayName: 'Allow create local workspace',
    description: 'Allow create local workspace.',
    configurable: isCanaryBuild,
    defaultState: isDesktopEnvironment || isCanaryBuild,
  },
  enable_advanced_block_visibility: {
    category: 'blocksuite',
    bsFlag: 'enable_advanced_block_visibility',
    displayName: 'Advanced block visibility control',
    description:
      'To provide detailed control over which edgeless blocks are visible in page mode.',
    configurable: true,
    defaultState: false,
  },
} satisfies { [key in string]: FlagInfo };

export type AFFINE_FLAGS = typeof AFFINE_FLAGS;
