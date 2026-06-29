import { useCallback, useState } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import UpdateChecker from './screens/UpdateCheckerScreen';
import ModpackLauncher from './screens/ModpackLauncher';
import './App.css';
import SetupScreen from './screens/SetupScreen';

type AppStep = 'update' | 'setup' | 'launcher';

function AppContent() {
    const { isSetupDone } = useUser();
    const [step, setStep] = useState<AppStep>('update');

    const handleUpdateComplete = useCallback(() => {
        setStep(isSetupDone ? 'launcher' : 'setup');
    }, [isSetupDone]);

    return (
        <div className="app">
            {step === 'update' && <UpdateChecker onComplete={handleUpdateComplete} />}
            {step === 'setup' && <SetupScreen onComplete={() => setStep('launcher')} />}
            {step === 'launcher' && <ModpackLauncher />}
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