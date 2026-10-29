import type React from 'react';
type S = React.CSSProperties;

export const modal = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 200,
  } as S,

  card: {
    width: '100%',
    maxWidth: '520px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: 'var(--radius-xl)',
    display: 'flex',
    flexDirection: 'column',
    maxHeight: '90vh',
    overflow: 'hidden',
  } as S,

  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
  } as S,

  headerLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  } as S,

  eyebrow: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: 'var(--accent)',
  } as S,

  title: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '18px',
    fontWeight: 800,
    color: 'var(--text-primary)',
    letterSpacing: '0.01em',
  } as S,

  closeBtn: {
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-faint)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
  } as S,

  body: {
    overflowY: 'auto',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  } as S,

  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  } as S,

  sectionTitle: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-faint)',
  } as S,

  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  } as S,

  label: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    flex: 1,
    minWidth: 0,
  } as S,

  valueTag: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--accent)',
    minWidth: '52px',
    textAlign: 'right',
  } as S,

  slider: {
    width: '100%',
    accentColor: 'var(--accent)',
    cursor: 'pointer',
  } as S,

  select: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    cursor: 'pointer',
  } as S,

  customResRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  } as S,

  customInput: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '8px 10px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    outline: 'none',
    width: '80px',
    textAlign: 'center',
  } as S,

  customSep: {
    color: 'var(--text-faint)',
    fontSize: '14px',
  } as S,

  textarea: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '12px',
    outline: 'none',
    width: '100%',
    resize: 'vertical',
    minHeight: '72px',
    lineHeight: 1.5,
    boxSizing: 'border-box',
  } as S,

  toggle: (active: boolean): S => ({
    width: '38px',
    height: '22px',
    borderRadius: '11px',
    background: active ? 'var(--accent)' : 'var(--bg-hover)',
    border: 'none',
    cursor: 'pointer',
    position: 'relative',
    flexShrink: 0,
    transition: 'background-color 0.15s',
  }),

  toggleKnob: (active: boolean): S => ({
    position: 'absolute',
    top: '3px',
    left: active ? '19px' : '3px',
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    background: '#fff',
    transition: 'left 0.15s',
  }),

  divider: {
    height: '1px',
    background: 'var(--border)',
  } as S,

  footer: {
    display: 'flex',
    gap: '10px',
    padding: '16px 24px',
    borderTop: '1px solid var(--border)',
  } as S,

  btnPrimary: {
    flex: 1,
    padding: '10px',
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 'var(--radius-md)',
    color: '#fff',
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 800,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  } as S,

  btnSecondary: {
    flex: 1,
    padding: '10px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-muted)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
  } as S,
} as const;
export type HintTone = 'ok' | 'info' | 'warn';

const hintColor: Record<HintTone, string> = {
  ok: 'var(--success)',
  info: 'var(--text-muted)',
  warn: 'var(--warning)',
};

/** Piezas del selector de RAM y de las secciones del modal */
export const settingsUi = {
  sectionHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
  } as S,

  systemTag: {
    fontSize: '11px',
    color: 'var(--text-faint)',
  } as S,

  presetRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px',
  } as S,

  presetBtn: (active: boolean, hovered: boolean): S => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '2px',
    padding: '10px 12px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${active ? 'var(--accent)' : hovered ? 'var(--border-strong)' : 'var(--border)'}`,
    background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'border-color 0.15s, background-color 0.15s',
  }),

  presetLabel: (active: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    color: active ? 'var(--accent)' : 'var(--text-faint)',
  }),

  presetValue: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '20px',
    fontWeight: 800,
  } as S,

  bigValueRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '12px',
  } as S,

  bigValue: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '28px',
    fontWeight: 800,
    lineHeight: 1,
  } as S,

  sourceTag: (auto: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    padding: '3px 8px',
    borderRadius: 'var(--radius-sm)',
    color: auto ? 'var(--success)' : 'var(--text-muted)',
    border: `1px solid ${auto ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
  }),

  memBar: {
    display: 'flex',
    height: '10px',
    borderRadius: '5px',
    overflow: 'hidden',
    background: 'var(--bg-hover)',
  } as S,

  memGame: (percent: number, warn: boolean): S => ({
    width: `${Math.min(100, Math.max(0, percent))}%`,
    background: warn ? 'var(--warning)' : 'var(--accent)',
    transition: 'width 0.15s, background-color 0.15s',
  }),

  memLegend: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '12px',
    fontSize: '11px',
    color: 'var(--text-faint)',
    marginTop: '6px',
  } as S,

  legendDot: (color: string): S => ({
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '2px',
    background: color,
    marginRight: '6px',
  }),

  hint: (tone: HintTone): S => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    fontSize: '12px',
    lineHeight: 1.45,
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    border: `1px solid ${tone === 'warn' ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
    background: tone === 'warn' ? 'rgba(245,158,11,0.08)' : 'var(--bg-elevated)',
    color: tone === 'ok' ? 'var(--text-secondary)' : hintColor[tone],
  }),

  hintIcon: (tone: HintTone): S => ({
    display: 'flex',
    flexShrink: 0,
    marginTop: '1px',
    color: hintColor[tone],
  }),

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '16px',
  } as S,

  toggleText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  } as S,

  toggleDesc: {
    fontSize: '11px',
    color: 'var(--text-faint)',
    lineHeight: 1.4,
  } as S,

  collapseBtn: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: 0,
    border: 'none',
    background: 'none',
    color: hovered ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
  }),

  chevron: (open: boolean): S => ({
    display: 'flex',
    transform: open ? 'rotate(180deg)' : 'none',
    transition: 'transform 0.15s',
  }),

  sliderScale: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '10px',
    color: 'var(--text-faint)',
    marginTop: '2px',
  } as S,

  restoreBtn: (hovered: boolean): S => ({
    marginRight: 'auto',
    background: 'none',
    border: 'none',
    padding: '0 4px',
    fontSize: '12px',
    color: hovered ? 'var(--accent)' : 'var(--text-faint)',
    cursor: 'pointer',
    textDecoration: hovered ? 'underline' : 'none',
  }),
} as const;
