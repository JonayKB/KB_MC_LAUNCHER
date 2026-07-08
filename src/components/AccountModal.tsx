import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Account } from '../types/account';
import { useUser } from '../context/UserContext';
import { ask } from '@tauri-apps/plugin-dialog';
import { LoginCompleteResponse } from '../types/setup';
import { accountSelector as s } from '../styles/accountSelectorStyles';

interface Props {
    onClose: () => void;
}

function AvatarHead({ src, username }: { src?: string; username?: string }) {
    if (src) {
        return <img src={src} alt={username} style={s.avatar} />;
    }
    return (
        <div style={s.avatarFallback}>
            {username?.[0]?.toUpperCase() ?? '?'}
        </div>
    );
}

export default function AccountSelectorModal({ onClose }: Props) {
    const { accounts, setAccounts } = useUser();
    const [closeBtnHovered, setCloseBtnHovered] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [removeBtnHovered, setRemoveBtnHovered] = useState<string | null>(null);
    const [addHovered, setAddHovered] = useState(false);
    const [loggingIn, setLoggingIn] = useState(false);

    function handleSelect(uuid: string) {
        setAccounts(prev =>
            prev.map(a => ({ ...a, isActual: a.uuid === uuid }))
        );
        onClose();
    }

    async function handleRemove(account: Account) {
        const confirmed = await ask(
            `¿Eliminar la cuenta de ${account.username}?`,
            { title: 'Eliminar cuenta', kind: 'warning' }
        );
        if (!confirmed) return;

        setAccounts(prev => {
            const filtered = prev.filter(a => a.uuid !== account.uuid);
            // Si era la activa, activar la primera que quede
            if (account.isActual && filtered.length > 0) {
                filtered[0].isActual = true;
            }
            return filtered;
        });
    }

    async function handleAddMicrosoft() {
        setLoggingIn(true);
        try {
            const result = await invoke<LoginCompleteResponse>('auth_microsoft');

            const newAccount: Account = {
                isOnline: true,
                username: result.username,
                uuid: result.uuid,
                accessToken: result.access_token,
                refreshToken: result.refresh_token,
                tokenExpiresAt: Date.now() + result.expires_in * 1000,
                skinHeadBase64: result.skin_head_base64,
                isActual: true,
            };

            setAccounts(prev => [
                // Desactivar las demás
                ...prev.map(a => ({ ...a, isActual: false })),
                newAccount,
            ]);

            onClose();
        } catch (err) {
            console.error('[AccountSelector] Error login Microsoft:', err);
        } finally {
            setLoggingIn(false);
        }
    }

    const activeAccount = accounts.find(a => a.isActual);

    return (
        <div style={s.backdrop} onClick={onClose}>
            <div style={s.card} onClick={e => e.stopPropagation()}>

                {/* ── Header ── */}
                <div style={s.header}>
                    <div style={s.headerLeft}>
                        <span style={s.eyebrow}>Cuentas</span>
                        <span style={s.title}>Seleccionar cuenta</span>
                    </div>
                    <button
                        style={s.closeBtn(closeBtnHovered)}
                        onMouseEnter={() => setCloseBtnHovered(true)}
                        onMouseLeave={() => setCloseBtnHovered(false)}
                        onClick={onClose}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                {/* ── Body ── */}
                <div style={s.body}>
                    {accounts.map(account => (
                        <div
                            key={account.uuid ?? account.username}
                            style={s.accountRow(
                                hoveredId === (account.uuid ?? account.username),
                                !!account.isActual
                            )}
                            onMouseEnter={() => setHoveredId(account.uuid ?? account.username ?? null)}
                            onMouseLeave={() => setHoveredId(null)}
                            onClick={() => handleSelect(account.uuid!)}
                        >
                            <AvatarHead
                                src={account.skinHeadBase64}
                                username={account.username}
                            />

                            <div style={s.accountInfo}>
                                <span style={s.accountName(!!account.isActual)}>
                                    {account.username ?? 'Cuenta sin nombre'}
                                </span>
                                <span style={s.accountType}>
                                    {account.isActual && <span style={s.activeBadge} />}
                                    {account.isOnline ? 'Microsoft' : 'Offline'}
                                    {account.isActual && ' · Activa'}
                                </span>
                            </div>

                            <button
                                style={s.removeBtn(removeBtnHovered === (account.uuid ?? account.username))}
                                onMouseEnter={() => setRemoveBtnHovered(account.uuid ?? account.username ?? null)}
                                onMouseLeave={() => setRemoveBtnHovered(null)}
                                onClick={e => { e.stopPropagation(); handleRemove(account); }}
                                title="Eliminar cuenta"
                            >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                    <path d="M10 11v6M14 11v6" />
                                </svg>
                            </button>
                        </div>
                    ))}

                    {accounts.length > 0 && <div style={s.divider} />}

                    {/* Añadir cuenta Microsoft */}
                    {loggingIn ? (
                        <div style={s.loggingIn}>
                            <div style={s.spinner} />
                            Iniciando sesión con Microsoft...
                        </div>
                    ) : (
                        <div
                            style={s.addRow(addHovered)}
                            onMouseEnter={() => setAddHovered(true)}
                            onMouseLeave={() => setAddHovered(false)}
                            onClick={handleAddMicrosoft}
                        >
                            <div style={s.addIcon}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="12" y1="5" x2="12" y2="19" />
                                    <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                            </div>
                            <span style={s.addLabel}>Añadir cuenta de Microsoft</span>
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}