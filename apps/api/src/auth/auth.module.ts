import { Module } from '@nestjs/common';
import { MeController } from './me.controller';
import { ClerkAuthGuard } from './clerk-auth.guard';
import { ClerkVerifierService } from './clerk-verifier.service';

// No auth endpoints live here anymore — Clerk owns sign-in/sign-up/reset
// entirely (rule 12). This module only verifies Clerk JWTs and serves /me.
@Module({
  controllers: [MeController],
  providers: [ClerkAuthGuard, ClerkVerifierService],
  exports: [ClerkAuthGuard, ClerkVerifierService],
})
export class AuthModule {}
