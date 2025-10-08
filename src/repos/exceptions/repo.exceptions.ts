import {
  NotFoundException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  BadRequestException,
} from "@nestjs/common";

/**
 * 레포지토리를 찾을 수 없을 때 발생
 */
export class RepoNotFoundException extends NotFoundException {
  constructor(repoId?: string) {
    super(
      repoId
        ? `Repository with ID '${repoId}' not found`
        : "Repository not found",
    );
  }
}

/**
 * 레포지토리 경로가 설정되지 않았을 때 발생
 */
export class RepoPathNotConfiguredException extends NotFoundException {
  constructor(repoId?: string) {
    super(
      repoId
        ? `Repository path for '${repoId}' is not configured`
        : "Repository path is not configured",
    );
  }
}

/**
 * 레포지토리 접근 권한이 없을 때 발생
 */
export class RepoAccessDeniedException extends ForbiddenException {
  constructor(repoId?: string) {
    super(
      repoId
        ? `You do not have permission to access repository '${repoId}'`
        : "You do not have permission to access this repository",
    );
  }
}

/**
 * 파일 또는 디렉토리를 찾을 수 없을 때 발생
 */
export class FileNotFoundException extends NotFoundException {
  constructor(path?: string) {
    super(path ? `File or directory '${path}' not found` : "File not found");
  }
}

/**
 * 파일이 이미 존재할 때 발생
 */
export class FileAlreadyExistsException extends ConflictException {
  constructor(filename: string) {
    super(`File '${filename}' already exists`);
  }
}

/**
 * 경로가 파일이 아닌 디렉토리일 때 발생
 */
export class PathIsDirectoryException extends BadRequestException {
  constructor(path?: string) {
    super(
      path
        ? `Path '${path}' is a directory, not a file`
        : "Path is a directory, not a file",
    );
  }
}

/**
 * Git 병합 충돌이 발생했을 때
 */
export class MergeConflictException extends ConflictException {
  constructor(details?: string) {
    super(details ? `Merge conflict: ${details}` : "Merge conflict occurred");
  }
}

/**
 * Fast-forward 병합이 불가능할 때 발생
 */
export class FastForwardNotPossibleException extends ConflictException {
  constructor() {
    super("Fast-forward merge is not possible");
  }
}

/**
 * 원격 저장소가 비어있거나 브랜치가 없을 때 발생
 */
export class RemoteEmptyException extends ConflictException {
  constructor() {
    super(
      "Remote repository is empty or branch does not exist. Please add, commit, and push first.",
    );
  }
}

/**
 * Git 작업 실패 시 발생하는 일반적인 예외
 */
export class GitOperationException extends InternalServerErrorException {
  constructor(operation: string, details?: string) {
    super(
      details
        ? `Git operation '${operation}' failed: ${details}`
        : `Git operation '${operation}' failed`,
    );
  }
}

/**
 * 브랜치를 찾을 수 없을 때 발생
 */
export class BranchNotFoundException extends NotFoundException {
  constructor(branchName: string) {
    super(`Branch '${branchName}' not found`);
  }
}

/**
 * 브랜치가 이미 존재할 때 발생
 */
export class BranchAlreadyExistsException extends ConflictException {
  constructor(branchName: string) {
    super(`Branch '${branchName}' already exists`);
  }
}

/**
 * Pull Request를 찾을 수 없을 때 발생
 */
export class PullRequestNotFoundException extends NotFoundException {
  constructor(prId?: string) {
    super(
      prId
        ? `Pull Request with ID '${prId}' not found`
        : "Pull Request not found",
    );
  }
}

/**
 * Pull Request 상태가 올바르지 않을 때 발생
 */
export class InvalidPullRequestStateException extends BadRequestException {
  constructor(currentState: string, expectedState?: string) {
    super(
      expectedState
        ? `Pull Request state is '${currentState}', expected '${expectedState}'`
        : `Invalid Pull Request state: '${currentState}'`,
    );
  }
}

/**
 * Pull Request 승인이 필요할 때 발생
 */
export class ApprovalRequiredException extends ForbiddenException {
  constructor() {
    super("This Pull Request requires approval before merging");
  }
}