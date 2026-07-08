import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { layout, logo, header, box, text, btn, input as inp } from '../styles/components';
import { invoke } from '@tauri-apps/api/core';
import { LoginCompleteResponse } from '../types/setup';
import { Account } from '../types/account';

type Step = 'owns_minecraft' | 'offline_username' | 'microsoft_prompt';

export default function SetupScreen({ onComplete }: Readonly<{ onComplete: () => void }>) {
    const { setAccounts } = useUser();
    const [step, setStep] = useState<Step>('owns_minecraft');
    const [inputUsername, setInputUsername] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);
    const [yesHovered, setYesHovered] = useState(false);
    const [noHovered, setNoHovered] = useState(false);
    const [continueHovered, setContinueHovered] = useState(false);
    const [loginState, setLoginState] = useState<'idle' | 'waiting_code' | 'polling' | 'done'>('idle');
    const [loginError, setLoginError] = useState<string | null>(null);

    function handleOwnsMinecraft(owns: boolean) {
        setStep(owns ? 'microsoft_prompt' : 'offline_username');
    }
    async function handleMicrosoftLogin() {
        try {
            setLoginState('polling');

            const result =
                await invoke<LoginCompleteResponse>(
                    'auth_microsoft'
                );

            const userAccount = {
                isOnline: true,
                username: result.username,
                uuid: result.uuid,
                accessToken: result.access_token,
                refreshToken: result.refresh_token,
                tokenExpiresAt: Date.now() + result.expires_in * 1000,
                isActual: true
            } as Account;
            setAccounts([userAccount]);

            setLoginState('done');

            onComplete();
        } catch (e) {
            setLoginError(String(e));
            setLoginState('idle');
        }
    }
    function handleOfflineSubmit() {
        const name = inputUsername.trim();
        if (name.length < 3 || name.length > 16) {
            setInputError('El nombre debe tener entre 3 y 16 caracteres');
            return;
        }
        if (!/^[a-zA-Z0-9_]+$/.test(name)) {
            setInputError('Solo letras, números y guiones bajos');
            return;
        }
        const userAccount = {
            isOnline: false,
            username: name,
            isActual: true
        };
        setAccounts([userAccount]);
        onComplete();
    }
    return (
        <div style={layout.fullscreenCenter}>
            <div style={layout.card}>

                <div style={header.zone}>
                    <div style={logo.wrap}>
                        <span style={logo.kb}>KB</span>
                        <span style={logo.dot}>·</span>
                        <span style={logo.text}>LAUNCHER</span>
                    </div>
                    <div style={header.iconWrap}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                            stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                            <circle cx="12" cy="7" r="4" />
                        </svg>
                    </div>
                    <h2 style={header.title}>
                        {step === 'owns_minecraft' && 'Configuración inicial'}
                        {step === 'offline_username' && 'Nombre de usuario'}
                        {step === 'microsoft_prompt' && 'Cuenta Microsoft'}
                    </h2>
                    <p style={header.subtitle}>
                        {step === 'owns_minecraft' && '¿Tienes Minecraft Java Edition comprado?'}
                        {step === 'offline_username' && 'Elige tu nombre para el modo offline'}
                        {step === 'microsoft_prompt' && 'Iniciarás sesión al lanzar el juego'}
                    </p>
                </div>

                {step === 'owns_minecraft' && (
                    <div style={btn.row}>
                        <button
                            style={{ ...btn.secondary, ...(noHovered ? btn.secondaryHover : {}) }}
                            onMouseEnter={() => setNoHovered(true)}
                            onMouseLeave={() => setNoHovered(false)}
                            onClick={() => handleOwnsMinecraft(false)}
                        >No tengo Minecraft</button>
                        <button
                            style={{ ...btn.primary, ...(yesHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setYesHovered(true)}
                            onMouseLeave={() => setYesHovered(false)}
                            onClick={() => handleOwnsMinecraft(true)}
                        >Sí, lo tengo</button>
                    </div>
                )}

                {step === 'offline_username' && (
                    <div style={layout.col('12px')}>
                        <input
                            style={{ ...inp.base, ...(inputError ? inp.error : {}) }}
                            type="text"
                            placeholder="Ej: KBPlayer"
                            value={inputUsername}
                            maxLength={16}
                            onChange={e => { setInputUsername(e.target.value); setInputError(null); }}
                            onKeyDown={e => e.key === 'Enter' && handleOfflineSubmit()}
                            autoFocus
                        />
                        {inputError && <span style={text.fieldError}>{inputError}</span>}
                        <button
                            style={{ ...btn.primary, ...(continueHovered ? btn.primaryHover : {}) }}
                            onMouseEnter={() => setContinueHovered(true)}
                            onMouseLeave={() => setContinueHovered(false)}
                            onClick={handleOfflineSubmit}
                        >Continuar</button>
                    </div>
                )}

                {step === 'microsoft_prompt' && (
                    <div style={layout.col('16px')}>
                        {loginState === 'idle' && (
                            <button onClick={handleMicrosoftLogin} style={btn.primary}>
                                Iniciar sesión con Microsoft
                            </button>
                        )}

                        {loginState === 'waiting_code' && (
                            <div style={box.info}>
                                <span style={text.info}>Abriendo navegador...</span>
                            </div>
                        )}
                        {loginState === 'polling' && (
                            <div style={box.info}>
                                <span style={text.info}>
                                    Esperando inicio de sesión...
                                </span>
                            </div>
                        )}


                        {loginError && (
                            <span style={text.fieldError}>{loginError}</span>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}