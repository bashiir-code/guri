import { Controller, Get, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AgenciesDirectoryService } from './agencies-directory.service';
import { RATE_LIMITS } from '../common/throttle';

// Public agency directory (§15) — no login needed to browse who serves where.
// Owners pick an agency from here when submitting a house. Only active agencies
// appear; nothing about intakes is exposed.
@Controller('agencies')
@Throttle({ default: RATE_LIMITS.browse })
export class PublicAgenciesController {
  constructor(private readonly directory: AgenciesDirectoryService) {}

  @Get()
  list(@Query('district') district?: string) {
    return this.directory.list(district && district.trim() ? district.trim() : undefined);
  }
}
