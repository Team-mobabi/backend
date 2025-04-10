import { IsOptional, IsArray, IsString } from 'class-validator';

export class AddFilesDto {
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    files?: string[];
}
