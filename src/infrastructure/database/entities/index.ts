import { EmailVerification } from "./email-verification.entity";
import { PrReview } from "./pr-review.entity";
import { PullRequest } from "./pull-request.entity";
import { RepoCollaborator } from "./repo-collaborator.entity";
import { Repo } from "./repo.entity";
import { User } from "./user.entity";

/** 앱과 마이그레이션 CLI(data-source.ts)가 같은 목록을 쓰도록 한 곳에서 관리 */
export const ENTITIES = [
  Repo,
  PullRequest,
  PrReview,
  RepoCollaborator,
  User,
  EmailVerification,
];
