import type { CodeBlockModel } from '@blocksuite/affine-model';
import { WebContainer } from '@webcontainer/api';

// cross-browser replacement for `Promise.withResolvers`
interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}
const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: any) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

let sharedWebContainer: WebContainer | null = null;
let bootPromise: Promise<WebContainer> | null = null;

const getSharedWebContainer = async (): Promise<WebContainer> => {
  if (sharedWebContainer) {
    return sharedWebContainer;
  }

  if (bootPromise) {
    return bootPromise;
  }

  bootPromise = WebContainer.boot();

  try {
    sharedWebContainer = await bootPromise;
    return sharedWebContainer;
  } catch (e) {
    throw new Error('Failed to boot WebContainer: ' + e);
  }
};

let serveUrl: string | null = null;
let settingServerUrlPromise: Promise<string> | null = null;

const resetServerUrl = () => {
  serveUrl = null;
  settingServerUrlPromise = null;
};

const getServeUrl = async (): Promise<string> => {
  if (serveUrl) {
    return serveUrl;
  }

  if (settingServerUrlPromise) {
    return settingServerUrlPromise;
  }

  const { promise, resolve, reject } = createDeferred<string>();
  settingServerUrlPromise = promise;

  try {
    const webContainer = await getSharedWebContainer();
    await webContainer.fs.writeFile(
      'package.json',
      `{
      "name":"preview",
      "devDependencies":{"serve":"^14.0.0"}
      }`
    );

    const dispose = webContainer.on('server-ready', (_, url) => {
      dispose();
      serveUrl = url;
      resolve(url);
    });

    const installProcess = await webContainer.spawn('npm', ['install']);
    await installProcess.exit;

    const serverProcess = await webContainer.spawn('npx', ['serve']);
    serverProcess.exit
      .then(() => {
        resetServerUrl();
      })
      .catch(e => {
        resetServerUrl();
        reject(e);
      });
  } catch (e) {
    resetServerUrl();
    reject(e);
  }

  return promise;
};

export async function linkWebContainer(
  iframe: HTMLIFrameElement,
  model: CodeBlockModel
) {
  const html = model.props.text.toString();
  const id = model.id;

  const webContainer = await getSharedWebContainer();
  const serveUrl = await getServeUrl();

  await webContainer.fs.writeFile(`${id}.html`, html);
  iframe.src = `${serveUrl}/${id}.html`;
}
