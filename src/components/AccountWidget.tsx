import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Account } from '../types/account';
import { useUser } from '../context/UserContext';
import { widget as s } from '../styles/accountWidgetStyles';
import { LoginCompleteResponse } from '../types/setup';

// ── Avatar ────────────────────────────────────────────────────
function Avatar({ src, username, size = 32 }: { src?: string; username?: string; size?: number }) {
    if (src) {
        return <img src={src} alt={username} style={{ ...s.avatar, width: size, height: size }} />;
    }
    return (
        <div style={s.avatarFallback(size)}>
            {username?.[0]?.toUpperCase() ?? '?'}
        </div>
    );
}

// ── Modal añadir cuenta ───────────────────────────────────────
type AddStep = 'choose' | 'offline' | 'microsoft';

function AddAccountModal({
    onClose,
    onAdded,
}: {
    onClose: () => void;
    onAdded: (account: Account) => void;
}) {
    const [step, setStep] = useState<AddStep>('choose');
    const [offlineName, setOfflineName] = useState('');
    const [nameError, setNameError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [msHovered, setMsHovered] = useState(false);
    const [offHovered, setOffHovered] = useState(false);
    const [btnHovered, setBtnHovered] = useState(false);
    const [backHovered, setBackHovered] = useState(false);

    async function handleMicrosoftLogin() {
        setLoading(true);
        try {
            const result = await invoke<LoginCompleteResponse>('auth_microsoft');
            onAdded({
                isOnline: true,
                username: result.username,
                uuid: result.uuid,
                accessToken: result.access_token,
                refreshToken: result.refresh_token,
                tokenExpiresAt: Date.now() + result.expires_in * 1000,
                skinHeadBase64: result.skin_head_base64,
                isActual: true,
            });
        } catch (err) {
            console.error('[AddAccount] Error login Microsoft:', err);
        } finally {
            setLoading(false);
        }
    }

    function handleOfflineSubmit() {
        const name = offlineName.trim();
        if (name.length < 3 || name.length > 16) {
            setNameError('El nombre debe tener entre 3 y 16 caracteres');
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            setNameError('Solo letras, números y guiones bajos');
            return;
        }
        onAdded({
            isOnline: false,
            username: name,
            uuid: `offline-${name}`,
            isActual: true,
        });
    }

    return (
        <div style={s.backdrop} onClick={onClose}>
            <div style={s.modal} onClick={e => e.stopPropagation()}>
                <div style={s.modalHeader}>
                    <span style={s.modalTitle}>
                        {step === 'choose' && 'Añadir cuenta'}
                        {step === 'offline' && 'Cuenta offline'}
                        {step === 'microsoft' && 'Cuenta Microsoft'}
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: '1px solid var(--border)',
                            borderRadius: 'var(--radius-md)', width: '28px', height: '28px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: 'var(--text-faint)',
                        }}
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div style={s.modalBody}>
                    {/* ── Elegir tipo ── */}
                    {step === 'choose' && (
                        <>
                            <button
                                style={s.optionBtn(msHovered)}
                                onMouseEnter={() => setMsHovered(true)}
                                onMouseLeave={() => setMsHovered(false)}
                                onClick={() => { setStep('microsoft'); handleMicrosoftLogin(); }}
                            >
                                <div style={s.optionIcon}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <rect x="2" y="2" width="9" height="9" /><rect x="13" y="2" width="9" height="9" />
                                        <rect x="2" y="13" width="9" height="9" /><rect x="13" y="13" width="9" height="9" />
                                    </svg>
                                </div>
                                <div style={s.optionText}>
                                    <span style={s.optionLabel}>Cuenta Microsoft</span>
                                    <span style={s.optionDesc}>Login con Xbox — acceso a multijugador</span>
                                </div>
                            </button>

                            <button
                                style={s.optionBtn(offHovered)}
                                onMouseEnter={() => setOffHovered(true)}
                                onMouseLeave={() => setOffHovered(false)}
                                onClick={() => setStep('offline')}
                            >
                                <div style={s.optionIcon}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                </div>
                                <div style={s.optionText}>
                                    <span style={s.optionLabel}>Cuenta offline</span>
                                    <span style={s.optionDesc}>Sin login — solo servidores offline</span>
                                </div>
                            </button>
                        </>
                    )}

                    {/* ── Microsoft loading ── */}
                    {step === 'microsoft' && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 0', color: 'var(--text-faint)', fontSize: '13px' }}>
                            {loading ? (
                                <>
                                    <div style={s.spinner} />
                                    Esperando login en el navegador...
                                </>
                            ) : (
                                <span>Completando login...</span>
                            )}
                        </div>
                    )}

                    {/* ── Offline ── */}
                    {step === 'offline' && (
                        <>
                            <input
                                style={nameError ? s.inputError : s.input}
                                type="text"
                                placeholder="Nombre de usuario (3-16 caracteres)"
                                value={offlineName}
                                maxLength={16}
                                onChange={e => { setOfflineName(e.target.value); setNameError(null); }}
                                onKeyDown={e => e.key === 'Enter' && handleOfflineSubmit()}
                                autoFocus
                            />
                            {nameError && <span style={s.errorText}>{nameError}</span>}
                            <button
                                style={s.primaryBtn(btnHovered)}
                                onMouseEnter={() => setBtnHovered(true)}
                                onMouseLeave={() => setBtnHovered(false)}
                                onClick={handleOfflineSubmit}
                            >
                                Continuar
                            </button>
                            <button
                                style={s.secondaryBtn(backHovered)}
                                onMouseEnter={() => setBackHovered(true)}
                                onMouseLeave={() => setBackHovered(false)}
                                onClick={() => setStep('choose')}
                            >
                                Volver
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Widget principal ──────────────────────────────────────────
export default function AccountWidget() {
    const { accounts, setAccounts } = useUser();
    const [open, setOpen] = useState(false);
    const [addOpen, setAddOpen] = useState(false);
    const [triggerHovered, setTriggerHovered] = useState(false);
    const [hoveredId, setHoveredId] = useState<string | null>(null);
    const [removedId, setRemovedId] = useState<string | null>(null);
    const [addBtnHovered, setAddBtnHovered] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    const active = accounts.find(a => a.isActual);
    const others = accounts.filter(a => !a.isActual);

    // Cerrar al click fuera
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    function handleSelect(uuid: string) {
        setAccounts(prev => prev.map(a => ({ ...a, isActual: a.uuid === uuid })));
        setOpen(false);
    }

    async function handleRemove(account: Account) {
        const confirmed = await ask(
            `¿Eliminar la cuenta de ${account.username}?`,
            { title: 'Eliminar cuenta', kind: 'warning' }
        );
        if (!confirmed) return;
        setAccounts(prev => {
            const filtered = prev.filter(a => a.uuid !== account.uuid);
            if (account.isActual && filtered.length > 0) {
                filtered[0] = { ...filtered[0], isActual: true };
            }

            return filtered;
        });
    }

    function handleAdded(newAccount: Account) {
        setAccounts(prev => [
            ...prev.map(a => ({ ...a, isActual: false })),
            newAccount,
        ]);
        setAddOpen(false);
        setOpen(false);
    }

    if (!active) return null;

    return (
        <>
            <div style={s.wrap} ref={wrapRef}>
                {/* ── Trigger ── */}
                <div
                    style={s.trigger(triggerHovered)}
                    onMouseEnter={() => setTriggerHovered(true)}
                    onMouseLeave={() => setTriggerHovered(false)}
                    onClick={() => setOpen(v => !v)}
                >
                    <div style={s.activeAccount}>
                        <Avatar src={active.skinHeadBase64} username={active.username} size={32} />
                        <div style={s.info}>
                            <span style={s.name}>{active.username ?? 'Sin cuenta'}</span>
                            <span style={s.type}>{active.isOnline ? 'Microsoft' : 'Offline'}</span>
                        </div>
                    </div>
                    <svg style={s.chevron(open)} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="6 9 12 15 18 9" />
                    </svg>
                </div>

                {/* ── Dropdown ── */}
                {open && (
                    <div style={s.dropdown}>
                        <div style={s.dropdownBody}>
                            {others.map(account => (
                                <div
                                    key={account.uuid}
                                    style={s.accountRow(hoveredId === account.uuid, false)}
                                    onMouseEnter={() => setHoveredId(account.uuid ?? null)}
                                    onMouseLeave={() => setHoveredId(null)}
                                    onClick={() => handleSelect(account.uuid!)}
                                >
                                    <Avatar src={account.skinHeadBase64} username={account.username} size={28} />
                                    <div style={s.accountInfo}>
                                        <span style={s.accountName(false)}>{account.username}</span>
                                        <span style={s.accountType}>{account.isOnline ? 'Microsoft' : 'Offline'}</span>
                                    </div>
                                    <button
                                        style={s.removeBtn(removedId === account.uuid)}
                                        onMouseEnter={() => setRemovedId(account.uuid ?? null)}
                                        onMouseLeave={() => setRemovedId(null)}
                                        onClick={e => { e.stopPropagation(); handleRemove(account); }}
                                        title="Eliminar"
                                    >
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                                        </svg>
                                    </button>
                                </div>
                            ))}

                            {others.length > 0 && <div style={s.divider} />}

                            <div
                                style={s.addBtn(addBtnHovered)}
                                onMouseEnter={() => setAddBtnHovered(true)}
                                onMouseLeave={() => setAddBtnHovered(false)}
                                onClick={() => { setAddOpen(true); setOpen(false); }}
                            >
                                <div style={{ ...s.avatarFallback(28), border: '1px dashed var(--border)' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                        <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                                    </svg>
                                </div>
                                <span style={s.addLabel}>Añadir cuenta</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {addOpen && (
                <AddAccountModal
                    onClose={() => setAddOpen(false)}
                    onAdded={handleAdded}
                />
            )}
        </>
    );
}