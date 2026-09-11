export { WhiteboardPerfHud } from './hud';
export { drawSprites2d } from './l0-renderer';
export {
  cullSprites,
  hitTestSprites,
  isL0HostFlavour,
  shouldActivateL0Layer,
  toL0Sprites,
} from './l0-scene';
export { WhiteboardLayoutHandlerExtensions } from './layout-handler';
export {
  getWidgetLodLevel,
  type LiveCandidate,
  livePriorityScore,
  type LiveWidgetKind,
  pickLiveIds,
  tryLive,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from './policy';
export { WhiteboardPerfPolicyExtension } from './policy-extension';
export {
  isInlineSnapshotSrc,
  SnapshotCache,
  snapshotCache,
} from './snapshot-cache';
export {
  applyStressFixture,
  applyStressPlan,
  buildStressPlan,
  createStoreStressApplier,
  type StressStore,
  WHITEBOARD_STRESS_FIXTURE,
} from './stress';
export {
  type L0BackendKind,
  readSocketRttSample,
  startRttProbe,
  type WhiteboardPerfSnapshot,
  whiteboardTelemetry,
} from './telemetry';
