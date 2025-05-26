// Legacy compatibility: export a group for old imports (deprecated, will be removed)
export const idPropertyConfigMenu = (property: Property) =>
  menu.group({ items: idPropertyConfigMenuItems(property) });
/**
 * @file ID Property Configuration Menu
 * @description Configuration menu component for ID property type in AFFiNE databases.
 * Allows users to customize ID column settings like prefix, suffix, and padding.
 */
import { menu } from '@blocksuite/affine-components/context-menu';

import type { Property } from '../../core/view-manager/property.js';
import { initializeAllIds } from './generator.js';

/**
 * Returns an array of menu configs for ID property settings (prefix, suffix, padding, regenerate)
 * @param property - The ID property to configure
 * @returns Array of MenuConfig
 */
export const idPropertyConfigMenuItems = (
  property: Property
): import('@blocksuite/affine-components/context-menu').MenuConfig[] => [
  // Prefix input: always reads latest value
  menu.input({
    placeholder: 'Prefix (e.g., TASK-)',
    initialValue: String(property.data$.value.prefix ?? ''),
    onComplete: (value: string) => {
      property.dataUpdate(() => ({ prefix: value }));
    },
    onChange: (value: string) => {
      property.dataUpdate(() => ({ prefix: value }));
    },
  }),
  // Suffix input: always reads latest value
  menu.input({
    placeholder: 'Suffix (e.g., -2025)',
    initialValue: String(property.data$.value.suffix ?? ''),
    onComplete: (value: string) => {
      property.dataUpdate(() => ({ suffix: value }));
    },
    onChange: (value: string) => {
      property.dataUpdate(() => ({ suffix: value }));
    },
  }),
  // Padding submenu: always reads latest value
  menu.subMenu({
    name: 'Padding',
    options: {
      title: {
        text: 'ID Padding',
      },
      items: [
        menu.group({
          items: [
            menu.action({
              name: '1 (e.g., 1, 2, 3...)',
              isSelected: (property.data$.value.padding ?? 3) === 1,
              select: () => {
                property.dataUpdate(() => ({ padding: 1 }));
              },
            }),
            menu.action({
              name: '2 (e.g., 01, 02, 03...)',
              isSelected: (property.data$.value.padding ?? 3) === 2,
              select: () => {
                property.dataUpdate(() => ({ padding: 2 }));
              },
            }),
            menu.action({
              name: '3 (e.g., 001, 002, 003...)',
              isSelected: (property.data$.value.padding ?? 3) === 3,
              select: () => {
                property.dataUpdate(() => ({ padding: 3 }));
              },
            }),
            menu.action({
              name: '4 (e.g., 0001, 0002, 0003...)',
              isSelected: (property.data$.value.padding ?? 3) === 4,
              select: () => {
                property.dataUpdate(() => ({ padding: 4 }));
              },
            }),
            menu.action({
              name: '5 (e.g., 00001, 00002, 00003...)',
              isSelected: (property.data$.value.padding ?? 3) === 5,
              select: () => {
                property.dataUpdate(() => ({ padding: 5 }));
              },
            }),
          ],
        }),
      ],
    },
  }),
  // Add a regenerate button with an emphasis
  menu.action({
    name: 'Re-generate all IDs',
    select: () => {
      initializeAllIds(property);
    },
  }) as import('@blocksuite/affine-components/context-menu').MenuConfig,
];
