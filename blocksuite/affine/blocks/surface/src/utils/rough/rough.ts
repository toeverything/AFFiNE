import { RoughCanvas } from './canvas.js';
import type { Config } from './core.js';
import { RoughGenerator } from './generator.js';
import { RoughSVG } from './svg.js';

export default {
  canvas(canvas: HTMLCanvasElement, config?: Config): RoughCanvas {
    return new RoughCanvas(canvas, config);
  },

  svg(svg: SVGSVGElement, config?: Config): RoughSVG {
    return new RoughSVG(svg, config);
  },

  generator(config?: Config): RoughGenerator {
    return new RoughGenerator(config);
  },

  newSeed(): number {
    return RoughGenerator.newSeed();
  },
};
