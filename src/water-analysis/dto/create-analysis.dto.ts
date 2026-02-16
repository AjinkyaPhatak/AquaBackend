import { IsOptional, IsString } from 'class-validator';

export class CreateAnalysisDto {
  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
