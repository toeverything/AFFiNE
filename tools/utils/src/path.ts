import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export class Path {
  static dir(url: string) {
    return new Path(fileURLToPath(url)).join('..');
  }

  get value() {
    return this.path;
  }

  get relativePath() {
    return './' + this.path.slice(ProjectRoot.path.length).replace(/\\/g, '/');
  }

  constructor(private readonly path: string) {}

  join(...paths: string[]) {
    return new Path(join(this.path, ...paths));
  }

  parent() {
    return this.join('..');
  }

  toPosixString() {
    if (sep === '\\') {
      return this.path.replaceAll('\\', '/');
    }

    return this.path;
  }

  toString() {
    return this.path;
  }

  exists() {
    return existsSync(this.path);
  }

  rm(opts: { recursive?: boolean } = {}) {
    rmSync(this.path, { ...opts, force: true });
  }

  mkdir() {
    mkdirSync(this.path, { recursive: true });
  }

  readAsFile() {
    return readFileSync(this.path);
  }

  writeFile(content: Buffer | string) {
    writeFileSync(this.path, content);
  }

  stats() {
    return statSync(this.path);
  }

  isFile() {
    return this.exists() && this.stats().isFile();
  }

  isDirectory() {
    return this.exists() && this.stats().isDirectory();
  }

  toFileUrl() {
    return pathToFileURL(this.path);
  }

  relative(to: string) {
    const re = relative(this.value, to);
    if (sep === '\\') {
      return re.replaceAll('\\', '/');
    }

    return re;
  }
}

export const ProjectRoot = Path.dir(import.meta.url).join('../../../');
