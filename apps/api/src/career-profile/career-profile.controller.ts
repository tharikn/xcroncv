import { Body, Controller, Delete, Get, HttpCode, Post, Put } from '@nestjs/common';
import { CurrentUser } from '../common/auth/current-user.decorator';
import { AuthUser } from '../common/auth/auth.types';
import { CareerProfileService } from './career-profile.service';
import { UpsertProfileDto } from './dto/profile.dto';

@Controller('career-profile')
export class CareerProfileController {
  constructor(private svc: CareerProfileService) {}

  @Get() get(@CurrentUser() u: AuthUser) { return this.svc.get(u); }
  @Put() put(@CurrentUser() u: AuthUser, @Body() dto: UpsertProfileDto) { return this.svc.upsert(u, dto); }
  /** Replace the signed-in user's profile with the canonical starter profile (no body needed). */
  @Post('reset') @HttpCode(200) reset(@CurrentUser() u: AuthUser) { return this.svc.reset(u); }
  @Delete() @HttpCode(204) remove(@CurrentUser() u: AuthUser) { return this.svc.remove(u); }
}
