/** Where a cash buy's money came from (owner, 2026-11-10; decision 583), as stored on `buys`. */
export const CASH_LOCATIONS = [
  { value: 'till', label: 'Till' },
  { value: 'backroom', label: 'Backroom' },
];

/**
 * Till or Backroom, as chips beside Cash and Credit (PayMethod's look, in cash's colour): asked of a cash buy
 * only, at CONFIRM BUY and at an overnight buy's Paid/Ours. A credit buy has none (its copied row says NA).
 * @param {{ location: string|null, onChoose: (value: string) => void }} p
 */
export default function CashLocation({ location, onChoose }) {
  return (
    <div className="pay-method cash-location" role="radiogroup" aria-label="Cash from">
      {CASH_LOCATIONS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={location === value}
          className={`pay-choice cash${location === value ? ' on' : ''}`}
          onClick={() => onChoose(value)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
