import './config';

import { Module } from '@nestjs/common';

import { MobileDebugEvalController } from './controller';
import { MobileDebugEvalService } from './service';

/**
 * Debug-only remote-eval bridge into the live mobile PWA session.
 *
 * Problem this solves: Safari remote debugging over cable has repeatedly
 * failed to give enough signal for mobile-specific bugs this session
 * (viewport/keyboard timing issues), and the fallback -- edit source, full
 * Docker rebuild, redeploy, wait for a manual tap, read static logs --
 * costs minutes per probe. This lets a query be pushed into the running
 * PWA and answered in roughly one poll interval instead.
 *
 * Deliberately a throwaway: disabled by default (`AFFINE_MOBILE_DEBUG_EVAL_ENABLED`),
 * gated by its own shared-secret token (not tied to a real user), in-memory
 * only (no persistence), single-outstanding-command (no queue). Not meant
 * to survive past the usability-bug investigation it was built for -- see
 * the PR-reconstruction note wherever this module is referenced.
 */
@Module({
  providers: [MobileDebugEvalService],
  controllers: [MobileDebugEvalController],
})
export class MobileDebugEvalModule {}
