import { log } from './logger';

interface CreateNoopWithMessageProps {
    module?: string;
    message: string;
    level?: 'info' | 'warn' | 'error';
}

export function createNoopWithMessage(
    props: CreateNoopWithMessageProps
): (...p: any[]) => any {
    const { message, level = 'info', module } = props;
    const module_log = module ? log.get(module) : log;
    return () => {
        module_log[level](message);
    };
}
