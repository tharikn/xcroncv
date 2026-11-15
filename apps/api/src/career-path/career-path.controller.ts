import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CareerPathService } from './career-path.service';
import { AddMilestoneDto, AnalyzeDto, CompensationQueryDto, CreatePlanDto, PageQueryDto, UpdateMilestoneDto, UpdatePlanDto } from './dto/career-path.dto';

@Controller('career-paths')
export class CareerPathController {
  constructor(private svc: CareerPathService) {}

  @Get('roles') roles() { return this.svc.roles(); }
  @Post('analyze') @HttpCode(200) analyze(@CurrentUser() u: AuthUser, @Body() dto: AnalyzeDto) { return this.svc.analyze(u, dto); }

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreatePlanDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PageQueryDto) { return this.svc.list(u, q.page ?? 1); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePlanDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }

  @Post(':id/milestones') addMilestone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddMilestoneDto) { return this.svc.addMilestone(u, id, dto); }
  @Patch(':id/milestones/:milestoneId')
  updateMilestone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('milestoneId', ParseUUIDPipe) mid: string, @Body() dto: UpdateMilestoneDto) { return this.svc.updateMilestone(u, id, mid, dto); }
  @Delete(':id/milestones/:milestoneId')
  removeMilestone(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('milestoneId', ParseUUIDPipe) mid: string) { return this.svc.removeMilestone(u, id, mid); }
}

@Controller('compensation-insights')
export class CompensationController {
  constructor(private svc: CareerPathService) {}
  @Get() insights(@CurrentUser() u: AuthUser, @Query() q: CompensationQueryDto) { return this.svc.compensation(u, q); }
}
