import {
    getAuth,
    onAuthStateChanged,
    User as FirebaseUser,
} from 'firebase/auth';
import { atom, useAtom } from 'jotai';
import { useEffect, useMemo } from 'react';

import { useIdentifyUser } from '@toeverything/datasource/feature-flags';
import { UserInfo } from '@toeverything/utils';

function _fromFirebaseUser(firebaseUser: FirebaseUser): UserInfo {
    return {
        id: firebaseUser.uid,
        nickname: firebaseUser.displayName,
        username: firebaseUser.displayName,
        email: firebaseUser.email,
        photo: firebaseUser.photoURL,
    };
}

const _userAtom = atom<UserInfo | undefined>(undefined as UserInfo);
const _loadingAtom = atom<boolean>(true);

const _useUserAndSpace = () => {
    const [user, setUser] = useAtom(_userAtom);
    const [loading, setLoading] = useAtom(_loadingAtom);
    const identifyUser = useIdentifyUser();

    useEffect(() => {
        if (loading) {
            const auth = getAuth();
            const oncePromise = new Promise<void>(resolve => {
                // let resolved = false;
                onAuthStateChanged(auth, async fbuser => {
                    if (fbuser) {
                        const user = _fromFirebaseUser(fbuser);
                        await identifyUser({
                            userName: user.nickname,
                            id: user.id,
                            email: user.email,
                            // country: user.city
                        });
                        setUser(user);
                        setLoading(false);
                    }
                    resolve();
                });
            });
            Promise.all([oncePromise]).finally(() => {
                setLoading(false);
            });
        }
    }, []);

    const currentSpaceId: string | undefined = useMemo(() => user?.id, [user]);

    return {
        user,
        currentSpaceId,
        loading,
    };
};

const _useUserAndSpacesForFreeLogin = () => {
    const [loading] = useAtom(_loadingAtom);

    useEffect(() => setLoading(false), []);
    const BRAND_ID = 'AFFiNE';
    return {
        user: {
            photo: '',
            id: BRAND_ID,
            nickname: BRAND_ID,
            email: '',
        } as UserInfo,
        currentSpaceId: BRAND_ID,
        loading,
    };
};
export const useUserAndSpaces = process.env['NX_FREE_LOGIN']
    ? _useUserAndSpacesForFreeLogin
    : _useUserAndSpace;
