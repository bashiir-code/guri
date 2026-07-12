import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { RATE_LIMITS } from '../common/throttle';
import {
  listingFieldsSchema,
  updateListingSchema,
  publishListingSchema,
  ownerDocMetaSchema,
  type ListingFieldsInput,
  type UpdateListingInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { ListingsService } from './listings.service';

const PHOTO_LIMITS = { fileSize: 15 * 1024 * 1024 };
const DOC_LIMITS = { fileSize: 20 * 1024 * 1024 };

@Controller('listings')
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class ListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Post()
  create(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Body(new ZodValidationPipe(listingFieldsSchema)) body: ListingFieldsInput,
  ) {
    return this.listings.create(ctx, req.user.sub, body);
  }

  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateListingSchema)) body: UpdateListingInput,
  ) {
    return this.listings.update(ctx, req.user.sub, id, body);
  }

  @Throttle({ default: RATE_LIMITS.upload })
  @Post(':id/photos')
  @UseInterceptors(FilesInterceptor('photos', 12, { limits: PHOTO_LIMITS }))
  addPhotos(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.listings.addPhotos(ctx, req.user.sub, id, files ?? []);
  }

  @Throttle({ default: RATE_LIMITS.upload })
  @Post(':id/owner-docs')
  @UseInterceptors(FileInterceptor('file', { limits: DOC_LIMITS }))
  addOwnerDoc(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() rawBody: unknown,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file_required');
    const meta = new ZodValidationPipe(ownerDocMetaSchema).transform(rawBody);
    return this.listings.addOwnerDoc(ctx, req.user.sub, id, meta, file);
  }

  @Get(':id/owner-docs')
  async listOwnerDocs(@AgencyCtx() ctx: AgencyContext, @Param('id', ParseUUIDPipe) id: string) {
    const detail = await this.listings.detail(ctx, id);
    return detail.ownerDocs;
  }

  @Post(':id/publish')
  publish(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(publishListingSchema)) _body: unknown,
  ) {
    return this.listings.publish(ctx, req.user.sub, id);
  }
}

// Console reads live under /agency/listings so GET /listings can stay public.
@Controller('agency/listings')
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class AgencyListingsController {
  constructor(private readonly listings: ListingsService) {}

  @Get()
  list(@AgencyCtx() ctx: AgencyContext) {
    return this.listings.list(ctx);
  }

  @Get(':id')
  detail(@AgencyCtx() ctx: AgencyContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.listings.detail(ctx, id);
  }
}

// Separate path so a document URL is always an explicit, audited issuance.
@Controller('owner-docs')
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class OwnerDocsController {
  constructor(private readonly listings: ListingsService) {}

  @Throttle({ default: RATE_LIMITS.documentUrl })
  @Post(':id/url')
  issueUrl(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.listings.issueOwnerDocUrl(ctx, req.user.sub, id);
  }
}
