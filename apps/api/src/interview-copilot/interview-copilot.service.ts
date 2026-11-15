import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from '../career-profile/career-profile.service';
import { sanitizeText } from '../job-clipper/clip-logic';
import { PrismaService } from '../prisma/prisma.service';
import { buildQuestions, Dimension, giveFeedback, Question, requirementTerms } from './copilot-logic';
import { AnswerDto, ConsentDto, CreateSessionDto } from './dto/copilot.dto';

const MAX_SESSIONS = 50;

@Injectable()
export class InterviewCopilotService {
  constructor(private prisma: PrismaService, private profiles: CareerProfileService) {}
  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  private async owned(u: AuthUser, id: string) {
    const s = await this.prisma.copilotSession.findFirst({ where: { id, ...this.who(u) }, include: { answers: { orderBy: { createdAt: 'asc' } } } });
    if (!s) throw new NotFoundException('Practice session not found');
    return s;
  }

  private view(s: Awaited<ReturnType<InterviewCopilotService['owned']>>) {
    return {
      id: s.id, jobTitle: s.jobTitle, resumeId: s.resumeId, versionNumber: s.versionNumber, retainAnswers: s.retainAnswers, status: s.status, createdAt: s.createdAt,
      mode: 'TEXT_PRACTICE', notice: 'Practice only. Never use this to get live help during a real assessment.',
      questions: s.questions as unknown as Question[],
      answers: s.answers.map((a) => ({ id: a.id, questionId: a.questionId, text: a.text, wordCount: a.wordCount, feedback: a.feedback as unknown as Dimension[], createdAt: a.createdAt })),
    };
  }

  async create(u: AuthUser, dto: CreateSessionDto) {
    if (dto.confirmPracticeOnly !== true) throw new BadRequestException('Confirm that this is practice only');
    const resume = await this.prisma.resume.findFirst({ where: { id: dto.resumeId, tenantId: u.tenantId, profile: { userId: u.userId } } });
    if (!resume) throw new NotFoundException('Resume not found');
    const version = await this.prisma.resumeVersion.findFirst({ where: { resumeId: dto.resumeId, versionNumber: dto.versionNumber } });
    if (!version) throw new NotFoundException('Resume version not found. Save a version first.');
    if ((await this.prisma.copilotSession.count({ where: this.who(u) })) >= MAX_SESSIONS) throw new BadRequestException(`You can keep up to ${MAX_SESSIONS} sessions. Delete some first.`);
    const profile = await this.profiles.get(u);
    const jobTitle = sanitizeText(dto.jobTitle, 120);
    const terms = requirementTerms(sanitizeText(dto.jobDescription ?? '', 20000), []);
    const questions = buildQuestions(profile as never, jobTitle, terms);
    const row = await this.prisma.copilotSession.create({
      data: { ...this.who(u), jobTitle, resumeId: dto.resumeId, versionNumber: dto.versionNumber, terms: terms as never, questions: questions as never, retainAnswers: dto.retainAnswers },
      include: { answers: true },
    });
    return this.view(row);
  }

  async list(u: AuthUser) {
    const rows = await this.prisma.copilotSession.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, take: 25, include: { answers: true } });
    return rows.map((s) => ({ id: s.id, jobTitle: s.jobTitle, versionNumber: s.versionNumber, status: s.status, createdAt: s.createdAt, answered: s.answers.length, total: (s.questions as unknown as Question[]).length }));
  }

  async get(u: AuthUser, id: string) { return this.view(await this.owned(u, id)); }

  async answer(u: AuthUser, id: string, dto: AnswerDto) {
    const s = await this.owned(u, id);
    const q = (s.questions as unknown as Question[]).find((x) => x.id === dto.questionId);
    if (!q) throw new NotFoundException('Question not found');
    const text = sanitizeText(dto.text, 4000);
    if (!text) throw new BadRequestException('Write an answer first');
    const profile = await this.profiles.get(u);
    const feedback = giveFeedback(text, q, profile as never);
    const words = text.split(/\s+/).filter(Boolean).length;
    // Text is persisted only with the user's opt-in; feedback never quotes it.
    await this.prisma.copilotAnswer.deleteMany({ where: { sessionId: id, questionId: dto.questionId } });
    await this.prisma.copilotAnswer.create({ data: { sessionId: id, questionId: dto.questionId, text: s.retainAnswers ? text : null, wordCount: words, feedback: feedback as never } });
    return { questionId: q.id, wordCount: words, feedback, retained: s.retainAnswers };
  }

  /** Session summary: per-dimension counts across answers. No overall score and nothing about the person. */
  async summary(u: AuthUser, id: string) {
    const s = await this.owned(u, id);
    const total = (s.questions as unknown as Question[]).length;
    const counts: Record<string, { strong: number; couldImprove: number }> = {};
    for (const a of s.answers) for (const d of a.feedback as unknown as Dimension[]) {
      const c = (counts[d.key] ??= { strong: 0, couldImprove: 0 });
      d.status === 'STRONG' ? c.strong++ : c.couldImprove++;
    }
    await this.prisma.copilotSession.update({ where: { id }, data: { status: s.answers.length >= total ? 'DONE' : 'ACTIVE' } });
    return {
      answered: s.answers.length, total, dimensions: counts,
      note: 'Counts of answers where each aspect looked strong or could improve. This describes your answers only; it is not a rating of you and does not predict hiring outcomes.',
    };
  }

  /** Switching retention off deletes any stored answer text immediately. */
  async consent(u: AuthUser, id: string, dto: ConsentDto) {
    await this.owned(u, id);
    if (!dto.retainAnswers) await this.prisma.copilotAnswer.updateMany({ where: { sessionId: id }, data: { text: null } });
    await this.prisma.copilotSession.update({ where: { id }, data: { retainAnswers: dto.retainAnswers } });
    return this.view(await this.owned(u, id));
  }

  async remove(u: AuthUser, id: string) {
    await this.owned(u, id);
    await this.prisma.copilotSession.delete({ where: { id } }); // answers cascade
  }
}
