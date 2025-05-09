import { html } from 'lit';
import { customElement } from 'lit/decorators.js';

import { BlockComponent, GfxBlockComponent } from '../view/index.js';
import type {
  HeadingBlockModel,
  NoteBlockModel,
  RootBlockModel,
  SurfaceBlockModel,
  TestGfxBlockModel,
} from './test-schema.js';

@customElement('test-root-block')
export class RootBlockComponent extends BlockComponent<RootBlockModel> {
  override renderBlock() {
    return html`
      <div class="test-root-block">${this.renderChildren(this.model)}</div>
    `;
  }
}

@customElement('test-note-block')
export class NoteBlockComponent extends BlockComponent<NoteBlockModel> {
  override renderBlock() {
    return html`
      <div class="test-note-block">${this.renderChildren(this.model)}</div>
    `;
  }
}

@customElement('test-h1-block')
export class HeadingH1BlockComponent extends BlockComponent<HeadingBlockModel> {
  override renderBlock() {
    return html` <div class="test-heading-block h1">${this.model.text}</div> `;
  }
}

@customElement('test-h2-block')
export class HeadingH2BlockComponent extends BlockComponent<HeadingBlockModel> {
  override renderBlock() {
    return html` <div class="test-heading-block h2">${this.model.text}</div> `;
  }
}

@customElement('test-surface-block')
export class SurfaceBlockComponent extends BlockComponent<SurfaceBlockModel> {
  override renderBlock() {
    return html`
      <div class="test-surface-block">${this.renderChildren(this.model)}</div>
    `;
  }
}

@customElement('test-gfx-block')
export class TestGfxBlockComponent extends GfxBlockComponent<TestGfxBlockModel> {
  override renderGfxBlock() {
    return html`
      <div class="test-gfx-block">${this.renderChildren(this.model)}</div>
    `;
  }
}
