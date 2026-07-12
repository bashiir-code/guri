import type { ConfigService } from '@nestjs/config';

// Platform admins are seeded from an environment allowlist — never
// self-serve (SPEC §2 v1.10). The users.is_platform_admin flag remains as a
// database-side grant (admin:promote) so an admin can be added without a
// redeploy; either source suffices.
export function isAllowlistedAdmin(config: ConfigService, email: string | null): boolean {
  if (!email) return false;
  const raw = config.get<string>('PLATFORM_ADMIN_EMAILS') ?? '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}
