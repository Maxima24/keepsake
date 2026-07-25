import { Injectable, computed, signal } from '@angular/core';
import {
  CreateTransactionInput,
  Direction,
} from '../core/models/ledger.models';

export interface DraftEntry {
  accountId: string;
  direction: Direction;
  amount: number | null;
}

/**
 * Client/UI state for the post-transaction form, held in Angular signals.
 * The live balanced/unbalanced flag is a `computed` signal derived from the rows.
 * (Server state lives in TanStack Query, not here.)
 */
@Injectable({ providedIn: 'root' })
export class UiStore {
  readonly description = signal('');
  readonly entries = signal<DraftEntry[]>(this.initialEntries());

  readonly debitTotal = computed(() =>
    this.entries()
      .filter((e) => e.direction === 'debit')
      .reduce((sum, e) => sum + (e.amount ?? 0), 0),
  );

  readonly creditTotal = computed(() =>
    this.entries()
      .filter((e) => e.direction === 'credit')
      .reduce((sum, e) => sum + (e.amount ?? 0), 0),
  );

  /** Live indicator: balanced only when debits === credits and > 0. */
  readonly balanced = computed(
    () => this.debitTotal() > 0 && this.debitTotal() === this.creditTotal(),
  );

  /** Whether the form is complete enough to submit. */
  readonly canSubmit = computed(
    () =>
      this.balanced() &&
      this.description().trim().length > 0 &&
      this.entries().every((e) => e.accountId !== '' && (e.amount ?? 0) > 0),
  );

  private initialEntries(): DraftEntry[] {
    return [
      { accountId: '', direction: 'debit', amount: null },
      { accountId: '', direction: 'credit', amount: null },
    ];
  }

  setDescription(value: string): void {
    this.description.set(value);
  }

  addEntry(direction: Direction): void {
    this.entries.update((es) => [
      ...es,
      { accountId: '', direction, amount: null },
    ]);
  }

  removeEntry(index: number): void {
    this.entries.update((es) =>
      es.length > 2 ? es.filter((_, i) => i !== index) : es,
    );
  }

  patchEntry(index: number, patch: Partial<DraftEntry>): void {
    this.entries.update((es) =>
      es.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    );
  }

  reset(): void {
    this.description.set('');
    this.entries.set(this.initialEntries());
  }

  toInput(): CreateTransactionInput {
    return {
      description: this.description().trim(),
      entries: this.entries().map((e) => ({
        accountId: e.accountId,
        direction: e.direction,
        amount: Number(e.amount),
      })),
    };
  }
}
