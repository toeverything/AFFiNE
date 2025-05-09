# @blocksuite/affine-ext-loader

Blocksuite extension loader system for AFFiNE, providing a structured way to manage and load extensions in different contexts.

## Usage

### Basic Extension Provider

```typescript
import { BaseExtensionProvider } from '@blocksuite/affine-ext-loader';
import { z } from 'zod';

// Create a custom provider with options
class MyProvider extends BaseExtensionProvider<'my-scope', { enabled: boolean }> {
  name = 'MyProvider';

  schema = z.object({
    enabled: z.boolean(),
  });

  setup(context: Context<'my-scope'>, options?: { enabled: boolean }) {
    super.setup(context, options);
    // Custom setup logic
  }
}
```

### Store Extensions

```typescript
import { StoreExtensionProvider, StoreExtensionManager } from '@blocksuite/affine-ext-loader';
import { z } from 'zod';

// Create a store provider with custom options
class MyStoreProvider extends StoreExtensionProvider<{ cacheSize: number }> {
  override name = 'MyStoreProvider';

  override schema = z.object({
    cacheSize: z.number().min(0),
  });

  override setup(context: StoreExtensionContext, options?: { cacheSize: number }) {
    super.setup(context, options);
    context.register([Ext1, Ext2, Ext3]);
  }
}

// Create and use the store extension manager
const manager = new StoreExtensionManager([MyStoreProvider]);
manager.configure(MyStoreProvider, { cacheSize: 100 });
const extensions = manager.get('store');
```

### View Extensions

```typescript
import { ViewExtensionProvider, ViewExtensionManager } from '@blocksuite/affine-ext-loader';
import { z } from 'zod';

// Create a view provider with custom options
class MyViewProvider extends ViewExtensionProvider<{ theme: string }> {
  override name = 'MyViewProvider';

  override schema = z.object({
    theme: z.enum(['light', 'dark']),
  });

  override setup(context: ViewExtensionContext, options?: { theme: string }) {
    super.setup(context, options);

    context.register([CommonExt]);
    if (context.scope === 'page') {
      context.register([PageExt]);
    } else if (context.scope === 'edgeless') {
      context.register([EdgelessExt]);
    }
    if (options?.theme === 'dark') {
      context.register([DarkModeExt]);
    }
  }

  // Override effect to run one-time initialization logic
  override effect() {
    // This will only run once per provider class
    console.log('Initializing MyViewProvider');
    // Register lit elements
    this.registerLitElements();
  }
}

// Create and use the view extension manager
const manager = new ViewExtensionManager([MyViewProvider]);
manager.configure(MyViewProvider, { theme: 'dark' });

// Get extensions for different view scopes
const pageExtensions = manager.get('page');
const edgelessExtensions = manager.get('edgeless');
```

### One-time Initialization with Effect

View extensions support one-time initialization through the `effect` method. This method is called automatically during setup, but only once per provider class. It's useful for:

- Initializing global state
- Registering lit elements
- Setting up shared resources

```typescript
class MyViewProvider extends ViewExtensionProvider {
  override effect() {
    // This will only run once, even if multiple instances are created
    initializeGlobalState();
    registerLitElements();
    setupGlobalEventListeners();
  }
}
```

### Available View Scopes

The view extension system supports the following scopes:

- `page` - Standard page view
- `edgeless` - Edgeless (whiteboard) view
- `preview-page` - Page preview view
- `preview-edgeless` - Edgeless preview view
- `mobile-page` - Mobile page view
- `mobile-edgeless` - Mobile edgeless view

### Extension Configuration

Extensions can be configured using the `configure` method:

```typescript
// Set configuration directly
manager.configure(MyProvider, { enabled: true });

// Update configuration using a function
manager.configure(MyProvider, prev => {
  if (!prev) return prev;
  return {
    ...prev,
    enabled: !prev.enabled,
  };
});

// Remove configuration
manager.configure(MyProvider, undefined);
```

### Dependency Injection

Both store and view extension managers support dependency injection:

```typescript
// Access the manager through the di container
const viewManager = std.get(ViewExtensionManagerIdentifier);
const pagePreviewExtension = viewManager.get('preview-page');
```
