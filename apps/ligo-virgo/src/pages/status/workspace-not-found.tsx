import { Error } from '@toeverything/components/account';

export function WorkspaceNotFound() {
    return (
        <Error
            subTitle="No workspace is found, please contact the admin"
            action1Text="Login or Register"
            clearOnClick={true}
        />
    );
}

export default WorkspaceNotFound;
