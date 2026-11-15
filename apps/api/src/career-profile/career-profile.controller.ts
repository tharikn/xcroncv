import { Body, Controller, Delete, Get, HttpCode, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from './career-profile.service';
import { UpsertProfileDto } from './dto/profile.dto';

@Controller('career-profile')
export class CareerProfileController {
  constructor(private svc: CareerProfileService) {}

  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.get(u); }
  @Put() put(@CurrentUser() u: AuthUser, @Body() dto: UpsertProfileDto) { return this.svc.upsert(u, dto); }
  @Delete() @HttpCode(204) remove(@CurrentUser() u: AuthUser) { return this.svc.remove(u); }
}
