## How the IPC System Works

### 1. Main Process: Decorating Methods & Properties

**IPC Handlers (API Methods):**

- Decorated with `@IpcHandle({ scope: 'category', name?: 'methodName' })`
- These are methods in service classes that handle requests from the renderer
- Example:
  ```typescript
  @IpcHandle({ scope: 'ui' })
  showMainWindow() {
    this.mainWindow.show();
    return true;
  }
  ```

**IPC Events:**

- Decorated with `@IpcEvent({ scope: 'category', name?: 'eventName' })`
- Typically RxJS Subjects or EventEmitters that emit events to the renderer
- Example:
  ```typescript
  @IpcEvent({ scope: 'ui' })
  maximized$ = new Subject<void>();
  ```

### 2. Helper Process: The Different IPC Strategy

**Helper Process Overview:**

- Helper processes run in a separate Node.js context using Electron's `utilityProcess` API
- They handle operations requiring Node.js APIs without affecting main process responsiveness
- Communication uses a combination of standard IPC handlers and AsyncCall-RPC

**IPC Module Configuration:**

- Helper uses a lightweight IPC configuration via `ElectronIpcModule.forHelper()`
- Unlike main process, it doesn't include the `IpcMainInitializerService`
- It still uses the `IpcScanner` to find decorated handlers
- Example:
  ```typescript
  @Module({
    imports: [
      ElectronIpcModule.forHelper(),
      // Other modules...
    ],
  })
  export class HelperAppModule {}
  ```

**Main-to-Helper RPC Communication:**

- Helper process does not have access to Electron apis. So we need to use RPC to delegate Electron apis to the helper process.
- Uses AsyncCall-RPC library for type-safe RPC between processes
- Helper process exposes APIs via `MainRpcService`:

  ```typescript
  @Injectable()
  export class MainRpcService implements OnModuleInit {
    rpc: AsyncVersionOf<MainToHelper> | null = null;

    onModuleInit() {
      this.rpc = AsyncCall<MainToHelper>(null, {
        channel: {
          on(listener) {
            // Setup message event listeners
            process.parentPort.on('message', e => listener(e.data));
            // Return unsubscribe function
          },
          send(data) {
            process.parentPort.postMessage(data);
          },
        },
      });
    }
  }
  ```

- Main process connects to helper via `HelperProcessService`:

  ```typescript
  // Main process provides APIs to helper process
  const mainToHelperServer: MainToHelper = {
    ...dialogMethods,
    ...shellMethods,
    ...appMethods,
  };

  // RPC client for calling helper methods
  this.rpcToHelper = AsyncCall<HelperToMain>(mainToHelperServer, {
    channel: new MessageEventChannel(this.utilityProcess),
  });
  ```

### 3. Type & Metadata Generation

1. **Parse IPC Decorators:**

   - `parseIpcHandlers` extracts information from `@IpcHandle` decorated methods
   - `parseIpcEvents` extracts information from `@IpcEvent` decorated properties
   - Both analyze parameter types, return types, and documentation

2. **Generate Type Files:**

   - `ipc-api-types.gen.ts`: Interface for API methods (`ElectronApis`)
   - `ipc-event-types.gen.ts`: Interface for event subscriptions (`ElectronEvents`)
   - `ipc-meta.gen.ts`: Registration metadata for the preload script

3. **Generated Types Example:**

   ```typescript
   // In ipc-api-types.gen.ts
   export interface ElectronApis {
     ui: {
       showMainWindow(): Promise<boolean>;
     };
   }

   // In ipc-event-types.gen.ts
   export interface ElectronEvents {
     ui: {
       onMaximized(callback: () => void): () => void;
     };
   }
   ```

### 4. Preload Process: The Bridge

1. **IPC Registration:**

   - Uses the `ipc-meta.gen.ts` file to know which methods and events exist
   - Registers handlers for all API methods using `ipcRenderer.invoke`
   - Sets up event listeners for all registered events

2. **Type-Safe Bridge Creation:**
   - Creates proxy objects matching the generated interfaces
   - Exposes these to the renderer process via `contextBridge.exposeInMainWorld`

### 5. Renderer Process: Type-Safe Access

1. **API Calls:**

   - Call methods via the exposed API with full TypeScript support
   - Example: `electron.ui.showMainWindow().then(result => console.log(result))`
   - Benefits: Auto-completion, parameter type checking, return type safety

2. **Event Subscription:**
   - Subscribe to events with typed callbacks
   - Example: `const unsubscribe = electron.ui.onMaximized(() => console.log('Window maximized'))`
   - Benefits: Type-safe event payloads, proper unsubscribe pattern

