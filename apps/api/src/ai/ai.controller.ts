import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AiService } from './ai.service';
import { CreateSuggestionDto, DecideSuggestionDto, SetAiSettingsDto } from './dto/ai.dto';

@Controller('ai')
export class AiController {
  constructor(private svc: AiService) {}

  @Get('status') status(@CurrentUser() u: AuthUser) { return this.svc.status(u); }
  @Put('settings') settings(@CurrentUser() u: AuthUser, @Body() dto: SetAiSettingsDto) { return this.svc.setEnabled(u, dto.enabled); }
  @Get('usage') usage(@CurrentUser() u: AuthUser) { return this.svc.usage(u); }

  @Post('suggestions') @HttpCode(201) suggest(@CurrentUser() u: AuthUser, @Body() dto: CreateSuggestionDto) { return this.svc.suggest(u, dto); }
  @Get('suggestions') list(@CurrentUser() u: AuthUser) { return this.svc.list(u); }
  @Post('suggestions/:id/decision') @HttpCode(200)
  decide(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: DecideSuggestionDto) { return this.svc.decide(u, id, dto); }
  @Delete('suggestions') purge(@CurrentUser() u: AuthUser) { return this.svc.purge(u); }
}
