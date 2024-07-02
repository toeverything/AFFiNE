import type { Observable } from 'rxjs';

export interface JobParams<Payload = any> {
  batchKey: string;
  payload: Payload;
}

export interface Job<Payload = any> extends JobParams<Payload> {
  id: string;
}

export interface JobQueueStatus {
  remaining: number;
}

export interface JobQueue<Payload> {
  enqueue(jobs: JobParams<Payload>[]): Promise<void>;

  accept(): Promise<Job<Payload>[] | null>;

  waitForAccept(signal: AbortSignal): Promise<Job<Payload>[]>;

  return(jobs: Job<Payload>[], retry?: boolean): Promise<void>;

  clear(): Promise<void>;

  status$: Observable<JobQueueStatus>;
}
