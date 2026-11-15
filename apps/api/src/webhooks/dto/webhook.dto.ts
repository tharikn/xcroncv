import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { EVENT_TYPES } from '../webhook-logic';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const EV = EVENT_TYPES as unknown as string[];

export class CreateWebhookDto {
  @Transform(trim) @IsString() @MaxLength(500) url: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) description?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EV.length) @ArrayUnique() @IsIn(EV, { each: true }) events: string[];
}

export class UpdateWebhookDto {
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) url?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) description?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(EV.length) @ArrayUnique() @IsIn(EV, { each: true }) events?: string[];
  @IsOptional() @IsBoolean() active?: boolean;
}
