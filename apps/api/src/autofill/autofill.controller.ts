import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AutofillService } from './autofill.service';
import { AuthorizeFieldsDto, StartSessionDto } from './dto/autofill.dto';

@Controller('autofill')
export class AutofillController {
  constructor(private svc: AutofillService) {}

  @Get('site-adapters') adapters() { return this.svc.adapters(); }
  @Post('sessions') start(@CurrentUser() u: AuthUser, @Body() dto: StartSessionDto) { return this.svc.start(u, dto); }
  @Get('sessions') list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }

  @Get('sessions/:id/field-options')
  options(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.fieldOptions(u, id); }

  @Post('sessions/:id/authorize-fields') @HttpCode(200)
  authorize(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AuthorizeFieldsDto) {
    return this.svc.authorize(u, id, dto);
  }

  @Post('sessions/:id/revoke') @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revoke(u, id); }
}
