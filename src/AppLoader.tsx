import { useCallback, useState } from 'react';
import UpdateChecker from './screens/UpdateCheckerScreen';
import './App.css';
import ModpackLauncher from './screens/ModpackLauncher';

type AppStep = 'update' | 'launcher';

export default function AppLoader() {
    const [step, setStep] = useState<AppStep>('update');
    const handleUpdateComplete = useCallback(() => setStep('launcher'), []);

    return (
        <div className="app">
            {step === 'update' && <UpdateChecker onComplete={handleUpdateComplete} />}
            {step === 'launcher' && <ModpackLauncher />}
        </div>
    );
}