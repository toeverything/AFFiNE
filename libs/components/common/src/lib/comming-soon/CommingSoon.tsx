import { Tooltip } from '@toeverything/components/ui';
import { useFlag } from '@toeverything/datasource/feature-flags';
function CommingSoon(props: { children: JSX.Element }) {
    const BooleanCommingSoon = useFlag('BooleanCommingSoon', false);
    if (!BooleanCommingSoon) return <></>;
    return (
        <Tooltip content={'Comming Soon'} placement="top">
            {props.children}
        </Tooltip>
    );
}

export { CommingSoon };
