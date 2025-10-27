import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ChangePasswordDto {
  @ApiProperty({
    description: "현재 비밀번호",
    example: "currentPassword123",
  })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    description: "새 비밀번호 (최소 8자)",
    example: "newPassword123",
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  newPassword: string;
}