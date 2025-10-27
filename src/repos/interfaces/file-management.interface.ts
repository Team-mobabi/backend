export interface FileItem {
  name: string;
  path: string;
  size: number;
  modifiedAt: Date;
  type: 'file';
}

export interface FolderItem {
  name: string;
  path: string;
  size: number;
  modifiedAt: Date;
  type: 'folder';
}

export interface FileSystemItem extends Omit<FileItem | FolderItem, 'type'> {
  type: 'file' | 'folder';
}

export interface DirectoryContent {
  type: 'directory';
  folders: FolderItem[];
  files: FileItem[];
  currentPath: string;
}

export interface FileContent {
  type: 'file';
  content: string;
  size: number;
  path: string;
  modifiedAt: Date;
}

export interface BinaryFileInfo {
  type: 'binary';
  size: number;
  path: string;
  modifiedAt: Date;
}

export interface UploadedFileInfo {
  originalname: string;
  filename: string;
  path: string;
  size: number;
  mimetype: string;
  modifiedAt: Date;
}

export interface UploadResult {
  success: true;
  uploadedFiles: UploadedFileInfo[];
  uploadPath: string;
  ignoredFiles?: string[];
  ignoredCount?: number;
  message?: string;
}

export interface FileOperationResult {
  success: true;
  filename?: string;
  path: string;
  size: number;
  modifiedAt: Date;
}

export interface FileDeleteResult {
  success: true;
  deletedPath: string;
  type: 'file' | 'folder';
}

export type FileBrowseResult = DirectoryContent | FileContent | BinaryFileInfo;