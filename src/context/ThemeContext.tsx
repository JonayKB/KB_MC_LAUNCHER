import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';

interface ThemeContextValue {
    theme: ThemeMode;
    toggleTheme: () => void;
    setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
    theme: 'dark',
    toggleTheme: () => { },
    setTheme: () => { },
});

export function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
    const [theme, setThemeState] = useState<ThemeMode>(() => {
        const stored = localStorage.getItem('kb-theme');
        return (stored === 'light' || stored === 'dark') ? stored : 'dark';
    });

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('kb-theme', theme);
    }, [theme]);

    const setTheme = (t: ThemeMode) => setThemeState(t);
    const toggleTheme = () => setThemeState(p => p === 'dark' ? 'light' : 'dark');

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

export const useTheme = () => useContext(ThemeContext);