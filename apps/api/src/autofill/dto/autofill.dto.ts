import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class StartSessionDto {
  @IsString() @MaxLength(60) adapterId: string;
  /** Hostname of the application page, e.g. boards.greenhouse.io. No path or query. */
  @IsOptional() @IsString() @MaxLength(253) targetHost?: string;
  /** Sessions begin only by an explicit user action. */
  @IsBoolean() confirm: boolean;
}

export class AuthorizeFieldsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(40) @ArrayUnique() @IsString({ each: true }) @MaxLength(80, { each: true }) fieldKeys: string[];
  /** Required (true) whenever a sensitive field is selected. Never inferred. */
  @IsOptional() @IsBoolean() sensitiveConsent?: boolean;
  /** The user reviewed the selected fields. */
  @IsBoolean() confirm: boolean;
}
