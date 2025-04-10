import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { Repo } from '@src/repos/entities/repo.entity';
import { CreateRepoDto } from '@src/repos/dto/create-repo.dto';

import * as path from 'node:path';
import { promises as fs } from 'node:fs';

import simpleGit from 'simple-git';
import { Repository } from 'typeorm';

@Injectable()
export class ReposService {
  constructor(
      @InjectRepository(Repo)
      private readonly repoRepository: Repository<Repo>,
  ) {}

  async createRepo(createRepoDto: CreateRepoDto, currentUserId: string): Promise<Repo> {
    const newRepo = this.repoRepository.create({
      ...createRepoDto,
      ownerId: currentUserId,
    });

    const savedRepo = await this.repoRepository.save(newRepo);

    const basePath = process.env.REPO_BASE_PATH || '/Users/gimnayeon/data/git';
    savedRepo.gitPath = path.join(basePath, savedRepo.repoId);

    await this.repoRepository.save(savedRepo);
    await this.ensureDirectoryExists(savedRepo.gitPath);

    const git = simpleGit(savedRepo.gitPath);
    await git.init();

    return savedRepo;
  }

  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.access(dirPath);
    } catch (err) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  async addFilesToRepo(repoId: string, files?: string[]) {
    const repo = await this.repoRepository.findOne({ where: { repoId } });
    if (!repo) {
      throw new NotFoundException('Repo not found');
    }

    const git = simpleGit(repo.gitPath);
    const addTarget = files?.length ? files : '.';

    await git.add(addTarget);

    const status = await git.status();
    const stagedFiles = status.staged || [];

    return { success: true, stagedFiles };
  }
}
