import {
    ConflictException,
    HttpException, HttpStatus,
    Injectable,
    InternalServerErrorException,
    NotFoundException
} from '@nestjs/common';
import {InjectRepository} from '@nestjs/typeorm';

import {Repo} from '@src/repos/entities/repo.entity';
import {CreateRepoDto} from '@src/repos/dto/create-repo.dto';

import * as path from 'node:path';
import {promises as fs} from 'node:fs';

import simpleGit, {BranchSummaryBranch, DefaultLogFields, SimpleGit} from 'simple-git';
import {Repository} from 'typeorm';
import {ConfigService} from "@nestjs/config";


@Injectable()
export class ReposService {
    private readonly repoBasePath: string;
    private readonly remoteBasePath: string;

    constructor(
        @InjectRepository(Repo)
        private readonly repoRepository: Repository<Repo>,
        private readonly configService: ConfigService,
    ) {
        this.repoBasePath = this.configService.get<string>('REPO_BASE_PATH', 'data/git');
        this.remoteBasePath = this.configService.get<string>('REMOTE_BASE_PATH', 'data/remote');
    }

    private async _getRepoAndGitInstance(repoId: string): Promise<{ repo: Repo; git: SimpleGit }> {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) {
            throw new NotFoundException('Repository not found');
        }
        if (!repo.gitPath) {
            throw new InternalServerErrorException('Repository path is not configured.');
        }