```
┌────────────────────────────────────────────────────────────────────────┐
│                            MAIN PROCESS                                │
│                                                                        │
│  ┌────────────────────────────┐        ┌────────────────────────────┐  │
│  │ Service Classes            │        │ Event Sources              │  │
│  │                            │        │                            │  │
│  │ @IpcHandle({               │        │ @IpcEvent({                │  │
│  │   scope: IpcScope.UI,      │        │   scope: IpcScope.UI,      │  │
│  │   name?: 'methodName'      │        │   name?: 'eventName'       │  │
│  │ })                         │        │ })                         │  │
│  │ async method(...) {...}    │        │ event$ = new Subject<T>()  │  │
│  └─────────────┬──────────────┘        └──────────────┬─────────────┘  │
│                │                                      │                │
│  ┌─────────────▼──────────────┐        ┌──────────────▼─────────────┐  │
│  │ IpcScanner                 │        │ IpcScanner                 │  │
│  │ - scanHandlers()           │        │ - scanEventSources()       │  │
│  │ - Extracts metadata        │        │ - Extracts metadata        │  │
│  │ - Maps channel -> handler  │        │ - Maps channel -> event$   │  │
│  └─────────────┬──────────────┘        └──────────────┬─────────────┘  │
│                │                                      │                │
│  ┌─────────────▼──────────────────────────────────────▼─────────────┐  │
│  │ IpcMainInitializerService                                        │  │
│  │                                                                  │  │
│  │ - registerHandlers: Sets up ipcMain.handle for all API methods   │  │
│  │ - registerEventEmitters: Subscribes to all event sources         │  │
│  │ - broadcastToAllWindows: Sends events to renderer processes      │  │
│  └──────────────────────────────┬───────────────────────────────────┘  │
│                                 │                                      │
│  ┌──────────────────────────────┴────────────────────────────────┐     │
│  │ HelperProcessService                                          │     │
│  │                                                               │     │
│  │ - Spawns and manages the helper process                       │     │
│  │ - Provides bridge between renderer and helper                 │     │
│  │ - Exposes (Electron) RPC interface to helper process          │     │
│  │   rpcToHelper: AsyncVersionOf<HelperToMain>                   │     │
│  └─────────────────────────────┬─────────────────────────────────┘     │
│                                │                                       │
└────────────────────────────────┼───────────────────────────────────────┘
                                 │
                ┌────────────────┴────────────────────┐
                │                                     │
                ▼                                     ▼
┌──────────────────────────────────┐  ┌─────────────────────────────────┐
│       HELPER PROCESS             │  │       TYPE GENERATION           │
│                                  │  │         (Build-time)            │
│  ┌────────────────────────────┐  │  │                                 │
│  │ MainRpcService             │  │  │  ┌────────────────────────┐     │
│  │                            │  │  │  │ Generate TypeScript    │     │
│  │ - Uses AsyncCall-RPC       │  │  │  │ interfaces from        │     │
│  │ - Exposes MainToHelper API │  │  │  │ decorated methods      │     │
│  │   (dialog, shell, app)     │  │  │  │ and properties         │     │
│  │                            │  │  │  └──────────┬─────────────┘     │
│  └────────────┬───────────────┘  │  │             │                   │
│               │                  │  │             ▼                   │
│  ┌────────────▼───────────────┐  │  │  ┌────────────────────────────┐ │
│  │ ElectronIpcModule.forHelper│  │  │  │ Generated Files:           │ │
│  │                            │  │  │  │ - ipc-api-types.gen.ts     │ │
│  │ - No IpcMainInitializer    │  │  │  │ - ipc-event-types.gen.ts   │ │
│  │ - Only provides IpcScanner │  │  │  │ - ipc-meta.gen.ts          │ │
│  │ - No event broadcasting    │  │  │  └────────────┬───────────────┘ │
│  └────────────┬───────────────┘  │  │               │                 │
│               │                  │  └───────────────┼─────────────────┘
│  ┌────────────▼───────────────┐  │                  │
│  │ Service Classes            │  │                  │
│  │                            │  │                  │
│  │ @IpcHandle({               │  │                  ▼
│  │   scope: IpcScope.WORKSPACE│  │  ┌─────────────────────────────────┐
│  │   name?: 'methodName'      │  │  │       PRELOAD PROCESS           │
│  │ })                         │  │  │                                 │
│  │ async method(...) {...}    │  │  │  ┌────────────────────────────┐ │
│  └────────────────────────────┘  │  │  │  IPC Bridge Setup          │ │
│                                  │  │  │                            │ │
└──────────────────────────────────┘  │  │  - Creates type-safe APIs  │ │
                                      │  │  - to ipcRenderer.invoke   │ │
                                      │  │  - Sets up event listeners │ │
                                      │  └──────────┬─────────────────┘ │
                                      │             │                   │
                                      │             ▼                   │
                                      │  ┌────────────────────────────┐ │
                                      │  │ contextBridge.exposeInMain │ │
                                      │  │                            │ │
                                      │  │ electron: {                │ │
                                      │  │   ui: { ... },             │ │
                                      │  │   workspace: { ... }       │ │
                                      │  │ }                          │ │
                                      │  └──────────┬─────────────────┘ │
                                      │             │                   │
                                      └─────────────┼───────────────────┘
                                                    │
                                                    ▼
                                      ┌─────────────────────────────────┐
                                      │      RENDERER PROCESS           │
                                      │                                 │
                                      │  ┌────────────────────────────┐ │
                                      │  │ Type-Safe IPC Access       │ │
                                      │  │                            │ │
                                      │  │ - API calls                │ │
                                      │  │   electron.ui.method()     │ │
                                      │  │                            │ │
                                      │  │ - Event subscriptions      │ │
                                      │  │   electron.ui.onEvent(cb)  │ │
                                      │  └────────────────────────────┘ │
                                      │                                 │
                                      └─────────────────────────────────┘

```
