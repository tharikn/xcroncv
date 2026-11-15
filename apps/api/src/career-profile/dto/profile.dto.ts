import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsEmail, IsEnum, IsInt, IsOptional, IsString,
  IsUrl, Matches, MaxLength, Min, ValidateNested,
} from 'class-validator';

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const ymMsg = { message: 'must be YYYY-MM' };

export class LinkDto {
  @IsString() @MaxLength(60) label: string;
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) @MaxLength(500) url: string;
}

export class BulletDto {
  @IsOptional() @IsEnum(['RESPONSIBILITY', 'ACHIEVEMENT']) kind?: 'RESPONSIBILITY' | 'ACHIEVEMENT';
  @IsString() @MaxLength(600) content: string;
  @IsOptional() @IsBoolean() isUserConfirmed?: boolean;
}

export class ExperienceDto {
  @IsString() @MaxLength(150) employerName: string;
  @IsString() @MaxLength(150) jobTitle: string;
  @IsOptional() @IsString() @MaxLength(50) employmentType?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @Matches(YM, ymMsg) startDate: string;
  @IsOptional() @Matches(YM, ymMsg) endDate?: string;
  @IsOptional() @IsBoolean() isCurrent?: boolean;
  @IsOptional() @IsString() @MaxLength(1500) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => BulletDto)
  bullets?: BulletDto[];
}

export class SkillDto {
  @IsString() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(60) category?: string;
  @IsOptional() @IsString() @MaxLength(40) proficiency?: string;
  @IsOptional() @IsInt() @Min(0) yearsUsed?: number;
}

export class EducationDto {
  @IsString() @MaxLength(150) institution: string;
  @IsString() @MaxLength(150) degree: string;
  @IsOptional() @IsString() @MaxLength(150) field?: string;
  @IsOptional() @Matches(YM, ymMsg) startDate?: string;
  @IsOptional() @Matches(YM, ymMsg) endDate?: string;
  @IsOptional() @IsString() @MaxLength(40) grade?: string;
}

export class ProjectDto {
  @IsString() @MaxLength(150) name: string;
  @IsOptional() @IsUrl({ protocols: ['http', 'https'], require_protocol: true }) url?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) @MaxLength(60, { each: true })
  technologies?: string[];
}

export class CertificationDto {
  @IsString() @MaxLength(150) name: string;
  @IsOptional() @IsString() @MaxLength(150) issuer?: string;
  @IsOptional() @Matches(YM, ymMsg) issuedDate?: string;
  @IsOptional() @Matches(YM, ymMsg) expiryDate?: string;
}

export class LanguageDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(40) proficiency?: string;
}

export class UpsertProfileDto {
  @IsString() @MaxLength(150) fullName: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) location?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => LinkDto)
  links?: LinkDto[];
  @IsOptional() @IsString() @MaxLength(150) headline?: string;
  @IsOptional() @IsString() @MaxLength(2000) summary?: string;

  @IsOptional() @IsArray() @ArrayMaxSize(40) @ValidateNested({ each: true }) @Type(() => ExperienceDto)
  experiences?: ExperienceDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => SkillDto)
  skills?: SkillDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => EducationDto)
  educations?: EducationDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ProjectDto)
  projects?: ProjectDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => CertificationDto)
  certifications?: CertificationDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => LanguageDto)
  languages?: LanguageDto[];
}
