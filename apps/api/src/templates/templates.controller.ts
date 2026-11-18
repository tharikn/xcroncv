import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private svc: TemplatesService) {}

  @Get() list(@Query('category') category?: string, @Query('atsProfile') atsProfile?: string) {
    return this.svc.list({ category, atsProfile });
  }
  /** Dummy-data render model for the gallery/preview (never the caller's profile). Public sample data;
   *  exempt from the global throttle so a gallery of hundreds of lazy cards cannot exhaust the limit. */
  @SkipThrottle()
  @Get(':id/sample') sample(@Param('id') id: string) { return this.svc.sample(id); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.getLatest(id); }
  @Get(':id/versions/:version')
  version(@Param('id') id: string, @Param('version', ParseIntPipe) v: number) { return this.svc.getVersion(id, v); }
}
