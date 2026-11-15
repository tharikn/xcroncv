import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { ResumeSourceService } from '../resume-source/resume-source.service';
import { AnswerFeedbackDto, CreatePrepDto, UpdateQuestionDto } from './dto/interview.dto';
import { buildQuestions, evaluateAnswer, GENERATOR, Question, resumeCorpus } from './interview-logic';

type Session = Awaited<ReturnType<PrismaService['interviewPrepSession']['findFirstOrThrow']>>;

export function sessionView(s: Session) {
  const questions = s.questions as unknown as Question[];
  return {
    id: s.id, title: s.title, resumeId: s.resumeId, resumeVersionId: s.resumeVersionId, roleTitle: s.roleTitle, company: s.company,
    generator: s.generator, questions, progress: { total: questions.length, practiced: questions.filter((q) => q.practiced).length },
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

/** Private, owner-only practice sessions. Text only; deleting a session deletes the answers. */
@Injectable()
export class InterviewService {
  constructor(private prisma: PrismaService, private source: ResumeSourceService) {}

  private async owned(user: AuthUser, id: string) {
    const s = await this.prisma.interviewPrepSession.findFirst({ where: { id, tenantId: user.tenantId, userId: user.userId } });
    if (!s) throw new NotFoundException('Practice session not found');
    return s;
  }

  async create(user: AuthUser, dto: CreatePrepDto) {
    const src = await this.source.load(user, dto.resumeId, dto.resumeVersionId); // owner-checked; 404 otherwise
    const questions = buildQuestions(src.model, { roleTitle: dto.roleTitle, company: dto.company, focusSkills: dto.focusSkills });
    const s = await this.prisma.interviewPrepSession.create({
      data: {
        tenantId: user.tenantId, userId: user.userId, title: dto.title || `${src.name} practice`, resumeId: src.resumeId, resumeVersionId: src.versionId,
        roleTitle: dto.roleTitle ?? null, company: dto.company ?? null, questions: questions as any, generator: GENERATOR,
      },
    });
    return sessionView(s);
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.interviewPrepSession.findMany({ where: { tenantId: user.tenantId, userId: user.userId }, orderBy: { updatedAt: 'desc' }, take: 50 });
    return rows.map((r) => { const v = sessionView(r); return { id: v.id, title: v.title, roleTitle: v.roleTitle, company: v.company, progress: v.progress, updatedAt: v.updatedAt }; });
  }

  async get(user: AuthUser, id: string) { return sessionView(await this.owned(user, id)); }

  private async mutate(s: Session, qid: string, fn: (q: Question) => Question) {
    const list = s.questions as unknown as Question[];
    if (!list.some((q) => q.id === qid)) throw new NotFoundException('Question not found');
    const questions = list.map((q) => (q.id === qid ? fn(q) : q));
    return sessionView(await this.prisma.interviewPrepSession.update({ where: { id: s.id }, data: { questions: questions as any } }));
  }

  async updateQuestion(user: AuthUser, id: string, qid: string, dto: UpdateQuestionDto) {
    const s = await this.owned(user, id);
    return this.mutate(s, qid, (q) => ({
      ...q, ...(dto.answer !== undefined ? { answer: dto.answer, feedback: dto.answer === q.answer ? q.feedback : null } : {}),
      ...(dto.practiced !== undefined ? { practiced: dto.practiced } : {}),
    }));
  }

  /** Rubric feedback on a typed answer. Works with no AI provider; uses the same resume version the session was built from. */
  async feedback(user: AuthUser, id: string, qid: string, dto: AnswerFeedbackDto) {
    const s = await this.owned(user, id);
    const src = await this.source.load(user, s.resumeId, s.resumeVersionId ?? undefined).catch(() => null);
    const corpus = src ? resumeCorpus(src.model) : '';
    return this.mutate(s, qid, (q) => ({ ...q, answer: dto.answer, feedback: evaluateAnswer(q, dto.answer, corpus), practiced: true }));
  }

  async remove(user: AuthUser, id: string) {
    const s = await this.owned(user, id);
    await this.prisma.interviewPrepSession.delete({ where: { id: s.id } });
  }
}
