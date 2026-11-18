import {
  allocateItemPayment,
  itemPayState,
  rebalanceItemPayments,
  unpaidForItems,
  AllocItem,
} from '@/services/books/waiterAllocation';

const primus: AllocItem = { id: 'primus', value: 3000, paid: 0, issuedAt: '2026-11-18T15:00:00Z' };
const mutzig: AllocItem = { id: 'mutzig', value: 3000, paid: 0, issuedAt: '2026-11-18T16:00:00Z' };
const fanta: AllocItem = { id: 'fanta', value: 800, paid: 0, issuedAt: '2026-11-18T16:30:00Z' };

describe('waiter tab item allocation', () => {
  it('pays the chosen line first', () => {
    const next = allocateItemPayment([primus, mutzig, fanta], 3000, ['mutzig']);
    expect(next).toEqual({ primus: 0, mutzig: 3000, fanta: 0 });
  });

  it('spreads leftover money oldest first', () => {
    const next = allocateItemPayment([primus, mutzig, fanta], 4000, ['mutzig']);
    expect(next).toEqual({ primus: 1000, mutzig: 3000, fanta: 0 });
  });

  it('pays oldest first when nothing is chosen', () => {
    const next = allocateItemPayment([fanta, mutzig, primus], 3500);
    expect(next).toEqual({ primus: 3000, mutzig: 500, fanta: 0 });
  });

  it('never pays a line beyond its value', () => {
    const next = allocateItemPayment([{ ...mutzig, paid: 2500 }, primus], 1000, ['mutzig']);
    expect(next).toEqual({ mutzig: 3000, primus: 500 });
  });

  it('fills old tabs that have no line amounts yet', () => {
    expect(rebalanceItemPayments([primus, mutzig, fanta], 3500)).toEqual({ primus: 3000, mutzig: 500, fanta: 0 });
  });

  it('keeps chosen lines when the totals already match', () => {
    const paid = rebalanceItemPayments([primus, { ...mutzig, paid: 3000 }, fanta], 3000);
    expect(paid).toEqual({ primus: 0, mutzig: 3000, fanta: 0 });
  });

  it('moves money from a returned line to the oldest unpaid line', () => {
    const returnedMutzig = { ...mutzig, value: 0, paid: 3000 };
    expect(rebalanceItemPayments([primus, returnedMutzig, fanta], 3000)).toEqual({
      primus: 3000,
      mutzig: 0,
      fanta: 0,
    });
  });

  it('removes extra newest first', () => {
    const paid = rebalanceItemPayments([{ ...primus, paid: 3000 }, { ...fanta, paid: 800 }], 3000);
    expect(paid).toEqual({ primus: 3000, fanta: 0 });
  });

  it('sums unpaid for chosen lines', () => {
    expect(unpaidForItems([{ ...primus, paid: 1000 }, mutzig, fanta], ['primus', 'fanta'])).toBe(2800);
  });

  it('labels line state', () => {
    expect(itemPayState(3000, 3000)).toBe('paid');
    expect(itemPayState(3000, 1000)).toBe('part');
    expect(itemPayState(3000, 0)).toBe('unpaid');
  });
});
