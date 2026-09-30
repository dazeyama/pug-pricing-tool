import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../components/Toast.jsx';

/**
 * A value edited in place (spec 9.4): the text with a ✎; clicking the ✎
 * turns it into a field. Enter saves (Ctrl+Enter for multi-line notes),
 * clicking away saves, Esc leaves it as it was. `format` reshapes the text as
 * it's typed (phone numbers); `validate` returns an error message or null.
 *
 * @param {{ value: string, display?: any, label: string, onSave: (text: string) => Promise<boolean>,
 *   multiline?: boolean, format?: (text: string) => string, validate?: (text: string) => string|null,
 *   canEdit: boolean, editBlocked: () => void, placeholder?: string, className?: string, maxLength?: number }} p
 */
export default function InlineEdit({
  value, display, label, onSave, multiline = false, format, validate, canEdit, editBlocked,
  placeholder = '', className = '', maxLength,
}) {
  const [draft, setDraft] = useState(null);   // null = not editing
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const field = useRef(null);
  const toast = useToast();
  const editing = draft != null;

  useEffect(() => {
    if (editing) {
      field.current?.focus();
      field.current?.select?.();
    }
  }, [editing]);

  // Paid/Ours, view-only or no user while editing: stop without saving.
  useEffect(() => {
    if (!canEdit) setDraft(null);
  }, [canEdit]);

  function start() {
    if (!canEdit) {
      editBlocked();
      return;
    }
    setError(null);
    setDraft(format ? format(value ?? '') : value ?? '');
  }

  async function commit(fromBlur) {
    if (draft == null || saving) return;
    const problem = validate?.(draft) ?? null;
    if (problem) {
      if (fromBlur) {
        // Clicking away can't keep the field open: say why and put it back.
        toast(`${label} not saved: ${problem}`, 'err');
        setDraft(null);
      } else {
        setError(problem);
      }
      return;
    }
    if (draft.trim() === (value ?? '').trim() || (format && format(draft) === format(value ?? ''))) {
      setDraft(null);
      return;
    }
    setSaving(true);
    const ok = await onSave(draft);
    setSaving(false);
    if (ok) setDraft(null);
  }

  if (!editing) {
    const shown = display ?? value;
    return (
      <span className={`ie ${className}`}>
        <span className={`ie-value${shown ? '' : ' ie-empty'}`}>{shown || placeholder}</span>
        <button
          type="button"
          className="ie-pencil"
          title={canEdit ? `Edit ${label.toLowerCase()}` : undefined}
          aria-label={`Edit ${label.toLowerCase()}`}
          onClick={start}
        >
          ✎
        </button>
      </span>
    );
  }

  const Field = multiline ? 'textarea' : 'input';
  return (
    <span className={`ie editing ${className}`}>
      <Field
        ref={field}
        type={multiline ? undefined : 'text'}
        className={`ie-field${error ? ' invalid' : ''}`}
        aria-label={label}
        aria-invalid={Boolean(error)}
        value={draft}
        maxLength={maxLength}
        rows={multiline ? 3 : undefined}
        disabled={saving}
        onChange={(e) => {
          setDraft(format ? format(e.target.value) : e.target.value);
          setError(null);
        }}
        onBlur={() => commit(true)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(null);
          } else if (e.key === 'Enter' && (!multiline || e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            commit(false);
          }
        }}
      />
      {multiline && <span className="ie-hint">Ctrl+Enter saves · Esc cancels</span>}
      {error && <span className="ie-error">{error}</span>}
    </span>
  );
}
