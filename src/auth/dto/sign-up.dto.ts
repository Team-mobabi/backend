import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SignUpDto {
  @ApiProperty({ example: "user@example.com", description: "이메일 주소" })
  @IsEmail({}, { message: "유효한 이메일 형식이 아닙니다." })
  @IsNotEmpty({ message: "이메일은 필수 항목입니다." })
  email: string;

  @ApiProperty({ example: "password123", description: "비밀번호 (최소 8자)" })
  @IsString()
  @MinLength(8, { message: "비밀번호는 최소 8자 이상이어야 합니다." })
  @IsNotEmpty({ message: "비밀번호는 필수 항목입니다." })
  password: string;
}
