import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, Length } from 'class-validator';
import { Public } from '../common/auth/public.decorator';
import { AuthExchangeService } from './auth-exchange.service';

export class ExchangeDto {
  @IsString() @Length(20, 100) code!: string;
  @IsString() @Length(1, 300) redirectUri!: string;
  @IsString() @Length(16, 128) nonce!: string;
}

@Controller('auth')
export class AuthExchangeController {
  constructor(private readonly svc: AuthExchangeService) {}

  /** Public by necessity: this is how a session starts. Throttled; the host validates code, redirect and nonce. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('exchange')
  async exchange(@Body() dto: ExchangeDto) {
    const r = await this.svc.exchange(dto.code, dto.redirectUri, dto.nonce);
    return { access_token: r.accessToken, token_type: 'Bearer', expires_in: r.expiresIn };
  }
}
