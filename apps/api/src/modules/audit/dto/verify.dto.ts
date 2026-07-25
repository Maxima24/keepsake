export interface VerifyResultDto {
  valid: boolean;
  brokenAtSeq: string | null;
  checked: number;
}
