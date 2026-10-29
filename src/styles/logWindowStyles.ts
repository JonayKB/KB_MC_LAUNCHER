import type React from 'react';
import type { LogLevel } from '../types/gameLogs';
type S = React.CSSProperties;

export const levelColor: Record<LogLevel, string> = {
  error: 'var(--error-text)',
  warn: 'var(--warning)',
  info: 'var(--text-secondary)',
  debug: 'var(--text-faint)',
  system: 'var(--accent)',
};

const condensed: S = {
  fontFamily: 'var(--font-condensed)',
  fontWeight: 700,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

export const logs = {
  screen: {
    height: '100vh',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-base)',
    color: 'var(--text-primary)',
  } as S,

  // ── Cabecera ────────────────────────────────────────────────
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '12px 16px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  } as S,

  titleCol: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minWidth: 0,
    flex: 1,
  } as S,

  eyebrow: {
    ...condensed,
    fontSize: '10px',
    letterSpacing: '0.14em',
    color: 'var(--accent)',
  } as S,

  title: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '20px',
    fontWeight: 800,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } as S,

  status: (tone: 'running' | 'ok' | 'error' | 'muted'): S => {
    const color = {
      running: 'var(--success)',
      ok: 'var(--text-muted)',
      error: 'var(--error-text)',
      muted: 'var(--text-faint)',
    }[tone];
    return {
      ...condensed,
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '11px',
      padding: '5px 10px',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
      background: 'var(--bg-elevated)',
      color,
      whiteSpace: 'nowrap',
    };
  },

  statusDot: (pulse: boolean, color: string): S => ({
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: color,
    animation: pulse ? 'pulse 1.4s ease-in-out infinite' : 'none',
  }),

  // ── Barra de herramientas ───────────────────────────────────
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    flexWrap: 'wrap',
  } as S,

  searchWrap: {
    position: 'relative',
    flex: '1 1 220px',
    minWidth: '180px',
    maxWidth: '360px',
  } as S,

  searchIcon: {
    position: 'absolute',
    left: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    color: 'var(--text-faint)',
    display: 'flex',
    pointerEvents: 'none',
  } as S,

  search: {
    width: '100%',
    height: '32px',
    padding: '0 30px 0 32px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--border)',
    background: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    outline: 'none',
  } as S,

  searchClear: {
    position: 'absolute',
    right: '6px',
    top: '50%',
    transform: 'translateY(-50%)',
    width: '22px',
    height: '22px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'none',
    color: 'var(--text-faint)',
    cursor: 'pointer',
  } as S,

  chip: (active: boolean, color: string): S => ({
    ...condensed,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '30px',
    padding: '0 10px',
    fontSize: '11px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? color : 'var(--border)'}`,
    background: active ? 'var(--bg-hover)' : 'transparent',
    color: active ? color : 'var(--text-faint)',
    cursor: 'pointer',
    opacity: active ? 1 : 0.7,
  }),

  chipCount: {
    fontFamily: 'var(--font-body)',
    fontWeight: 500,
    letterSpacing: 0,
    fontVariantNumeric: 'tabular-nums',
  } as S,

  spacer: { flex: 1 } as S,

  toolBtn: (active = false, danger = false): S => ({
    ...condensed,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '30px',
    padding: '0 10px',
    fontSize: '11px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${danger ? 'var(--accent-border)' : active ? 'var(--accent-border)' : 'var(--border)'}`,
    background: danger ? 'var(--accent-dim)' : active ? 'var(--accent-dim)' : 'transparent',
    color: danger || active ? 'var(--accent)' : 'var(--text-secondary)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }),

  // ── Aviso de cierre ─────────────────────────────────────────
  banner: (error: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 16px',
    fontSize: '13px',
    background: error ? 'var(--accent-dim)' : 'var(--bg-elevated)',
    borderBottom: `1px solid ${error ? 'var(--accent-border)' : 'var(--border)'}`,
    color: error ? 'var(--error-text)' : 'var(--text-secondary)',
    flexWrap: 'wrap',
  }),

  // ── Cuerpo ──────────────────────────────────────────────────
  bodyWrap: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
  } as S,

  body: (wrap: boolean): S => ({
    position: 'absolute',
    inset: 0,
    overflow: 'auto',
    padding: '8px 0',
    fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, ui-monospace, monospace',
    fontSize: '12px',
    lineHeight: 1.55,
    whiteSpace: wrap ? 'pre-wrap' : 'pre',
    wordBreak: wrap ? 'break-word' : 'normal',
  }),

  line: (level: LogLevel, stderr: boolean): S => ({
    display: 'flex',
    gap: '12px',
    padding: '0 16px 0 0',
    color: levelColor[level],
    background: level === 'error' ? 'rgba(232,25,44,0.07)' : level === 'system' ? 'var(--bg-elevated)' : 'transparent',
    borderLeft: `2px solid ${stderr ? 'var(--accent-border)' : 'transparent'}`,
    fontWeight: level === 'system' ? 600 : 400,
    contentVisibility: 'auto',
    containIntrinsicSize: 'auto 19px',
  }),

  gutter: {
    flexShrink: 0,
    width: '56px',
    textAlign: 'right',
    color: 'var(--text-faint)',
    opacity: 0.6,
    userSelect: 'none',
    fontVariantNumeric: 'tabular-nums',
  } as S,

  text: {
    flex: 1,
    minWidth: 0,
  } as S,

  mark: {
    background: 'var(--warning)',
    color: '#000',
    borderRadius: '2px',
    padding: '0 1px',
  } as S,

  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    color: 'var(--text-faint)',
    fontSize: '13px',
    textAlign: 'center',
    padding: '24px',
  } as S,

  jumpBtn: {
    ...condensed,
    position: 'absolute',
    right: '20px',
    bottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    height: '34px',
    padding: '0 14px',
    fontSize: '11px',
    borderRadius: '17px',
    border: 'none',
    background: 'var(--accent)',
    color: '#fff',
    cursor: 'pointer',
    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
  } as S,

  // ── Pie ─────────────────────────────────────────────────────
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    padding: '6px 16px',
    fontSize: '11px',
    color: 'var(--text-faint)',
    background: 'var(--bg-surface)',
    borderTop: '1px solid var(--border)',
    fontVariantNumeric: 'tabular-nums',
    flexWrap: 'wrap',
  } as S,
} as const;
