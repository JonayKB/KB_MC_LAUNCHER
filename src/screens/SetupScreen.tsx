import { useState } from 'react';
import { useUser } from '../context/UserContext';
import { layout, logo, header, box, text, btn, input as inp } from '../styles/components';
import { invoke } from '@tauri-apps/api/core';
import { LoginCompleteResponse } from '../types/setup';
import { Account, accountFromLogin, isLoginCancelled, upsertAccount, validateOfflineUsername } from '../types/account';

type Step = 'owns_minecraft' | 'offline_username' | 'microsoft_prompt';

export default function SetupScreen({ onComplete }: Readonly<{ onComplete: () => void }>) {
    const { accounts, setAccounts, expiredUsernames, clearExpiredSession } = useUser();
    const sessionExpired = expiredUsernames.length > 0;
    // Si se llega por sesión caducada, directo a iniciar sesión con Microsoft
    const [step, setStep] = useState<Step>(sessionExpired ? 'microsoft_prompt' : 'owns_minecraft');
    const [inputUsername, setInputUsername] = useState('');
    const [inputError, setInputError] = useState<string | null>(null);
    const [yesHovered, setYesHovered] = useState(false);
    const [noHovered, setNoHovered] = useState(false);
    const [continueHovered, setContinueHovered] = useState(false);
    const [backHovered, setBackHovered] = useState(false);
    const [loginHovered, setLoginHovered] = useState(false);
    const [loginState, setLoginState] = useState<'idle' | 'waiting_code' | 'polling' | 'done'>('idle');
    const [loginError, setLoginError] = useState<string | null>(null);

    // Se conservan las demás cuentas (al volver por sesión caducada puede haber otras)
    function finish(account: Account) {
        setAccounts(prev => upsertAccount(prev, account));
        clearExpiredSession();
        onComplete();
    }

    function handleOwnsMinecraft(owns: boolean) {
        setStep(owns ? 'microsoft_prompt' : 'offline_username');
    }
    async function handleMicrosoftLogin() {
        try {
            setLoginState('polling');
            setLoginError(null);

            const result =
                await invoke<LoginCompleteResponse>(
                    'auth_microsoft'
                );

            setLoginState('done');
            finish(accountFromLogin(result));
        } catch (e) {
            setLoginError(isLoginCancelled(e) ? null : String(e));
            setLoginState('idle');
        }
    }
    function handleOfflineSubmit() {
        const name = inputUsername.trim();
        const error = validateOfflineUsername(name);
        if (error) {
            setInputError(error);
            return;
        }
        finish({
            isOnline: false,
            username: name,
            uuid: `offline-${name}`,
            isActual: true,
        });
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
                    {sessionExpired && (
                        <div style={box.info}>
                            <span style={text.info}>
                                La sesión de {expiredUsernames.join(', ')} ha caducado. Vuelve a iniciar sesión para seguir jugando.
                            </span>
                        </div>
                    )}
                    <p style={header.subtitle}>
                        {step === 'owns_minecraft' && '¿Tienes Minecraft Java Edition comprado?'}
                        {step === 'offline_username' && 'Elige tu nombre para el modo offline'}
                        {step === 'microsoft_prompt' && 'Se abrirá tu navegador para iniciar sesión'}
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

                {step !== 'owns_minecraft' && loginState !== 'polling' && (
                    <button
                        style={{ ...btn.secondary, ...(backHovered ? btn.secondaryHover : {}), order: 1 }}
                        onMouseEnter={() => setBackHovered(true)}
                        onMouseLeave={() => setBackHovered(false)}
                        onClick={() => { setStep('owns_minecraft'); setInputError(null); setLoginError(null); }}
                    >Volver</button>
                )}

                {step === 'microsoft_prompt' && (
                    <div style={layout.col('16px')}>
                        {loginState === 'idle' && (
                            <button
                                onClick={handleMicrosoftLogin}
                                style={{ ...btn.primary, ...(loginHovered ? btn.primaryHover : {}) }}
                                onMouseEnter={() => setLoginHovered(true)}
                                onMouseLeave={() => setLoginHovered(false)}
                            >
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
                        {loginState === 'polling' && (
                            <button
                                style={{ ...btn.secondary, ...(backHovered ? btn.secondaryHover : {}) }}
                                onMouseEnter={() => setBackHovered(true)}
                                onMouseLeave={() => setBackHovered(false)}
                                onClick={() => invoke('cancel_login')}
                            >Cancelar</button>
                        )}


                        {loginError && (
                            <span style={text.fieldError}>{loginError}</span>
                        )}

                        {sessionExpired && accounts.length > 0 && loginState !== 'polling' && (
                            <button
                                style={btn.secondary}
                                onClick={() => { clearExpiredSession(); onComplete(); }}
                            >Usar otra de mis cuentas</button>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}