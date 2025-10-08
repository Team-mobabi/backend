import { IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class MergePullRequestDto {
  @ApiPropertyOptional({
    description: 'Fast-forward merge만 허용할지 여부',
    default: false
  })
  @IsOptional()
  @IsBoolean()
  fastForwardOnly?: boolean = false;
}
