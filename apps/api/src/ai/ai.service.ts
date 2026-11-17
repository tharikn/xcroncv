import { BadRequestException, ForbiddenException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { AI_PROVIDER, AI_TASKS, AiRequest, TextGenerationProvider } from './ai.types';
import { estimateTokens, looksLikeInjection, MAX_INPUT_CHARS, parseOutput, redact, unsupportedNumbers } from './ai-policy';
import { CreateSuggestionDto, DecideSuggestionDto } from './dto/ai.dto';
import { HELP_CHAT_FEATURE } from './help/help-chat.types';

const DAY = 86_400_000;
const dailyLimit = () => Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 20);
const timeoutMs = () => Math.max(100, Number(process.env.AI_TIMEOUT_MS) || 8000);

/** Policy gateway: consent -> availability -> validation -> redaction -> quota -> timeout -> output validation -> suggestion. */
@Injectable()
export class AiService {
  constructor(private prisma: PrismaService, @Inject(AI_PROVIDER) private provider: TextGenerationProvider) {}

  private who(u: AuthUser) { return { tenantId: u.tenantId, userId: u.userId }; }

  private used(u: AuthUser, now: Date) {
    // In-app assistant messages are metered separately (own token budget) so they never eat suggestion quota.
    return this.prisma.aiUsageEvent.count({ where: { ...this.who(u), feature: { not: HELP_CHAT_FEATURE }, createdAt: { gte: new Date(now.getTime() - DAY) }, status: { not: 'UNAVAILABLE' } } });
  }

  async status(u: AuthUser, now = new Date()) {
    const s = await this.prisma.aiSetting.findFirst({ where: this.who(u) });
    const info = this.provider.info;
    return {
      enabled: !!s?.enabled, consentAt: s?.consentAt ?? null,
      provider: { id: info.id, model: info.model, available: info.available, external: info.id !== 'deterministic' && info.id !== 'none' },
      quota: { limit: dailyLimit(), used: await this.used(u, now), windowHours: 24 },
      tasks: [...AI_TASKS],
      guarantees: [
        'Suggestions only: nothing is saved to your profile until you confirm and apply it yourself.',
        'AI never produces or changes a score.',
        'Contact details are removed before text reaches a provider.',
      ],
    };
  }

  async setEnabled(u: AuthUser, enabled: boolean) {
    const now = new Date();
    await this.prisma.aiSetting.upsert({
      where: { tenantId_userId: this.who(u) },
      create: { ...this.who(u), enabled, consentAt: enabled ? now : null },
      update: { enabled, consentAt: enabled ? now : null },
    });
    return this.status(u);
  }

  private async record(u: AuthUser, feature: string, status: string, tokens: [number, number], latencyMs: number) {
    const info = this.provider.info;
    await this.prisma.aiUsageEvent.create({
      data: {
        ...this.who(u), feature, provider: info.id, model: info.model, promptVersion: info.promptVersion, inputTokens: tokens[0], outputTokens: tokens[1],
        costMicros: Math.round(((tokens[0] + tokens[1]) / 1000) * info.costPer1kTokensMicros), latencyMs, status,
      },
    });
  }

