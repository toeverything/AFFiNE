import fs from 'node:fs/promises';
import { argv, exit } from 'node:process';

import xml2js from 'xml2js';

function date() {
  let dt = new Date();
  let date = ('0' + dt.getDate()).slice(-2);
  let month = ('0' + (dt.getMonth() + 1)).slice(-2);
  let year = dt.getFullYear();
  return `${year}-${month}-${date}`;
}

async function add_release(path, version) {
  let appstreamXml = await fs.readFile(path);
  const appstream = await xml2js.parseStringPromise(appstreamXml);
  const releases = appstream.component.releases[0].release;

  for (const release of releases) {
    if (release.$.version === version) {
      console.error(`version ${version} already exists`);
      exit(1);
    }
  }

  const newRelease = {
    $: { version, date: date() },
    url: [`https://github.com/toeverything/AFFiNE/releases/tag/v${version}`],
  };
  releases.push(newRelease);

  const builder = new xml2js.Builder();
  appstreamXml = builder.buildObject(appstream);
  await fs.writeFile(path, appstreamXml);
}

const args = argv.slice(2);
if (args.length !== 2) {
  console.log(
    'Usage: node update-appstream.mjs <app.metainfo.xml path> <new release version>'
  );
  exit(1);
}
await add_release(...args);
