import { Body, Controller, Get, Put } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { UpdatePreferencesDto } from './dto/preferences.dto';
import { PreferencesService } from './preferences.service';

@Controller('me/preferences')
export class PreferencesController {
  constructor(private svc: PreferencesService) {}
  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.get(u); }
  @Put() update(@CurrentUser() u: AuthUser, @Body() dto: UpdatePreferencesDto) { return this.svc.update(u, dto); }
}
