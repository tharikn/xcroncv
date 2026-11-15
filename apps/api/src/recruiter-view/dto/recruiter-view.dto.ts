import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

const bool = ({ value }: { value: unknown }) => (value === 'true' || value === true ? true : value === 'false' || value === false ? false : value);

/** Query for GET /resumes/:id/recruiter-view */
export class RecruiterViewQueryDto {
  @IsOptional() @IsEnum(['quick', 'full']) mode?: 'quick' | 'full';
  @IsOptional() @Transform(bool) @IsBoolean() anonymize?: boolean;
  @IsOptional() @Transform(bool) @IsBoolean() annotations?: boolean;
  @IsOptional() @IsUUID() versionId?: string;
}

/** Body for POST /resumes/:id/recruiter-view/preview (optional target-role context). Nothing here is stored. */
export class RecruiterPreviewDto {
  @IsOptional() @IsEnum(['quick', 'full']) mode?: 'quick' | 'full';
  @IsOptional() @IsBoolean() anonymize?: boolean;
  @IsOptional() @IsBoolean() includeAnnotations?: boolean;
  @IsOptional() @IsUUID() resumeVersionId?: string;
  @IsOptional() @IsString() @MaxLength(120) targetRole?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(40, { each: true }) keywords?: string[];
}
