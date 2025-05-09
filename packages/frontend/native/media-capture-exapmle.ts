import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  Whisper,
  WhisperFullParams,
  WhisperSamplingStrategy,
} from '@napi-rs/whisper';
import { BehaviorSubject, EMPTY, Observable } from 'rxjs';
import {
  distinctUntilChanged,
  exhaustMap,
  groupBy,
  mergeMap,
  switchMap,
  tap,
} from 'rxjs/operators';

import { type Application, ShareableContent } from './index.js';

const rootDir = join(fileURLToPath(import.meta.url), '..');

const shareableContent = new ShareableContent();

const appList = new Set([
  'com.tinyspeck.slackmacgap.helper',
  'us.zoom.xos',
  'org.mozilla.firefoxdeveloperedition',
]);

console.info(shareableContent.applications().map(app => app.bundleIdentifier));

const GGLM_LARGE = join(rootDir, 'ggml-large-v3-turbo.bin');

const whisper = new Whisper(GGLM_LARGE, {
  useGpu: true,
  gpuDevice: 1,
});

const whisperParams = new WhisperFullParams(WhisperSamplingStrategy.Greedy);

const SAMPLE_WINDOW_MS = 3000; // 3 seconds, similar to stream.cpp's step_ms
const SAMPLES_PER_WINDOW = (SAMPLE_WINDOW_MS / 1000) * 16000; // 16kHz sample rate

// eslint-disable-next-line rxjs/finnish
const runningApplications = new BehaviorSubject(
  shareableContent.applications()
);

const applicationListChangedSubscriber =
  ShareableContent.onApplicationListChanged(() => {
    runningApplications.next(shareableContent.applications());
  });

runningApplications
  .pipe(
    mergeMap(apps => apps.filter(app => appList.has(app.bundleIdentifier))),
    groupBy(app => app.bundleIdentifier),
    mergeMap(app$ =>
      app$.pipe(
        exhaustMap(app =>
          new Observable<[Application, boolean]>(subscriber => {
            const stateSubscriber = ShareableContent.onAppStateChanged(
              app,
              err => {
                if (err) {
                  subscriber.error(err);
                  return;
                }
                subscriber.next([app, app.isRunning]);
              }
            );
            return () => {
              stateSubscriber.unsubscribe();
            };
          }).pipe(
            distinctUntilChanged(
              ([_, isRunningA], [__, isRunningB]) => isRunningA === isRunningB
            ),
            switchMap(([app]) =>
              !app.isRunning
                ? EMPTY
                : new Observable(observer => {
                    const buffers: Float32Array[] = [];
                    const audioStream = app.tapAudio((err, samples) => {
                      if (err) {
                        observer.error(err);
                        return;
                      }

                      if (samples) {
                        buffers.push(samples);
                        observer.next(samples);

                        // Calculate total samples in buffer
                        const totalSamples = buffers.reduce(
                          (acc, buf) => acc + buf.length,
                          0
                        );

                        // Process when we have enough samples for our window
                        if (totalSamples >= SAMPLES_PER_WINDOW) {
                          // Concatenate all buffers
                          const concatenated = new Float32Array(totalSamples);
                          let offset = 0;
                          buffers.forEach(buf => {
                            concatenated.set(buf, offset);
                            offset += buf.length;
                          });

                          // Transcribe the audio
                          const result = whisper.full(
                            whisperParams,
                            concatenated
                          );

                          // Print results
                          console.info(result);

                          // Keep any remaining samples for next window
                          const remainingSamples =
                            totalSamples - SAMPLES_PER_WINDOW;
                          if (remainingSamples > 0) {
                            const lastBuffer = buffers[buffers.length - 1];
                            buffers.length = 0;
                            buffers.push(lastBuffer.slice(-remainingSamples));
                          } else {
                            buffers.length = 0;
                          }
                        }
                      }
                    });

                    return () => {
                      audioStream.stop();
                    };
                  })
            )
          )
        )
      )
    ),
    tap({
      finalize: () => {
        applicationListChangedSubscriber.unsubscribe();
      },
    })
  )
  .subscribe();
