export const BOARD_TEMPLATES = ['todo', 'project'] as const;

export type BoardTemplate = (typeof BOARD_TEMPLATES)[number];

export type BoardStatusOption = {
  value: string;
  color: string;
};

export type BoardColumnSeed = {
  type: string;
  name: string;
  options?: BoardStatusOption[];
};

export const TODO_STATUS_OPTIONS: BoardStatusOption[] = [
  { value: 'To do', color: 'var(--affine-tag-orange)' },
  { value: 'In progress', color: 'var(--affine-tag-blue)' },
  { value: 'Done', color: 'var(--affine-tag-green)' },
];

export const PROJECT_STATUS_OPTIONS: BoardStatusOption[] = [
  { value: 'Backlog', color: 'var(--affine-tag-gray)' },
  { value: 'In progress', color: 'var(--affine-tag-blue)' },
  { value: 'Review', color: 'var(--affine-tag-purple)' },
  { value: 'Done', color: 'var(--affine-tag-green)' },
];

export const TODO_COLUMNS: BoardColumnSeed[] = [
  { type: 'select', name: 'Status', options: TODO_STATUS_OPTIONS },
];

export const PROJECT_COLUMNS: BoardColumnSeed[] = [
  { type: 'select', name: 'Status', options: PROJECT_STATUS_OPTIONS },
  { type: 'member', name: 'Assignee' },
  { type: 'date', name: 'Due' },
  {
    type: 'multi-select',
    name: 'Labels',
    options: [
      { value: 'Bug', color: 'var(--affine-tag-red)' },
      { value: 'Feature', color: 'var(--affine-tag-blue)' },
      { value: 'Docs', color: 'var(--affine-tag-teal)' },
    ],
  },
  { type: 'image', name: 'Cover' },
];

export function columnsForTemplate(template: BoardTemplate): BoardColumnSeed[] {
  return template === 'project' ? PROJECT_COLUMNS : TODO_COLUMNS;
}

export function isBoardTemplate(value: unknown): value is BoardTemplate {
  return value === 'todo' || value === 'project';
}