  async suggest(u: AuthUser, dto: CreateSuggestionDto, now = new Date()) {
    const setting = await this.prisma.aiSetting.findFirst({ where: this.who(u) });
    if (!setting?.enabled) throw new ForbiddenException('AI assistance is off. Turn it on to request suggestions; the manual tools keep working either way.');
    if (!this.provider.info.available) {
      await this.record(u, dto.task, 'UNAVAILABLE', [0, 0], 0);
      throw new ServiceUnavailableException('No AI provider is available right now. Your text is unchanged; continue manually.');
    }
    const text = (dto.text ?? '').trim();
    if (!text && dto.task !== 'SUMMARY_DRAFT') throw new BadRequestException('Enter some text first');
    if (text.length > MAX_INPUT_CHARS) throw new BadRequestException(`Text is limited to ${MAX_INPUT_CHARS} characters`);
    if ((await this.used(u, now)) >= dailyLimit()) throw new HttpException('Daily AI limit reached. Try again later or continue manually.', HttpStatus.TOO_MANY_REQUESTS);

    const red = redact(text);
    const ctx = dto.context ?? {};
    const req: AiRequest = { task: dto.task, text: red.text, context: { title: ctx.title, years: ctx.years, skills: ctx.skills } };
    const injectionFlagged = looksLikeInjection(text);
    const started = Date.now();
    const inTokens = estimateTokens(red.text + JSON.stringify(req.context));

    let raw: unknown;
    let timer: NodeJS.Timeout | undefined;
    try {
      raw = await Promise.race([
        this.provider.generateStructured(req),
        new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs()); }),
      ]);
    } catch (e) {
      const timeout = (e as Error).message === 'TIMEOUT';
      await this.record(u, dto.task, timeout ? 'TIMEOUT' : 'ERROR', [inTokens, 0], Date.now() - started);
      throw new ServiceUnavailableException(timeout
        ? 'The AI provider took too long. Your text is unchanged; continue manually.'
        : 'The AI provider failed. Your text is unchanged; continue manually.');
    } finally { if (timer) clearTimeout(timer); }

    const out = parseOutput(raw);
    const outTokens = estimateTokens(JSON.stringify(raw ?? ''));
    if (!out) {
      await this.record(u, dto.task, 'INVALID_OUTPUT', [inTokens, outTokens], Date.now() - started);
      throw new HttpException('The assistant returned something unusable, so it was discarded. Please try again or edit manually.', HttpStatus.BAD_GATEWAY);
    }
    const source = `${red.text} ${ctx.years ?? ''} ${(ctx.skills ?? []).join(' ')} ${ctx.title ?? ''}`;
    if (unsupportedNumbers(out, source).length) {
      await this.record(u, dto.task, 'INVALID_OUTPUT', [inTokens, outTokens], Date.now() - started);
      throw new HttpException('The suggestion contained numbers that were not in your input, so it was discarded.', HttpStatus.BAD_GATEWAY);
    }
    await this.record(u, dto.task, 'OK', [inTokens, outTokens], Date.now() - started);
    const row = await this.prisma.aiSuggestion.create({
      data: {
        ...this.who(u), feature: dto.task, provider: this.provider.info.id, promptVersion: this.provider.info.promptVersion,
        inputPreview: red.text.slice(0, 160), output: out as never,
        provenance: { redacted: red.redacted, injectionFlagged, unsupportedNumbers: [], sourceFields: ['text', ...(ctx.skills?.length ? ['skills'] : []), ...(ctx.title ? ['title'] : [])] } as never,
      },
    });
    return this.view(row);
  }

  private view(r: { id: string; feature: string; provider: string; status: string; inputPreview: string; output: unknown; provenance: unknown; createdAt: Date; decidedAt: Date | null }) {
    return {
      id: r.id, feature: r.feature, provider: r.provider, status: r.status, inputPreview: r.inputPreview, output: r.output,
      provenance: r.provenance, createdAt: r.createdAt, decidedAt: r.decidedAt, requiresApproval: r.status === 'PENDING',
    };
  }

  async list(u: AuthUser) {
    const rows = await this.prisma.aiSuggestion.findMany({ where: this.who(u), orderBy: { createdAt: 'desc' }, take: 30 });
    return rows.map((r) => this.view(r));
  }

  async decide(u: AuthUser, id: string, dto: DecideSuggestionDto, now = new Date()) {
    const s = await this.prisma.aiSuggestion.findFirst({ where: { id, ...this.who(u) } });
    if (!s) throw new NotFoundException('Suggestion not found');
    if (s.status !== 'PENDING') throw new BadRequestException('This suggestion was already decided');
    if (dto.decision === 'ACCEPT' && dto.confirm !== true) throw new BadRequestException('Confirm that you reviewed the text before accepting it');
    const row = await this.prisma.aiSuggestion.update({ where: { id }, data: { status: dto.decision === 'ACCEPT' ? 'ACCEPTED' : 'REJECTED', decidedAt: now } });
    // Accepting only records the decision. The user applies the text through the normal, validated profile endpoints.
    return { ...this.view(row), applied: false };
  }

  async usage(u: AuthUser, now = new Date()) {
    const since = new Date(now.getTime() - 30 * DAY);
    const rows = await this.prisma.aiUsageEvent.findMany({ where: { ...this.who(u), feature: { not: HELP_CHAT_FEATURE }, createdAt: { gte: since } }, take: 2000 });
    const byFeature: Record<string, { calls: number; ok: number; inputTokens: number; outputTokens: number; costMicros: number }> = {};
    for (const r of rows) {
      const b = (byFeature[r.feature] ??= { calls: 0, ok: 0, inputTokens: 0, outputTokens: 0, costMicros: 0 });
      b.calls++; if (r.status === 'OK') b.ok++; b.inputTokens += r.inputTokens; b.outputTokens += r.outputTokens; b.costMicros += r.costMicros;
    }
    const decided = await this.prisma.aiSuggestion.findMany({ where: { ...this.who(u), createdAt: { gte: since } }, select: { status: true }, take: 2000 });
    const accepted = decided.filter((d) => d.status === 'ACCEPTED').length;
    const rejected = decided.filter((d) => d.status === 'REJECTED').length;
    return {
      windowDays: 30, totalCalls: rows.length, failures: rows.filter((r) => r.status !== 'OK').length, byFeature,
      suggestions: { accepted, rejected, pending: decided.length - accepted - rejected },
      note: 'Usage metadata only. Prompts, resume text and outputs are not kept in usage records.',
    };
  }

  async purge(u: AuthUser) {
    const r = await this.prisma.aiSuggestion.deleteMany({ where: this.who(u) });
    return { deleted: r.count };
  }
}
