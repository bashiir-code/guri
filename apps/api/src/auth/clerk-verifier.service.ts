import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createRemoteJWKSet, jwtVerify } from 'jose';

export interface ClerkTokenPayload {
  sub: string; // Clerk user id
  email?: string;
}

// Verifies Clerk session JWTs (RS256) against the instance JWKS, networkless
// after the first fetch. The instance domain is embedded in the publishable
// key (pk_test_<base64("<domain>$")>), so no extra config is needed.
@Injectable()
export class ClerkVerifierService {
  private jwks?: ReturnType<typeof createRemoteJWKSet>;
  private issuer?: string;
  private readonly publishableKey?: string;

  constructor(config: ConfigService) {
    this.publishableKey =
      config.get<string>('CLERK_PUBLISHABLE_KEY') ??
      config.get<string>('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY');
  }

  private instanceDomain(): string {
    const b64 = this.publishableKey?.split('_')[2];
    if (!b64) throw new UnauthorizedException('clerk_not_configured');
    const domain = Buffer.from(b64, 'base64').toString('utf8').replace(/\$$/, '');
    if (!/^[a-z0-9.-]+$/i.test(domain)) {
      throw new UnauthorizedException('clerk_not_configured');
    }
    return domain;
  }

  async verify(token: string): Promise<ClerkTokenPayload> {
    try {
      if (!this.jwks) {
        const domain = this.instanceDomain();
        this.issuer = `https://${domain}`;
        this.jwks = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`));
      }
      const { payload } = await jwtVerify(token, this.jwks, { issuer: this.issuer });
      if (!payload.sub) throw new Error('missing sub');
      return {
        sub: payload.sub,
        email: typeof payload.email === 'string' ? payload.email.toLowerCase() : undefined,
      };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('invalid_token');
    }
  }
}