        await this.ensureDirectoryExists(repo.gitPath);
        const git = simpleGit(repo.gitPath);
        return {repo, git};
    }

    private async ensureDirectoryExists(dirPath: string): Promise<void> {
        try {
            await fs.access(dirPath);
        } catch (err) {
            await fs.mkdir(dirPath, {recursive: true});
        }
    }

    async createRepo(createRepoDto: CreateRepoDto, ownerId: string): Promise<Repo> {
        const newRepo = this.repoRepository.create({...createRepoDto, ownerId});
        const savedRepo = await this.repoRepository.save(newRepo);

        savedRepo.gitPath = path.join(this.repoBasePath, savedRepo.repoId);

        try {
            await this.ensureDirectoryExists(savedRepo.gitPath);
            const git = simpleGit(savedRepo.gitPath);
            await git.init();
            await git.addConfig('commit.gpgsign', 'false');

            return this.repoRepository.save(savedRepo);
        } catch (error) {
            await this.repoRepository.delete(savedRepo.repoId);
            throw new InternalServerErrorException(`Failed to initialize repository: ${error.message}`);
        }
    }

    async pullRepo(
        repoId: string,
        remote = 'origin',
        branch = 'main',
        ffOnly = false,
    ) {
        const {git} = await this._getRepoAndGitInstance(repoId);

        await git.fetch(remote, branch);

        const localHash = (await git.revparse(['HEAD'])).trim();
        const remoteHash = (await git.revparse([`${remote}/${branch}`])).trim();

        if (localHash === remoteHash) {
            throw new HttpException('', HttpStatus.NO_CONTENT);
        }

        const isAncestor = await git.raw([
            'merge-base', '--is-ancestor', localHash, remoteHash,
        ]).then(() => true).catch(() => false);

        if (ffOnly && !isAncestor) {
            throw new ConflictException('Fast-forward not possible');
        }

        try {
            await git.pull(remote, branch, ffOnly ? {'--ff-only': null} : {});
        } catch (err) {
            if (/merge conflict/i.test(err.message)) {
                throw new ConflictException('Merge conflict');
            }
            throw new InternalServerErrorException(err.message);
        }

        return {
            success: true,
            fastForward: isAncestor,
            from: localHash,
            to: remoteHash,
        };
    }

    async addRemote(repoId: string, url: string, name = 'origin') {
        const {git} = await this._getRepoAndGitInstance(repoId);
        const remotes = await git.getRemotes(true);
        if (remotes.find((r) => r.name === name)) {
            await git.remote(['set-url', name, url]);
        } else {
            await git.addRemote(name, url);
        }
    }

    async status(repoId: string) {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repository not found');

        const git = simpleGit(repo.gitPath);
        const st = await git.status();

        return [
            ...st.modified.map(f => ({name: f, status: 'modified'})),
            ...st.not_added.map(f => ({name: f, status: 'untracked'})),
            ...st.created.map(f => ({name: f, status: 'added'})),
            ...st.deleted.map(f => ({name: f, status: 'deleted'})),
            ...st.renamed.map(r => ({name: r.to, status: 'renamed'})),
        ];
    }

    async addFilesToRepo(repoId: string, files?: string[]) {
        const {git} = await this._getRepoAndGitInstance(repoId);
        const addTarget = files?.length ? files : '.';
        await git.add(addTarget);

        const status = await git.status();
        return {success: true, stagedFiles: status.staged || []};
    }

    async commitToRepo(repoId: string, message: string, branch = 'main') {
        const {git} = await this._getRepoAndGitInstance(repoId);

        const current = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
        if (current !== branch) {
            await git.checkout(['-B', branch]);
        }

        const commitResult = await git.commit(message, undefined, {'--no-gpg-sign': null});
        const [{hash, message: msg, date}] = (await git.log({maxCount: 1})).all;

        return {
            success: true,
            commitHash: hash,
            message: msg,
            committedAt: date,
            stats: commitResult.summary,
        };
    }

    async pushRepo(repoId: string, remote = 'origin', branch = 'main') {
        const repo = await this.repoRepository.findOne({where: {repoId}});
        if (!repo) throw new NotFoundException('Repo not found');

        const git = simpleGit(repo.gitPath);

        let remoteExists = true;
        try {
            await git.raw(['rev-parse', '--verify', `${remote}/${branch}`]);
        } catch {
            remoteExists = false;
        }

        let ahead = 0;
        if (remoteExists) {
            const [, a] = (await git.raw([
                'rev-list', '--left-right', '--count',
                `${remote}/${branch}...HEAD`
            ])).trim().split('\t').map(Number);
            ahead = a;
        }

        if (remoteExists && ahead === 0) {
            return {success: true, upToDate: true, pushed: []};
        }

        const res = await git.push(remote, branch);

        return {
            success: true,
            upToDate: false,
            pushed: res.pushed,
        };

    }

    async getBranches(repoId: string, limit = 20) {
        const {git} = await this._getRepoAndGitInstance(repoId);

        const branchRes = await git.branchLocal();
        const branches = await Promise.all(
            branchRes.all.map(async (branchName) => {
                const logRes = await git.log<DefaultLogFields>([
                    branchName,
                    `--max-count=${limit}`,
                    '--reverse',
                ]);
                const commits = logRes.all.map(c => ({
                    hash: c.hash.slice(0, 7),
                    message: c.message,
                    author: c.author_name,
                    committedAt: c.date,
                }));
                return {
                    name: branchName,
                    pushedCommits: commits
                };
            }),
        );
        return {branches};
    }

    async getGraph(repoId: string, since?: string, max = 200) {
        const {git} = await this._getRepoAndGitInstance(repoId);

        const branchInfo = await git.branch(['-a']);
        const branches: Record<string, string> = {};
        for (const [name, obj] of Object.entries(branchInfo.branches) as
            [string, BranchSummaryBranch][]) {
            if (!name.startsWith('remotes/')) branches[name] = obj.commit;
        }

        const pretty = '%H|%P|%an|%ai|%s';
        const args: string[] = [
            '--all',
            '--reverse',
            `--max-count=${max}`,
            `--pretty=${pretty}`,
        ];
        if (since) args.push(`^${since}`);

        const raw = await git.raw(['log', ...args]);
        const commits = raw.trim().split('\n').filter(Boolean).map(line => {
            const [hash, parents, author, iso, msg] = line.split('|');
            return {
                hash,
                parents: parents ? parents.split(' ') : [],
                author,
                committedAt: iso,
                message: msg,
            };
        });

        return {branches, commits};
    }

    async createLocalRemote(repoId: string, name = 'origin') {
        const {repo, git: localGit} = await this._getRepoAndGitInstance(repoId);

        const remoteRepoPath = path.join(this.remoteBasePath, `${repo.repoId}.git`);

        try {
            await fs.access(remoteRepoPath);
        } catch {
            await fs.mkdir(remoteRepoPath, {recursive: true});
            const bareGit = simpleGit(remoteRepoPath);
            await bareGit.init(true); // --bare
        }

        const remotes = await localGit.getRemotes(true);
        const existing = remotes.find((r) => r.name === name);

        if (existing) {
            await localGit.remote(['set-url', name, remoteRepoPath]);
        } else {
            await localGit.addRemote(name, remoteRepoPath);
        }

        return {name, path: remoteRepoPath};
    }
}
