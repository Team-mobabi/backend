import { ApiProperty } from "@nestjs/swagger";

export class RepoOwnerDto {
  @ApiProperty({
    description: "소유자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  id: string;

  @ApiProperty({
    description: "소유자 이메일",
    example: "user@example.com",
  })
  email: string;
}

export class RepoResponseDto {
  @ApiProperty({
    description: "레포지토리 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  repoId: string;

  @ApiProperty({
    description: "레포지토리 소유자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  ownerId: string;

  @ApiProperty({
    description: "레포지토리 이름",
    example: "my-project",
  })
  name: string;

  @ApiProperty({
    description: "레포지토리 설명",
    example: "This is my awesome project",
    nullable: true,
  })
  description: string | null;

  @ApiProperty({
    description: "비공개 여부",
    example: false,
  })
  isPrivate: boolean;

  @ApiProperty({
    description: "Fork 출처 레포지토리 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
    nullable: true,
  })
  forkedFrom: string | null;

  @ApiProperty({
    description: "레포지토리 생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  createdAt: Date;

  @ApiProperty({
    description: "레포지토리 소유자 정보",
    type: RepoOwnerDto,
    required: false,
  })
  owner?: RepoOwnerDto;
}
