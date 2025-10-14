import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty } from "class-validator";

export class SendVerificationDto {
  @ApiProperty({
    description: "인증번호를 받을 이메일 주소",
    example: "user@example.com",
  })
  @IsEmail()
  @IsNotEmpty()
  email: string;
}