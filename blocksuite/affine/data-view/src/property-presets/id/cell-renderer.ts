/**
 * @file ID Cell Renderer Implementation for AFFiNE Databases
 * @description This file contains the cell renderer definition for the ID column type
 * that displays unique read-only identifiers in database tables.
 */
import { LockIcon } from '@blocksuite/icons/lit';
import { html } from 'lit';

import { BaseCellRenderer } from '../../core/property/index.js';
import { createFromBaseCellRenderer } from '../../core/property/renderer.js';
import { createIcon } from '../../core/utils/uni-icon.js';
import { idPropertyModelConfig } from './define.js';

/**
 * CSS styles for ID cell rendering
 * Applies a distinct style to visually indicate that the cell is read-only
 */
const idStyle = html`
  <style>
    .affine-database-id {
      font-family: var(--affine-font-family);
      font-size: var(--affine-font-xs);
      padding: 0 8px;
      height: 100%;
      display: flex;
      align-items: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--affine-text-secondary-color);
    }

    .affine-database-id .lock-icon {
      margin-right: 4px;
      display: inline-flex;
      align-items: center;
      opacity: 0.7;
      color: var(--affine-icon-color);
    }

    .affine-database-id .id-value {
      font-family: var(--affine-font-mono);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 2px 4px;
      border-radius: 4px;
      background-color: var(--affine-background-secondary-color);
      font-weight: 500;
    }
  </style>
`;

/**
 * Renderer component for ID cells
 * Displays ID values in a styled read-only container
 * @extends BaseCellRenderer<string, string>
 */
export class IdCell extends BaseCellRenderer<string, string> {
  /**
   * Override to force readonly status for ID cells
   * @returns {boolean} Always returns true to enforce read-only state
   */
  override get readonly() {
    return true; // Always readonly, regardless of property settings
  }

  /**
   * Auto-generate ID value if empty when connected
   */
  override connectedCallback() {
    super.connectedCallback();

    // If the cell is empty, generate a new ID
    if (!this.value) {
      // Using dynamic import to avoid circular dependency
      import('./generator.js')
        .then(({ generateNextId }) => {
          // Get a new ID and set it
          const newId = generateNextId(this.property);
          if (newId) {
            this.valueSetNextTick(newId);
          }
        })
        .catch(error => {
          console.error('Failed to generate ID:', error);
        });
    }
  }

  /**
   * Also check on value change in case the value is cleared
   */
  override updated() {
    if (!this.value) {
      // Using dynamic import to avoid circular dependency
      import('./generator.js')
        .then(({ generateNextId }) => {
          // Get a new ID and set it
          const newId = generateNextId(this.property);
          if (newId) {
            this.valueSetNextTick(newId);
          }
        })
        .catch(error => {
          console.error('Failed to generate ID:', error);
        });
    }
  }

  /**
   * Renders the cell content
   * @returns {TemplateResult} HTML template containing the ID value
   */
  override render() {
    return html`
      ${idStyle}
      <div class="affine-database-id">
        <span class="lock-icon">
          ${LockIcon({ width: '14px', height: '14px' })}
        </span>
        <span class="id-value">${this.value || ''}</span>
      </div>
    `;
  }
}

// Register the custom element to make it available to the DOM
// This is required to avoid "Illegal constructor" errors when the component is instantiated
customElements.define('affine-id-cell', IdCell);

/**
 * Property configuration for ID columns
 *
 * @remarks
 * Key characteristics:
 * - readonly: true - Makes the cells read-only to ensure ID integrity
 * - icon: LockIcon - Uses a lock icon to visually indicate restricted editing
 * - Only one ID column is allowed per table (enforced in block-utils.ts)
 * - Custom configuration menu available in config-menu.ts
 */
export const idPropertyConfig = idPropertyModelConfig.createPropertyMeta({
  icon: createIcon('LockIcon'), // Uses a lock icon to indicate unique ID
  cellRenderer: {
    view: createFromBaseCellRenderer(IdCell),
  },
});
