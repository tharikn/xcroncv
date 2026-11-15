import { Module } from '@nestjs/common';
import { VERIFICATION_PROVIDERS } from './credential-logic';
import { CredentialDisclosuresController, CredentialsController } from './evidence-wallet.controller';
import { EvidenceWalletService } from './evidence-wallet.service';

@Module({
  controllers: [CredentialsController, CredentialDisclosuresController],
  providers: [
    EvidenceWalletService,
    // No issuer/provider is integrated yet (doc 49 phase P2, needs provider and legal review). Register adapters here.
    { provide: VERIFICATION_PROVIDERS, useValue: [] },
  ],
})
export class EvidenceWalletModule {}
