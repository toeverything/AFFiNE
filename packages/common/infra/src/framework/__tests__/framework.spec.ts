import { describe, expect, test } from 'vitest';

import {
  CircularDependencyError,
  ComponentNotFoundError,
  createEvent,
  createIdentifier,
  DuplicateDefinitionError,
  Entity,
  Framework,
  MissingDependencyError,
  RecursionLimitError,
  Scope,
  Service,
} from '..';
import { OnEvent } from '../core/event';

describe('framework', () => {
  test('basic', () => {
    const framework = new Framework();
    class TestService extends Service {
      a = 'b';
    }

    framework.service(TestService);

    const provider = framework.provider();
    expect(provider.get(TestService).a).toBe('b');
  });

  test('entity', () => {
    const framework = new Framework();
    class TestService extends Service {
      a = 'b';
    }

    class TestEntity extends Entity<{ name: string }> {
      constructor(readonly test: TestService) {
        super();
      }
    }

    framework.service(TestService).entity(TestEntity, [TestService]);

    const provider = framework.provider();
    const entity = provider.createEntity(TestEntity, {
      name: 'test',
    });
    expect(entity.test.a).toBe('b');
    expect(entity.props.name).toBe('test');
  });

  test('componentCount', () => {
    const framework = new Framework();
    class TestService extends Service {
      a = 'b';
    }

    framework.service(TestService);

    expect(framework.componentCount).toEqual(1);
  });

  test('dependency', () => {
    const framework = new Framework();

    class A extends Service {
      value = 'hello world';
    }

    class B extends Service {
      constructor(public a: A) {
        super();
      }
    }

    class C extends Service {
      constructor(public b: B) {
        super();
      }
    }

    framework.service(A).service(B, [A]).service(C, [B]);

    const provider = framework.provider();

    expect(provider.get(C).b.a.value).toEqual('hello world');
  });

  test('identifier', () => {
    interface Animal extends Service {
      name: string;
    }
    const Animal = createIdentifier<Animal>('Animal');

    class Cat extends Service {
      name = 'cat';
    }

    class Zoo extends Service {
      constructor(public animal: Animal) {
        super();
      }
    }

    const serviceCollection = new Framework();
    serviceCollection.impl(Animal, Cat).service(Zoo, [Animal]);

    const provider = serviceCollection.provider();
    expect(provider.get(Zoo).animal.name).toEqual('cat');
  });

  test('variant', () => {
    const framework = new Framework();

    interface USB extends Service {
      speed: number;
    }

    const USB = createIdentifier<USB>('USB');

    class TypeA extends Service implements USB {
      speed = 100;
    }
    class TypeC extends Service implements USB {
      speed = 300;
    }

    class PC extends Service {
      constructor(
        public typeA: USB,
        public ports: USB[]
      ) {
        super();
      }
    }

    framework
      .impl(USB('A'), TypeA)
      .impl(USB('C'), TypeC)
      .service(PC, [USB('A'), [USB]]);

    const provider = framework.provider();
    expect(provider.get(USB('A')).speed).toEqual(100);
    expect(provider.get(USB('C')).speed).toEqual(300);
    expect(provider.get(PC).typeA.speed).toEqual(100);
    expect(provider.get(PC).ports.length).toEqual(2);
  });

  test('lazy initialization', () => {
    const framework = new Framework();
    interface Command {
      shortcut: string;
      callback: () => void;
    }
    const Command = createIdentifier<Command>('command');

    let pageSystemInitialized = false;

    class PageSystem extends Service {
      mode = 'page';
      name = 'helloworld';

      constructor() {
        super();
        pageSystemInitialized = true;
      }

      switchToEdgeless() {
        this.mode = 'edgeless';
      }

      rename() {
        this.name = 'foobar';
      }
    }

    class CommandSystem extends Service {
      constructor(public commands: Command[]) {
        super();
      }

      execute(shortcut: string) {
        const command = this.commands.find(c => c.shortcut === shortcut);
        if (command) {
          command.callback();
        }
      }
    }

    framework.service(PageSystem);
    framework.service(CommandSystem, [[Command]]);
    framework.impl(Command('switch'), p => ({
      shortcut: 'option+s',
      callback: () => p.get(PageSystem).switchToEdgeless(),
    }));
    framework.impl(Command('rename'), p => ({
      shortcut: 'f2',
      callback: () => p.get(PageSystem).rename(),
    }));

    const provider = framework.provider();
    const commandSystem = provider.get(CommandSystem);

    expect(
      pageSystemInitialized,
      "PageSystem won't be initialized until command executed"
    ).toEqual(false);

    commandSystem.execute('option+s');
    expect(pageSystemInitialized).toEqual(true);
    expect(provider.get(PageSystem).mode).toEqual('edgeless');

    expect(provider.get(PageSystem).name).toEqual('helloworld');
    expect(commandSystem.commands.length).toEqual(2);
    commandSystem.execute('f2');
    expect(provider.get(PageSystem).name).toEqual('foobar');
  });

  test('duplicate, override', () => {
    const framework = new Framework();

    const something = createIdentifier<any>('USB');

    class A {
      a = 'i am A';
    }

    class B {
      b = 'i am B';
    }

    framework.impl(something, A).override(something, B);

    const provider = framework.provider();
    expect(provider.get(something)).toEqual({ b: 'i am B' });
  });

  test('event', () => {
    const framework = new Framework();

    const event = createEvent<{ value: number }>('test-event');

    @OnEvent(event, p => p.onTestEvent)
    class TestService extends Service {
      value = 0;

      onTestEvent(payload: { value: number }) {
        this.value = payload.value;
      }
    }

    framework.service(TestService);

    const provider = framework.provider();
    provider.emitEvent(event, { value: 123 });
    expect(provider.get(TestService).value).toEqual(123);
  });

  test('scope', () => {
    const framework = new Framework();

    class SystemService extends Service {
      appName = 'affine';
    }

    framework.service(SystemService);

    class WorkspaceScope extends Scope {}

    class WorkspaceService extends Service {
      constructor(public system: SystemService) {
        super();
      }
    }

    framework.scope(WorkspaceScope).service(WorkspaceService, [SystemService]);

    class PageScope extends Scope<{ pageId: string }> {}

    class PageService extends Service {
      constructor(
        public workspace: WorkspaceService,
        public system: SystemService
      ) {
        super();
      }
    }

    framework
      .scope(WorkspaceScope)
      .scope(PageScope)
      .service(PageService, [WorkspaceService, SystemService]);

    class EditorScope extends Scope {
      get pageId() {
        return this.framework.get(PageScope).props.pageId;
      }
    }

    class EditorService extends Service {
      constructor(public page: PageService) {
        super();
      }
    }

    framework
      .scope(WorkspaceScope)
      .scope(PageScope)
      .scope(EditorScope)
      .service(EditorService, [PageService]);

    const root = framework.provider();
    expect(root.get(SystemService).appName).toEqual('affine');
    expect(() => root.get(WorkspaceService)).toThrowError(
      ComponentNotFoundError
    );

    const workspaceScope = root.createScope(WorkspaceScope);
    const workspaceService = workspaceScope.get(WorkspaceService);
    expect(workspaceService.system.appName).toEqual('affine');
    expect(() => workspaceScope.get(PageService)).toThrowError(
      ComponentNotFoundError
    );

    const pageScope = workspaceScope.createScope(PageScope, {
      pageId: 'test-page',
    });
    expect(pageScope.props.pageId).toEqual('test-page');
    const pageService = pageScope.get(PageService);
    expect(pageService.workspace).toBe(workspaceService);
    expect(pageService.system.appName).toEqual('affine');

    const editorScope = pageScope.createScope(EditorScope);
    expect(editorScope.pageId).toEqual('test-page');
    const editorService = editorScope.get(EditorService);
    expect(editorService.page).toBe(pageService);
  });

  test('scope event', () => {
    const framework = new Framework();

    const event = createEvent<{ value: number }>('test-event');

    @OnEvent(event, p => p.onTestEvent)
    class TestService extends Service {
      value = 0;

      onTestEvent(payload: { value: number }) {
        this.value = payload.value;
      }
    }

    class TestScope extends Scope {}

    @OnEvent(event, p => p.onTestEvent)
    class TestScopeService extends Service {
      value = 0;

      onTestEvent(payload: { value: number }) {
        this.value = payload.value;
      }
    }

    framework.service(TestService).scope(TestScope).service(TestScopeService);

    const provider = framework.provider();
    const scope = provider.createScope(TestScope);
    scope.emitEvent(event, { value: 123 });
    expect(provider.get(TestService).value).toEqual(0);
    expect(scope.get(TestScopeService).value).toEqual(123);
  });

  test('dispose', () => {
    const framework = new Framework();

    let isSystemDisposed = false;
    class System extends Service {
      appName = 'affine';

      override dispose(): void {
        super.dispose();
        isSystemDisposed = true;
      }
    }

    framework.service(System);

    let isWorkspaceDisposed = false;
    class WorkspaceScope extends Scope {
      override dispose(): void {
        super.dispose();
        isWorkspaceDisposed = true;
      }
    }

    let isWorkspacePageServiceDisposed = false;
    class WorkspacePageService extends Service {
      constructor(
        public workspace: WorkspaceScope,
        public sysmte: System
      ) {
        super();
      }
      override dispose(): void {
        super.dispose();
        isWorkspacePageServiceDisposed = true;
      }
    }

    framework
      .scope(WorkspaceScope)
      .service(WorkspacePageService, [WorkspaceScope, System]);

    {
      using root = framework.provider();

      {
        // create a workspace
        using workspaceScope = root.createScope(WorkspaceScope);
        const pageService = workspaceScope.get(WorkspacePageService);

        expect(pageService).instanceOf(WorkspacePageService);

        expect(
          isSystemDisposed ||
            isWorkspaceDisposed ||
            isWorkspacePageServiceDisposed
        ).toBe(false);
      }
      expect(isWorkspaceDisposed && isWorkspacePageServiceDisposed).toBe(true);

      expect(isSystemDisposed).toBe(false);
    }
    expect(isSystemDisposed).toBe(true);
  });

  test('service not found', () => {
    const framework = new Framework();

    const provider = framework.provider();
    expect(() => provider.get(createIdentifier('SomeService'))).toThrowError(
      ComponentNotFoundError
    );
  });

  test('missing dependency', () => {
    const framework = new Framework();

    class A extends Service {
      value = 'hello world';
    }

    class B extends Service {
      constructor(public a: A) {
        super();
      }
    }

    framework.service(B, [A]);

    const provider = framework.provider();
    expect(() => provider.get(B)).toThrowError(MissingDependencyError);
  });

  test('circular dependency', () => {
    const framework = new Framework();

    class A extends Service {
      constructor(public c: C) {
        super();
      }
    }

    class B extends Service {
      constructor(public a: A) {
        super();
      }
    }

    class C extends Service {
      constructor(public b: B) {
        super();
      }
    }

    framework.service(A, [C]).service(B, [A]).service(C, [B]);

    const provider = framework.provider();
    expect(() => provider.get(A)).toThrowError(CircularDependencyError);
    expect(() => provider.get(B)).toThrowError(CircularDependencyError);
    expect(() => provider.get(C)).toThrowError(CircularDependencyError);
  });

  test('duplicate service definition', () => {
    const serviceCollection = new Framework();

    class A extends Service {}

    serviceCollection.service(A);
    expect(() => serviceCollection.service(A)).toThrowError(
      DuplicateDefinitionError
    );

    class B {}
    const Something = createIdentifier('something');
    serviceCollection.impl(Something, A);
    expect(() => serviceCollection.impl(Something, B)).toThrowError(
      DuplicateDefinitionError
    );
  });

  test('recursion limit', () => {
    // maxmium resolve depth is 100
    const serviceCollection = new Framework();
    const Something = createIdentifier('something');
    let i = 0;
    for (; i < 100; i++) {
      const next = i + 1;

      class Test {
        constructor(_next: any) {}
      }

      serviceCollection.impl(Something(i.toString()), Test, [
        Something(next.toString()),
      ]);
    }

    class Final {
      a = 'b';
    }
    serviceCollection.impl(Something(i.toString()), Final);
    const provider = serviceCollection.provider();
    expect(() => provider.get(Something('0'))).toThrowError(
      RecursionLimitError
    );
  });
});
