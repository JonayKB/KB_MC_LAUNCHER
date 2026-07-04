import { useCallback, useState } from 'react';
import { UserProvider, useUser } from './context/UserContext';
import UpdateChecker from './screens/UpdateCheckerScreen';
import SetupScreen from './screens/SetupScreen';
import './App.css';
import App from './App';
import { ThemeProvider } from './context/ThemeContext';

type AppStep = 'update' | 'setup' | 'app';

function AppContent() {
    const { isSetupDone, isLoading } = useUser();

    // Empezar siempre por el checker de updates — es rápido y necesario
    const [step, setStep] = useState<AppStep>('update');

    const handleUpdateComplete = useCallback(() => {
        // Después de updates, decidir a dónde ir
        if (isSetupDone) {
            setStep('app');   // ← faltaba este caso
        } else {
            setStep('setup');
        }
    }, [isSetupDone]);

    // Mientras el contexto carga desde localStorage, no renderizar nada
    // Evita el flash del setup screen
    if (isLoading) return null;

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