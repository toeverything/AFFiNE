import { LoadingIcon } from '@blocksuite/affine/components/icons';
import { WarningIcon } from '@blocksuite/icons/lit';
import { type TemplateResult } from 'lit';

import type {
  AttachmentChip,
  ChatChip,
  ChipState,
  CollectionChip,
  DocChip,
  FileChip,
  SelectedContextChip,
  TagChip,
} from './type';

export function getChipTooltip(
  state: ChipState,
  name: string,
  tooltip?: string | null
) {
  if (tooltip) {
    return tooltip;
  }
  if (state === 'candidate') {
    return 'Click to add doc';
  }
  if (state === 'processing') {
    return 'Processing...';
  }
  if (state === 'failed') {
    return 'Failed to add to context';
  }
  return name;
}

export function getChipIcon(
  state: ChipState,
  icon: TemplateResult<1>
): TemplateResult<1> {
  const isLoading = state === 'processing';
  const isFailed = state === 'failed';
  if (isFailed) {
    return WarningIcon();
  }
  if (isLoading) {
    return LoadingIcon();
  }
  return icon;
}

export function isDocChip(chip: ChatChip): chip is DocChip {
  return 'docId' in chip;
}

export function isFileChip(chip: ChatChip): chip is FileChip {
  return 'file' in chip && chip.file instanceof File;
}

export function isTagChip(chip: ChatChip): chip is TagChip {
  return 'tagId' in chip;
}

export function isCollectionChip(chip: ChatChip): chip is CollectionChip {
  return 'collectionId' in chip;
}

export function isSelectedContextChip(
  chip: ChatChip
): chip is SelectedContextChip {
  return 'snapshot' in chip && 'combinedElementsMarkdown' in chip;
}

export function isAttachmentChip(chip: ChatChip): chip is AttachmentChip {
  return 'sourceId' in chip && 'name' in chip;
}

export function getChipKey(chip: ChatChip) {
  if (isDocChip(chip)) {
    return chip.docId;
  }
  if (isFileChip(chip)) {
    return chip.file.name;
  }
  if (isTagChip(chip)) {
    return chip.tagId;
  }
  if (isCollectionChip(chip)) {
    return chip.collectionId;
  }
  if (isSelectedContextChip(chip)) {
    return chip.uuid;
  }
  return null;
}

export function omitChip(chips: ChatChip[], chip: ChatChip) {
  return chips.filter(item => {
    if (isDocChip(chip)) {
      return !isDocChip(item) || item.docId !== chip.docId;
    }
    if (isFileChip(chip)) {
      return !isFileChip(item) || item.file !== chip.file;
    }
    if (isTagChip(chip)) {
      return !isTagChip(item) || item.tagId !== chip.tagId;
    }
    if (isCollectionChip(chip)) {
      return !isCollectionChip(item) || item.collectionId !== chip.collectionId;
    }
    if (isSelectedContextChip(chip)) {
      return !isSelectedContextChip(item) || item.uuid !== chip.uuid;
    }
    if (isAttachmentChip(chip)) {
      return !isAttachmentChip(item) || item.sourceId !== chip.sourceId;
    }
    return true;
  });
}

export function findChipIndex(chips: ChatChip[], chip: ChatChip) {
  return chips.findIndex(item => {
    if (isDocChip(chip)) {
      return isDocChip(item) && item.docId === chip.docId;
    }
    if (isFileChip(chip)) {
      return isFileChip(item) && item.file === chip.file;
    }
    if (isTagChip(chip)) {
      return isTagChip(item) && item.tagId === chip.tagId;
    }
    if (isCollectionChip(chip)) {
      return isCollectionChip(item) && item.collectionId === chip.collectionId;
    }
    if (isSelectedContextChip(chip)) {
      return isSelectedContextChip(item) && item.uuid === chip.uuid;
    }
    if (isAttachmentChip(chip)) {
      return isAttachmentChip(item) && item.sourceId === chip.sourceId;
    }
    return -1;
  });
}

export function estimateTokenCount(text: string): number {
  const chinese = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
  const english = text.replace(/[\u4e00-\u9fa5]/g, '');
  // Split English text into words by whitespace
  const englishWords = english.trim().split(/\s+/).length;

  // Chinese characters: 1 character ≈ 2.5 tokens
  // English words: 1 word ≈ 1.3 tokens
  return Math.ceil(chinese * 2.5 + englishWords * 1.3);
}
