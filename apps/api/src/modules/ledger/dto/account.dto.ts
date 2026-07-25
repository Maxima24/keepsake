export interface AccountDto {
  id: string;
  name: string;
  balance: number; // cached minor units
  createdAt: string; // ISO string
}
