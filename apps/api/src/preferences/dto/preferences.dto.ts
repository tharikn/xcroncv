import { IsIn, IsOptional } from 'class-validator';

export const THEMES = ['system', 'light', 'dark'] as const;
export const LOCALES = ['en', 'ta', 'hi'] as const;

export class UpdatePreferencesDto {
  @IsOptional() @IsIn(THEMES as unknown as string[]) theme?: (typeof THEMES)[number];
  @IsOptional() @IsIn(LOCALES as unknown as string[]) locale?: (typeof LOCALES)[number];
}
