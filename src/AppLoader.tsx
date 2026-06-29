import { useCallback, useState } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import UpdateChecker from './screens/UpdateCheckerScreen';
import SetupScreen from './screens/SetupScreen';
import './App.css';
import type { ModpackEntry, InstalledModpack } from './types/modpack';
import { useInstalledModpack } from './hooks/useInstalledModpack';
import ModpackSelectScreen from './screens/ModpackSelectScreen';
import ModpackInstallScreen from './screens/ModpackInstallScreen';
import ModpackLauncher from './screens/ModpackLauncher';

type AppStep = 'update' | 'setup' | 'select' | 'install' | 'launcher';

function AppContent() {
    const { isSetupDone } = useUser();
    const { installed, setInstalled } = useInstalledModpack();
    const [step, setStep] = useState<AppStep>('update');
    const [selectedModpack, setSelectedModpack] = useState<ModpackEntry | null>(null);

    const handleUpdateComplete = useCallback(() => {
        if (!isSetupDone) { setStep('setup'); return; }
        setStep(installed ? 'launcher' : 'select');
    }, [isSetupDone, installed]);

    function handleModpackSelect(modpack: ModpackEntry) {
        setSelectedModpack(modpack);
        setStep('install');
    }

    function handleInstalled(data: InstalledModpack) {
        setInstalled(data);
        setStep('launcher');
    }

    return (
        <div className="app">
            {step === 'update' && (
                <UpdateChecker onComplete={handleUpdateComplete} />
            )}
            {step === 'setup' && (
                <SetupScreen onComplete={() => setStep(installed ? 'launcher' : 'select')} />
            )}
            {step === 'select' && (
                <ModpackSelectScreen onSelect={handleModpackSelect} />
            )}
            {step === 'install' && selectedModpack && (
                <ModpackInstallScreen
                    modpack={selectedModpack}
                    onInstalled={handleInstalled}
                    onBack={() => setStep('select')}
                />
            )}
            {step === 'launcher' && installed && (
                <ModpackLauncher
                    installed={installed}
                    onUninstall={() => { setInstalled(null); setStep('select'); }}
                    onChangeModpack={() => setStep('select')}
                />
            )}
        </div>
    );
}

export default function AppLoader() {
    return (
        <UserProvider>
            <AppContent />
        </UserProvider>
    );
}