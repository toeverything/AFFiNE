type Token = any;

interface DependencyConfig {
    token: Token;
    lazy?: boolean;
}

export interface Value<T> {
    value: T;
}

export interface DependencyCallOrConstructProps {
    getDependency: <R, T = any>(
        token: T | (new (...p: any[]) => T)
    ) => R extends Value<infer A> ? A : T;
}

interface DependencyCallOrConstruct {
    new (props: DependencyCallOrConstructProps): any;
    (props: DependencyCallOrConstructProps): any;
}

export interface RegisterDependencyConfig {
    type: 'value' | 'function' | 'class';
    value: DependencyCallOrConstruct | any;
    dependencies?: DependencyConfig[];
    /**
     * The unique identifier of the injection, if not passed, the value is equal to value
     */
    token: Token;
}

export class DiContainer {
    private dependency_config = new Map<Token, RegisterDependencyConfig>();
    private dependency_map = new Map<Token, any>();
    private dependency_status = new Map<Token, 'loading' | 'loaded'>();

    private get_create_params(
        config: RegisterDependencyConfig
    ): DependencyCallOrConstructProps {
        const get_dependency: DependencyCallOrConstructProps['getDependency'] =
            token => {
                const found = config.dependencies?.find(
                    dep => dep.token === token
                );
                if (!found) {
                    return null;
                }
                if (found.lazy) {
                    this.load(found.token);
                }
                return this.dependency_map.get(token);
            };

        return {
            getDependency: get_dependency,
        };
    }

    private load(token: Token) {
        if (this.dependency_map.has(token)) {
            return;
        }
        if (this.dependency_status.get(token) === 'loading') {
            throw new Error('Circular dependency', token);
        }
        this.dependency_status.set(token, 'loading');
        const config = this.dependency_config.get(token);
        if (!config) {
            throw new Error('No dependencies found', token);
        }
        switch (config.type) {
            case 'value': {
                this.dependency_map.set(token, config.value);
                break;
            }
            case 'class': {
                const deps = config.dependencies || [];
                deps.forEach(dep => {
                    if (!dep.lazy && !this.dependency_map.has(dep.token)) {
                        this.load(dep.token);
                    }
                });
                this.dependency_map.set(
                    token,
                    new config.value(this.get_create_params(config))
                );
                break;
            }
            case 'function': {
                const deps = config.dependencies || [];
                deps.forEach(dep => {
                    if (!dep.lazy && !this.dependency_map.has(dep.token)) {
                        this.load(dep.token);
                    }
                });
                this.dependency_map.set(
                    token,
                    config.value(this.get_create_params(config))
                );
                break;
            }
            default: {
                console.error(
                    'Unknown type of dependency',
                    config.token,
                    config.type
                );
            }
        }
        this.dependency_status.set(token, 'loaded');
    }

    register(dependencyConfigs: RegisterDependencyConfig[]) {
        dependencyConfigs.forEach(config => {
            this.dependency_config.set(config.token, config);
        });
    }

    getDependency: DependencyCallOrConstructProps['getDependency'] = token => {
        this.load(token);
        return this.dependency_map.get(token);
    };
}
