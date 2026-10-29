import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useUser } from '../context/UserContext';
import { appSettings } from '../styles/appSettingStyles';
import { accounts as st } from '../styles/accountStyles';
import { input as inp, text } from '../styles/components';
import { LoginCompleteResponse } from '../types/setup';
import {
    Account,
    accountFromLogin,
    accountKey,
    validateOfflineUsername,
    withActiveAccount,
} from '../types/account';

interface Props {
    onClose: () => void;
}

export function AccountAvatar({ account, size = 40 }: Readonly<{ account: Account | null; size?: number }>) {
    if (account?.skinHead) {
        return <img src={account.skinHead} alt="" style={st.avatarImg(size)} />;
    }
    return (
        <div style={st.avatarFallback(size)}>
            {(account?.username ?? '?').charAt(0).toUpperCase()}
        </div>
    );
}

function AccountRow({ account, canRemove, onSelect, onRemove }: Readonly<{
    account: Account;
    canRemove: boolean;
    onSelect: () => void;
    onRemove: () => void;
}>) {
    const [hovered, setHovered] = useState(false);
    return (
        <div
            style={st.row(hovered, account.isActual)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onClick={onSelect}
        >
            <AccountAvatar account={account} size={36} />
            <div style={st.rowText}>
                <span style={st.rowName}>{account.username}</span>
                <span style={st.rowType(account.isOnline)}>
                    {account.isOnline ? 'Microsoft' : 'Offline'}
                </span>
            </div>
            {account.isActual && <span style={st.activeTag}>Activa</span>}
            {canRemove && (
                <button
                    style={st.removeBtn(hovered)}
                    title="Eliminar cuenta"
                    aria-label={`Eliminar cuenta ${account.username}`}
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                </button>
            )}
        </div>
    );
}

export default function AccountsModal({ onClose }: Props) {
    const { accounts, setAccounts } = useUser();
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [mode, setMode] = useState<'list' | 'offline'>('list');
    const [offlineName, setOfflineName] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loggingIn, setLoggingIn] = useState(false);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    function selectAccount(key: string) {
        setAccounts(prev => prev.map(a => ({ ...a, isActual: accountKey(a) === key })));
    }

    function removeAccount(key: string) {
        setAccounts(prev => {
            const rest = prev.filter(a => accountKey(a) !== key);
            // Si se borra la activa, pasar a la primera que quede
            if (rest.length > 0 && !rest.some(a => a.isActual)) {
                rest[0] = { ...rest[0], isActual: true };
            }
            return rest;
        });
    }

    async function addMicrosoft() {
        setError(null);
        setLoggingIn(true);
        try {
            const result = await invoke<LoginCompleteResponse>('auth_microsoft');
            setAccounts(prev => withActiveAccount(prev, accountFromLogin(result)));
        } catch (e) {
            setError(String(e));
        } finally {
            setLoggingIn(false);
        }
    }

    function addOffline() {
        const name = offlineName.trim();
        const validation = validateOfflineUsername(name);
        if (validation) {
            setError(validation);
            return;
        }
        setAccounts(prev => withActiveAccount(prev, { isOnline: false, username: name, isActual: true }));
        setOfflineName('');
        setMode('list');
    }

    return (
        <div style={appSettings.backdrop} onClick={onClose}>
            <div style={appSettings.card} onClick={e => e.stopPropagation()}>

                <div style={appSettings.header}>
                    <div style={appSettings.headerLeft}>
                        <span style={appSettings.eyebrow}>KB MC Launcher</span>
                        <span style={appSettings.title}>Cuentas</span>
                    </div>
                    <button
                        style={appSettings.closeBtn(closeBtnHovered)}
                        onMouseEnter={() => setCloseBtnHovered(true)}
                        onMouseLeave={() => setCloseBtnHovered(false)}
                        onClick={onClose}
                        aria-label="Cerrar"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div style={st.list}>
                    {accounts.map(account => {
                        const key = accountKey(account);
                        return (
                            <AccountRow
                                key={key}
                                account={account}
                                canRemove={accounts.length > 1}
                                onSelect={() => selectAccount(key)}
                                onRemove={() => removeAccount(key)}
                            />
                        );
                    })}
                </div>

                <div style={st.footer}>
                    {mode === 'list' ? (
                        <div style={st.actions}>
                            <button style={st.actionBtn(true, loggingIn)} disabled={loggingIn} onClick={addMicrosoft}>
                                {loggingIn ? 'Esperando al navegador...' : '+ Cuenta Microsoft'}
                            </button>
                            <button
                                style={st.actionBtn(false, loggingIn)}
                                disabled={loggingIn}
                                onClick={() => { setError(null); setMode('offline'); }}
                            >
                                + Cuenta offline
                            </button>
                        </div>
                    ) : (
                        <div style={st.offlineForm}>
                            <input
                                style={{ ...inp.base, ...(error ? inp.error : {}) }}
                                type="text"
                                placeholder="Nombre de usuario"
                                value={offlineName}
                                maxLength={16}
                                onChange={e => { setOfflineName(e.target.value); setError(null); }}
                                onKeyDown={e => e.key === 'Enter' && addOffline()}
                                autoFocus
                            />
                            <div style={st.actions}>
                                <button style={st.actionBtn(false, false)} onClick={() => { setError(null); setMode('list'); }}>
                                    Cancelar
                                </button>
                                <button style={st.actionBtn(true, false)} onClick={addOffline}>
                                    Añadir
                                </button>
                            </div>
                        </div>
                    )}
                    {error && <span style={text.fieldError}>{error}</span>}
                </div>
            </div>
        </div>
    );
}
