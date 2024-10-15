# dialogs

This folder contains all the dialogs in the app, such as "sign in/out dialog", "create workspace dialog", etc.

<AllDialogs /> in `index.tsx` will mount all dialogs. Whether each dialog is displayed or not is controlled by the global service.

Some components that need to be mounted all the time will also be placed in this folder, but this is not a best practice and should be properly handled in the future.
