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
                        identifyUser({
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

    return { user, currentSpaceId, loading };
};

const BRAND_ID = 'AFFiNE';

const _localTrigger = atom<boolean>(false);
const _useUserAndSpacesForFreeLogin = () => {
    const [user, setUser] = useAtom(_userAtom);
    const [loading, setLoading] = useAtom(_loadingAtom);
    const [localTrigger] = useAtom(_localTrigger);

    useEffect(() => setLoading(false), []);

    useEffect(() => {
        if (localTrigger) {
            setUser({
                photo: '',
                id: BRAND_ID,
                username: BRAND_ID,
                nickname: BRAND_ID,
                email: '',
            });
        }
    }, [localTrigger, setLoading, setUser]);

    const currentSpaceId: string | undefined = useMemo(() => user?.id, [user]);

    return { user, currentSpaceId, loading };
};

export const useLocalTrigger = () => {
    const [, setTrigger] = useAtom(_localTrigger);
    return () => setTrigger(true);
};

export const useUserAndSpaces = process.env['NX_LOCAL']
    ? _useUserAndSpacesForFreeLogin
    : _useUserAndSpace;
