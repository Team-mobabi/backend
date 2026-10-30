import { Schema } from "effect";

export const CollaboratorRoleSchema = Schema.Literal("read", "write", "admin");
export type CollaboratorRole = Schema.Schema.Type<
  typeof CollaboratorRoleSchema
>;

const ROLE_RANK: Record<CollaboratorRole, number> = {
  read: 1,
  write: 2,
  admin: 3,
};

/** 상위 권한은 하위 권한을 포함한다 (admin ⊃ write ⊃ read) */
export const roleSatisfies = (
  role: CollaboratorRole,
  required: CollaboratorRole,
): boolean => ROLE_RANK[role] >= ROLE_RANK[required];
