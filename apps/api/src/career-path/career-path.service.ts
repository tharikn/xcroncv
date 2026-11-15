import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { PrismaService } from '../prisma/prisma.service';
import { analyzeProfile, suggestMilestones, toOption, currentRoleId } from './analysis';
import { COMPENSATION_PROVIDERS, CompensationProvider, normalizeObservations } from './compensation';
import { AddMilestoneDto, AnalyzeDto, CompensationQueryDto, CreatePlanDto, UpdateMilestoneDto, UpdatePlanDto } from './dto/career-path.dto';
import { roleById, ROLES, TAXONOMY_VERSION } from './role-taxonomy';

const MAX_PLANS = 20;
const MAX_MILESTONES = 30;

@Injectable()
export class CareerPathService {
  constructor(
    private prisma: PrismaService, private profiles: CareerProfileService,
    @Optional() @Inject(COMPENSATION_PROVIDERS) private providers: CompensationProvider[] = [],
  ) {}

  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  roles() { return { taxonomyVersion: TAXONOMY_VERSION, roles: ROLES.map((r) => ({ id: r.id, title: r.title, family: r.family, summary: r.summary })) }; }

  /** Computed on demand from the confirmed profile; nothing is saved by analysing. */
  async analyze(u: AuthUser, dto: AnalyzeDto) {
    const profile = await this.profiles.get(u); // 404 when there is no profile: no invented data
    return analyzeProfile(profile as never, { targetRoleId: dto.targetRoleId });
  }

  private async owned(u: AuthUser, id: string) {
    const p = await this.prisma.careerPlan.findFirst({ where: { id, ...this.who(u) }, include: { milestones: { orderBy: { position: 'asc' } } } });
    if (!p) throw new NotFoundException('Plan not found');
    return p;
  }

  async create(u: AuthUser, dto: CreatePlanDto) {
    const role = roleById(dto.roleId);
    if (!role) throw new BadRequestException('Unknown role');
    if ((await this.prisma.careerPlan.count({ where: this.who(u) })) >= MAX_PLANS) throw new BadRequestException(`You can keep up to ${MAX_PLANS} plans`);
    const profile = await this.profiles.get(u);
    const option = toOption(profile as never, role, { currentId: currentRoleId(profile as never), targetId: role.id });
    const plan = await this.prisma.careerPlan.create({
      data: {
        ...this.who(u), title: dto.title ?? `Towards ${role.title}`, targetRoleId: role.id, taxonomyVersion: TAXONOMY_VERSION,
        basis: { why: option.why, coverage: option.coverage, transferable: option.transferable, noRecordedEvidence: option.noRecordedEvidence } as never,
        milestones: { create: suggestMilestones(option).map((m, i) => ({ title: m.title, position: i })) },
      },
      include: { milestones: { orderBy: { position: 'asc' } } },
    });
    return this.view(plan);
  }

  private view(p: Awaited<ReturnType<CareerPathService['owned']>>) {
    const ms = p.milestones; const done = ms.filter((m) => m.status === 'DONE').length;
    return {
      id: p.id, title: p.title, targetRoleId: p.targetRoleId, targetRoleTitle: roleById(p.targetRoleId)?.title ?? p.targetRoleId, taxonomyVersion: p.taxonomyVersion,
      basis: p.basis, status: p.status, notes: p.notes, createdAt: p.createdAt, updatedAt: p.updatedAt,
      progress: { done, total: ms.length }, milestones: ms.map((m) => ({ id: m.id, title: m.title, targetDate: m.targetDate, status: m.status, notes: m.notes, position: m.position })),
    };
  }

  async list(u: AuthUser, page = 1) {
    const rows = await this.prisma.careerPlan.findMany({
      where: this.who(u), orderBy: { updatedAt: 'desc' }, skip: (page - 1) * 25, take: 25, include: { milestones: { orderBy: { position: 'asc' } } },
    });
    return rows.map((r) => this.view(r));
  }

  async get(u: AuthUser, id: string) { return this.view(await this.owned(u, id)); }

  async update(u: AuthUser, id: string, dto: UpdatePlanDto) {
    await this.owned(u, id);
    const data: Record<string, unknown> = {};
    for (const k of ['title', 'status', 'notes'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    await this.prisma.careerPlan.update({ where: { id }, data });
    return this.view(await this.owned(u, id));
  }

  async remove(u: AuthUser, id: string) {
    await this.owned(u, id);
    await this.prisma.careerPlan.delete({ where: { id } }); // milestones cascade
  }

  async addMilestone(u: AuthUser, id: string, dto: AddMilestoneDto) {
    const p = await this.owned(u, id);
    if (p.milestones.length >= MAX_MILESTONES) throw new BadRequestException(`A plan can have up to ${MAX_MILESTONES} milestones`);
    await this.prisma.careerMilestone.create({ data: { planId: id, title: dto.title, targetDate: dto.targetDate ?? null, position: p.milestones.length } });
    return this.view(await this.owned(u, id));
  }

  async updateMilestone(u: AuthUser, id: string, milestoneId: string, dto: UpdateMilestoneDto) {
    const p = await this.owned(u, id);
    if (!p.milestones.some((m) => m.id === milestoneId)) throw new NotFoundException('Milestone not found');
    const data: Record<string, unknown> = {};
    for (const k of ['title', 'targetDate', 'status', 'notes'] as const) if (dto[k] !== undefined) data[k] = dto[k];
    await this.prisma.careerMilestone.update({ where: { id: milestoneId }, data });
    return this.view(await this.owned(u, id));
  }

  async removeMilestone(u: AuthUser, id: string, milestoneId: string) {
    const p = await this.owned(u, id);
    if (!p.milestones.some((m) => m.id === milestoneId)) throw new NotFoundException('Milestone not found');
    await this.prisma.careerMilestone.delete({ where: { id: milestoneId } });
    return this.view(await this.owned(u, id));
  }

  /** Numbers appear only when a connected, licensed provider returns fully attributed observations. Only role and coarse location leave the platform. */
  async compensation(u: AuthUser, q: CompensationQueryDto) {
    void u;
    const providers = this.providers ?? [];
    if (!providers.length) {
      return {
        available: false, observations: [],
        reason: 'No licensed compensation data source is connected, so no salary figures are shown. This platform does not estimate pay.',
      };
    }
    const raw = (await Promise.all(providers.map((p) => p.fetch({ role: q.role, location: q.location, currency: q.currency }).catch(() => [])))).flat();
    const observations = normalizeObservations(raw);
    return {
      available: observations.length > 0, observations,
      reason: observations.length ? null : 'No attributed observations were found for this role and location.',
      note: observations.length ? 'Observed market data, shown with source, geography, currency and date. It is not guidance about what you should be paid.' : undefined,
    };
  }
}
