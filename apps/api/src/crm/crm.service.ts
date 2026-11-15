import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthUser } from '../common/auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import { Channel, contactKey, findDuplicate } from './contact.util';
import {
  CreateActivityDto, CreateContactDto, CreateLinkDto, ImportContactsDto, CreateTaskDto, UpdateActivityDto, UpdateContactDto, UpdateTaskDto,
} from './dto/crm.dto';
import { decryptNote, encryptNote } from './notes-crypto';
import { analyzeContactCsv } from './contact-import';

const scope = (u: AuthUser) => ({ tenantId: u.tenantId, userId: u.userId });

@Injectable()
export class CrmService {
  constructor(private prisma: PrismaService) {}

  // ---- contacts -----------------------------------------------------------------------------
  private async ownedContact(u: AuthUser, id: string) {
    const c = await this.prisma.careerContact.findFirst({ where: { id, ...scope(u) } });
    if (!c) throw new NotFoundException('Contact not found'); // non-disclosing
    return c;
  }

  /** Never exposes the encrypted blob; notes are decrypted only for the owner. */
  private view(c: any) {
    const { notesEnc, nameKey, ...rest } = c;
    return { ...rest, notes: notesEnc ? decryptNote(notesEnc) : null };
  }

  async createContact(u: AuthUser, dto: CreateContactDto) {
    const key = contactKey(dto.name, dto.organization);
    const existing = await this.prisma.careerContact.findMany({ where: scope(u) });
    const dup = findDuplicate(existing, key, dto.channels ?? []);
    if (dup) throw new ConflictException({ message: 'A matching contact already exists', existingId: dup.id });
    const c = await this.prisma.careerContact.create({
      data: {
        ...scope(u), name: dto.name.trim(), nameKey: key, organization: dto.organization, role: dto.role,
        relationship: dto.relationship ?? 'OTHER', channels: (dto.channels ?? []) as unknown as Prisma.InputJsonValue,
        tags: dto.tags ?? [], notesEnc: dto.notes ? encryptNote(dto.notes) : null,
      },
    });
    return this.view(c);
  }

