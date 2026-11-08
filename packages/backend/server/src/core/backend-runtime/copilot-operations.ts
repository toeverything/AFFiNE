import type {
  ByokLocalLeaseOutput,
  ByokPolicyOutput,
  ByokProbeResultOutput,
  ByokProfileOutput,
  CopilotExecuteInput,
  CopilotRouteCheckInput,
  CreateByokLocalLeaseInput,
  CreateByokProfileInput,
  ProbeByokDraftInput,
  ProbeByokProfileInput,
  ReorderByokProfilesInput,
  ReplaceByokProfileInput,
  RotateByokCredentialInput,
} from '../../native';
import { RuntimeEventStream } from './event-stream';
import { BackendRuntimeSearchOperations } from './search-operations';

export class BackendRuntimeOperations extends BackendRuntimeSearchOperations {
  async listByokProfiles(workspaceId: string): Promise<ByokProfileOutput[]> {
    return await this.measured('listByokProfiles', runtime =>
      runtime.listByokProfiles(workspaceId)
    );
  }

  async getByokPolicy(): Promise<ByokPolicyOutput> {
    return await this.measured('getByokPolicy', runtime =>
      Promise.resolve(runtime.getByokPolicy())
    );
  }

  async createByokProfile(
    input: CreateByokProfileInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('createByokProfile', runtime =>
      runtime.createByokProfile(input)
    );
  }

  async replaceByokProfile(
    input: ReplaceByokProfileInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('replaceByokProfile', runtime =>
      runtime.replaceByokProfile(input)
    );
  }

  async rotateByokCredential(
    input: RotateByokCredentialInput
  ): Promise<ByokProfileOutput> {
    return await this.measured('rotateByokCredential', runtime =>
      runtime.rotateByokCredential(input)
    );
  }

  async probeByokProfile(
    input: ProbeByokProfileInput
  ): Promise<ByokProbeResultOutput> {
    return await this.measured('probeByokProfile', runtime =>
      runtime.probeByokProfile(input)
    );
  }

  async probeByokDraft(
    input: ProbeByokDraftInput
  ): Promise<ByokProbeResultOutput> {
    return await this.measured('probeByokDraft', runtime =>
      runtime.probeByokDraft(input)
    );
  }

  async deleteByokProfile(workspaceId: string, profileId: string) {
    return await this.measured('deleteByokProfile', runtime =>
      runtime.deleteByokProfile(workspaceId, profileId)
    );
  }

  async reorderByokProfiles(
    input: ReorderByokProfilesInput
  ): Promise<ByokProfileOutput[]> {
    return await this.measured('reorderByokProfiles', runtime =>
      runtime.reorderByokProfiles(input)
    );
  }

  async createByokLocalLease(
    input: CreateByokLocalLeaseInput
  ): Promise<ByokLocalLeaseOutput> {
    return await this.measured('createByokLocalLease', runtime =>
      runtime.createByokLocalLease(input)
    );
  }

  async executeCopilot(input: CopilotExecuteInput) {
    const output = await this.measured('executeCopilot', runtime =>
      runtime.executeCopilot(input)
    );
    return JSON.parse(output) as {
      events: Array<{
        type: 'route_selected' | 'route_failed' | 'usage';
        route: {
          profileId: string;
          source: 'server' | 'local' | 'affine_cloud';
          provider: string;
          model: string;
        };
        errorKind?: string;
        usage?: unknown;
      }>;
      result: unknown;
    };
  }

  async assertCopilotRoute(input: CopilotRouteCheckInput) {
    await this.measured('assertCopilotRoute', runtime =>
      runtime.assertCopilotRoute(input)
    );
  }

  streamCopilot<TEvent>(
    input: CopilotExecuteInput,
    toolCallback: (request: string) => Promise<string>,
    options: { maxSteps: number; signal?: AbortSignal }
  ): AsyncIterableIterator<TEvent> {
    const stream = new RuntimeEventStream<TEvent>();
    const endMarker = '__AFFINE_COPILOT_STREAM_END__';
    void this.runtime
      .executeCopilotStream(
        input,
        options.maxSteps,
        (error, value) => {
          if (error) {
            stream.push({
              type: 'error',
              errorKind: 'callback',
              message: error.message,
            } as TEvent);
          } else if (value === endMarker) {
            stream.push();
          } else {
            stream.push(JSON.parse(value) as TEvent);
          }
        },
        async (error, request) => {
          if (error) throw error;
          return await toolCallback(request);
        }
      )
      .then(handle => {
        stream.attach(() => handle.abort());
        if (options.signal?.aborted) handle.abort();
        else
          options.signal?.addEventListener('abort', () => handle.abort(), {
            once: true,
          });
      })
      .catch(error => {
        stream.push({
          type: 'error',
          errorKind: 'setup',
          message: error instanceof Error ? error.message : String(error),
        } as TEvent);
        stream.push();
      });
    return stream;
  }
}
