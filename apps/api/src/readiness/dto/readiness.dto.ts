import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsIn, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class TargetSkillDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(60) name: string;
  @IsIn(['required', 'preferred']) importance: 'required' | 'preferred';
}

export class CreatePlanDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) targetRole: string;
  @ArrayMinSize(1) @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => TargetSkillDto) skills: TargetSkillDto[];
}

export class UpdateMilestoneDto {
  @IsOptional() @IsIn(['OPEN', 'DONE', 'DISMISSED']) status?: 'OPEN' | 'DONE' | 'DISMISSED';
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export class AddMilestoneDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(60) skill?: string;
}

export class ImportPreviewDto {
  @IsIn(['JOB_DESCRIPTION', 'CAREER_PATH_ROLE']) source: 'JOB_DESCRIPTION' | 'CAREER_PATH_ROLE';
  @IsString() @MinLength(1) @MaxLength(80) id: string;
}
