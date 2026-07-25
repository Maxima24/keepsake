import { Component, computed, inject, signal } from '@angular/core';
import { ReconciliationApi } from '../../core/api/reconciliation.api';
import {
  ApiKey,
  IngestFileResult,
  IngestSource,
  MintedApiKey,
  NeedsMappingRecord,
} from '../../core/models/reconciliation.models';
import { formatDateTime, formatMinor } from '../../core/format';
import { IconComponent } from '../../shared/ui/icon.component';

const DEFAULT_MAPPING = `{
  "hasHeader": true,
  "delimiter": ",",
  "columns": {
    "reference": "REF",
    "amount": { "column": "AMT", "scale": 100 },
    "direction": { "column": "TYPE", "map": { "C": "credit", "D": "debit" } },
    "valueDate": { "column": "DATE", "format": "YYYY-MM-DD" }
  }
}`;

@Component({
  selector: 'app-integrations',
  standalone: true,
  imports: [IconComponent],
  templateUrl: './integrations.component.html',
})
export class IntegrationsComponent {
  private readonly api = inject(ReconciliationApi);
  readonly fmtDate = formatDateTime;
  readonly formatMinor = formatMinor;

  readonly sources = signal<IngestSource[]>([]);
  readonly apiKeys = signal<ApiKey[]>([]);
  readonly needsMapping = signal<NeedsMappingRecord[]>([]);
  readonly message = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly newSourceName = signal('');
  readonly newSourceKind = signal<'ledger' | 'counterparty'>('counterparty');

  readonly mappingSourceId = signal('');
  readonly mappingJson = signal(DEFAULT_MAPPING);

  readonly uploadSource = signal('');
  readonly uploadFile = signal<File | null>(null);
  readonly uploadResult = signal<IngestFileResult | null>(null);

  readonly newKeyLabel = signal('');
  readonly mintedKey = signal<MintedApiKey | null>(null);

  readonly counterpartySources = computed(() =>
    this.sources().filter((s) => s.kind === 'counterparty'),
  );

  constructor() {
    this.load();
  }

  private load(): void {
    this.api.listSources().subscribe({ next: (s) => this.sources.set(s) });
    this.api.listApiKeys().subscribe({ next: (k) => this.apiKeys.set(k) });
    this.api.listNeedsMapping().subscribe({ next: (n) => this.needsMapping.set(n) });
  }

  private ok(msg: string): void {
    this.message.set(msg);
    this.error.set(null);
  }
  private fail(e: { error?: { message?: string } }, fallback: string): void {
    this.error.set(e?.error?.message ?? fallback);
    this.message.set(null);
  }

  createSource(): void {
    if (!this.newSourceName().trim()) return;
    this.api.createSource(this.newSourceName().trim(), this.newSourceKind()).subscribe({
      next: () => {
        this.ok('Source registered.');
        this.newSourceName.set('');
        this.load();
      },
      error: (e) => this.fail(e, 'Could not create source.'),
    });
  }

  saveMapping(): void {
    if (!this.mappingSourceId()) {
      this.error.set('Pick a source to map.');
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.mappingJson());
    } catch {
      this.error.set('Mapping is not valid JSON.');
      return;
    }
    this.api.setMapping(this.mappingSourceId(), parsed).subscribe({
      next: () => {
        this.ok('Mapping profile saved (audited).');
        this.load();
      },
      error: (e) => this.fail(e, 'Could not save mapping.'),
    });
  }

  onFile(event: Event): void {
    this.uploadFile.set((event.target as HTMLInputElement).files?.[0] ?? null);
  }

  upload(): void {
    const file = this.uploadFile();
    if (!this.uploadSource() || !file) {
      this.error.set('Pick a counterparty source and a CSV file.');
      return;
    }
    this.api.uploadFile(this.uploadSource(), file).subscribe({
      next: (r) => {
        this.uploadResult.set(r);
        this.ok(
          r.duplicate
            ? 'Identical file already imported (deduped).'
            : `Imported ${r.rowCount} rows (${r.errorCount} errors).`,
        );
      },
      error: (e) => this.fail(e, 'Upload failed.'),
    });
  }

  mint(): void {
    if (!this.newKeyLabel().trim()) return;
    this.api.mintKey(this.newKeyLabel().trim()).subscribe({
      next: (k) => {
        this.mintedKey.set(k);
        this.newKeyLabel.set('');
        this.ok('API key created — copy it now, it is shown only once.');
        this.load();
      },
      error: (e) => this.fail(e, 'Could not mint key.'),
    });
  }

  revoke(id: string): void {
    this.api.revokeKey(id).subscribe({
      next: () => {
        this.ok('Key revoked.');
        this.load();
      },
      error: (e) => this.fail(e, 'Could not revoke key.'),
    });
  }
}
