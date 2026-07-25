import { Role } from '../../../common/roles';

export interface UserDto {
  id: string;
  email: string;
  role: Role;
  disabled: boolean;
  createdAt: string; // ISO string — never includes passwordHash
}
