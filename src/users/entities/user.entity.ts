import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from "typeorm";
import { ApiProperty, ApiHideProperty } from "@nestjs/swagger";
import { Exclude } from "class-transformer";

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
  @Exclude()
  @Column()
  passwordHash: string;

  @ApiHideProperty()
  @Exclude()
  @Column({ nullable: true })
  refreshToken?: string;

  @ApiProperty({
    description: "계정 생성일",
    example: "2024-01-01T00:00:00.000Z",
  })
  @CreateDateColumn()
  createdAt: Date;
}
