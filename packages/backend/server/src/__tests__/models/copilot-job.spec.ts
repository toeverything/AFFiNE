import {
  AiJobStatus,
  AiJobType,
  PrismaClient,
  User,
  Workspace,
} from '@prisma/client';
import ava, { TestFn } from 'ava';

import { Config } from '../../base';
import { CopilotJobModel, CopilotTranscriptTaskModel } from '../../models';
import { UserModel } from '../../models/user';
import { WorkspaceModel } from '../../models/workspace';
import { createTestingModule, type TestingModule } from '../utils';

interface Context {
  config: Config;
  module: TestingModule;
  db: PrismaClient;
  user: UserModel;
  workspace: WorkspaceModel;
  copilotJob: CopilotJobModel;
  transcriptTask: CopilotTranscriptTaskModel;
}

const test = ava as TestFn<Context>;

test.before(async t => {
  const module = await createTestingModule();
  t.context.user = module.get(UserModel);
  t.context.workspace = module.get(WorkspaceModel);
  t.context.copilotJob = module.get(CopilotJobModel);
  t.context.transcriptTask = module.get(CopilotTranscriptTaskModel);
  t.context.db = module.get(PrismaClient);
  t.context.config = module.get(Config);
  t.context.module = module;
});

let user: User;
let workspace: Workspace;

test.beforeEach(async t => {
  await t.context.module.initTestingDB();
  user = await t.context.user.create({
    email: 'test@affine.pro',
  });
  workspace = await t.context.workspace.create(user.id);
});

test.after(async t => {
  await t.context.module.close();
});

test('should create a copilot job', async t => {
  const data = {
    workspaceId: workspace.id,
    blobId: 'blob-id',
    createdBy: user.id,
    type: AiJobType.transcription,
  };

  const job = await t.context.copilotJob.create(data);

  t.truthy(job.id);

  const job1 = await t.context.copilotJob.get(job.id);
  t.deepEqual(
    {
      ...data,
      id: job.id,
      status: AiJobStatus.pending,
      payload: {},
    },
    job1
  );
});

test('should get null for non-exist job', async t => {
  const job = await t.context.copilotJob.get('non-exist');
  t.is(job, null);
});

test('should update job', async t => {
  const { id: jobId } = await t.context.copilotJob.create({
    workspaceId: workspace.id,
    blobId: 'blob-id',
    createdBy: user.id,
    type: AiJobType.transcription,
  });

  const hasJob = await t.context.copilotJob.has(
    user.id,
    workspace.id,
    'blob-id'
  );
  t.true(hasJob);

  const job = await t.context.copilotJob.get(jobId);

  const data = {
    status: AiJobStatus.running,
    payload: { foo: 'bar' },
  };
  await t.context.copilotJob.update(jobId, data);
  const job1 = await t.context.copilotJob.get(jobId);
  t.deepEqual(job1, { ...job, ...data });
});

test('should claim job', async t => {
  const { id: jobId } = await t.context.copilotJob.create({
    workspaceId: workspace.id,
    blobId: 'blob-id',
    createdBy: user.id,
    type: AiJobType.transcription,
  });

  const status = await t.context.copilotJob.claim(jobId, user.id);
  t.is(status, AiJobStatus.pending, 'should not claim non-finished job');

  await t.context.copilotJob.update(jobId, { status: AiJobStatus.finished });

  const status1 = await t.context.copilotJob.claim(jobId, 'non-exist-user');
  t.is(
    status1,
    AiJobStatus.finished,
    'should not claim job created by other user'
  );

  const status2 = await t.context.copilotJob.claim(jobId, user.id);
  t.is(status2, AiJobStatus.claimed, 'should claim finished job');

  const status3 = await t.context.copilotJob.get(jobId);
  t.is(
    status3?.status,
    AiJobStatus.claimed,
    'should update job status to claimed'
  );
});

test('should fence transcript dispatch generations atomically', async t => {
  const task = await t.context.transcriptTask.create({
    userId: user.id,
    workspaceId: workspace.id,
    blobId: 'transcript-blob',
    recipeId: 'transcript.audio',
    recipeVersion: 'v1',
    inputSnapshot: { normalizedTranscript: 'source' },
  });
  const adoptions = await Promise.all([
    t.context.transcriptTask.adoptLegacyDispatch(
      task.id,
      null,
      'legacy-generation-a'
    ),
    t.context.transcriptTask.adoptLegacyDispatch(
      task.id,
      null,
      'legacy-generation-b'
    ),
  ]);
  t.is(adoptions.filter(Boolean).length, 1);
  const adopted = await t.context.transcriptTask.get(task.id);
  const adoptedGeneration = adopted?.dispatchGeneration;
  if (!adoptedGeneration) {
    t.fail('legacy dispatch should have a generation');
    return;
  }
  t.true(
    await t.context.transcriptTask.claimDispatch(
      task.id,
      adoptedGeneration,
      null
    )
  );
  t.true(
    await t.context.transcriptTask.completeDispatch(
      task.id,
      adoptedGeneration,
      null,
      {
        status: 'failed',
        protectedResult: { normalizedTranscript: 'source' },
        errorCode: 'provider_failed',
      }
    )
  );

  const claims = await Promise.all([
    t.context.transcriptTask.claimRetry(
      task.id,
      user.id,
      workspace.id,
      null,
      'generation-a'
    ),
    t.context.transcriptTask.claimRetry(
      task.id,
      user.id,
      workspace.id,
      null,
      'generation-b'
    ),
  ]);
  t.is(claims.filter(Boolean).length, 1);

  const claimed = await t.context.transcriptTask.get(task.id);
  const generation = claimed?.dispatchGeneration;
  if (!generation) {
    t.fail('retry should have a dispatch generation');
    return;
  }
  t.false(
    await t.context.transcriptTask.claimDispatch(
      task.id,
      generation === 'generation-a' ? 'generation-b' : 'generation-a',
      null
    )
  );
  t.true(
    await t.context.transcriptTask.claimDispatch(task.id, generation, null)
  );
  t.true(
    await t.context.transcriptTask.attachActionRun(
      task.id,
      generation,
      null,
      'run-next'
    )
  );
  t.false(
    await t.context.transcriptTask.attachActionRun(
      task.id,
      generation,
      null,
      'run-duplicate'
    )
  );
  t.false(
    await t.context.transcriptTask.completeDispatch(
      task.id,
      generation,
      'run-duplicate',
      { status: 'ready' }
    )
  );
  t.true(
    await t.context.transcriptTask.completeDispatch(
      task.id,
      generation,
      'run-next',
      {
        status: 'ready',
        protectedResult: { normalizedTranscript: 'result' },
      }
    )
  );
  t.like(await t.context.transcriptTask.get(task.id), {
    status: 'ready',
    dispatchGeneration: null,
    actionRunId: 'run-next',
  });
});
