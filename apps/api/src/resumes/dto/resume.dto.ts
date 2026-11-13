import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsHexColor, IsInt, IsNumber, IsOptional,
  IsString, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const SECTION_TYPES = ['summary', 'experience', 'skills', 'education', 'projects', 'certifications', 'languages'];

export class SectionConfigDto {
  @IsEnum(SECTION_TYPES) type: string;
  @IsBoolean() visible: boolean;
}

export class OverridesDto {
  @IsOptional() @IsHexColor() accent?: string;
  @IsOptional() @IsNumber() @Min(9) @Max(12) baseSizePt?: number;
  @IsOptional() @IsEnum(['A4', 'LETTER']) pageSize?: 'A4' | 'LETTER';
}

export class CreateResumeDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(100) targetRole?: string;
  @IsString() @MaxLength(60) templateId: string;
  @IsOptional() @IsInt() @Min(1) templateVersion?: number; // defaults to latest
}

export class UpdateResumeDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(100) targetRole?: string;
  @IsOptional() @IsString() @MaxLength(60) templateId?: string;
  @IsOptional() @IsInt() @Min(1) templateVersion?: number;
  @IsOptional() @IsEnum(['DRAFT', 'ACTIVE', 'ARCHIVED']) status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  @IsOptional() @IsArray() @ArrayMaxSize(7) @ValidateNested({ each: true }) @Type(() => SectionConfigDto)
  sections?: SectionConfigDto[];
  @IsOptional() @ValidateNested() @Type(() => OverridesDto) overrides?: OverridesDto;
}

export class CreateVersionDto {
  @IsOptional() @IsString() @MaxLength(200) changeSummary?: string;
}
