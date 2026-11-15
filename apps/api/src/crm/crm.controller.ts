import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CrmService } from './crm.service';
import {
  CreateActivityDto, CreateContactDto, CreateLinkDto, ImportContactsDto, CreateTaskDto, UpdateActivityDto, UpdateContactDto, UpdateTaskDto,
} from './dto/crm.dto';

const num = (v?: string) => (v ? Math.max(1, Number(v) || 1) : undefined);

@Controller('contacts')
export class ContactsController {
  constructor(private svc: CrmService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('q') q?: string, @Query('tag') tag?: string, @Query('page') page?: string) {
    return this.svc.listContacts(u, { q, tag, page: num(page) });
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateContactDto) { return this.svc.createContact(u, dto); }

  /** Declared before :id so "export" is not parsed as an id. Streamed, never stored. */
  @Get('export') async export(@CurrentUser() u: AuthUser, @Res() res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', 'attachment; filename="contacts-export.json"');
    res.json(await this.svc.exportAll(u));
  }

  @Post('import/preview') @Throttle({ default: { limit: 20, ttl: 60_000 } })
  importPreview(@CurrentUser() u: AuthUser, @Body() dto: ImportContactsDto) { return this.svc.previewImport(u, dto); }
  @Post('import/commit') @Throttle({ default: { limit: 10, ttl: 60_000 } })
  importCommit(@CurrentUser() u: AuthUser, @Body() dto: ImportContactsDto) { return this.svc.commitImport(u, dto); }

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getContact(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateContactDto) { return this.svc.updateContact(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteContact(u, id); }
  @Post(':id/links') link(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateLinkDto) { return this.svc.addLink(u, id, dto); }
  @Delete(':id/links/:linkId') @HttpCode(204)
  unlink(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('linkId', ParseUUIDPipe) linkId: string) { return this.svc.removeLink(u, id, linkId); }
}

@Controller('job-activities')
export class JobActivitiesController {
  constructor(private svc: CrmService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('contactId') contactId?: string, @Query('page') page?: string) {
    return this.svc.listActivities(u, { contactId, page: num(page) });
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateActivityDto) { return this.svc.createActivity(u, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateActivityDto) { return this.svc.updateActivity(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteActivity(u, id); }
}

@Controller('follow-up-tasks')
export class FollowUpTasksController {
  constructor(private svc: CrmService) {}

  @Get() list(@CurrentUser() u: AuthUser, @Query('status') status?: string, @Query('contactId') contactId?: string) {
    return this.svc.listTasks(u, { status, contactId });
  }
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateTaskDto) { return this.svc.createTask(u, dto); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaskDto) { return this.svc.updateTask(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.deleteTask(u, id); }
}
