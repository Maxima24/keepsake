import { Role } from '../../common/roles';
import { UserDto } from './dto/user.dto';

// Structural row shape — no Prisma import. Note: passwordHash is deliberately
// absent, so it can never be mapped into a DTO.
interface UserRow {
  id: string;
  email: string;
  role: string;
  disabled: boolean;
  createdAt: Date;
}

export function toUserDto(row: UserRow): UserDto {
  return {
    id: row.id,
    email: row.email,
    role: row.role as Role,
    disabled: row.disabled,
    createdAt: row.createdAt.toISOString(),
  };
}
