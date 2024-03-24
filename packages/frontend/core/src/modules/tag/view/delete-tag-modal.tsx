import { ConfirmModal, toast } from '@affine/component';
import { Trans } from '@affine/i18n';
import { useAFFiNEI18N } from '@affine/i18n/hooks';
import { useLiveData, useService } from '@toeverything/infra';
import { useCallback, useMemo } from 'react';

import { TagService } from '../service/tag';

export const DeleteTagConfirmModal = ({
  open,
  onOpenChange,
  selectedTagIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTagIds: string[];
}) => {
  const t = useAFFiNEI18N();
  const tagService = useService(TagService);
  const tags = useLiveData(tagService.tags$);
  const selectedTags = useMemo(() => {
    return tags.filter(tag => selectedTagIds.includes(tag.id));
  }, [selectedTagIds, tags]);
  const tagName = useLiveData(selectedTags[0]?.value$ || '');

  const handleDelete = useCallback(() => {
    selectedTagIds.forEach(tagId => {
      tagService.deleteTag(tagId);
    });

    toast(
      selectedTagIds.length > 1
        ? t['com.affine.delete-tags.count']({ count: selectedTagIds.length })
        : t['com.affine.tags.delete-tags.toast']()
    );

    onOpenChange(false);
  }, [onOpenChange, selectedTagIds, t, tagService]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={t['com.affine.delete-tags.confirm.title']()}
      description={
        selectedTags.length === 1 ? (
          <Trans
            i18nKey={'com.affine.delete-tags.confirm.description'}
            values={{ tag: tagName }}
            components={{ 1: <strong /> }}
          />
        ) : (
          t['com.affine.delete-tags.confirm.multi-tag-description']({
            count: selectedTags.length.toString(),
          })
        )
      }
      confirmButtonOptions={{
        type: 'warning',
        children: t['Delete'](),
      }}
      onConfirm={handleDelete}
    />
  );
};
