// CONFIRM BUY's read-back after a lost answer (decisions 363, 367): is the buy, read back, the
// confirm this tab sent? Two tabs on one computer share its draft (spec 8.12), so "confirmed by
// this user" isn't enough: another tab may have confirmed it with other cards, name or price.
// Every draft write moves the buy's version, and a confirm must match it, so a confirm that went
// through had exactly the cards this tab had when it pressed. useDraft.js reads the row.
import { phoneDigits } from '../../lib/phone.js';

const trimmed = (s) => String(s ?? '').trim();
/** The same cards, each with the same quantity. */
const sameCards = (saved, sent) => saved.length === sent.length
  && sent.every((l) => saved.some((x) => x.id === l.id && x.quantity === l.quantity));

/**
 * @param {object|null} row  the buy: status, number, confirmed_by, customer_name, phone, notes,
 *   paid_price, paid_method, buy_lines (id, game, quantity); null if it's gone
 * @param {{ userId: string, sent: { customerName: string, phone: string, notes: string,
 *   paidPrice: number, paidMethod: string }, lines: { id: string, quantity: number }[] }} attempt
 * @returns {{ state: 'mine', result: { number: number, games: string[], target_name: null } }
 *   | { state: 'draft' } | { state: 'other' }}
 *   mine: this tab's confirm went through; draft: it didn't; other: the buy was finished another way
 */
export function readBack(row, attempt) {
  if (row?.status === 'draft') return { state: 'draft' };
  if (!row || row.status !== 'confirmed' || row.number == null) return { state: 'other' };
  const { sent } = attempt;
  const same = row.confirmed_by === attempt.userId
    && trimmed(row.customer_name) === trimmed(sent.customerName)
    && phoneDigits(row.phone) === phoneDigits(sent.phone)
    && trimmed(row.notes) === trimmed(sent.notes)
    && Number(row.paid_price) === Number(sent.paidPrice)
    && row.paid_method === sent.paidMethod
    && sameCards(row.buy_lines ?? [], attempt.lines);
  if (!same) return { state: 'other' };
  // Magic before Pokémon, as confirm_buy lists the games.
  const games = [...new Set((row.buy_lines ?? []).map((l) => l.game))]
    .sort((a, b) => Number(a === 'pokemon') - Number(b === 'pokemon') || a.localeCompare(b));
  return { state: 'mine', result: { number: row.number, games, target_name: null } };
}
