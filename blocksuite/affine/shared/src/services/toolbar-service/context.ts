import { nextTick } from '@blocksuite/global/utils';
import {
  BlockComponent,
  BlockSelection,
  type BlockStdScope,
  SurfaceSelection,
} from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  type GfxElementModelView,
  type GfxModel,
} from '@blocksuite/std/gfx';
import type {
  BaseSelection,
  BlockModel,
  SelectionConstructor,
} from '@blocksuite/store';

import { DocModeProvider } from '../doc-mode-service';
import { EditPropsStore } from '../edit-props-store';
import { FeatureFlagService } from '../feature-flag-service';
import { TelemetryProvider, type TelemetryService } from '../telemetry-service';
import { ThemeProvider } from '../theme-service';
import { ToolbarRegistryIdentifier } from './registry';

abstract class ToolbarContextBase {
  constructor(readonly std: BlockStdScope) {}

  get command() {
    return this.std.command;
  }

  get chain() {
    return this.command.chain();
  }

  get doc() {
    return this.store.doc;
  }

  get workspace() {
    return this.std.workspace;
  }

  get host() {
    return this.std.host;
  }

  get clipboard() {
    return this.std.clipboard;
  }

  get selection() {
    return this.std.selection;
  }

  get store() {
    return this.std.store;
  }

  get history() {
    return this.store.history.undoManager;
  }

  get view() {
    return this.std.view;
  }

  get activated() {
    if (this.readonly) return false;
    if (this.flags.accept()) return true;
    if (this.host.event.active) return true;
    // Selects `embed-synced-doc-block`
    if (this.host.contains(document.activeElement)) return true;
    return this.isEdgelessMode;
  }

  get readonly() {
    return this.store.readonly;
  }

  get docModeProvider() {
    return this.std.get(DocModeProvider);
  }

  get editorMode() {
    return this.docModeProvider.getEditorMode() ?? 'page';
  }

  get isPageMode() {
    return this.editorMode === 'page';
  }

  get isEdgelessMode() {
    return this.editorMode === 'edgeless';
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get theme() {
    return this.std.get(ThemeProvider);
  }

  get settings() {
    return this.std.get(EditPropsStore);
  }

  get features() {
    return this.std.get(FeatureFlagService);
  }

  get toolbarRegistry() {
    return this.std.get(ToolbarRegistryIdentifier);
  }

  get flags() {
    return this.toolbarRegistry.flags;
  }

  get flavour$() {
    return this.toolbarRegistry.flavour$;
  }

  get placement$() {
    return this.toolbarRegistry.placement$;
  }

  get message$() {
    return this.toolbarRegistry.message$;
  }

  get elementsMap$() {
    return this.toolbarRegistry.elementsMap$;
  }

  get hasSelectedSurfaceModels() {
    return (
      this.flavour$.peek().includes('surface') &&
      this.elementsMap$.peek().size > 0
    );
  }

  getSurfaceModels() {
    if (this.hasSelectedSurfaceModels) {
      const flavour = this.flavour$.peek();
      const elementsMap = this.elementsMap$.peek();
      const elements = [
        'affine:surface',
        'affine:surface:locked',
        'affine:surface:alignment',
      ].includes(flavour)
        ? Array.from(elementsMap.values()).flat()
        : elementsMap.get(flavour);
      return elements ?? [];
    }
    return [];
  }

  getSurfaceModelsByType<T extends abstract new (...args: any) => any>(
    klass: T
  ) {
    return this.getSurfaceModels().filter(e => this.matchModel(e, klass));
  }

  getSurfaceBlocksByType<T extends abstract new (...args: any) => any>(
    klass: T
  ) {
    if (this.hasSelectedSurfaceModels) {
      const elements = this.elementsMap$.peek().get(this.flavour$.peek());
      if (elements?.length) {
        return elements
          .map(model => this.gfx.view.get(model.id))
          .filter(block => block && this.matchBlock(block, klass));
      }
    }
    return [];
  }

  getCurrentBlockBy<T extends SelectionConstructor>(type: T) {
    const getFromSelection = () => {
      const selection = this.selection.find(type);
      if (!selection) return null;
      if (selection.is(SurfaceSelection)) {
        const elementId = selection.elements[0];
        const model = this.gfx.getElementById(elementId);
        if (!model) return null;
        return this.gfx.view.get(model.id) ?? null;
      }
      const model = this.store.getBlock(selection.blockId);
      if (!model) return null;
      return this.view.getBlock(model.id);
    };

    const getFromMessage = () => {
      const block = this.message$.peek()?.element;
      return block instanceof BlockComponent ? block : null;
    };

    return getFromSelection() ?? getFromMessage();
  }

  getCurrentBlock() {
    return this.hasSelectedSurfaceModels
      ? this.getCurrentBlockBy(SurfaceSelection)
      : this.getCurrentBlockBy(BlockSelection);
  }

  getCurrentBlockByType<T extends abstract new (...args: any) => any>(
    klass: T
  ) {
    const block = this.getCurrentBlock();
    return this.matchBlock(block, klass) ? block : null;
  }

  matchBlock<T extends abstract new (...args: any) => any>(
    component: GfxElementModelView | BlockComponent | null,
    klass: T
  ): component is InstanceType<T> {
    return component instanceof klass;
  }

  getCurrentModelBy<T extends SelectionConstructor>(type: T) {
    const getFromSelection = () => {
      const selection = this.selection.find(type);
      if (!selection) return null;
      if (selection.is(SurfaceSelection)) {
        const elementId = selection.elements[0];
        return elementId ? this.gfx.getElementById(elementId) : null;
      }
      return this.store.getBlock(selection.blockId)?.model ?? null;
    };

    const getFromMessage = () => {
      const block = this.message$.peek()?.element;
      return block instanceof BlockComponent ? block.model : null;
    };

    return getFromSelection() ?? getFromMessage();
  }

  getCurrentModel(): GfxModel | BlockModel | null {
    return this.hasSelectedSurfaceModels
      ? this.getCurrentModelBy(SurfaceSelection)
      : this.getCurrentModelBy(BlockSelection);
  }

  getCurrentModelByType<T extends abstract new (...args: any) => any>(
    klass: T
  ) {
    const model = this.getCurrentModel();
    return this.matchModel(model, klass) ? model : null;
  }

  matchModel<T extends abstract new (...args: any) => any>(
    model: GfxModel | BlockModel | null,
    klass: T
  ): model is InstanceType<T> {
    return model instanceof klass;
  }

  select(group: string, selections: BaseSelection[] = []) {
    nextTick()
      .then(() => this.selection.setGroup(group, selections))
      .catch(console.error);
  }

  show() {
    this.flags.show();
  }

  hide() {
    this.flags.hide();
  }

  reset() {
    this.flags.reset();
    this.message$.value = null;
  }

  get telemetryProvider() {
    return this.std.getOptional(TelemetryProvider);
  }

  track = (...[name, props]: Parameters<TelemetryService['track']>) => {
    const segment = this.hasSelectedSurfaceModels ? 'whiteboard' : 'doc';
    this.telemetryProvider?.track(name, {
      segment,
      page: `${segment} editor`,
      module: 'toolbar',
      ...props,
    });
  };
}

export class ToolbarContext extends ToolbarContextBase {}
