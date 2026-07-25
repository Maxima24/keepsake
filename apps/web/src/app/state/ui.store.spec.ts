import { UiStore } from './ui.store';

describe('UiStore (post-transaction form signals)', () => {
  let store: UiStore;

  beforeEach(() => {
    store = new UiStore();
  });

  it('starts with two empty rows and is not submittable', () => {
    expect(store.entries().length).toBe(2);
    expect(store.balanced()).toBe(false);
    expect(store.canSubmit()).toBe(false);
  });

  it('is balanced only when debits equal credits and are > 0', () => {
    store.patchEntry(0, { amount: 1000 });
    store.patchEntry(1, { amount: 1000 });
    expect(store.debitTotal()).toBe(1000);
    expect(store.creditTotal()).toBe(1000);
    expect(store.balanced()).toBe(true);

    store.patchEntry(1, { amount: 999 });
    expect(store.balanced()).toBe(false);
  });

  it('canSubmit requires balanced + description + every row complete', () => {
    store.setDescription('Cash sale');
    store.patchEntry(0, { accountId: 'a1', amount: 1000 });
    store.patchEntry(1, { accountId: 'a2', amount: 1000 });
    expect(store.canSubmit()).toBe(true);

    store.patchEntry(1, { accountId: '' }); // missing account
    expect(store.canSubmit()).toBe(false);
  });

  it('adds and removes rows but never drops below two', () => {
    store.addEntry('debit');
    expect(store.entries().length).toBe(3);
    store.removeEntry(2);
    expect(store.entries().length).toBe(2);
    store.removeEntry(0);
    expect(store.entries().length).toBe(2);
  });

  it('reset clears the form', () => {
    store.setDescription('x');
    store.patchEntry(0, { amount: 5 });
    store.reset();
    expect(store.description()).toBe('');
    expect(store.entries()[0].amount).toBeNull();
    expect(store.balanced()).toBe(false);
  });

  it('toInput builds the API payload from the draft', () => {
    store.setDescription('Sale');
    store.patchEntry(0, { accountId: 'cash', direction: 'debit', amount: 1000 });
    store.patchEntry(1, { accountId: 'rev', direction: 'credit', amount: 1000 });
    expect(store.toInput()).toEqual({
      description: 'Sale',
      entries: [
        { accountId: 'cash', direction: 'debit', amount: 1000 },
        { accountId: 'rev', direction: 'credit', amount: 1000 },
      ],
    });
  });
});
