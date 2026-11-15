import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { roleOptions, targetsFromJobDescription, targetsFromRole } from './readiness-import';
import { AddMilestoneDto, ImportPreviewDto, CreatePlanDto, UpdateMilestoneDto } from './dto/readiness.dto';
import {
  analyse, ANALYSIS_VERSION, dedupeTargets, mergeMilestones, Milestone, ProfileEvidence, SkillAnalysis, summarise, suggestMilestones, TargetSkill,
} from './readiness-logic';

type Plan = Awaited<ReturnType<PrismaService['readinessPlan']['findFirstOrThrow']>>;

export function planView(p: Plan) {
  const analysis = p.analysis as unknown as SkillAnalysis[];
  return {
    id: p.id, targetRole: p.targetRole, targetSkills: p.targetSkills, analysis, summary: summarise(analysis),
    milestones: p.milestones as unknown as Milestone[], analysisVersion: p.analysisVersion, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

/** Builds evidence from confirmed profile facts only (confirmed skills and bullets). */
export function toEvidence(profile: any): ProfileEvidence {
  return {
    experiences: (profile.experiences ?? []).map((e: any) => ({
      id: e.id, label: `${e.jobTitle} at ${e.employerName}`,
      text: [e.jobTitle, e.description ?? '', ...(e.bullets ?? []).filter((b: any) => b.isUserConfirmed !== false).map((b: any) => b.content)].join('\n'),
    })),
    projects: (profile.projects ?? []).map((p: any) => ({ id: p.id, label: p.name, text: [p.name, p.description ?? '', ...(p.technologies ?? [])].join('\n') })),
    certifications: (profile.certifications ?? []).map((c: any) => ({ id: c.id, label: c.name })),
    skills: (profile.skills ?? []).filter((s: any) => s.isUserConfirmed !== false).map((s: any) => ({ id: s.id, name: s.name })),
  };
}

@Injectable()
export class ReadinessService {
  constructor(private prisma: PrismaService) {}

  private async owned(user: AuthUser, id: string) {
    const p = await this.prisma.readinessPlan.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!p) throw new NotFoundException('Plan not found');
    return p;
  }

  private async evidence(user: AuthUser): Promise<ProfileEvidence> {
    const profile = await this.prisma.careerProfile.findFirst({
      where: { userId: user.userId, tenantId: user.tenantId },
      include: { experiences: { include: { bullets: true } }, projects: true, certifications: true, skills: true },
    });
    if (!profile) throw new NotFoundException('Create your career profile first: readiness is compared against recorded evidence.');
    return toEvidence(profile);
  }

  /** Where target skills can be imported from: the owner's saved job descriptions (module 23/29) and career-path roles (module 44). */
  async importSources(user: AuthUser) {
    const jds = await this.prisma.jobDescription.findMany({
      where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' }, take: 50, select: { id: true, title: true, company: true, confirmationStatus: true },
    });
    return { jobDescriptions: jds, roles: roleOptions() };
  }

  /** Read-only: returns editable target skills. The client reviews them and then calls create; nothing is stored here. */
  async importPreview(user: AuthUser, dto: ImportPreviewDto) {
    if (dto.source === 'JOB_DESCRIPTION') {
      const jd = await this.prisma.jobDescription.findFirst({ where: { id: dto.id, tenantId: user.tenantId, userId: user.userId }, select: { id: true, title: true, requirements: true } });
      if (!jd) throw new NotFoundException('Job description not found');
      const t = targetsFromJobDescription(jd);
      if (t.skills.length === 0) throw new BadRequestException('That job description has no included skill requirements. Confirm or add some in the match tool first.');
      return t;
    }
    const t = targetsFromRole(dto.id);
    if (!t) throw new NotFoundException('Role not found');
    return t;
  }

  async create(user: AuthUser, dto: CreatePlanDto) {
    const evidence = await this.evidence(user);
    const targets: TargetSkill[] = dedupeTargets(dto.skills);
    const analysis = analyse(evidence, targets);
    const p = await this.prisma.readinessPlan.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, targetRole: dto.targetRole, targetSkills: targets as any, analysis: analysis as any,
        milestones: suggestMilestones(analysis) as any, analysisVersion: ANALYSIS_VERSION,
      },
    });
    return planView(p);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.readinessPlan.findMany({ where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map((r) => {
      const v = planView(r);
      return { id: v.id, targetRole: v.targetRole, summary: v.summary, openMilestones: v.milestones.filter((m) => m.status === 'OPEN').length, updatedAt: v.updatedAt };
    });
  }

  async get(user: AuthUser, id: string) { return planView(await this.owned(user, id)); }

  /** Re-run the comparison against the current profile; existing milestones (and your edits) are kept. */
  async refresh(user: AuthUser, id: string) {
    const plan = await this.owned(user, id);
    const analysis = analyse(await this.evidence(user), plan.targetSkills as unknown as TargetSkill[]);
    const milestones = mergeMilestones(plan.milestones as unknown as Milestone[], suggestMilestones(analysis));
    return planView(await this.prisma.readinessPlan.update({ where: { id: plan.id }, data: { analysis: analysis as any, milestones: milestones as any, analysisVersion: ANALYSIS_VERSION } }));
  }

  async addMilestone(user: AuthUser, id: string, dto: AddMilestoneDto) {
    const plan = await this.owned(user, id);
    const m: Milestone = { id: `u-${randomUUID().slice(0, 8)}`, title: dto.title, skill: dto.skill, status: 'OPEN', origin: 'USER' };
    const milestones = [...(plan.milestones as unknown as Milestone[]), m];
    return planView(await this.prisma.readinessPlan.update({ where: { id: plan.id }, data: { milestones: milestones as any } }));
  }

  async updateMilestone(user: AuthUser, id: string, mid: string, dto: UpdateMilestoneDto) {
    const plan = await this.owned(user, id);
    const list = plan.milestones as unknown as Milestone[];
    if (!list.some((m) => m.id === mid)) throw new NotFoundException('Milestone not found');
    const milestones = list.map((m) => (m.id === mid ? { ...m, ...(dto.status ? { status: dto.status } : {}), ...(dto.title ? { title: dto.title } : {}), ...(dto.note !== undefined ? { note: dto.note } : {}) } : m));
    return planView(await this.prisma.readinessPlan.update({ where: { id: plan.id }, data: { milestones: milestones as any } }));
  }

  async remove(user: AuthUser, id: string) {
    const plan = await this.owned(user, id);
    await this.prisma.readinessPlan.delete({ where: { id: plan.id } });
  }
}
