import { IsString, IsOptional, MaxLength, MinLength } from 'class-validator';

export class GenerateFromJdDto {
  @IsString() @MinLength(50) @MaxLength(30000) jdText!: string;
  @IsString() @IsOptional() @MaxLength(160) jobTitle?: string;
  @IsString() @IsOptional() @MaxLength(120) company?: string;
  @IsString() @IsOptional() @MaxLength(80) templateId?: string; // if null, auto-select
}

export class SelectTemplateDto {
  @IsString() templateId!: string;
}
