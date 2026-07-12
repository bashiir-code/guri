import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { intakeSubmitSchema, intakeReassignSchema } from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { RATE_LIMITS } from '../common/throttle';
import { IntakesService } from './intakes.service';

const INTAKE_LIMITS = { fileSize: 15 * 1024 * 1024 };

// Owner-initiated intake (§15). Any signed-in user can submit — doing so grants
// the owner role (rule 15), no separate account. These are LEADS: never public.
@Controller()
@UseGuards(ClerkAuthGuard)
export class OwnerIntakesController {
  constructor(private readonly intakes: IntakesService) {}

  // POST /intakes — basics + photos (+ optional pre-screen docs), pick one agency.
  @Throttle({ default: RATE_LIMITS.upload })
  @Post('intakes')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'photos', maxCount: 12 },
        { name: 'docs', maxCount: 6 },
      ],
      { limits: INTAKE_LIMITS },
    ),
  )
  submit(
    @Req() req: AuthenticatedRequest,
    @Body() rawBody: unknown,
    @UploadedFiles() files: { photos?: Express.Multer.File[]; docs?: Express.Multer.File[] },
  ) {
    // Drop empty multipart values so zod optionals behave (an empty field is
    // "not provided", not an invalid number/string).
    const cleaned = Object.fromEntries(
      Object.entries((rawBody ?? {}) as Record<string, unknown>).filter(
        ([, v]) => v !== undefined && v !== '',
      ),
    );
    const meta = new ZodValidationPipe(intakeSubmitSchema).transform(cleaned);
    return this.intakes.submit(req.user.sub, meta, {
      photos: files?.photos ?? [],
      docs: files?.docs ?? [],
    });
  }

  @Get('my/intakes')
  mine(@Req() req: AuthenticatedRequest) {
    return this.intakes.myIntakes(req.user.sub);
  }

  // POST /intakes/:id/reassign — after declined/expired, re-send to a new agency.
  @Throttle({ default: RATE_LIMITS.request })
  @Post('intakes/:id/reassign')
  reassign(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(intakeReassignSchema)) body: { agencyId: string },
  ) {
    return this.intakes.reassign(req.user.sub, id, body.agencyId);
  }
}
