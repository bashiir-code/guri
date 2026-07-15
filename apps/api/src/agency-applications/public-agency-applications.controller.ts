import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { agencyApplicationSchema, type AgencyApplicationInput } from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { RATE_LIMITS } from '../common/throttle';
import { AgencyApplicationsService } from './agency-applications.service';

// Public "become a verified agency" submission (§2/§15). No login — anyone
// running an agency can apply. Throttled like other public submissions so the
// admin queue can't be flooded; approval stays a manual platform-admin step.
@Controller('agency-applications')
@Throttle({ default: RATE_LIMITS.request })
export class PublicAgencyApplicationsController {
  constructor(private readonly applications: AgencyApplicationsService) {}

  @Post()
  create(
    @Body(new ZodValidationPipe(agencyApplicationSchema)) body: AgencyApplicationInput,
  ) {
    return this.applications.create(body);
  }
}
