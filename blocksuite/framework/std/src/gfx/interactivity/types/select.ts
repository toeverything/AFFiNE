import type { GfxModel } from '../../model/model';

export type ExtensionElementSelectContext = {
  /**
   * The candidate elements for selection.
   */
  candidates: GfxModel[];

  /**
   * The element which is ready to be selected.
   */
  target: GfxModel;

  /**
   * Use to change the target element of selection.
   * @param element
   * @returns
   */
  suggest: (element: {
    /**
     * The suggested element id
     */
    id: string;

    /**
     * The priority of the suggestion. If there are multiple suggestions coming from different extensions,
     * the one with the highest priority will be used.
     *
     * Default to 0.
     */
    priority?: number;
  }) => void;
};
