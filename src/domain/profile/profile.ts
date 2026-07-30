import { toUserRole, type UserRole } from '@/domain/auth/user-role';

export interface Profile {
  readonly id: string;
  readonly role: UserRole;
  readonly fullName: string | null;
}

/** Shape of a `profiles` row as PostgREST returns it. */
export interface ProfileRow {
  id: string;
  role: string | null;
  full_name: string | null;
}

/**
 * The single place a database row becomes a domain object.
 *
 * Every entity in this app has one of these, and no other layer is allowed to
 * touch `snake_case` keys. That keeps the column-naming convention from leaking
 * into components, and means a renamed column is a one-line change here.
 */
export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    role: toUserRole(row.role),
    fullName: row.full_name,
  };
}

export function profileDisplayName(profile: Profile): string {
  const name = profile.fullName?.trim();
  return name === undefined || name === '' ? 'Sem nome' : name;
}
