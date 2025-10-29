import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsNotEmpty, IsString } from "class-validator";
import { CollaboratorRole } from "@src/repos/entities/repo-collaborator.entity";

export class AddCollaboratorDto {
  @ApiProperty({
    description: "추가할 사용자 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: "부여할 권한",
    enum: CollaboratorRole,
    example: CollaboratorRole.WRITE,
    default: CollaboratorRole.READ,
  })
  @IsEnum(CollaboratorRole)
  role: CollaboratorRole = CollaboratorRole.READ;
}

export class UpdateCollaboratorDto {
  @ApiProperty({
    description: "변경할 권한",
    enum: CollaboratorRole,
    example: CollaboratorRole.ADMIN,
  })
  @IsEnum(CollaboratorRole)
  @IsNotEmpty()
  role: CollaboratorRole;
}