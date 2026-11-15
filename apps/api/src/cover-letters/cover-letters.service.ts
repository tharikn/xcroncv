import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService, FullProfile } from '../career-profile/career-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { unsupportedCount, validateClaims } from './claim-validator';
import { COVER_LETTER_TEMPLATES, getTemplate } from './cover-letter.templates';
import { LetterLength, LetterSection, LetterTone, ProfileFacts } from './cover-letter.types';
import { BindDto, CreateDraftDto, CreateLetterVersionDto, ValidateClaimsDto } from './dto/cover-letter.dto';
import { buildDraft } from './draft-builder';

export function factsFromProfile(p: FullProfile, now = new Date()): ProfileFacts {
  const starts = p.experiences.map((e) => e.startDate).filter(Boolean).sort();
  const first = starts[0] ? new Date(`${starts[0]}-01`) : null;
  const years = first && !isNaN(first.getTime()) ? Math.max(0, Math.floor((now.getTime() - first.getTime()) / (365.25 * 24 * 3600 * 1000))) : undefined;
  return {
    fullName: p.fullName, headline: p.headline,
    employers: [...new Set(p.experiences.map((e) => e.employerName))],
    titles: p.experiences.map((e) => e.jobTitle),
    skills: [...new Set(p.skills.map((s) => s.name))],
    bullets: p.experiences.flatMap((e) => e.bullets.map((b) => b.content)),
    yearsExperience: years,
  };
}

