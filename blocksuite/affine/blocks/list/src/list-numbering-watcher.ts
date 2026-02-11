import { ListBlockModel } from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import { StoreExtension } from '@blocksuite/store';

import { correctNumberedListsOrderToPrev } from './commands/utils.js';

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
        this._nextSiblingCache.set(model, nextSibling?.id ?? null);
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
          // Store the order before it gets cleared
          const nextSiblingId = this._nextSiblingCache.get(model);

          if (nextSiblingId) {
            const nextSibling = this.store.getBlock(nextSiblingId)?.model;

            if (
              nextSibling &&
              matchModels(nextSibling, [ListBlockModel]) &&
              nextSibling.props.type === 'numbered'
            ) {
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
          this._nextSiblingCache.set(model, nextSibling?.id ?? null);
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
        // When a numbered list is added, update the previous sibling's cache
        if (
          payload.type === 'add' &&
          payload.flavour === 'affine:list' &&
          matchModels(payload.model, [ListBlockModel])
        ) {
          // Subscribe to props changes for the new list block
          this._subscribeToModelChanges(payload.model);

          if (payload.model.props.type === 'numbered') {
            // Update cache for the new item
            const nextSibling = this.store.getNext(payload.model);
            this._nextSiblingCache.set(payload.model, nextSibling?.id ?? null);
            this._previousTypeCache.set(payload.model, 'numbered');

            // Update cache for the previous sibling (if it's also a numbered list)
            const prevSibling = this.store.getPrev(payload.model);
            if (
              prevSibling &&
              matchModels(prevSibling, [ListBlockModel]) &&
              prevSibling.props.type === 'numbered'
            ) {
              this._nextSiblingCache.set(prevSibling, payload.model.id);
            }
          } else {
            // For non-numbered lists, still cache the type
            this._previousTypeCache.set(
              payload.model,
              payload.model.props.type
            );
          }
        }

        // Handle delete events
        if (payload.type !== 'delete') return;

        if (payload.flavour !== 'affine:list') return;
        if (!matchModels(payload.model, [ListBlockModel])) return;
        if (payload.model.props.type !== 'numbered') return;

        // Try to get next sibling from cache first
        let nextSiblingId = this._nextSiblingCache.get(payload.model);

        // If not in cache, find it through parent
        if (!nextSiblingId) {
          const parent = this.store.getParent(payload.model);
          if (parent) {
            const deletedIndex = parent.children.indexOf(payload.model);
            if (
              deletedIndex !== -1 &&
              deletedIndex < parent.children.length - 1
            ) {
              const nextSibling = parent.children[deletedIndex + 1];
              nextSiblingId = nextSibling?.id ?? null;
            }
          }
        }

        // If there's no next sibling, nothing to renumber
        if (!nextSiblingId) {
          return;
        }

        const nextSibling = this.store.getBlock(nextSiblingId)?.model;

        // Only renumber if the next sibling is also a numbered list
        if (
          !nextSibling ||
          !matchModels(nextSibling, [ListBlockModel]) ||
          nextSibling.props.type !== 'numbered'
        ) {
          return;
        }

        // Renumber the next sibling and all continuous numbered lists after it
        correctNumberedListsOrderToPrev(this.store, nextSibling);
      })
    );
  }
}
