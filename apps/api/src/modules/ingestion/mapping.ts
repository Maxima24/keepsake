/**
 * Counterparty file mapping: turns a raw CSV row (per a saved per-source profile)
 * into Keepsake's canonical counterparty record. Amounts are normalized to integer
 * minor units at the boundary; the raw row is preserved separately for auditors.
 */

export type DirectionMapping =
  | { column: string; map: Record<string, 'debit' | 'credit'> }
  | { fromSign: true }; // negative amount => credit, positive => debit

export interface ColumnMapping {
  reference?: string;
  amount: { column: string; scale?: number }; // scale converts major→minor (default 100)
  direction: DirectionMapping;
  valueDate: {
    column: string;
    format?: 'ISO' | 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
  };
}

export interface MappingProfile {
  delimiter?: string; // default ','
  hasHeader?: boolean; // default true
  columns: ColumnMapping;
}

export interface MappedRecord {
  reference: string | null;
  amount: number; // minor units, always positive
  direction: 'debit' | 'credit';
  valueDate: Date;
}

function cell(row: Record<string, string>, column: string): string {
  const v = row[column];
  if (v === undefined) throw new Error(`missing column "${column}"`);
  return v.trim();
}

/** Parse a possibly-formatted major amount ("4,200.50") into signed minor units. */
export function parseSignedMinor(raw: string, scale = 100): number {
  const cleaned = raw.replace(/[,\s]/g, '');
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new Error(`unparseable amount "${raw}"`);
  return Math.round(n * scale);
}

export function parseValueDate(
  raw: string,
  format: ColumnMapping['valueDate']['format'] = 'ISO',
): Date {
  let d: Date;
  if (format === 'ISO' || format === 'YYYY-MM-DD') {
    d = new Date(raw);
  } else {
    const parts = raw.split(/[/\-.]/).map((p) => Number(p));
    if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) {
      throw new Error(`unparseable date "${raw}"`);
    }
    const [a, b, y] = parts;
    const [day, month] =
      format === 'DD/MM/YYYY' ? [a, b] : /* MM/DD/YYYY */ [b, a];
    d = new Date(Date.UTC(y, month - 1, day));
  }
  if (Number.isNaN(d.getTime())) throw new Error(`unparseable date "${raw}"`);
  return d;
}

/** Map one raw row → a canonical counterparty record, or throw with the reason. */
export function mapRow(
  row: Record<string, string>,
  m: ColumnMapping,
): MappedRecord {
  const signedMinor = parseSignedMinor(
    cell(row, m.amount.column),
    m.amount.scale ?? 100,
  );

  let direction: 'debit' | 'credit';
  if ('fromSign' in m.direction) {
    direction = signedMinor < 0 ? 'credit' : 'debit';
  } else {
    const key = cell(row, m.direction.column);
    const mapped = m.direction.map[key];
    if (!mapped) throw new Error(`unmapped direction "${key}"`);
    direction = mapped;
  }

  return {
    reference: m.reference ? (row[m.reference]?.trim() ?? null) : null,
    amount: Math.abs(signedMinor),
    direction,
    valueDate: parseValueDate(cell(row, m.valueDate.column), m.valueDate.format),
  };
}
