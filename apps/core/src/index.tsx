import { assertExists } from '@blocksuite/global/utils';
import { TraceExporter } from '@google-cloud/opentelemetry-cloud-trace-exporter';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { DocumentLoadInstrumentation } from '@opentelemetry/instrumentation-document-load';
import { FetchInstrumentation } from '@opentelemetry/instrumentation-fetch';
import { XMLHttpRequestInstrumentation } from '@opentelemetry/instrumentation-xml-http-request';
import { SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

async function main() {
  await import('./bootstrap/before-app');
  const { App } = await import('./app');
  const root = document.getElementById('app');
  assertExists(root);

  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

function registerTracer() {
  const provider = new WebTracerProvider();
  provider.addSpanProcessor(new SimpleSpanProcessor(new TraceExporter()));

  provider.register({
    propagator: new W3CTraceContextPropagator(),
  });

  registerInstrumentations({
    instrumentations: [
      new DocumentLoadInstrumentation(),
      new XMLHttpRequestInstrumentation(),
      new FetchInstrumentation(),
    ],
  });
}

registerTracer();
await main();
