interface PathCommand {
  command: string;
  coordinates: number[];
}

/**
 * A utility class for building SVG path strings using command-based API.
 * Supports moveTo, lineTo, curveTo operations and can build complete path strings.
 */
export class SVGPathBuilder {
  private commands: PathCommand[] = [];

  /**
   * Move to a specific point without drawing
   */
  moveTo(x: number, y: number): this {
    this.commands.push({
      command: 'M',
      coordinates: [x, y],
    });
    return this;
  }

  /**
   * Draw a line to a specific point
   */
  lineTo(x: number, y: number): this {
    this.commands.push({
      command: 'L',
      coordinates: [x, y],
    });
    return this;
  }

  /**
   * Draw a cubic Bézier curve
   */
  curveTo(
    cp1x: number,
    cp1y: number,
    cp2x: number,
    cp2y: number,
    x: number,
    y: number
  ): this {
    this.commands.push({
      command: 'C',
      coordinates: [cp1x, cp1y, cp2x, cp2y, x, y],
    });
    return this;
  }

  /**
   * Close the current path
   */
  closePath(): this {
    this.commands.push({
      command: 'Z',
      coordinates: [],
    });
    return this;
  }

  /**
   * Build the complete SVG path string
   */
  build(): string {
    const pathSegments = this.commands.map(cmd => {
      const coords = cmd.coordinates.join(' ');
      return coords ? `${cmd.command} ${coords}` : cmd.command;
    });

    return pathSegments.join(' ');
  }

  /**
   * Clear all commands and reset the builder
   */
  clear(): this {
    this.commands = [];
    return this;
  }
}

/**
 * Create SVG polygon points string for common shapes
 */
export class SVGShapeBuilder {
  /**
   * Generate diamond (rhombus) polygon points
   */
  static diamond(
    width: number,
    height: number,
    strokeWidth: number = 0
  ): string {
    const halfStroke = strokeWidth / 2;
    return [
      `${width / 2},${halfStroke}`,
      `${width - halfStroke},${height / 2}`,
      `${width / 2},${height - halfStroke}`,
      `${halfStroke},${height / 2}`,
    ].join(' ');
  }

  /**
   * Generate triangle polygon points
   */
  static triangle(
    width: number,
    height: number,
    strokeWidth: number = 0
  ): string {
    const halfStroke = strokeWidth / 2;
    return [
      `${width / 2},${halfStroke}`,
      `${width - halfStroke},${height - halfStroke}`,
      `${halfStroke},${height - halfStroke}`,
    ].join(' ');
  }

  /**
   * Generate diamond path using SVGPathBuilder
   */
  static diamondPath(
    width: number,
    height: number,
    strokeWidth: number = 0
  ): string {
    const halfStroke = strokeWidth / 2;
    const pathBuilder = new SVGPathBuilder();

    return pathBuilder
      .moveTo(width / 2, halfStroke)
      .lineTo(width - halfStroke, height / 2)
      .lineTo(width / 2, height - halfStroke)
      .lineTo(halfStroke, height / 2)
      .closePath()
      .build();
  }

  /**
   * Generate triangle path using SVGPathBuilder
   */
  static trianglePath(
    width: number,
    height: number,
    strokeWidth: number = 0
  ): string {
    const halfStroke = strokeWidth / 2;
    const pathBuilder = new SVGPathBuilder();

    return pathBuilder
      .moveTo(width / 2, halfStroke)
      .lineTo(width - halfStroke, height - halfStroke)
      .lineTo(halfStroke, height - halfStroke)
      .closePath()
      .build();
  }
}
