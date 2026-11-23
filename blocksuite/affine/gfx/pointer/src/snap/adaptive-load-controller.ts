export class AdaptiveStrideController {
  private _stride = 1;

  private _ticks = 0;

  constructor(
    private readonly _options: {
      heavyCostMs: number;
      maxStride: number;
      recoveryCostMs: number;
    }
  ) {}

  reportCost(costMs: number) {
    if (costMs > this._options.heavyCostMs) {
      this._stride = Math.min(this._options.maxStride, this._stride + 1);
      return;
    }

    if (costMs < this._options.recoveryCostMs && this._stride > 1) {
      this._stride -= 1;
    }
  }

  reset() {
    this._stride = 1;
    this._ticks = 0;
  }

  shouldSkip() {
    const shouldSkip = this._stride > 1 && this._ticks % this._stride !== 0;
    this._ticks += 1;
    return shouldSkip;
  }
}

export class AdaptiveCooldownController {
  private _remainingFrames = 0;

  constructor(
    private readonly _options: {
      cooldownFrames: number;
      maxCostMs: number;
    }
  ) {}

  reportCost(costMs: number) {
    if (costMs > this._options.maxCostMs) {
      this._remainingFrames = this._options.cooldownFrames;
    }
  }

  reset() {
    this._remainingFrames = 0;
  }

  shouldRun() {
    if (this._remainingFrames <= 0) {
      return true;
    }

    this._remainingFrames -= 1;
    return false;
  }
}
