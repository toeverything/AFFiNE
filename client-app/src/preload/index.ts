/* eslint-disable @typescript-eslint/ban-ts-comment */

// tauri preload script can't have `export {}`
// @ts-ignore 'index.ts' cannot be compiled under '--isolatedModules' because it is considered a global script file. Add an import, export, or an empty 'export {}' statement to make it a module.ts(1208)
window.__TAURI_ISOLATION_HOOK__ = payload => {
  console.log('Tauri isolation hook', payload);

  return payload;
};

/**
 * Give AFFiNE app code some env to know it is inside a tauri app.
 */
function setEnvironmentVariables() {
  window.CLIENT_APP = true;
}

setEnvironmentVariables();
