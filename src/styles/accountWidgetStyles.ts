import type React from 'react';
type S = React.CSSProperties;

export const widget = {
  wrap: {
    position: 'fixed',
    top: '16px',
    right: '16px',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  } as S,

  activeAccount: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    justifyContent: 'space-between',
  } as S,

  trigger: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'background-color 0.15s, border-color 0.15s',
    backgroundColor: hovered ? 'var(--bg-elevated)' : 'var(--bg-surface)',
    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
    minWidth: '220px',
    justifyContent: 'space-between',

  }),

  avatar: {
    width: '32px',
    height: '32px',
    borderRadius: 'var(--radius-md)',
    imageRendering: 'pixelated',
    border: '1px solid var(--border)',
    flexShrink: 0,
  } as S,

  avatarFallback: (size: number): S => ({
    width: `${size}px`,
    height: `${size}px`,
    borderRadius: 'var(--radius-md)',
    flexShrink: 0,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-faint)',
    fontSize: `${size / 2.2}px`,
    fontWeight: 700,
    fontFamily: 'var(--font-condensed)',
  }),

  info: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  } as S,

  name: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--text-primary)',
    whiteSpace: 'nowrap',
  } as S,

  type: {
    fontSize: '10px',
    color: 'var(--text-faint)',
    whiteSpace: 'nowrap',
  } as S,

  chevron: (open: boolean): S => ({
    color: 'var(--text-faint)',
    transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
    transition: 'transform 0.2s',
    flexShrink: 0,
  }),

  dropdown: {
    marginTop: '6px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    overflow: 'hidden',
    minWidth: '220px',
  } as S,

  dropdownBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    padding: '6px',
  } as S,

  accountRow: (hovered: boolean, active: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: active
      ? 'var(--bg-hover)'
      : hovered ? 'var(--bg-elevated)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    cursor: active ? 'default' : 'pointer',
    transition: 'background-color 0.12s',
  }),

  accountInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
    minWidth: 0,
  } as S,

  accountName: (active: boolean): S => ({
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    color: active ? 'var(--accent)' : 'var(--text-primary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),

  accountType: {
    fontSize: '10px',
    color: 'var(--text-faint)',
  } as S,

  removeBtn: (hovered: boolean): S => ({
    width: '24px',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: hovered ? 'var(--accent-dim)' : 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: hovered ? 'var(--accent)' : 'var(--text-faint)',
    cursor: 'pointer',
    flexShrink: 0,
    transition: 'background-color 0.12s, color 0.12s',
  }),

  divider: {
    height: '1px',
    background: 'var(--border)',
    margin: '2px 6px',
  } as S,

  addBtn: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 10px',
    borderRadius: 'var(--radius-md)',
    backgroundColor: hovered ? 'var(--bg-elevated)' : 'transparent',
    cursor: 'pointer',
    transition: 'background-color 0.12s',
    color: 'var(--text-muted)',
  }),

  addLabel: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
  } as S,

  // ── Modal de añadir cuenta ────────────────────────────────
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

  modal: {
    width: '100%',
    maxWidth: '380px',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderTop: '2px solid var(--accent)',
    borderRadius: 'var(--radius-xl)',
    overflow: 'hidden',
  } as S,

  modalHeader: {
    padding: '20px 24px 16px',
    borderBottom: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as S,

  modalTitle: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '17px',
    fontWeight: 800,
    color: 'var(--text-primary)',
  } as S,

  modalBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '20px 24px',
  } as S,

  optionBtn: (hovered: boolean): S => ({
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    padding: '14px 16px',
    background: hovered ? 'var(--bg-elevated)' : 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-lg)',
    cursor: 'pointer',
    transition: 'background-color 0.15s',
    textAlign: 'left',
  }),

  optionIcon: {
    width: '36px',
    height: '36px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: 'var(--text-muted)',
  } as S,

  optionText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  } as S,

  optionLabel: {
    fontFamily: 'var(--font-condensed)',
    fontSize: '14px',
    fontWeight: 700,
    color: 'var(--text-primary)',
  } as S,

  optionDesc: {
    fontSize: '11px',
    color: 'var(--text-faint)',
  } as S,

  input: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  } as S,

  inputError: {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--accent)',
    borderRadius: 'var(--radius-md)',
    padding: '10px 12px',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font-body)',
    fontSize: '14px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  } as S,

  errorText: {
    fontSize: '11px',
    color: 'var(--accent)',
  } as S,

  primaryBtn: (hovered: boolean): S => ({
    padding: '11px',
    background: hovered ? 'var(--accent-hover)' : 'var(--accent)',
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
    width: '100%',
  }),

  secondaryBtn: (hovered: boolean): S => ({
    padding: '11px',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    color: hovered ? 'var(--text-primary)' : 'var(--text-muted)',
    fontFamily: 'var(--font-condensed)',
    fontSize: '13px',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    transition: 'background-color 0.15s, color 0.15s',
    backgroundColor: hovered ? 'var(--bg-elevated)' : 'transparent',
    width: '100%',
  }),

  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid var(--border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    flexShrink: 0,
  } as S,
} as const;