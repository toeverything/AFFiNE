import type { TestWorkspace } from '../test';

declare global {
  interface WindowEventMap {
    'test-result': CustomEvent<TestResult>;
  }
  interface Window {
    collection: TestWorkspace;
  }
}

export interface TestResult {
  success: boolean;
  messages: string[];
}

const testResult: TestResult = {
  success: true,
  messages: [],
};

interface TestCase {
  name: string;
  callback: () => Promise<boolean>;
}

let testCases: TestCase[] = [];

function reportTestResult() {
  const event = new CustomEvent<TestResult>('test-result', {
    detail: testResult,
  });
  window.dispatchEvent(event);
}

function addMessage(message: string) {
  console.log(message);
  testResult.messages.push(message);
}

function reject(message: string) {
  testResult.success = false;
  addMessage(`❌ ${message}`);
}

export function testSerial(name: string, callback: () => Promise<boolean>) {
  testCases.push({ name, callback });
}

function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function runOnce() {
  await wait(50); // for correct event sequence

  for (const testCase of testCases) {
    const { name, callback } = testCase;
    const result = await callback();

    if (result) addMessage(`✅ ${name}`);
    else reject(name);
  }
  reportTestResult();
  testCases = [];
}

export async function nextFrame() {
  return new Promise(resolve => requestAnimationFrame(resolve));
}

// Test image source: https://en.wikipedia.org/wiki/Test_card
export async function loadTestImageBlob(name: string): Promise<Blob> {
  const resp = await fetch(`/${name}.png`);
  return resp.blob();
}

export async function loadImage(blobUrl: string) {
  const img = new Image();
  img.src = blobUrl;
  return new Promise<HTMLImageElement>(resolve => {
    img.onload = () => resolve(img);
  });
}

export function assertColor(
  img: HTMLImageElement,
  x: number,
  y: number,
  color: [number, number, number]
): boolean {
  const canvas = document.createElement('canvas');
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(x, y, 1, 1).data;
  const r = data[0];
  const g = data[1];
  const b = data[2];
  return r === color[0] && g === color[1] && b === color[2];
}

// prevent redundant test runs
export function disableButtonsAfterClick() {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(button => {
        button.disabled = true;
      });
    });
  });
}
