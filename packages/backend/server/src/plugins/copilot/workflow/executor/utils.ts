import { Logger, OnModuleInit } from '@nestjs/common';

import { WorkflowExecutor, type WorkflowExecutorType } from './types';

const WORKFLOW_EXECUTOR: Map<string, WorkflowExecutor> = new Map();

function registerWorkflowExecutor(e: WorkflowExecutor) {
  const existing = WORKFLOW_EXECUTOR.get(e.type);
  if (existing && existing === e) return false;
  WORKFLOW_EXECUTOR.set(e.type, e);
  return true;
}

export function getWorkflowExecutor(
  type: WorkflowExecutorType
): WorkflowExecutor {
  const executor = WORKFLOW_EXECUTOR.get(type);
  if (!executor) {
    throw new Error(`Executor ${type} not defined`);
  }

  return executor;
}

export abstract class AutoRegisteredWorkflowExecutor
  extends WorkflowExecutor
  implements OnModuleInit
{
  onModuleInit() {
    this.register();
  }

  register() {
    if (registerWorkflowExecutor(this)) {
      new Logger(`CopilotWorkflowExecutor:${this.type}`).log(
        'Workflow executor registered.'
      );
    }
  }
}
