// Rules a day page and its buy panels share (FABLE_REPORT C2).

export const COMPLETED_LOCK = 'Completed (exported): its ⋯ → Mark Paid/Ours again, or the whole day\u2019s (⋯ next to EXPORT), to change it';
// A buy marked Completed from its own ⋯, not exported (owner, 2026-10-02).
export const MARKED_LOCK = 'Completed (marked by hand, not exported): its ⋯ → Mark Paid/Ours again to change it';
/** Was this line Completed by hand (Mark as completed), not by an export? */
export const markedByHand = (l) => Boolean(l.completed_at) && l.cc_status == null;
