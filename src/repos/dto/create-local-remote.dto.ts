import { IsString, IsOptional, Length } from 'class-validator';

export class CreateLocalRemoteDto {
    @IsString()
    @IsOptional()
    @Length(1, 50)
    name?: string;
}