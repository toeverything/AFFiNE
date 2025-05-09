# @affine/templates

Manages template files for use in AFFiNE. For now we only support onboarding templates.

## How to update

Before we offer a better solution, to update the onboarding templates:

1. run AFFiNE core locally (dev mode)
2. expose `ZipTransformer` to window. e.g., `import {ZipTransformer} from '@blocksuite/affine/blocks/root'; window.ZipTransformer = ZipTransformer;`
3. run the following script
   ```js
   (async () => {
     // make sure ZipTransformer is imported and attached to window
     const { ZipTransformer } = window;
     await Promise.all([...currentWorkspace.blockSuiteWorkspace.pages.values()].map(p => p.load()));
     // wait for a few more seconds
     await new Promise(resolve => setTimeout(resolve, 5000));
     const zipblob = await ZipTransformer.exportPages(currentWorkspace.blockSuiteWorkspace, [...currentWorkspace.blockSuiteWorkspace.pages.values()]);
     const url = URL.createObjectURL(zipblob);
     const a = document.createElement('a');
     a.setAttribute('href', url);
     a.setAttribute('download', `${currentWorkspace.id}.affine.zip`);
     a.click();
     a.remove();
     URL.revokeObjectURL(url);
   })();
   ```
4. unzip the file, replace the json files into onboarding folder (no need to include the `assets`)
5. run `yarn postinstall` to update the `templates.gen.ts` file
