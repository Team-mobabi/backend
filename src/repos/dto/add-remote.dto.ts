import { IsString, IsNotEmpty, IsOptional, Length, IsUrl } from 'class-validator';

export class AddRemoteDto {
    @IsUrl({}, { message: '유효한 URL 형식이 아닙니다.' })
    @IsNotEmpty({ message: '원격 저장소 URL은 필수입니다.' })
    url: string;

    @IsString()
    @IsOptional()
    @Length(1, 50)
    name?: string;
}