import type React from 'react';

type S = React.CSSProperties;

// ── Layout ────────────────────────────────────────────────────
export const layout = {
  fullscreenCenter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: 'var(--bg-base)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    padding: '24px',
  } as S,

  card: {
    width: '100%',
    maxWidth: '480px',
    backgroundColor: 'var(--bg-surface)',
    borderRadius: '10px',
    padding: '32px',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    display: 'flex',
    flexDirection: 'column',
    gap: '22px',
  } as S,

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
  } as S,

  rowTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    width: '100%',
  } as S,

  col: (gap = '12px'): S => ({
    display: 'flex',
    flexDirection: 'column',
    gap,
  }),
} as const;

// ── Logo mark ─────────────────────────────────────────────────
export const logo = {
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    marginBottom: '14px',
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.15em',
  } as S,
  kb: { color: 'var(--accent)' } as S,
  dot: { color: 'var(--text-faint)' } as S,
  text: { color: 'var(--text-faint)' } as S,
} as const;

// ── Header zone ───────────────────────────────────────────────
export const header = {
  zone: { textAlign: 'center' } as S,

  iconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: 'var(--radius-lg)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 14px',
  } as S,

  title: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '24px',
    fontWeight: 800,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.02em',
    color: 'var(--text-primary)',
    margin: '0 0 6px',
  } as S,

  subtitle: {
    fontSize: '18px',
    color: 'var(--text-muted)',
    margin: 0,
  } as S,
} as const;

// ── Badge ─────────────────────────────────────────────────────
export const badge = {
  wrap: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as S,

  left: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as S,

  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'var(--accent)',
    flexShrink: 0,
  } as S,

  label: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: 'var(--text-faint)',
  } as S,

  value: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '0.05em',
  } as S,

  valueSmall: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    letterSpacing: '0.03em',
  } as S,
} as const;

// ── Progress bar ──────────────────────────────────────────────
export const progress = {
  container: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
  } as S,

  track: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--bg-hover)',
    borderRadius: '3px',
    overflow: 'hidden',
  } as S,

  bar: {
    height: '100%',
    background: 'var(--accent)',
    borderRadius: '3px',
    transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
  } as S,

  percentage: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 700,
    color: 'var(--accent)',
    width: '40px',
    textAlign: 'right' as const,
  } as S,
} as const;

// ── Status / info / error boxes ───────────────────────────────
export const box = {
  status: {
    backgroundColor: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    borderLeft: '3px solid var(--accent)',
    borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
    padding: '14px 16px',
    display: 'flex',
    alignItems: 'center',
    minHeight: '44px',
  } as S,

  error: {
    backgroundColor: 'var(--accent-dim)',
    borderTop: '1px solid var(--accent-border)',
    borderRight: '1px solid var(--accent-border)',
    borderBottom: '1px solid var(--accent-border)',
    borderLeft: '3px solid var(--accent)',
    borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
    padding: '14px 16px',
  } as S,

  info: {
    backgroundColor: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)',
    borderRight: '1px solid var(--border)',
    borderBottom: '1px solid var(--border)',
    borderLeft: '3px solid var(--text-faint)',
    borderRadius: '0 var(--radius-lg) var(--radius-lg) 0',
    padding: '14px 16px',
  } as S,
} as const;

// ── Text ──────────────────────────────────────────────────────
export const text = {
  status: {
    fontSize: '18px',
    color: 'var(--text-secondary)',
    lineHeight: '1.5',
  } as S,

  statusSmall: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.4,
    wordBreak: 'break-all' as const,
  } as S,

  error: {
    fontSize: '14px',
    color: 'var(--error-text)',
    lineHeight: '1.5',
    fontWeight: 500,
  } as S,

  info: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: 1.5,
  } as S,

  phaseLabel: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    color: 'var(--accent)',
    textTransform: 'uppercase' as const,
    marginBottom: '2px',
  } as S,

  phaseMuted: {
    color: 'var(--text-faint)',
  } as S,

  fieldError: {
    fontSize: '12px',
    color: 'var(--error-text)',
    marginTop: '-4px',
  } as S,
} as const;

// ── Spinner ───────────────────────────────────────────────────
export const spinner: S = {
  width: '14px',
  height: '14px',
  border: '2px solid var(--accent)',
  borderTopColor: 'transparent',
  borderRadius: '50%',
  flexShrink: 0,
  animation: 'spin 0.8s linear infinite',
};

// ── Buttons ───────────────────────────────────────────────────
const btnBase: S = {
  flex: 1,
  padding: '11px',
  borderRadius: 'var(--radius-md)',
  fontFamily: 'var(--font-condensed)',
  fontSize: '14px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  cursor: 'pointer',
  transition: 'background-color 0.15s, color 0.15s',
  border: 'none',
};

export const btn = {
  row: {
    display: 'flex',
    gap: '10px',
  } as S,

  primary: {
    ...btnBase,
    backgroundColor: 'var(--accent)',
    color: '#fff',
  } as S,

  primaryHover: {
    backgroundColor: 'var(--accent-hover)',
  } as S,

  secondary: {
    ...btnBase,
    backgroundColor: 'transparent',
    color: 'var(--text-muted)',
    border: '1px solid var(--border)',
  } as S,

  secondaryHover: {
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
  } as S,
} as const;

// ── Input ─────────────────────────────────────────────────────
export const input = {
  base: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '11px 14px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '15px',
    outline: 'none',
    width: '100%',
    transition: 'border-color 0.15s',
  } as S,

  error: {
    borderColor: 'var(--accent)',
  } as S,
} as const;

// ── Drop zone ─────────────────────────────────────────────────
export const dropZone = {
  base: {
    border: '2px dashed var(--border)',
    borderRadius: 'var(--radius-lg)',
    padding: '36px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background-color 0.15s',
    backgroundColor: 'var(--bg-elevated)',
  } as S,

  active: {
    borderColor: 'var(--accent)',
    backgroundColor: 'var(--accent-dim)',
  } as S,

  label: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '15px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const,
    color: 'var(--text-faint)',
    transition: 'color 0.15s',
  } as S,

  labelActive: {
    color: 'var(--accent)',
  } as S,

  hint: {
    fontSize: '12px',
    color: 'var(--border-strong)',
  } as S,
} as const;