import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { Repo } from "@src/repos/entities/repo.entity";
import { RepoCollaborator, CollaboratorRole } from "@src/repos/entities/repo-collaborator.entity";
import { BaseRepoService } from "./base-repo.service";
import { AddCollaboratorDto, UpdateCollaboratorDto } from "@src/repos/dto/collaborator.dto";

@Injectable()
export class CollaboratorService extends BaseRepoService {
  constructor(
    @InjectRepository(Repo)
    repoRepository: Repository<Repo>,
    @InjectRepository(RepoCollaborator)
    collaboratorRepository: Repository<RepoCollaborator>,
    configService: ConfigService,
  ) {
    super(repoRepository, collaboratorRepository, configService);
  }

  async addCollaborator(
    repoId: string,
    userId: string,
    dto: AddCollaboratorDto,
  ) {
    const { repo } = await this.getRepoAndGit(repoId, userId, CollaboratorRole.ADMIN);

    if (repo.ownerId === dto.userId) {
      throw new ConflictException("Cannot add owner as collaborator");
    }

    const existing = await this.collaboratorRepository.findOne({
      where: { repoId, userId: dto.userId },
    });

    if (existing) {
      throw new ConflictException("User is already a collaborator");
    }

    const collaborator = this.collaboratorRepository.create({
      repoId,
      userId: dto.userId,
      role: dto.role,
    });

    return this.collaboratorRepository.save(collaborator);
  }

  async getCollaborators(repoId: string, userId: string) {
    await this.getRepoAndGit(repoId, userId, CollaboratorRole.READ);

    return this.collaboratorRepository.find({
      where: { repoId },
      order: { addedAt: "DESC" },
    });
  }

  async updateCollaborator(
    repoId: string,
    userId: string,
    collaboratorUserId: string,
    dto: UpdateCollaboratorDto,
  ) {
    await this.getRepoAndGit(repoId, userId, CollaboratorRole.ADMIN);

    const collaborator = await this.collaboratorRepository.findOne({
      where: { repoId, userId: collaboratorUserId },
    });

    if (!collaborator) {
      throw new NotFoundException("Collaborator not found");
    }

    collaborator.role = dto.role;
    return this.collaboratorRepository.save(collaborator);
  }

  async removeCollaborator(
    repoId: string,
    userId: string,
    collaboratorUserId: string,
  ) {
    await this.getRepoAndGit(repoId, userId, CollaboratorRole.ADMIN);

    const collaborator = await this.collaboratorRepository.findOne({
      where: { repoId, userId: collaboratorUserId },
    });

    if (!collaborator) {
      throw new NotFoundException("Collaborator not found");
    }

    await this.collaboratorRepository.remove(collaborator);

    return { success: true, message: "Collaborator removed successfully" };
  }
}