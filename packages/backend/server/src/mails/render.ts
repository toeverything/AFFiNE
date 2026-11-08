import { createElement, type ReactElement, Suspense } from 'react';
import { renderToReadableStream } from 'react-dom/server';

const doctype =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">';

export async function render(component: ReactElement) {
  const stream = await renderToReadableStream(
    createElement(Suspense, null, component),
    { progressiveChunkSize: Number.POSITIVE_INFINITY }
  );
  const decoder = new TextDecoder('utf-8');
  let html = '';

  for await (const chunk of stream) {
    html += decoder.decode(chunk, { stream: true });
  }
  html += decoder.decode();

  return `${doctype}${html.replace(/<!DOCTYPE.*?>/, '')}`;
}
