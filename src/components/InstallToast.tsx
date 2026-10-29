import { useNavigate } from 'react-router-dom';
import { useInstall, InstallJob } from '../context/InstallContext';
import { formatBytes, formatSpeed } from '../types/installer';
import { toast, ToastTone } from '../styles/installToastStyles';

function toneOf(job: InstallJob): ToastTone {
    if (job.status === 'done') return 'success';
    if (job.status === 'error') return 'error';
    if (job.status === 'cancelled') return 'muted';
    return 'progress';
}

function eyebrowOf(job: InstallJob): string {
    if (job.isUninstall) {
        if (job.status === 'done') return 'Desinstalado';
        if (job.status === 'error') return 'Error al desinstalar';
        return 'Desinstalando';
    }
    switch (job.status) {
        case 'running': return job.isUpdate ? 'Actualizando' : 'Instalando';
        case 'cancelling': return 'Cancelando...';
        case 'done': return job.isUpdate ? 'Actualizado' : 'Instalado';
        case 'cancelled': return 'Instalación cancelada';
        case 'error': return 'Error en la instalación';
    }
}

function progressDetail(job: InstallJob): string | null {
    const p = job.progress;
    if (p.mode === 'download') {
        const total = p.totalBytes ? ` / ${formatBytes(p.totalBytes)}` : '';
        return `${formatBytes(p.downloadedBytes ?? 0)}${total} · ${formatSpeed(p.speedBps ?? 0)}`;
    }
    if (p.mode === 'extract') {
        return `${p.extractedFiles ?? 0} / ${p.totalFiles ?? 0} archivos`;
    }
    return null;
}

function ToastIcon({ tone }: Readonly<{ tone: ToastTone }>) {
    if (tone === 'success') return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
    );
    if (tone === 'error') return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
    );
    if (tone === 'muted') return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
    );
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
    );
}

export default function InstallToast() {
    const { job, cancelInstall, dismiss } = useInstall();
    const navigate = useNavigate();
    if (!job) return null;

    const tone = toneOf(job);
    const active = job.status === 'running' || job.status === 'cancelling';
    const detail = active ? progressDetail(job) : null;

    return (
        <div style={toast.wrap(tone)} role="status" aria-live="polite">
            <div style={toast.header}>
                <div style={toast.icon(tone)}><ToastIcon tone={tone} /></div>
                <div style={toast.titleCol}>
                    <span style={toast.eyebrow(tone)}>{eyebrowOf(job)}</span>
                    <span
                        style={toast.title}
                        title="Ir al modpack"
                        onClick={() => navigate(`/modpacks/${job.modpackId}`, { state: { name: job.name } })}
                    >
                        {job.name} <span style={{ color: 'var(--text-faint)', fontWeight: 700 }}>v{job.version}</span>
                    </span>
                </div>
                {!active && (
                    <button style={toast.closeBtn} onClick={dismiss} aria-label="Cerrar notificación">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                )}
            </div>

            {active && job.isUninstall && (
                <>
                    <span style={toast.step}>{job.progress.step}</span>
                    <div style={toast.track}>
                        <div style={{ ...toast.bar(35, tone), animation: 'toast-indeterminate 1.2s ease-in-out infinite' }} />
                    </div>
                </>
            )}

            {active && !job.isUninstall && (
                <>
                    <span style={toast.step}>
                        {job.progress.stepCount > 0 && (
                            <span style={{ color: 'var(--text-faint)', fontWeight: 700 }}>
                                Paso {job.progress.stepIndex}/{job.progress.stepCount} ·{' '}
                            </span>
                        )}
                        {job.progress.step}
                    </span>
                    <div style={toast.track}>
                        <div style={toast.bar(job.progress.percent, tone)} />
                    </div>
                    <div style={toast.footer}>
                        <span>{detail ? `${job.progress.percent}% · ${detail}` : `${job.progress.percent}%`}</span>
                        <button
                            style={toast.cancelBtn(job.status === 'cancelling')}
                            disabled={job.status === 'cancelling'}
                            onClick={cancelInstall}
                        >
                            {job.status === 'cancelling' ? 'Cancelando...' : 'Cancelar'}
                        </button>
                    </div>
                </>
            )}

            {job.status === 'done' && (
                <span style={toast.step}>{job.isUninstall ? 'Se han eliminado los archivos de la instancia.' : 'Listo para jugar.'}</span>
            )}
            {job.status === 'cancelled' && (
                <span style={toast.step}>
                    {job.isUpdate ? 'El modpack quedó a medias: vuelve a actualizar antes de jugar.' : 'No se ha instalado nada.'}
                </span>
            )}
            {job.status === 'error' && job.error && (
                <span style={toast.error}>{job.error}</span>
            )}
        </div>
    );
}