  async listContacts(u: AuthUser, opts: { q?: string; tag?: string; page?: number; pageSize?: number } = {}) {
    const { q, tag, page = 1, pageSize = 25 } = opts;
    const rows = await this.prisma.careerContact.findMany({
      where: {
        ...scope(u), ...(tag ? { tags: { has: tag } } : {}),
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { organization: { contains: q, mode: 'insensitive' } }] } : {}),
      },
      orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: Math.min(pageSize, 100),
    });
    return rows.map((c) => ({ ...this.view(c), notes: undefined })); // list omits notes
  }

  async getContact(u: AuthUser, id: string) {
    const c = await this.prisma.careerContact.findFirst({
      where: { id, ...scope(u) }, include: { links: true, activities: { orderBy: { occurredAt: 'desc' } }, tasks: { orderBy: { dueAt: 'asc' } } },
    });
    if (!c) throw new NotFoundException('Contact not found');
    return { ...this.view(c), links: c.links, activities: c.activities, tasks: c.tasks };
  }

  async updateContact(u: AuthUser, id: string, dto: UpdateContactDto) {
    const cur = await this.ownedContact(u, id);
    const name = dto.name ?? cur.name;
    const organization = dto.organization !== undefined ? dto.organization : cur.organization;
    const key = contactKey(name, organization);
    const channels = dto.channels ?? ((cur.channels as unknown as Channel[]) ?? []);
    const others = await this.prisma.careerContact.findMany({ where: scope(u) });
    const dup = findDuplicate(others, key, channels, id);
    if (dup) throw new ConflictException({ message: 'A matching contact already exists', existingId: dup.id });
    const c = await this.prisma.careerContact.update({
      where: { id },
      data: {
        name: name.trim(), nameKey: key, organization, role: dto.role, relationship: dto.relationship, tags: dto.tags,
        channels: dto.channels as unknown as Prisma.InputJsonValue | undefined,
        ...(dto.notes !== undefined ? { notesEnc: dto.notes ? encryptNote(dto.notes) : null } : {}),
      },
    });
    return this.view(c);
  }

  /** Deletes the contact and (cascade) its links, activities and tasks. */
  async deleteContact(u: AuthUser, id: string) {
    await this.ownedContact(u, id);
    await this.prisma.careerContact.delete({ where: { id } });
  }

  async addLink(u: AuthUser, id: string, dto: CreateLinkDto) {
    await this.ownedContact(u, id);
    const dup = await this.prisma.contactLink.findFirst({ where: { contactId: id, kind: dto.kind, externalRef: dto.externalRef } });
    if (dup) throw new ConflictException('Link already exists');
    return this.prisma.contactLink.create({ data: { contactId: id, kind: dto.kind, externalRef: dto.externalRef, label: dto.label } });
  }

  async removeLink(u: AuthUser, id: string, linkId: string) {
    await this.ownedContact(u, id);
    await this.prisma.contactLink.deleteMany({ where: { id: linkId, contactId: id } });
  }

  /** Full user export (JSON), streamed and not persisted. */
  async exportAll(u: AuthUser) {
    const [contacts, activities, tasks] = await Promise.all([
      this.prisma.careerContact.findMany({ where: scope(u), include: { links: true } }),
      this.prisma.jobActivity.findMany({ where: scope(u) }),
      this.prisma.followUpTask.findMany({ where: scope(u) }),
    ]);
    return { exportedAt: new Date().toISOString(), contacts: contacts.map((c) => this.view(c)), activities, tasks };
  }

  // ---- CSV import (consent-gated, stateless) --------------------------------------------------
  /** Dry run: parses in memory and reports NEW / DUPLICATE / INVALID rows. Nothing is saved or enriched. */
  async previewImport(u: AuthUser, dto: ImportContactsDto) {
    if (dto.consent !== true) throw new BadRequestException('Confirm that you may keep these contacts before importing.');
    const existing = await this.prisma.careerContact.findMany({ where: scope(u) });
    const r = analyzeContactCsv(dto.csv, existing);
    const count = (s: string) => r.rows.filter((x) => x.status === s).length;
    return { ...r, summary: { new: count('NEW'), duplicate: count('DUPLICATE'), invalid: count('INVALID') } };
  }

  /** Saves only rows that are still NEW at commit time (re-analysed server-side; the client list is never trusted). Duplicates are skipped, never merged. */
  async commitImport(u: AuthUser, dto: ImportContactsDto) {
    const r = await this.previewImport(u, dto);
    let created = 0;
    for (const row of r.rows) {
      if (row.status !== 'NEW' || !row.contact) continue;
      const c = row.contact;
      await this.prisma.careerContact.create({
        data: {
          ...scope(u), name: c.name, nameKey: contactKey(c.name, c.organization), organization: c.organization, role: c.role,
          relationship: c.relationship, channels: c.channels as unknown as Prisma.InputJsonValue, tags: c.tags, notesEnc: c.notes ? encryptNote(c.notes) : null,
        },
      });
      created++;
    }
    return { created, skippedDuplicates: r.summary.duplicate, invalid: r.summary.invalid, truncated: r.truncated };
  }

  // ---- activities ---------------------------------------------------------------------------
  private async assertContact(u: AuthUser, contactId?: string) { if (contactId) await this.ownedContact(u, contactId); }

  async createActivity(u: AuthUser, dto: CreateActivityDto) {
    await this.assertContact(u, dto.contactId);
    return this.prisma.jobActivity.create({
      data: { ...scope(u), contactId: dto.contactId, type: dto.type, occurredAt: new Date(dto.occurredAt), summary: dto.summary, externalRef: dto.externalRef },
    });
  }

  listActivities(u: AuthUser, opts: { contactId?: string; page?: number; pageSize?: number } = {}) {
    const { contactId, page = 1, pageSize = 50 } = opts;
    return this.prisma.jobActivity.findMany({
      where: { ...scope(u), ...(contactId ? { contactId } : {}) }, orderBy: { occurredAt: 'desc' }, skip: (page - 1) * pageSize, take: Math.min(pageSize, 100),
    });
  }

  private async ownedActivity(u: AuthUser, id: string) {
    const a = await this.prisma.jobActivity.findFirst({ where: { id, ...scope(u) } });
    if (!a) throw new NotFoundException('Activity not found');
    return a;
  }

  async updateActivity(u: AuthUser, id: string, dto: UpdateActivityDto) {
    await this.ownedActivity(u, id);
    return this.prisma.jobActivity.update({
      where: { id }, data: { type: dto.type, summary: dto.summary, occurredAt: dto.occurredAt ? new Date(dto.occurredAt) : undefined },
    });
  }

  async deleteActivity(u: AuthUser, id: string) {
    await this.ownedActivity(u, id);
    await this.prisma.jobActivity.delete({ where: { id } });
  }

  // ---- follow-up tasks ----------------------------------------------------------------------
  async createTask(u: AuthUser, dto: CreateTaskDto) {
    await this.assertContact(u, dto.contactId);
    return this.prisma.followUpTask.create({
      data: { ...scope(u), contactId: dto.contactId, title: dto.title, dueAt: new Date(dto.dueAt), externalRef: dto.externalRef },
    });
  }

  listTasks(u: AuthUser, opts: { status?: string; contactId?: string } = {}) {
    return this.prisma.followUpTask.findMany({
      where: { ...scope(u), ...(opts.status ? { status: opts.status } : {}), ...(opts.contactId ? { contactId: opts.contactId } : {}) },
      orderBy: { dueAt: 'asc' }, take: 200,
    });
  }

  private async ownedTask(u: AuthUser, id: string) {
    const t = await this.prisma.followUpTask.findFirst({ where: { id, ...scope(u) } });
    if (!t) throw new NotFoundException('Task not found');
    return t;
  }

  async updateTask(u: AuthUser, id: string, dto: UpdateTaskDto) {
    await this.ownedTask(u, id);
    return this.prisma.followUpTask.update({
      where: { id },
      data: {
        title: dto.title, status: dto.status, dueAt: dto.dueAt ? new Date(dto.dueAt) : undefined,
        ...(dto.status === 'DONE' ? { completedAt: new Date() } : dto.status ? { completedAt: null } : {}),
      },
    });
  }

  async deleteTask(u: AuthUser, id: string) {
    await this.ownedTask(u, id);
    await this.prisma.followUpTask.delete({ where: { id } });
  }

  /** Counts for the analytics module (domain interface; no cross-module table access). */
  async taskStats(u: AuthUser, now = new Date()) {
    const open = await this.prisma.followUpTask.findMany({ where: { ...scope(u), status: 'OPEN' }, select: { dueAt: true } });
    const done = await this.prisma.followUpTask.count({ where: { ...scope(u), status: 'DONE' } });
    return { open: open.length, overdue: open.filter((t) => t.dueAt < now).length, done };
  }
}
