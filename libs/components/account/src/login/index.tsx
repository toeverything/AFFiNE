/* eslint-disable filename-rules/match */
// import { Authing } from './authing';
import { Firebase } from './firebase';
import { FileSystem } from './fs';

export function Login() {
    return (
        <>
            {/* <Authing /> */}
            {process.env['NX_LOCAL'] ? <FileSystem /> : <Firebase />}
        </>
    );
}
