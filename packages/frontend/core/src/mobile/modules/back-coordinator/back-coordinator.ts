import { LiveData, Service } from '@toeverything/infra';
import type { StateSnapshot } from 'react-virtuoso';

export type MobileBackIntent =
  | 'system-back'
  | 'ui-back'
  | 'ui-up'
  | 'interactive-gesture';

export type MobileInteractiveBackPhase =
  | 'begin'
  | 'progress'
  | 'cancel'
  | 'commit';

export type MobileDestinationKind =
  | 'home'
  | 'all-docs'
  | 'all-collections'
  | 'all-tags'
  | 'journal'
  | 'doc'
  | 'search'
  | 'collection'
  | 'tag'
  | 'settings-child';

export type MobileRestorationSnapshot = {
  anchor?: string;
  expanded?: readonly string[];
  focus?: string;
  listState?: StateSnapshot;
};

export type MobileSourceToken = {
  workspaceId: string;
  location: string;
  restoration?: MobileRestorationSnapshot;
};

type BackHandler = (intent: MobileBackIntent) => boolean | void;

type VisualLayer = {
  id: symbol;
  parent?: symbol;
  enabled: () => boolean;
  interactive: boolean;
  handle: BackHandler;
};

type SemanticDestination = {
  kind: MobileDestinationKind;
  back?: BackHandler;
  up?: BackHandler;
};

type InteractiveTransaction = {
  target: symbol | 'destination';
};

const rootKinds = new Set<MobileDestinationKind>([
  'home',
  'all-docs',
  'all-collections',
  'all-tags',
  'journal',
]);

export const isMobileRootDestination = (kind: MobileDestinationKind) =>
  rootKinds.has(kind);

export class MobileBackCoordinator extends Service {
  private readonly visualLayers: VisualLayer[] = [];
  private destination: SemanticDestination = { kind: 'home' };
  private transaction: InteractiveTransaction | undefined;
  private readonly snapshots = new Map<string, MobileRestorationSnapshot>();
  private readonly sources: MobileSourceToken[] = [];

  readonly canHandle$ = new LiveData(false);
  readonly canInteractivePop$ = new LiveData(false);

  registerVisual({
    id = Symbol('mobile-visual-layer'),
    parent,
    enabled = () => true,
    interactive = true,
    handle,
  }: {
    id?: symbol;
    parent?: symbol;
    enabled?: () => boolean;
    interactive?: boolean;
    handle: BackHandler;
  }) {
    const layer: VisualLayer = {
      id,
      parent,
      enabled,
      interactive,
      handle,
    };
    this.visualLayers.push(layer);
    this.publishAvailability();
    return {
      id: layer.id,
      dispose: () => {
        const removed = new Set<symbol>([layer.id]);
        let changed = true;
        while (changed) {
          changed = false;
          for (const candidate of this.visualLayers) {
            if (candidate.parent && removed.has(candidate.parent)) {
              changed = !removed.has(candidate.id) || changed;
              removed.add(candidate.id);
            }
          }
        }
        for (let index = this.visualLayers.length - 1; index >= 0; index--) {
          if (removed.has(this.visualLayers[index].id)) {
            this.visualLayers.splice(index, 1);
          }
        }
        const transactionTarget = this.transaction?.target;
        if (
          transactionTarget &&
          transactionTarget !== 'destination' &&
          removed.has(transactionTarget)
        ) {
          this.transaction = undefined;
        }
        this.publishAvailability();
      },
    };
  }

  setDestination(destination: SemanticDestination) {
    this.destination = destination;
    this.transaction = undefined;
    this.publishAvailability();
  }

  pushSource(source: MobileSourceToken) {
    const previous = this.sources.at(-1);
    if (
      previous?.workspaceId === source.workspaceId &&
      previous.location === source.location
    ) {
      return;
    }
    this.sources.push(source);
  }

  popSource(workspaceId: string) {
    const source = this.sources.at(-1);
    if (!source || source.workspaceId !== workspaceId) return undefined;
    this.sources.pop();
    return source;
  }

  discardSources(count = this.sources.length) {
    this.sources.splice(Math.max(0, this.sources.length - count), count);
  }

  hasSource(workspaceId: string) {
    return this.sources.at(-1)?.workspaceId === workspaceId;
  }

  request(intent: MobileBackIntent) {
    const layer = this.topLayer();
    if (layer) return layer.handle(intent) !== false;
    if (intent === 'ui-up') {
      return this.destination.up
        ? this.destination.up(intent) !== false
        : false;
    }
    if (
      isMobileRootDestination(this.destination.kind) ||
      !this.destination.back
    ) {
      return false;
    }
    return this.destination.back(intent) !== false;
  }

  beginInteractive() {
    if (this.transaction) return false;
    const layer = this.topLayer();
    if (layer) {
      if (!layer.interactive) return false;
      this.transaction = { target: layer.id };
      return true;
    }
    if (
      isMobileRootDestination(this.destination.kind) ||
      !this.destination.back ||
      !this.canInteractivePop$.value
    ) {
      return false;
    }
    this.transaction = { target: 'destination' };
    return true;
  }

  cancelInteractive() {
    this.transaction = undefined;
  }

  commitInteractive() {
    const transaction = this.transaction;
    this.transaction = undefined;
    if (!transaction) return false;
    if (transaction.target === 'destination') {
      return this.request('interactive-gesture');
    }
    const layer = this.visualLayers.find(
      candidate => candidate.id === transaction.target && candidate.enabled()
    );
    return layer?.handle('interactive-gesture') !== false && !!layer;
  }

  handleInteractivePhase(phase: MobileInteractiveBackPhase) {
    if (phase === 'begin') return this.beginInteractive();
    if (phase === 'cancel') {
      this.cancelInteractive();
      return true;
    }
    if (phase === 'commit') return this.commitInteractive();
    return !!this.transaction;
  }

  setSnapshot(key: string, snapshot: MobileRestorationSnapshot) {
    this.snapshots.set(key, snapshot);
  }

  snapshot(key: string) {
    return this.snapshots.get(key);
  }

  reset() {
    this.visualLayers.splice(0);
    this.snapshots.clear();
    this.sources.splice(0);
    this.destination = { kind: 'home' };
    this.transaction = undefined;
    this.publishAvailability();
  }

  private topLayer() {
    for (let index = this.visualLayers.length - 1; index >= 0; index--) {
      const layer = this.visualLayers[index];
      if (layer.enabled()) return layer;
    }
    return undefined;
  }

  private publishAvailability() {
    const layer = this.topLayer();
    const destinationCanPop =
      !isMobileRootDestination(this.destination.kind) &&
      !!this.destination.back;
    this.canHandle$.next(!!layer || destinationCanPop);
    this.canInteractivePop$.next(layer ? layer.interactive : destinationCanPop);
  }

  override dispose() {
    this.reset();
    super.dispose();
  }
}
