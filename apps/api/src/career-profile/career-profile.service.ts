import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser } from '../common/auth/auth.types';
import { UpsertProfileDto } from './dto/profile.dto';
import { STARTER_PROFILE } from './starter-profile';

export const profileInclude = {
  experiences: { orderBy: { displayOrder: 'asc' }, include: { bullets: { orderBy: { displayOrder: 'asc' } } } },
  skills: { orderBy: { displayOrder: 'asc' } },
  educations: { orderBy: { displayOrder: 'asc' } },
  projects: { orderBy: { displayOrder: 'asc' } },
  certifications: { orderBy: { displayOrder: 'asc' } },
  languages: { orderBy: { displayOrder: 'asc' } },
} satisfies Prisma.CareerProfileInclude;

export type FullProfile = Prisma.CareerProfileGetPayload<{ include: typeof profileInclude }>;

const withOrder = <T extends object>(arr: T[] | undefined) => (arr ?? []).map((x, i) => ({ ...x, displayOrder: i }));

@Injectable()
export class CareerProfileService {
  constructor(private prisma: PrismaService) {}

  async get(user: AuthUser): Promise<FullProfile> {
    const p = await this.prisma.careerProfile.findUnique({ where: { userId: user.userId }, include: profileInclude });
    if (!p) throw new NotFoundException('Career profile not found');
    return p;
  }

  /** Full replace of the user's profile in one transaction. userId always comes from the token. */
  async upsert(user: AuthUser, dto: UpsertProfileDto): Promise<FullProfile> {
    return this.prisma.$transaction(async (tx) => {
      const scalar = {
        fullName: dto.fullName, email: dto.email ?? null, phone: dto.phone ?? null,
        location: dto.location ?? null, headline: dto.headline ?? null, summary: dto.summary ?? null,
        links: (dto.links ?? []) as unknown as Prisma.InputJsonValue,
      };
      const profile = await tx.careerProfile.upsert({
        where: { userId: user.userId },
        create: { ...scalar, userId: user.userId, tenantId: user.tenantId },
        update: scalar,
      });
      const profileId = profile.id;

      await tx.experience.deleteMany({ where: { profileId } }); // bullets cascade
      await tx.skill.deleteMany({ where: { profileId } });
      await tx.education.deleteMany({ where: { profileId } });
      await tx.project.deleteMany({ where: { profileId } });
      await tx.certification.deleteMany({ where: { profileId } });
      await tx.language.deleteMany({ where: { profileId } });

      for (const [i, e] of (dto.experiences ?? []).entries()) {
        const { bullets, ...rest } = e;
        await tx.experience.create({
          data: {
            ...rest, profileId, displayOrder: i, endDate: e.isCurrent ? null : e.endDate ?? null,
            bullets: { create: withOrder(bullets).map((b) => ({ ...b, kind: b.kind ?? 'RESPONSIBILITY' })) },
          },
        });
      }
      await tx.skill.createMany({ data: withOrder(dto.skills).map((x) => ({ ...x, profileId })) });
      await tx.education.createMany({ data: withOrder(dto.educations).map((x) => ({ ...x, profileId })) });
      await tx.project.createMany({
        data: withOrder(dto.projects).map((x) => ({ ...x, technologies: x.technologies ?? [], profileId })),
      });
      await tx.certification.createMany({ data: withOrder(dto.certifications).map((x) => ({ ...x, profileId })) });
      await tx.language.createMany({ data: withOrder(dto.languages).map((x) => ({ ...x, profileId })) });

      return tx.careerProfile.findUniqueOrThrow({ where: { id: profileId }, include: profileInclude });
    });
  }

  /** Restore the starter profile. Reuses the transactional full replace so tenant/owner stay token-derived. */
  async reset(user: AuthUser): Promise<FullProfile> {
    return this.upsert(user, STARTER_PROFILE);
  }

  async remove(user: AuthUser): Promise<void> {
    await this.prisma.careerProfile.deleteMany({ where: { userId: user.userId } });
  }
}
