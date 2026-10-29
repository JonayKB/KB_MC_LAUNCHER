import type React from 'react';
type S = React.CSSProperties;

export type ToastTone = 'progress' | 'success' | 'error' | 'muted';

const toneColor: Record<ToastTone, string> = {
  progress: 'var(--accent)',
  success: 'var(--success)',
  error: 'var(--error-text)',
  muted: 'var(--text-faint)',
};

export const toast = {
  wrap: (tone: ToastTone): S => ({
    position: 'fixed',
    top: 'calc(16px + env(safe-area-inset-top, 0px))',
    right: '16px',
    width: '340px',
    maxWidth: 'calc(100vw - 32px)',
    zIndex: 300,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderLeft: `3px solid ${toneColor[tone]}`,
    borderRadius: 'var(--radius-xl)',
    boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    animation: 'toast-in 0.2s ease-out',
  }),

  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
  } as S,

  icon: (tone: ToastTone): S => ({
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: 'var(--radius-md)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: toneColor[tone],
    background: 'var(--bg-elevated)',
  }),

  titleCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minWidth: 0,
  } as S,

  eyebrow: (tone: ToastTone): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: toneColor[tone],
  }),

  title: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '16px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  } as S,

  closeBtn: {
    width: '24px',
    height: '24px',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-muted)',
    cursor: 'pointer',
  } as S,

  step: {
    fontSize: '12px',
    color: 'var(--text-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as S,

  track: {
    height: '6px',
    borderRadius: '3px',
    background: 'var(--bg-hover)',
    overflow: 'hidden',
  } as S,

  bar: (percent: number, tone: ToastTone): S => ({
    height: '100%',
    width: `${Math.min(100, Math.max(0, percent))}%`,
    background: toneColor[tone],
    borderRadius: '3px',
    transition: 'width 0.25s ease-out',
  }),

  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '11px',
    color: 'var(--text-faint)',
    fontVariantNumeric: 'tabular-nums',
  } as S,

  error: {
    fontSize: '12px',
    lineHeight: 1.45,
    color: 'var(--error-text)',
    maxHeight: '96px',
    overflowY: 'auto',
    wordBreak: 'break-word',
  } as S,

  cancelBtn: (disabled: boolean): S => ({
    height: '26px',
    padding: '0 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border-strong)',
    background: 'transparent',
    color: 'var(--text-secondary)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.6 : 1,
  }),
} as const;
