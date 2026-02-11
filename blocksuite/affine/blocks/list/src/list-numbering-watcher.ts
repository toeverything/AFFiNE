import { ListBlockModel } from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { type BlockModel, StoreExtension } from '@blocksuite/store';

import { correctNumberedListsOrderToPrev } from './commands/utils.js';

type BlockUpdatedPayload = {
  type: 'add' | 'delete' | 'update';
  model: BlockModel;
  flavour: string;
  id: string;
};

/**
 * Extension that watches for list block deletions and automatically
 * renumbers subsequent numbered lists to maintain continuous ordering.
 *
 * Example:
 * Before deletion:
 * 1. Item one
 * 2. Item two (deleted)
 * 3. Item three
 *
 * After deletion:
 * 1. Item one
 * 2. Item three (automatically renumbered from 3 to 2)
 */
export class ListNumberingWatcherExtension extends StoreExtension {
  static override readonly key = 'list-numbering-watcher';

  // Cache to store next sibling info before deletion
  private readonly _nextSiblingCache = new WeakMap<
    ListBlockModel,
    string | null
  >();

  // Cache to store previous sibling info
  private readonly _prevSiblingCache = new WeakMap<
    ListBlockModel,
    string | null
  >();

  // Cache to store previous type of list items
  private readonly _previousTypeCache = new WeakMap<
    ListBlockModel,
    'numbered' | 'bulleted' | 'todo' | 'toggle'
  >();

  private _initializeCache() {
    // Initialize cache for all existing numbered lists
    const listBlocks = this.store.getBlocksByFlavour('affine:list');
    listBlocks.forEach(block => {
      const model = block.model;
      if (!matchModels(model, [ListBlockModel])) return;

      if (model.props.type === 'numbered') {
        const nextSibling = this.store.getNext(model);
        const prevSibling = this.store.getPrev(model);
        this._nextSiblingCache.set(model, nextSibling?.id ?? null);
        this._prevSiblingCache.set(model, prevSibling?.id ?? null);
        this._previousTypeCache.set(model, 'numbered');
      }

      // Subscribe to props changes for each list block
      this._subscribeToModelChanges(model);
    });
  }

  private _subscribeToModelChanges(model: ListBlockModel) {
    this.store.disposableGroup.add(
      model.propsUpdated.subscribe(({ key }) => {
        if (key !== 'type') return;

        const currentType = model.props.type;
        const previousType = this._previousTypeCache.get(model);

        // If type changed from numbered to something else, renumber the next items
        if (previousType === 'numbered' && currentType !== 'numbered') {
          const nextSiblingId = this._nextSiblingCache.get(model);
          const prevSiblingId = this._prevSiblingCache.get(model);

          // Update the previous numbered sibling's cache to skip this item
          if (prevSiblingId) {
            const prevSibling = this.store.getBlock(prevSiblingId)?.model;
            if (
              prevSibling &&
              matchModels(prevSibling, [ListBlockModel]) &&
              prevSibling.props.type === 'numbered'
            ) {
              this._nextSiblingCache.set(prevSibling, nextSiblingId ?? null);
            }
          }

          // Update the next sibling's cache to skip this item
          if (nextSiblingId) {
            const nextSibling = this.store.getBlock(nextSiblingId)?.model;

            if (
              nextSibling &&
              matchModels(nextSibling, [ListBlockModel]) &&
              nextSibling.props.type === 'numbered'
            ) {
              this._prevSiblingCache.set(nextSibling, prevSiblingId ?? null);

              // Find the previous numbered sibling by traversing backwards
              const prevNumberedSibling = this._getPrevNumberedSibling(model);

              this.store.transact(() => {
                if (prevNumberedSibling) {
                  // Continue from the previous numbered item
                  nextSibling.props.order =
                    (prevNumberedSibling.props.order ?? 1) + 1;
                } else {
                  // No previous numbered item, start from 1
                  nextSibling.props.order = 1;
                }

                // Continue renumbering the rest
                let base = nextSibling.props.order + 1;
                const continuousLists =
                  this._getNextContinuousNumberedLists(nextSibling);
                continuousLists.forEach(list => {
                  list.props.order = base;
                  base++;
                });
              });
            }
          }
        }

        // Update caches for numbered lists
        if (currentType === 'numbered') {
          const nextSibling = this.store.getNext(model);
          const prevSibling = this.store.getPrev(model);
          this._nextSiblingCache.set(model, nextSibling?.id ?? null);
          this._prevSiblingCache.set(model, prevSibling?.id ?? null);
        }

        // Always update the type cache
        this._previousTypeCache.set(model, currentType);
      })
    );
  }

