import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cashBuysCsv, cashFileName } from '../src/lib/cashBuys.js';

// The Cash buys file (owner, 2026-10-02): for the store's records and taxes.
test('the Cash buys file: store day, staff name, phone, two decimals, formulas defused', () => {
  const rows = [
    // 7:30 PM Pacific on the 2nd is the 3rd in UTC: the store's day is the 2nd.
    { userId: 'u1', userName: null, at: '2026-10-03T02:30:00Z', customer: '=SUM(A1)', phone: '5035551234',
      type: 'Walk-in buy', market: 12.5, paid: 4 },
    // A user since removed: the name kept with the payment.
    { userId: 'gone', userName: 'Old Name', at: '2026-10-15T18:00:00Z', customer: 'Lee, Pat', phone: null,
      type: 'Collection', market: 100, paid: 33.3 },
  ];
  const csv = cashBuysCsv(rows, (id) => (id === 'u1' ? { name: 'Jordan' } : null));
  assert.equal(csv, 'User bought,Date bought,Customer,Phone,Type,Market price,Paid in cash\r\n'
    + "Jordan,2026-10-02,\"'=SUM(A1)\",(503) 555-1234,Walk-in buy,12.50,4.00\r\n"
    + 'Old Name,2026-10-15,"Lee, Pat",,Collection,100.00,33.30');
  assert.equal(cashFileName('2026-10'), 'cash-buys-2026-10.csv');
});
