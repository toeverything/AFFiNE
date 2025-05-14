import type { ShapeElementModel } from '@blocksuite/affine-model';

/**
 * Utility to manage a class on an element, tracking the previous class via dataset.
 * If the new class is different from the previous one (stored in dataset),
 * the previous class is removed. The new class is added if not already present.
 * The dataset is then updated with the new class name.
 *
 * @param element The HTMLElement to update.
 * @param newClassName The new class name to apply.
 * @param datasetKeyForPreviousClass The key in `element.dataset` used to store the previous class name.
 */
function updateClass(
  element: HTMLElement,
  newClassName: string,
  datasetKeyForPreviousClass: string
): void {
  const previousClassName = element.dataset[datasetKeyForPreviousClass];

  if (previousClassName && previousClassName !== newClassName) {
    element.classList.remove(previousClassName);
  }

  if (!element.classList.contains(newClassName)) {
    element.classList.add(newClassName);
  }

  element.dataset[datasetKeyForPreviousClass] = newClassName;
}

/**
 * Utility to set multiple CSS styles on an HTMLElement.
 *
 * @param element The HTMLElement to apply styles to.
 * @param styles An object where keys are camelCased CSS property names and values are their string values.
 */
export function setStyles(
  element: HTMLElement,
  styles: Record<string, string>
): void {
  for (const property in styles) {
    if (Object.prototype.hasOwnProperty.call(styles, property)) {
      // Using `any` for `element.style` index is a common practice for dynamic style assignment.
      // Assumes `property` is a valid camelCased CSS property.
      (element.style as any)[property] = styles[property];
    }
  }
}

export function manageClassNames(
  model: ShapeElementModel,
  element: HTMLElement
) {
  const currentShapeTypeClass = `shape-${model.shapeType}`;
  const currentShapeStyleClass = `shape-style-${model.shapeStyle.toLowerCase()}`;

  updateClass(element, currentShapeTypeClass, 'prevShapeTypeClass');
  updateClass(element, currentShapeStyleClass, 'prevShapeStyleClass');
}
