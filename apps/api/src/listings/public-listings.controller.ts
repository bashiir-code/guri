import { BadRequestException, Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { browseQuerySchema } from '@guri/shared';
import { ListingsService } from './listings.service';
import { RATE_LIMITS } from '../common/throttle';

// Public browse — no login needed to look (SPEC §5/§6). Serves only published
// available|reserved listings; drafts, rented homes and intakes never appear.
@Controller('listings')
@Throttle({ default: RATE_LIMITS.browse })
export class PublicListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  browse(@Query() raw: Record<string, string>) {
    // Drop empty query params so zod optionals behave.
    const cleaned = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== undefined && v !== ''),
    );
    const parsed = browseQuerySchema.safeParse(cleaned);
    if (!parsed.success) {
      throw new BadRequestException({
        message: 'validation_failed',
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    return this.listings.publicList(parsed.data);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.listings.publicDetail(id);
  }
}
