import {Injectable, InternalServerErrorException, NotFoundException} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';

import {Repo} from '@src/repos/entities/repo.entity';
import {CreateRepoDto} from '@src/repos/dto/create-repo.dto';

import * as path from 'node:path';
import {promises as fs} from 'node:fs';

import simpleGit, {DefaultLogFields} from 'simple-git';
import {Repository} from 'typeorm';

@Injectable()
export class ReposService {
    constructor(
        @InjectRepository(Repo)
        private readonly repoRepository: Repository<Repo>,
    ) {
    }

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
        await git.addConfig('commit.gpgsign', 'false');

        return savedRepo;
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.access(dirPath);
        } catch (err) {
            await fs.mkdir(dirPath, {recursive: true});
        }
    }

    async addRemote(repoId: string, url: string, name = 'origin') {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repository not found');

        const git = simpleGit(repo.gitPath);
        const remotes = await git.getRemotes(true);

        if (remotes.find(r => r.name === name)) {
            await git.remote(['set-url', name, url]);
        } else {
            await git.addRemote(name, url);
        }
    }


    async addFilesToRepo(repoId: string, files?: string[]) {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) {
            throw new NotFoundException('Repo not found');
        }

        const git = simpleGit(repo.gitPath);
        const addTarget = files?.length ? files : '.';

        await git.add(addTarget);

        const status = await git.status();
        const stagedFiles = status.staged || [];

        return {success: true, stagedFiles};
    }

    async commitToRepo(repoId: string, message: string) {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repo not found');

        const git = simpleGit(repo.gitPath);

        const commitResult = await git.commit(message, undefined, {'--no-gpg-sign': null});
        const [{hash, message: msg, date}] = (await git.log({maxCount: 1})).all;

        return {
            success: true,
            commitHash: hash,
            message: msg,
            committedAt: date,
            stats: commitResult.summary
        };
    }

    async pushRepo(repoId: string, remote = 'origin', branch = 'main') {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repo not found');

        const git = simpleGit(repo.gitPath);

        try {
            const res = await git.push(remote, branch);
            return {success: true, detail: res};
        } catch (err) {
            throw new InternalServerErrorException(err.message);
        }
    }

    async getBranches(repoId: string, limit = 20) {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repo not found');

        const git = simpleGit(repo.gitPath);

        const branchRes = await git.branchLocal();
        const branches = await Promise.all(
            branchRes.all.map(async (branchName) => {
                const logRes = await git.log<DefaultLogFields>([
                    branchName,
                    `--max-count=${limit}`,
                ]);
                const commits = logRes.all.map(c => ({
                    hash: c.hash.slice(0, 7),
                    message: c.message,
                    author: c.author_name,
                    date: c.date,
                }));
                return {
                    name: branchName,
                    pushedCommits: commits
                };
            }),
        );
        return {branches};
    }
}
