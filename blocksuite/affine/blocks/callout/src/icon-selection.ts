import type { CalloutBlockModel } from '@blocksuite/affine-model';

// A blob upload is asynchronous and the icon picker stays open while the
// upload runs. A user can select a second icon before the first upload
// resolves, and the first result would then overwrite the later selection.
// This map counts icon selections per callout model. An upload result
// applies only when its selection is still the latest one. A WeakMap keeps
// the guard across popup sessions and across the block and toolbar pickers.
const latestIconSelection = new WeakMap<CalloutBlockModel, number>();

export function beginIconSelection(model: CalloutBlockModel): number {
  const generation = (latestIconSelection.get(model) ?? 0) + 1;
  latestIconSelection.set(model, generation);
  return generation;
}

export function isLatestIconSelection(
  model: CalloutBlockModel,
  generation: number
): boolean {
  return latestIconSelection.get(model) === generation;
}
