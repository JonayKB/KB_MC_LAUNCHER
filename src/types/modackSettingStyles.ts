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