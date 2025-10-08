import { IsNotEmpty, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SwitchBranchDto {
  @ApiProperty({
    description: "전환할 브랜치 이름",
    example: "main",
  })
  @IsString()
  @IsNotEmpty()
  name: string;
}