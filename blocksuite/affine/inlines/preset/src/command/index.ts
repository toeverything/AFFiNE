export type { TextFormatConfig } from './config.js';
export { textFormatConfigs } from './config.js';
export {
  FORMAT_BLOCK_SUPPORT_FLAVOURS,
  FORMAT_NATIVE_SUPPORT_FLAVOURS,
  FORMAT_TEXT_SUPPORT_FLAVOURS,
} from './consts.js';
export { deleteTextCommand } from './delete-text.js';
export { formatBlockCommand } from './format-block.js';
export { formatNativeCommand } from './format-native.js';
export { formatTextCommand } from './format-text.js';
export {
  getTextAttributes,
  isTextAttributeActive,
  toggleBold,
  toggleCode,
  toggleItalic,
  toggleStrike,
  toggleTextStyleCommand,
  toggleUnderline,
} from './text-style.js';
export { isFormatSupported } from './utils.js';
