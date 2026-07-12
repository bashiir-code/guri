import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { uploadDocumentSchema } from '@guri/shared';
import { RATE_LIMITS } from '../common/throttle';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { DealsService } from './deals.service';
import { DealStateService } from './deal-state.service';
import { DocumentsService } from './documents.service';
import { AgreementsService } from './agreements.service';

const ID_PHOTO_LIMITS = { fileSize: 15 * 1024 * 1024 };

// Customer request/queue flow (§6). Any signed-in user is a customer (§2).
@Controller()
@UseGuards(ClerkAuthGuard)
export class DealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly dealState: DealStateService,
    private readonly documents: DocumentsService,
    private readonly agreements: AgreementsService,
  ) {}

  // §6: agreement download — parties only, presigned + audited per issue.
  @Throttle({ default: RATE_LIMITS.documentUrl })
  @Get('deals/:id/agreement')
  agreementUrls(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.agreements.issueUrls(req.user.sub, id);
  }

  // §6: customer ID upload (multipart) → docs_in_review.
  @Throttle({ default: RATE_LIMITS.upload })
  @Post('deals/:id/documents')
  @UseInterceptors(FileInterceptor('file', { limits: ID_PHOTO_LIMITS }))
  uploadDocument(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file_required');
    const meta = new ZodValidationPipe(uploadDocumentSchema).transform(
      (req.body ?? {}) as Record<string, unknown>,
    );
    return this.documents.upload(req.user.sub, id, meta, file);
  }

  // §9: view the ID via a short-lived presigned URL; every issue is audited.
  @Throttle({ default: RATE_LIMITS.documentUrl })
  @Post('deals/:id/documents/url')
  documentUrl(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.issueUrl(req.user.sub, id);
  }

  @Throttle({ default: RATE_LIMITS.request })
  @Post('listings/:id/requests')
  request(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.dealState.createRequest(id, req.user.sub);
  }

  @Get('my/requests')
  myRequests(@Req() req: AuthenticatedRequest) {
    return this.deals.myRequests(req.user.sub);
  }

  @Get('deals/:id')
  deal(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.getDealForParty(req.user.sub, id);
  }

  @Post('deals/:id/withdraw')
  withdraw(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.withdraw(req.user.sub, id);
  }
}