  private _getPrevNumberedSibling(
    model: ListBlockModel
  ): ListBlockModel | null {
    let current = this.store.getPrev(model);

    while (current) {
      if (
        matchModels(current, [ListBlockModel]) &&
        current.props.type === 'numbered'
      ) {
        return current;
      }
      current = this.store.getPrev(current);
    }

    return null;
  }

  private _getNextContinuousNumberedLists(
    model: ListBlockModel
  ): ListBlockModel[] {
    const result: ListBlockModel[] = [];
    let current = this.store.getNext(model);

    while (
      current &&
      matchModels(current, [ListBlockModel]) &&
      current.props.type === 'numbered'
    ) {
      result.push(current);
      current = this.store.getNext(current);
    }

    return result;
  }

  override loaded() {
    // Initialize cache for existing blocks
    this._initializeCache();

    this.store.disposableGroup.add(
      this.store.slots.blockUpdated.subscribe(payload => {
        // Handle add events
        if (payload.type === 'add') {
          this._handleAddEvent(payload);
          return;
        }

        // Handle delete events
        if (payload.type === 'delete') {
          this._handleDeleteEvent(payload);
          return;
        }
      })
    );
  }

  private _handleAddEvent(payload: BlockUpdatedPayload) {
    // Guard clauses
    if (payload.flavour !== 'affine:list') return;
    if (!matchModels(payload.model, [ListBlockModel])) return;

    // Subscribe to props changes for the new list block
    this._subscribeToModelChanges(payload.model);

    // Cache the type for all list types
    this._previousTypeCache.set(payload.model, payload.model.props.type);

    // Only handle numbered lists for sibling cache updates
    if (payload.model.props.type !== 'numbered') return;

    // Update cache for the new numbered item
    const nextSibling = this.store.getNext(payload.model);
    const prevSibling = this.store.getPrev(payload.model);
    this._nextSiblingCache.set(payload.model, nextSibling?.id ?? null);
    this._prevSiblingCache.set(payload.model, prevSibling?.id ?? null);

    // Update previous sibling's cache
    if (
      prevSibling &&
      matchModels(prevSibling, [ListBlockModel]) &&
      prevSibling.props.type === 'numbered'
    ) {
      this._nextSiblingCache.set(prevSibling, payload.model.id);
    }

    // Update next sibling's cache
    if (
      nextSibling &&
      matchModels(nextSibling, [ListBlockModel]) &&
      nextSibling.props.type === 'numbered'
    ) {
      this._prevSiblingCache.set(nextSibling, payload.model.id);
    }
  }

  private _handleDeleteEvent(payload: BlockUpdatedPayload) {
    // Guard clauses
    if (payload.flavour !== 'affine:list') return;
    if (!matchModels(payload.model, [ListBlockModel])) return;
    if (payload.model.props.type !== 'numbered') return;

    // Get cached siblings
    const nextSiblingId = this._nextSiblingCache.get(payload.model) ?? null;
    const prevSiblingId = this._prevSiblingCache.get(payload.model) ?? null;

    // Update previous sibling's cache
    this._updatePrevSiblingCache(prevSiblingId, nextSiblingId);

    // Update next sibling's cache and renumber
    this._updateNextSiblingCacheAndRenumber(nextSiblingId, prevSiblingId);
  }

  private _updatePrevSiblingCache(
    prevSiblingId: string | null,
    nextSiblingId: string | null
  ) {
    if (!prevSiblingId) return;

    const prevSibling = this.store.getBlock(prevSiblingId)?.model;
    if (
      !prevSibling ||
      !matchModels(prevSibling, [ListBlockModel]) ||
      prevSibling.props.type !== 'numbered'
    ) {
      return;
    }

    this._nextSiblingCache.set(prevSibling, nextSiblingId);
  }

  private _updateNextSiblingCacheAndRenumber(
    nextSiblingId: string | null,
    prevSiblingId: string | null
  ) {
    if (!nextSiblingId) return;

    const nextSibling = this.store.getBlock(nextSiblingId)?.model;
    if (
      !nextSibling ||
      !matchModels(nextSibling, [ListBlockModel]) ||
      nextSibling.props.type !== 'numbered'
    ) {
      return;
    }

    this._prevSiblingCache.set(nextSibling, prevSiblingId);
    correctNumberedListsOrderToPrev(this.store, nextSibling);
  }
}
