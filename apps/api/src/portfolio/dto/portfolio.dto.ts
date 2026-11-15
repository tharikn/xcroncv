import { Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsObject, IsOptional, IsString, IsUUID, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';

const VIS = ['public', 'masked', 'hidden'];
export const THEMES = ['light', 'dark', 'warm'];

export class HeaderSelectionDto {
  @IsOptional() @IsIn(VIS) fullName?: string;
  @IsOptional() @IsIn(VIS) headline?: string;
  @IsOptional() @IsIn(VIS) summary?: string;
  @IsOptional() @IsIn(VIS) location?: string;
  @IsOptional() @IsIn(VIS) email?: string;
  @IsOptional() @IsIn(VIS) phone?: string;
  @IsOptional() @IsIn(VIS) links?: string;
}

export class SectionPickDto {
  @IsArray() @ArrayMaxSize(50) @IsUUID('all', { each: true }) ids: string[];
  @IsOptional() @IsBoolean() includeBullets?: boolean;
}

export class SelectionDto {
  @IsObject() @ValidateNested() @Type(() => HeaderSelectionDto) header: HeaderSelectionDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) experience?: SectionPickDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) projects?: SectionPickDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) skills?: SectionPickDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) education?: SectionPickDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) certifications?: SectionPickDto;
  @IsOptional() @ValidateNested() @Type(() => SectionPickDto) languages?: SectionPickDto;
}

export class CreatePortfolioDto {
  @IsString() @MinLength(1) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(80) roleFamily?: string;
  @ValidateNested() @Type(() => SelectionDto) selection: SelectionDto;
  @IsOptional() @IsIn(THEMES) theme?: string;
}

export class CreatePortfolioVersionDto {
  @ValidateNested() @Type(() => SelectionDto) selection: SelectionDto;
  @IsOptional() @IsIn(THEMES) theme?: string;
  @IsOptional() @IsString() @MaxLength(200) changeSummary?: string;
}

export class PreviewDto {
  @IsOptional() @IsInt() @Min(1) versionNumber?: number;
  @IsOptional() @ValidateNested() @Type(() => SelectionDto) selection?: SelectionDto;
}

export class PublishDto {
  @IsInt() @Min(1) versionNumber: number;
  /** Publishing exposes data to anyone holding the link: explicit confirmation is mandatory. */
  @IsBoolean() confirm: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
  @IsOptional() @IsBoolean() noIndex?: boolean;
}

export class SharePolicyDto {
  /** null removes the expiry. */
  @IsOptional() @IsDateString() expiresAt?: string | null;
  @IsOptional() @IsBoolean() noIndex?: boolean;
  /** Set a visitor password (8-128 chars) or null / empty to remove it. Stored only as a salted scrypt hash. */
  @IsOptional() @IsString() @MaxLength(128) password?: string | null;
}
