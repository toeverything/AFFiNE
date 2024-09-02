import { CONSTRUCTOR_CONTEXT } from '../constructor-context';
import type { FrameworkProvider } from '../provider';

// eslint-disable-next-line @typescript-eslint/ban-types
export class Component<Props = {}> {
  readonly framework: FrameworkProvider;

  readonly props: Props;

  protected readonly disposables: (() => void)[] = [];

  get eventBus() {
    return this.framework.eventBus;
  }

  constructor() {
    if (!CONSTRUCTOR_CONTEXT.current.provider) {
      throw new Error('Component must be created in the context of a provider');
    }
    this.framework = CONSTRUCTOR_CONTEXT.current.provider;
    this.props = CONSTRUCTOR_CONTEXT.current.props;
    CONSTRUCTOR_CONTEXT.current = {};
  }

  dispose() {
    this.disposables.forEach(dispose => dispose());
  }

  [Symbol.dispose]() {
    this.dispose();
  }
}
