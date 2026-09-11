import { describe, expect, it } from 'vitest';

import { WHITEBOARD_FLAVOURS, WHITEBOARD_SURFACE_CHILDREN } from '../const';
import { ChartBlockSchema } from '../blocks/chart/model';
import { HelloBlockSchema } from '../blocks/hello/model';
import {
  collectStoreExtensions,
  registerGfxWidget,
} from '../register-gfx-widget';

describe('whiteboard scaffold', () => {
  it('uses the wb: namespace for surface widgets', () => {
    expect(HelloBlockSchema.model.flavour).toBe(WHITEBOARD_FLAVOURS.hello);
    expect(HelloBlockSchema.model.parent).toContain('affine:surface');
    expect(WHITEBOARD_SURFACE_CHILDREN).toContain('wb:*');
    expect(WHITEBOARD_SURFACE_CHILDREN).toContain('wb:chart');
    expect(WHITEBOARD_SURFACE_CHILDREN).toContain('wb:sketch');
    expect(WHITEBOARD_SURFACE_CHILDREN).toContain('wb:board');
  });

  it('collects schema extensions from registerGfxWidget', () => {
    const widget = registerGfxWidget({
      flavour: HelloBlockSchema.model.flavour,
      schema: { setup() {} },
      view: { page: 'wb-hello', edgeless: 'wb-hello-edgeless' },
    });

    expect(collectStoreExtensions([widget])).toHaveLength(1);
    expect(widget.flavour).toBe('wb:hello');
  });

  it('registers wb:chart as a gfx surface widget', () => {
    expect(ChartBlockSchema.model.flavour).toBe(WHITEBOARD_FLAVOURS.chart);
    expect(ChartBlockSchema.model.parent).toContain('affine:surface');
    expect(ChartBlockSchema.model.parent).toContain('affine:note');
  });
});
