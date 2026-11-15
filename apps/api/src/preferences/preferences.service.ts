import { Injectable } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePreferencesDto } from './dto/preferences.dto';

/** null means "never chosen": the client keeps its own local value instead of being forced to a server default. */
export const DEFAULT_PREFERENCES = { theme: null, locale: null } as const;

@Injectable()
export class PreferencesService {
  constructor(private prisma: PrismaService) {}

  /** tenant AND owner come from the verified token. */
  private key(u: AuthUser) { return { tenantId_userId: { tenantId: u.tenantId, userId: u.userId } }; }

  async get(u: AuthUser) {
    const row = await this.prisma.userPreference.findUnique({ where: this.key(u) });
    return row ? { theme: row.theme, locale: row.locale } : { ...DEFAULT_PREFERENCES };
  }

  async update(u: AuthUser, dto: UpdatePreferencesDto) {
    const data: UpdatePreferencesDto = {};
    if (dto.theme) data.theme = dto.theme;
    if (dto.locale) data.locale = dto.locale;
    const row = await this.prisma.userPreference.upsert({
      where: this.key(u),
      create: { tenantId: u.tenantId, userId: u.userId, ...data },
      update: data,
    });
    return { theme: row.theme, locale: row.locale };
  }
}
