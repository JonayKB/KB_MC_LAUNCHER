import { useCallback, useState } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import UpdateChecker from './screens/UpdateCheckerScreen';
import SetupScreen from './screens/SetupScreen';
import './App.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';

type AppStep = 'update' | 'setup' | 'app';

function AppContent() {
    const { isSetupDone } = useUser();
    const [step, setStep] = useState<AppStep>('update');

    const handleUpdateComplete = useCallback(() => {
        if (!isSetupDone) { setStep('setup'); return; }
    }, [isSetupDone]);
    return (
        <div className="app">
            {step === 'update' && (
                <UpdateChecker onComplete={handleUpdateComplete} />
            )}
            {step === 'setup' && (
                <SetupScreen onComplete={() => setStep('app')} />
            )}
            {step === 'app' && (
                <App />
            )}
        </div>
    );
}

export default function AppLoader() {
    return (
        <UserProvider>
            <ThemeProvider>
                <AppContent />
            </ThemeProvider>
        </UserProvider>
    );
}