import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { ATS_DIMENSIONS, ATS_DISCLAIMER, ATS_TAXONOMY_VERSION, ATS_VERSION } from './ats-engine';
import { AtsEngineService } from './ats-engine.service';
import { RunAtsDto } from './dto/ats.dto';

@Controller('ats')
export class AtsModelController {
  /** Static, versioned description of how the score is made (no user data). Still behind the global auth guard. */
  @Get('model')
  model() {
    return {
      atsVersion: ATS_VERSION, taxonomyVersion: ATS_TAXONOMY_VERSION, disclaimer: ATS_DISCLAIMER,
      dimensions: ATS_DIMENSIONS.map(({ id, label, weight, what, needsJob }) => ({ id, label, weight, what, needsJob })),
    };
  }
}

@Controller('resumes')
export class ResumeAtsController {
  constructor(private svc: AtsEngineService) {}

  @Post(':resumeId/ats-reports')
  run(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string, @Body() dto: RunAtsDto) { return this.svc.run(u, resumeId, dto); }

  @Get(':resumeId/ats-reports')
  list(@CurrentUser() u: AuthUser, @Param('resumeId', ParseUUIDPipe) resumeId: string) { return this.svc.list(u, resumeId); }
}

@Controller('ats-reports')
export class AtsReportsController {
  constructor(private svc: AtsEngineService) {}

  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
