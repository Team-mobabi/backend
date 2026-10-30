import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from "typeorm";
import { ApiProperty, ApiHideProperty } from "@nestjs/swagger";

@Entity()
export class User {
  @ApiProperty({
    description: "사용자 고유 ID",
    example: "123e4567-e89b-12d3-a456-426614174000",
  })
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @ApiProperty({
    description: "사용자 이메일",
    example: "user@example.com",
  })
  @Column({ unique: true })
  email: string;

  @ApiHideProperty()
  @Column()
  passwordHash: string;

  /** refresh 토큰의 SHA-256 hex. 원문은 저장하지 않는다 */
  @ApiHideProperty()
  @Index()
  @Column({ type: "varchar", length: 64, nullable: true })
  refreshTokenHash?: string | null;

  @ApiProperty({
    description: "계정 생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  createdAt: Date;
}
