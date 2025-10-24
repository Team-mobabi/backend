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
 * 파일명이 너무 길 때 발생
 */
export class FilenameTooLongException extends BadRequestException {
  constructor(filename: string, maxBytes: number, actualBytes: number) {
    super({
      statusCode: 400,
      error: 'Filename Too Long',
      message: '파일명이 너무 깁니다. 파일명을 짧게 변경해주세요.',
      filename,
      maxBytes,
      actualBytes,
      hint: '한글은 한 글자당 3바이트를 차지합니다. 영문과 숫자를 사용하거나 파일명을 50자 이내로 줄여주세요.',
    });
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

/**
 * Git Pull 시 로컬 변경사항과 충돌할 때 발생
 */
export class GitPullConflictException extends ConflictException {
  constructor(public readonly conflictDetails: {
    message: string;
    localChanges?: string[];
    conflictFiles?: string[];
  }) {
    super({
      statusCode: 409,
      error: 'Pull Conflict',
      ...conflictDetails,
      resolution: '로컬 변경사항을 커밋하거나 stash한 후 다시 시도해주세요'
    });
  }
}

/**
 * Git Push가 거부될 때 발생
 */
export class GitPushRejectedException extends ConflictException {
  constructor(public readonly details: {
    reason: string;
    hint?: string;
  }) {
    const resolution = details.reason.includes('non-fast-forward')
      ? '원격 저장소의 변경사항을 먼저 pull한 후 push해주세요'
      : '원격 저장소 상태를 확인해주세요';

    super({
      statusCode: 409,
      error: 'Push Rejected',
      message: 'Push가 거부되었습니다',
      reason: details.reason,
      hint: details.hint,
      resolution
    });
  }
}

/**
 * Git Rebase 충돌이 발생할 때
 */
export class GitRebaseConflictException extends ConflictException {
  constructor(public readonly conflictFiles: string[]) {
    super({
      statusCode: 409,
      error: 'Rebase Conflict',
      message: 'Rebase 중 충돌이 발생했습니다',
      conflictFiles,
      resolution: '충돌을 해결하고 git rebase --continue를 실행해주세요'
    });
  }
}

/**
 * 커밋되지 않은 변경사항이 있을 때 발생
 */
export class GitUncommittedChangesException extends BadRequestException {
  constructor(public readonly changes: string[]) {
    super({
      statusCode: 400,
      error: 'Uncommitted Changes',
      message: '커밋되지 않은 변경사항이 있습니다',
      changes,
      resolution: '변경사항을 커밋하거나 stash한 후 다시 시도해주세요'
    });
  }
}

/**
 * Git Stash 충돌이 발생할 때
 */
export class GitStashConflictException extends ConflictException {
  constructor(public readonly conflictFiles: string[]) {
    super({
      statusCode: 409,
      error: 'Stash Conflict',
      message: 'Stash 적용 중 충돌이 발생했습니다',
      conflictFiles,
      resolution: '충돌을 수동으로 해결한 후 다시 시도해주세요'
    });
  }
}