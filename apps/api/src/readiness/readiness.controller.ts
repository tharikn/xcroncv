import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AddMilestoneDto, ImportPreviewDto, CreatePlanDto, UpdateMilestoneDto } from './dto/readiness.dto';
import { ReadinessService } from './readiness.service';

@Controller('readiness-plans')
export class ReadinessController {
  constructor(private svc: ReadinessService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePlanDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  /** Declared before :id. */
  @Get('import-sources') importSources(@CurrentUser() u: AuthUser) { return this.svc.importSources(u); }
  @Post('import-preview') @HttpCode(200) importPreview(@CurrentUser() u: AuthUser, @Body() dto: ImportPreviewDto) { return this.svc.importPreview(u, dto); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Post(':id/refresh') @HttpCode(200) refresh(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.refresh(u, id); }
  @Post(':id/milestones') addMilestone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMilestoneDto) { return this.svc.addMilestone(u, id, dto); }
  @Patch(':id/milestones/:mid')
  updateMilestone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('mid') mid: string, @Body() dto: UpdateMilestoneDto) { return this.svc.updateMilestone(u, id, mid, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
