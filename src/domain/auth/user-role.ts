/**
 * The role of the signed-in user.
 *
 * The source of truth is `profiles.role` in Supabase, set by a database trigger
 * at sign-up — never by the client. This type is only the local reflection: it
 * decides what the UI *shows*, and not what the database *allows*. What actually
 * blocks improper access is row-level security.
 *
 * ---
 * Why a string-literal union and a `Record`, rather than a TypeScript `enum`:
 *
 * - The values are already strings in the database. A union types them as
 *   exactly those strings, so `role === 'doctor'` compiles and a typo does not,
 *   with no conversion between a wire value and a language construct.
 * - `enum` is one of the few TypeScript features that emits real JavaScript
 *   (an object at runtime), which puts it at odds with `erasableSyntaxOnly` and
 *   with modern bundlers. The union costs nothing at runtime.
 * - A `Record<Role, X>` lookup is checked for exhaustiveness: adding a role to
 *   the union makes every label map fail to compile until it is filled in. That
 *   is the same guarantee Dart's exhaustive `switch` over an enum gives.
 */
export const USER_ROLES = ['doctor', 'secretary'] as const;

export type UserRole = (typeof USER_ROLES)[number];

/** Unknown or missing values read back as `doctor`, matching `UserRole.fromWire`. */
export function toUserRole(wire: string | null | undefined): UserRole {
  return USER_ROLES.includes(wire as UserRole) ? (wire as UserRole) : 'doctor';
}
