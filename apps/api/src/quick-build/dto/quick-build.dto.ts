import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class QuickBuildDto {
  /** Raw job description. Sanitised server-side; never persisted as-is. */
  @IsString() @MinLength(50) @MaxLength(30_000) jdText!: string;

  @IsString() @IsOptional() @MaxLength(160) jobTitle?: string;

  /** Omit to let the engine pick an ATS-first template deterministically for this user. */
  @IsString() @IsOptional() @MaxLength(80) templateId?: string;

  @IsString() @IsOptional() @MaxLength(120) name?: string;

  /** Page budget the repair ladder must respect. 2 is the professional default. */
  @IsInt() @Min(1) @Max(3) @IsOptional() maxPages?: number;

  /** AI text polish is opt-in per build; layout is always deterministic. */
  @IsBoolean() @IsOptional() useAi?: boolean;
}
