import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateProposalDto, DecisionDto, RecordApplicationDto, UpdateApplicationDto, UpsertJobContextDto } from './dto/portal.dto';
import { JobPortalService } from './job-portal.service';

@Controller('portal')
export class JobPortalController {
  constructor(private svc: JobPortalService) {}

  @Put('job-contexts') @HttpCode(200) upsert(@CurrentUser() u: AuthUser, @Body() dto: UpsertJobContextDto) { return this.svc.upsertContext(u, dto); }
  @Get('job-contexts') list(@CurrentUser() u: AuthUser) { return this.svc.listContexts(u); }
  @Get('job-contexts/:id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.getContext(u, id); }
  @Delete('job-contexts/:id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeContext(u, id); }

  @Post('job-contexts/:id/proposals') propose(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateProposalDto) { return this.svc.createProposal(u, id, dto); }
  @Get('job-contexts/:id/proposals') proposals(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.proposals(u, id); }
  @Post('proposals/:id/decisions') @HttpCode(200) decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecisionDto) { return this.svc.decide(u, id, dto); }

  @Post('applications') record(@CurrentUser() u: AuthUser, @Body() dto: RecordApplicationDto) { return this.svc.record(u, dto); }
  @Get('applications') applications(@CurrentUser() u: AuthUser) { return this.svc.applications(u); }
  @Patch('applications/:id') setStatus(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateApplicationDto) { return this.svc.setHostStatus(u, id, dto); }
  @Delete('applications/:id') @HttpCode(204) removeApp(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.removeApplication(u, id); }
}
