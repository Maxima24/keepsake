/** Safe representation of an API key — never includes the secret hash. */
export interface ApiKeyDto {
  id: string;
  label: string;
  prefix: string; // display hint, e.g. 'sk_live_ab12…'
  serviceUserId: string;
  disabled: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

/** Returned exactly once, at mint time — carries the plaintext secret. */
export interface MintedApiKeyDto extends ApiKeyDto {
  key: string;
}
