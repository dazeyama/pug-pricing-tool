import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * CM's modal: a dimmed overlay with a head, a body and a row of buttons.
 * Without onClose the modal can't be dismissed (Esc and the overlay do nothing),
 * for questions that need an answer. Never use alert()/confirm() (spec 7.6).
 *
 * @param {{ title: string, children: any, footer?: any,
 *           onClose?: () => void, wide?: boolean, className?: string }} props
 */
export default function Modal({ title, children, footer, onClose, wide, className = '' }) {
  useEffect(() => {
    if (!onClose) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={`modal${className ? ` ${className}` : ''}`}
      onMouseDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`modal-box${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">{title}</div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
