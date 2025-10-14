import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { ApiProperty } from "@nestjs/swagger";

@Entity()
export class EmailVerification {
  @ApiProperty({
    description: "인증 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({
    description: "인증할 이메일 주소",
    example: "user@example.com",
  })
  @Column()
  email: string;

  @ApiProperty({
    description: "인증 번호 (6자리)",
    example: "123456",
  })
  @Column()
  code: string;

  @ApiProperty({
    description: "인증 여부",
    example: false,
  })
  @Column({ default: false })
  verified: boolean;

  @ApiProperty({
    description: "인증 생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({
    description: "인증 만료일 (생성 후 5분)",
    example: "2024-01-01T00:05:00.000Z",
  })
  @Column()
  expiresAt: Date;
}