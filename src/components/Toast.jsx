import { createContext, useCallback, useContext, useState } from 'react';

// CM's toast: slides up in the bottom-right corner, stays 3.5s, fades out.
// kind is '' | 'ok' | 'err' | 'warn' (the coloured left edge).

const ToastContext = createContext(() => {});
let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, kind = '') => {
    const id = nextId++;
    const patch = (fields) =>
      setToasts((list) => list.map((t) => (t.id === id ? { ...t, ...fields } : t)));
    setToasts((list) => [...list, { id, message, kind, show: false }]);
    // Two frames: let it paint hidden once, so the slide-in transition runs.
    requestAnimationFrame(() => requestAnimationFrame(() => patch({ show: true })));
    setTimeout(() => {
      patch({ show: false });
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 300);
    }, 3500);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind ? ` ${t.kind}` : ''}${t.show ? ' show' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** @returns {(message: string, kind?: ''|'ok'|'err'|'warn') => void} */
export function useToast() {
  return useContext(ToastContext);
}
