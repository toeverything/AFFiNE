import { ConnectorElementModel } from '@blocksuite/affine-model';
import {
  type DragExtensionInitializeContext,
  InteractivityExtension,
} from '@blocksuite/std/gfx';

export class ConnectorFilter extends InteractivityExtension {
  static override key = 'connector-filter';

  override mounted() {
    this.action.onDragInitialize((context: DragExtensionInitializeContext) => {
      let hasConnectorFlag = false;

      const elementSet = new Set(context.elements.map(elem => elem.id));
      const elements = context.elements.filter(elem => {
        if (elem instanceof ConnectorElementModel) {
          const sourceElemNotFound =
            elem.source.id && !elementSet.has(elem.source.id);
          const targetElemNotFound =
            elem.target.id && !elementSet.has(elem.target.id);

          // If either source or target element is not found, then remove the connector
          if (sourceElemNotFound || targetElemNotFound) {
            return false;
          }

          hasConnectorFlag = true;
          return true;
        }

        return true;
      });

      if (hasConnectorFlag) {
        // connector needs to be updated first
        elements.sort((a, _) => (a instanceof ConnectorElementModel ? -1 : 1));
      }

      context.elements = elements;

      return {};
    });
  }
}
