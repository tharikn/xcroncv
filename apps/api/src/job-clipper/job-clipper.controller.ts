import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateClipDto, CreateSessionDto, PageDto, UpdateClipDto } from './dto/clip.dto';
import { JobClipperService } from './job-clipper.service';

@Controller('clipped-jobs')
export class ClippedJobsController {
  constructor(private svc: JobClipperService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateClipDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PageDto) { return this.svc.list(u, q.page ?? 1); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClipDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
  @Post(':id/analyze') @HttpCode(200) analyze(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.analyze(u, id); }
}

@Controller('extension/sessions')
export class ExtensionSessionsController {
  constructor(private svc: JobClipperService) {}
  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateSessionDto) { return this.svc.createSession(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.sessions(u); }
  @Post(':id/revoke') @HttpCode(200) revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revokeSession(u, id); }
}
