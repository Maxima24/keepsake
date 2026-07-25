import { AuditDto } from '../../audit/dto/audit.dto';
import { AccountDto } from './account.dto';
import { TransactionDto } from './transaction.dto';

/**
 * A point-in-time snapshot whose integrity can be re-verified offline: it carries
 * the audit chain up to `at` (so the recipient can re-verify it) plus an
 * `exportHash` over the whole document.
 */
export interface ExportDocumentDto {
  at: string; // as-of ISO timestamp
  generatedAt: string;
  accounts: AccountDto[]; // as-of balances (derived from entries)
  transactions: TransactionDto[]; // as-of, with entries
  audit: AuditDto[]; // the chain prefix up to `at`
  chainHead: string | null; // hash of the last included audit row
  exportHash: string; // sha256(canonical(document without exportHash))
}
