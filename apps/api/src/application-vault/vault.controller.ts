import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { CreateVaultEntryDto, SnoozeDto, UpdateVaultEntryDto, VaultQueryDto } from './dto/vault.dto';
import { VaultService } from './vault.service';

@Controller('application-vault')
export class VaultController {
  constructor(private svc: VaultService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateVaultEntryDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: VaultQueryDto, @Query('page') page?: string) { return this.svc.list(u, q, Math.max(1, Number(page) || 1)); }
  /** Declared before :id. */
  @Get('reminders') reminders(@CurrentUser() u: AuthUser) { return this.svc.reminders(u); }
  @Post(':id/snooze') @HttpCode(200)
  snooze(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: SnoozeDto) { return this.svc.snooze(u, id, dto.days); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Get(':id/snapshot') snapshot(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.snapshot(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateVaultEntryDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }
}
