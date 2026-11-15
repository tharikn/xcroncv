import { Transform, Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { DOC_TYPES, TONES } from '../doc-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class DocInputsDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) recipientName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) managerName?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) relationship?: string;
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/, { message: 'lastDay must be YYYY-MM-DD' }) lastDay?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) targetRole?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) occasion?: string;
  @IsOptional() @IsUUID('all') experienceId?: string;
  @IsOptional() @IsUUID('all') projectId?: string;
}

export class CreateDocumentDto {
  @IsIn(DOC_TYPES as unknown as string[]) type: (typeof DOC_TYPES)[number];
  @IsOptional() @Transform(trim) @IsString() @MinLength(1) @MaxLength(120) title?: string;
  @IsOptional() @IsIn(TONES as unknown as string[]) tone?: (typeof TONES)[number];
  @IsOptional() @ValidateNested() @Type(() => DocInputsDto) inputs?: DocInputsDto;
}

export class SectionEditDto {
  @IsString() @MaxLength(40) id: string;
  @IsString() @MaxLength(6000) text: string;
}

export class CreateVersionDto {
  @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => SectionEditDto) sections: SectionEditDto[];
  @IsOptional() @Transform(trim) @IsString() @MaxLength(200) changeSummary?: string;
}
