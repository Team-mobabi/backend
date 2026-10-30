import { Schema } from "effect";
import { CollaboratorRoleSchema } from "./collaborator-role";

export const CollaboratorSchema = Schema.Struct({
  id: Schema.String,
  repoId: Schema.String,
  userId: Schema.String,
  role: CollaboratorRoleSchema,
  addedAt: Schema.Date,
});
export type Collaborator = Schema.Schema.Type<typeof CollaboratorSchema>;

export const CollaboratorWithUserSchema = Schema.Struct({
  ...CollaboratorSchema.fields,
  user: Schema.NullOr(
    Schema.Struct({ id: Schema.String, email: Schema.String }),
  ),
});
export type CollaboratorWithUser = Schema.Schema.Type<
  typeof CollaboratorWithUserSchema
>;

export const CollaboratorListSchema = Schema.Array(CollaboratorWithUserSchema);

export const AddCollaboratorBodySchema = Schema.Struct({
  userId: Schema.NonEmptyString.annotations({
    description: "추가할 사용자 ID",
  }),
  role: Schema.optionalWith(CollaboratorRoleSchema, {
    default: () => "read" as const,
  }),
});
export type AddCollaboratorBody = Schema.Schema.Type<
  typeof AddCollaboratorBodySchema
>;

export const UpdateCollaboratorBodySchema = Schema.Struct({
  role: CollaboratorRoleSchema,
});

export const RemoveCollaboratorResultSchema = Schema.Struct({
  success: Schema.Literal(true),
  message: Schema.String,
});
