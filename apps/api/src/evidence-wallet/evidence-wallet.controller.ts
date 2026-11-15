import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { AuthUser } from '../common/auth/auth.types';
import { CurrentUser } from '../common/auth/current-user.decorator';
import {
  AddEvidenceDto, CreateCredentialDto, CreateGrantDto, UpdateCredentialDto, VerificationRequestDto,
} from './dto/credential.dto';
import { EvidenceWalletService } from './evidence-wallet.service';

@Controller('credentials')
export class CredentialsController {
  constructor(private svc: EvidenceWalletService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateCredentialDto) { return this.svc.create(u, dto); }
  @Get() list(@CurrentUser() u: AuthUser, @Query('page') page?: string) { return this.svc.list(u, Math.max(1, Number(page) || 1)); }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.get(u, id); }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCredentialDto) { return this.svc.update(u, id, dto); }
  @Delete(':id') @HttpCode(204) remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.remove(u, id); }

  @Post(':id/evidence')
  addEvidence(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddEvidenceDto) { return this.svc.addEvidence(u, id, dto); }
  @Delete(':id/evidence/:evidenceId') @HttpCode(204)
  removeEvidence(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Param('evidenceId', ParseUUIDPipe) eid: string) { return this.svc.removeEvidence(u, id, eid); }

  @Post(':id/verification-requests') @HttpCode(200)
  verify(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: VerificationRequestDto) { return this.svc.requestVerification(u, id, dto); }
  @Get(':id/verification')
  verification(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.verification(u, id); }

  @Post(':id/disclosure-grants')
  grant(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateGrantDto) { return this.svc.createGrant(u, id, dto); }
  @Get(':id/disclosure-grants')
  grants(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.listGrants(u, id); }
}

@Controller('credential-disclosures')
export class CredentialDisclosuresController {
  constructor(private svc: EvidenceWalletService) {}

  @Get(':id/projection')
  projection(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.grantProjection(u, id); }
  @Post(':id/revoke') @HttpCode(200)
  revoke(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.svc.revokeGrant(u, id); }
}
