import type { TaskWorkflowDefaults } from '@blocksuite/affine/shared/services';

export const serializeTaskWorkflowFields = (
  fields: TaskWorkflowDefaults['list']['fieldDefs']
) =>
  fields
    .map(field =>
      field.label === field.key
        ? `${field.key}:${field.type}`
        : `${field.key}:${field.type}:${field.label}`
    )
    .join(', ');

export const parseTaskWorkflowFields = (
  value: string
): TaskWorkflowDefaults['list']['fieldDefs'] => {
  const seenKeys = new Set<string>();
  return value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [key = '', type = 'text', ...labelParts] = part.split(':');
      const normalizedKey = key.trim();
      if (!/^[A-Za-z0-9_-]+$/.test(normalizedKey)) {
        return null;
      }
      if (seenKeys.has(normalizedKey)) {
        return null;
      }
      seenKeys.add(normalizedKey);
      const trimmedType = type.trim().replaceAll('-', '_');
      const normalizedType =
        trimmedType === 'number' ||
        trimmedType === 'date' ||
        trimmedType === 'select' ||
        trimmedType === 'multi_select' ||
        trimmedType === 'progress'
          ? trimmedType
          : 'text';
      const label = labelParts.join(':').trim() || key.trim();
      return {
        key: normalizedKey,
        type: normalizedType,
        label,
      };
    })
    .filter(
      (field): field is TaskWorkflowDefaults['list']['fieldDefs'][number] =>
        Boolean(field?.key && field.label)
    );
};

const workflowSemantics = new Set(['none', 'todo', 'in_progress', 'done']);

export const parseTaskWorkflowColumns = (value: string) =>
  value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => {
      const [label = '', semantic = ''] = part.split(':');
      const normalizedSemantic = semantic.trim().replaceAll('-', '_');
      if (!normalizedSemantic) {
        return label.trim();
      }
      if (!workflowSemantics.has(normalizedSemantic)) {
        return label.trim();
      }
      return `${label.trim()}:${normalizedSemantic}`;
    })
    .filter(Boolean);