@Injectable()
export class CoverLettersService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}

  templates() { return COVER_LETTER_TEMPLATES; }

  /** Ownership is part of every query: tenant AND owner. Non-disclosing 404. */
  private async owned(user: AuthUser, id: string) {
    const l = await this.prisma.coverLetter.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!l) throw new NotFoundException('Cover letter not found');
    return l;
  }

  private async facts(user: AuthUser): Promise<ProfileFacts> {
    return factsFromProfile(await this.profiles.get(user)); // 404 if no profile
  }

  async createDraft(user: AuthUser, dto: CreateDraftDto) {
    const kind = dto.kind ?? 'standard';
    const tpl = getTemplate(kind);
    if (!tpl) throw new BadRequestException('Unknown template');
    if (kind === 'referral' && !dto.referrerName?.trim()) {
      throw new BadRequestException('A referral letter needs the referrer name you supply; referrals are never invented.');
    }
    const facts = await this.facts(user);
    if (dto.resumeId) {
      const r = await this.prisma.resume.findFirst({ where: { id: dto.resumeId, tenantId: user.tenantId, profile: { userId: user.userId } } });
      if (!r) throw new NotFoundException('Resume not found');
    }
    const sections = buildDraft(facts, {
      kind, tone: (dto.tone ?? 'professional') as LetterTone, length: (dto.length ?? 'medium') as LetterLength,
      company: dto.company, jobTitle: dto.jobTitle, jdText: dto.jdText, referrerName: dto.referrerName,
    });
    const userAuthored = dto.referrerName ? [dto.referrerName] : [];
    const claims = validateClaims(sections, facts, userAuthored);
    return this.prisma.$transaction(async (tx) => {
      const letter = await tx.coverLetter.create({
        data: {
          tenantId: user.tenantId, userId: user.userId, title: dto.title, company: dto.company, jobTitle: dto.jobTitle,
          kind, tone: dto.tone ?? 'professional', length: dto.length ?? 'medium', templateVersion: tpl.version,
          resumeId: dto.resumeId, currentVersion: 1,
        },
      });
      const version = await tx.coverLetterVersion.create({
        data: {
          coverLetterId: letter.id, versionNumber: 1, sections: sections as unknown as Prisma.InputJsonValue,
          claims: claims as unknown as Prisma.InputJsonValue, changeSummary: 'Initial draft',
        },
      });
      return { ...letter, version, unsupportedClaims: unsupportedCount(claims) };
    });
  }

  list(user: AuthUser, page = 1, pageSize = 20) {
    return this.prisma.coverLetter.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * pageSize, take: Math.min(pageSize, 50),
    });
  }

  async get(user: AuthUser, id: string) {
    const letter = await this.owned(user, id);
    const version = await this.prisma.coverLetterVersion.findUnique({
      where: { coverLetterId_versionNumber: { coverLetterId: id, versionNumber: letter.currentVersion } },
    });
    const versions = await this.prisma.coverLetterVersion.findMany({
      where: { coverLetterId: id }, orderBy: { versionNumber: 'desc' }, select: { id: true, versionNumber: true, changeSummary: true, createdAt: true },
    });
    return { ...letter, version, versions };
  }

  async rename(user: AuthUser, id: string, title?: string) {
    await this.owned(user, id);
    return this.prisma.coverLetter.update({ where: { id }, data: { title } });
  }

  /** Versions are immutable: every save creates a new version; claims are re-validated on the server. */
  async createVersion(user: AuthUser, id: string, dto: CreateLetterVersionDto) {
    const letter = await this.owned(user, id);
    if (!dto.sections.length) throw new BadRequestException('A letter needs at least one section');
    const facts = await this.facts(user);
    const claims = validateClaims(dto.sections as LetterSection[], facts, dto.userAuthored ?? []);
    const versionNumber = letter.currentVersion + 1;
    const version = await this.prisma.$transaction(async (tx) => {
      const v = await tx.coverLetterVersion.create({
        data: {
          coverLetterId: id, versionNumber, sections: dto.sections as unknown as Prisma.InputJsonValue,
          claims: claims as unknown as Prisma.InputJsonValue, changeSummary: dto.changeSummary ?? null,
        },
      });
      await tx.coverLetter.update({ where: { id }, data: { currentVersion: versionNumber } });
      return v;
    });
    return { ...version, unsupportedClaims: unsupportedCount(claims) };
  }

  async validate(user: AuthUser, id: string, dto: ValidateClaimsDto) {
    await this.owned(user, id);
    const claims = validateClaims(dto.sections as LetterSection[], await this.facts(user), dto.userAuthored ?? []);
    return { claims, unsupportedClaims: unsupportedCount(claims) };
  }

  async remove(user: AuthUser, id: string) {
    await this.owned(user, id);
    await this.prisma.coverLetter.delete({ where: { id } }); // versions + bindings cascade
  }

  /** Sections of the current (or requested) version, for streamed export. Never persisted. */
  async exportable(user: AuthUser, id: string, versionNumber?: number) {
    const letter = await this.owned(user, id);
    const v = await this.prisma.coverLetterVersion.findUnique({
      where: { coverLetterId_versionNumber: { coverLetterId: id, versionNumber: versionNumber ?? letter.currentVersion } },
    });
    if (!v) throw new NotFoundException('Version not found');
    return { title: letter.title, sections: v.sections as unknown as LetterSection[] };
  }

  /** Binds an exact cover-letter version to an opaque host application reference. Requires explicit confirmation. */
  async bind(user: AuthUser, applicationRef: string, dto: BindDto) {
    if (dto.confirm !== true) throw new BadRequestException('Explicit confirmation is required to bind a cover letter to an application');
    await this.owned(user, dto.coverLetterId);
    const v = await this.prisma.coverLetterVersion.findUnique({
      where: { coverLetterId_versionNumber: { coverLetterId: dto.coverLetterId, versionNumber: dto.versionNumber } },
    });
    if (!v) throw new NotFoundException('Version not found');
    const existing = await this.prisma.coverLetterApplicationBinding.findFirst({
      where: { userId: user.userId, applicationRef, coverLetterId: dto.coverLetterId },
    });
    if (existing) throw new ConflictException('This cover letter is already bound to the application');
    return this.prisma.coverLetterApplicationBinding.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, coverLetterId: dto.coverLetterId, versionNumber: dto.versionNumber,
        resumeVersionId: dto.resumeVersionId, applicationRef,
      },
    });
  }

  listBindings(user: AuthUser, applicationRef: string) {
    return this.prisma.coverLetterApplicationBinding.findMany({
      where: { tenantId: user.tenantId, userId: user.userId, applicationRef }, orderBy: { createdAt: 'desc' },
    });
  }
}
