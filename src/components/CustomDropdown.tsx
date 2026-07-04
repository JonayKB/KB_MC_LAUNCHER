import { useState, useEffect, useRef } from 'react';


interface DropdownProps {
    options: { label: string; value: number }[];
    value: number;
    onChange: (value: number) => void;
}

export function CustomDropdown({ options, value, onChange }: DropdownProps) {
    const [open, setOpen] = useState(false);
    const [hovered, setHovered] = useState<number | null>(null);
    const ref = useRef<HTMLDivElement>(null);

    const selected = options.find(o => o.value === value) ?? options[0];

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <div ref={ref} style={{ position: 'relative', width: '100%' }}>
            {/* Trigger */}
            <div
                onClick={() => setOpen(v => !v)}
                style={{
                    background: 'var(--bg-elevated)',
                    border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    padding: '9px 12px',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    transition: 'border-color 0.15s',
                    userSelect: 'none',
                }}
            >
                <span>{selected.label}</span>
                <svg
                    width="12" height="12" viewBox="0 0 24 24"
                    fill="none" stroke="currentColor" strokeWidth="2"
                    style={{
                        color: 'var(--text-faint)',
                        transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
                        transition: 'transform 0.15s',
                        flexShrink: 0,
                    }}
                >
                    <polyline points="6 9 12 15 18 9" />
                </svg>
            </div>

            {/* Dropdown list */}
            {open && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    right: 0,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 300,
                    overflow: 'hidden',
                }}>
                    {options.map(opt => (
                        <div
                            key={opt.value}
                            onClick={() => { onChange(opt.value); setOpen(false); }}
                            onMouseEnter={() => setHovered(opt.value)}
                            onMouseLeave={() => setHovered(null)}
                            style={{
                                padding: '9px 12px',
                                fontSize: '13px',
                                color: opt.value === value
                                    ? 'var(--accent)'
                                    : 'var(--text-primary)',
                                backgroundColor: hovered === opt.value
                                    ? 'var(--bg-hover)'
                                    : opt.value === value
                                    ? 'var(--bg-elevated)'
                                    : 'transparent',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'background-color 0.1s',
                            }}
                        >
                            <span>{opt.label}</span>
                            {opt.value === value && (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <polyline points="20 6 9 17 4 12" />
                                </svg>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}