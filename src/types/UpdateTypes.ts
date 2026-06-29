export type UpdaterState = 'checking' | 'updating' | 'up-to-date' | 'error';

export interface UpdateCheckerProps {
    onComplete: () => void;
}