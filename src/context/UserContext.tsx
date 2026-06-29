import React, { createContext, useContext, useEffect, useState } from 'react';

interface UserContextValue {
    hasMinecraftOwned: boolean | null; // null = no respondido aún
    setHasMinecraftOwned: (owned: boolean) => void;
    username: string | undefined;
    setUsername: (name: string) => void;
    isSetupDone: boolean;
    resetSetup: () => void;
}

const UserContext = createContext<UserContextValue>({
    hasMinecraftOwned: null,
    setHasMinecraftOwned: () => { },
    username: undefined,
    setUsername: () => { },
    isSetupDone: false,
    resetSetup: () => { },
});

export function useUser() {
    return useContext(UserContext);
}

const LS_KEY = 'kb_launcher_user';

interface PersistedUser {
    hasMinecraftOwned: boolean | null;
    username?: string;
}

export function UserProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [hasMinecraftOwned, setHasMinecraftOwnedState] = useState<boolean | null>(null);
    const [username, setUsernameState] = useState<string | undefined>(undefined);


    useEffect(() => {
        try {
            const raw = localStorage.getItem(LS_KEY);
            if (raw) {
                const data: PersistedUser = JSON.parse(raw);
                setHasMinecraftOwnedState(data.hasMinecraftOwned);
                setUsernameState(data.username);
            }
        } catch { }
    }, []);

    useEffect(() => {
        if (hasMinecraftOwned === null && username === undefined) return;
        localStorage.setItem(LS_KEY, JSON.stringify({ hasMinecraftOwned, username }));
    }, [hasMinecraftOwned, username]);

    function setHasMinecraftOwned(owned: boolean) {
        setHasMinecraftOwnedState(owned);
    }

    function setUsername(name: string) {
        setUsernameState(name);
    }

    function resetSetup() {
        localStorage.removeItem(LS_KEY);
        setHasMinecraftOwnedState(null);
        setUsernameState(undefined);
    }

    const isSetupDone =
        hasMinecraftOwned === false && !!username ||
        hasMinecraftOwned === true;

    return (
        <UserContext.Provider value={{
            hasMinecraftOwned,
            setHasMinecraftOwned,
            username,
            setUsername,
            isSetupDone,
            resetSetup,
        }}>
            {children}
        </UserContext.Provider>
    );
}