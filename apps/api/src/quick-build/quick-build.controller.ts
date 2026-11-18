import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { QuickBuildDto } from './dto/quick-build.dto';
import { QuickBuildService } from './quick-build.service';

@Controller('quick-build')
export class QuickBuildController {
  constructor(private readonly svc: QuickBuildService) {}

  /**
   * POST /quick-build/preview
   * Runs the whole pipeline (JD analysis, selection, planning, repair) without persisting anything.
   */
  @Post('preview')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  preview(@CurrentUser() u: AuthUser, @Body() dto: QuickBuildDto) {
    return this.svc.preview(u, dto);
  }

  /**
   * POST /quick-build
   * One click: builds, validates, repairs and stores the resume plus its resolved layout plan.
   */
  @Post()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  create(@CurrentUser() u: AuthUser, @Body() dto: QuickBuildDto) {
    return this.svc.create(u, dto);
  }

  /** GET /quick-build/resumes/:id/report — the decision log behind the layout. */
  @Get('resumes/:id/report')
  report(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getReport(u, id);
  }
}
