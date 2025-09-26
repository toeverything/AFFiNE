import {
  type IconData as ComponentIconData,
  IconPicker,
  IconType,
  uniReactRoot,
} from '@affine/component';
// Import the identifier for internal use
import {
  type IconData,
  type IconPickerOptions,
  type IconPickerService as IIconPickerService,
} from '@blocksuite/affine-shared/services';
import { Service } from '@toeverything/infra';
import { html, type TemplateResult } from 'lit';

// Re-export types from BlockSuite shared services
export type {
  IconData,
  IconPickerOptions,
  IconPickerService as IIconPickerService,
} from '@blocksuite/affine-shared/services';
export { IconPickerServiceIdentifier } from '@blocksuite/affine-shared/services';

// Convert between BlockSuite IconData and Component IconData
function convertToBlockSuiteIconData(
  componentIconData: ComponentIconData
): IconData {
  if (componentIconData.type === IconType.Emoji) {
    return {
      type: 'emoji',
      value: componentIconData.unicode,
    };
  } else if (componentIconData.type === IconType.AffineIcon) {
    return {
      type: 'icon',
      value: componentIconData.name,
    };
  }
  // For other types, default to icon type
  return {
    type: 'icon',
    value: 'default',
  };
}

export class IconPickerService extends Service implements IIconPickerService {
  public readonly iconPickerComponent =
    uniReactRoot.createUniComponent(IconPicker);

  renderIconPicker(options: IconPickerOptions): TemplateResult {
    const element = document.createElement('div');

    // Adapt the options to match IconPicker component's expected interface
    const adaptedOptions = {
      onSelect: options.onSelect
        ? (data?: ComponentIconData) => {
            if (data && options.onSelect) {
              const blockSuiteIconData = convertToBlockSuiteIconData(data);
              options.onSelect(blockSuiteIconData);
            }
          }
        : undefined,
      onClose: options.onClose,
    };

    this.iconPickerComponent(element, adaptedOptions, () => {});
    return html`${element}`;
  }
}
