import type { FlagInfo } from './types';

// const isNotStableBuild = BUILD_CONFIG.appBuildType !== 'stable';
const isCanaryBuild = BUILD_CONFIG.appBuildType === 'canary';
const isMobile = BUILD_CONFIG.isMobileEdition;
const isIOS = BUILD_CONFIG.isIOS;

export const AFFINE_FLAGS = {
  enable_ai: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai.description',
    hide: true,
    configurable: true,
    defaultState: true,
  },
  enable_ai_network_search: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai-network-search.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai-network-search.description',
    hide: true,
    configurable: false,
    defaultState: true,
  },
  enable_ai_playground: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai-model-switch.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai-model-switch.description',
    configurable: isCanaryBuild,
    defaultState: isCanaryBuild,
  },
  enable_edgeless_text: {
    category: 'blocksuite',
    bsFlag: 'enable_edgeless_text',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-edgeless-text.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-edgeless-text.description',
    configurable: false,
    defaultState: true,
  },
  enable_color_picker: {
    category: 'blocksuite',
    bsFlag: 'enable_color_picker',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-color-picker.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-color-picker.description',
    configurable: false,
    defaultState: true,
  },
  enable_ai_chat_block: {
    category: 'blocksuite',
    bsFlag: 'enable_ai_chat_block',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai-chat-block.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai-chat-block.description',
    configurable: false,
    defaultState: true,
  },
  enable_ai_onboarding: {
    category: 'blocksuite',
    bsFlag: 'enable_ai_onboarding',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai-onboarding.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai-onboarding.description',
    configurable: false,
    defaultState: true,
  },
  enable_mind_map_import: {
    category: 'blocksuite',
    bsFlag: 'enable_mind_map_import',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-mind-map-import.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-mind-map-import.description',
    configurable: false,
    defaultState: true,
  },
  enable_block_meta: {
    category: 'blocksuite',
    bsFlag: 'enable_block_meta',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-block-meta.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-block-meta.description',
    configurable: isCanaryBuild,
    defaultState: true,
  },

  enable_emoji_folder_icon: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-emoji-folder-icon.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-emoji-folder-icon.description',

    feedbackType: 'discord',
    feedbackLink:
      'https://discord.com/channels/959027316334407691/1280014319865696351/1280014319865696351',
    configurable: true,
    defaultState: true,
  },
  enable_emoji_doc_icon: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-emoji-doc-icon.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-emoji-doc-icon.description',
    feedbackType: 'discord',
    feedbackLink:
      'https://discord.com/channels/959027316334407691/1280014319865696351',
    configurable: true,
    defaultState: true,
  },
  enable_editor_settings: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-editor-settings.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-editor-settings.description',
    configurable: false,
    defaultState: true,
  },
  enable_theme_editor: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-theme-editor.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-theme-editor.description',
    configurable: isCanaryBuild && !isMobile,
    defaultState: isCanaryBuild,
  },
  enable_advanced_block_visibility: {
    category: 'blocksuite',
    bsFlag: 'enable_advanced_block_visibility',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-advanced-block-visibility.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-advanced-block-visibility.description',
    configurable: true,
    defaultState: false,
  },
  enable_mobile_keyboard_toolbar: {
    category: 'blocksuite',
    bsFlag: 'enable_mobile_keyboard_toolbar',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-mobile-keyboard-toolbar.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-mobile-keyboard-toolbar.description',
    configurable: false,
    defaultState: isMobile,
  },
  enable_mobile_linked_doc_menu: {
    category: 'blocksuite',
    bsFlag: 'enable_mobile_linked_doc_menu',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-mobile-linked-doc-menu.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-mobile-linked-doc-menu.description',
    configurable: false,
    defaultState: isMobile,
  },
  enable_mobile_edgeless_editing: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-mobile-edgeless-editing.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-mobile-edgeless-editing.description',
    configurable: isMobile,
    defaultState: false,
  },
  enable_pdf_embed_preview: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-pdf-embed-preview.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-pdf-embed-preview.description',
    configurable: !isMobile,
    defaultState: true,
  },
  enable_editor_rtl: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-editor-rtl.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-editor-rtl.description',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_mobile_ai_button: {
    category: 'affine',
    displayName: 'Enable AI Button',
    description: 'Enable AI Button on mobile',
    configurable: isMobile && isIOS,
    defaultState: isMobile && isIOS,
  },
  enable_turbo_renderer: {
    category: 'blocksuite',
    bsFlag: 'enable_turbo_renderer',
    displayName: 'Enable Turbo Renderer',
    description: 'Enable experimental edgeless turbo renderer',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_dom_renderer: {
    category: 'blocksuite',
    bsFlag: 'enable_dom_renderer',
    displayName: 'Enable DOM Renderer',
    description: 'Enable DOM renderer for graphics elements',
    configurable: true,
    defaultState: false,
  },
  enable_edgeless_scribbled_style: {
    category: 'blocksuite',
    bsFlag: 'enable_edgeless_scribbled_style',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-edgeless-scribbled-style.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-edgeless-scribbled-style.description',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_table_virtual_scroll: {
    category: 'blocksuite',
    bsFlag: 'enable_table_virtual_scroll',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-table-virtual-scroll.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-table-virtual-scroll.description',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_setting_subpage_animation: {
    category: 'affine',
    displayName: 'Enable Setting Subpage Animation',
    description: 'Apply animation for setting subpage open/close',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_adapter_panel: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-adapter-panel.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-adapter-panel.description',
    configurable: isCanaryBuild,
    defaultState: false,
  },
  enable_two_step_journal_confirmation: {
    category: 'affine',
    displayName: 'Enable Two Step Journal Confirmation',
    description:
      'When enabled, you must confirm the journal before you can create a new journal.',
    configurable: isCanaryBuild,
    defaultState: isCanaryBuild,
  },
  enable_send_detailed_object_to_ai: {
    category: 'affine',
    displayName:
      'com.affine.settings.workspace.experimental-features.enable-ai-send-detailed-object.name',
    description:
      'com.affine.settings.workspace.experimental-features.enable-ai-send-detailed-object.description',
    configurable: true,
    defaultState: true,
  },
  enable_battery_save_mode: {
    category: 'affine',
    displayName: 'Enable Battery Save Mode (Require Restart)',
    description:
      'Limit indexing and other compute-intensive tasks on this device, may experience longer loading time and latency in search and other features, in exchange for quietness.',
    configurable: true,
    defaultState: isMobile,
  },
  enable_mobile_database_editing: {
    category: 'blocksuite',
    bsFlag: 'enable_mobile_database_editing',
    displayName: 'Enable Mobile Database Editing',
    description: 'Enable mobile database editing',
    configurable: isMobile,
    defaultState: false,
  },
  enable_pdfmake_export: {
    category: 'blocksuite',
    bsFlag: 'enable_pdfmake_export',
    displayName: 'Enable PDF Export',
    description:
      'Experimental export PDFs support, it may contain the wrong style.',
    configurable: true,
    defaultState: false,
  },
} satisfies { [key in string]: FlagInfo };

// oxlint-disable-next-line no-redeclare
export type AFFINE_FLAGS = typeof AFFINE_FLAGS;
