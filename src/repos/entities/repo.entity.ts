import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from "typeorm";

@Entity()
export class Repo {
  @PrimaryGeneratedColumn("uuid")
  repoId: string;

  @Column()
  ownerId: string;

  @Column({ length: 100 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ default: false })
  isPrivate: boolean;

  @Column({ length: 255, default: "" })
  gitPath: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;
}
