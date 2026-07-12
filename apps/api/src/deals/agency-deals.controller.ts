import {
  BadRequestException,
  Body,
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
import {
  closeDealSchema,
  declineRequestSchema,
  generateAgreementSchema,
  rescheduleDealSchema,
  selectDealSchema,
  verifyDealSchema,
  viewingOutcomeSchema,
  type CloseDealInput,
  type DeclineRequestInput,
  type GenerateAgreementInput,
  type SelectDealInput,
  type VerifyDealInput,
  type ViewingOutcomeInput,
} from '@guri/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { AgencyCtx, AgencyGuard, AgencyRoles, type AgencyContext } from '../auth/agency.guard';
import { DealsService } from './deals.service';
import { DealStateService } from './deal-state.service';
import { DocumentsService } from './documents.service';
import { AgreementsService } from './agreements.service';

// Agency side of the deal engine (§4/§5/§6). Every write goes through the
// state-machine service; the guard scopes everything to the caller's agency.
@Controller()
@UseGuards(ClerkAuthGuard, AgencyGuard)
@AgencyRoles('agent')
export class AgencyDealsController {
  constructor(
    private readonly deals: DealsService,
    private readonly dealState: DealStateService,
    private readonly documents: DocumentsService,
    private readonly agreements: AgreementsService,
  ) {}

  // §6: generate the bilingual prefilled PDF (unlocked at 'approved').
  @Post('deals/:id/agreement')
  generateAgreement(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(generateAgreementSchema)) body: GenerateAgreementInput,
  ) {
    return this.agreements.generate(ctx, req.user.sub, id, body);
  }

  @Post('deals/:id/agreement/signed')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  uploadSignedScan(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file_required');
    return this.agreements.uploadSigned(ctx, req.user.sub, id, file);
  }

  // §4: the atomic close — signed scan + deposit + first rent + lease term.
  @Post('deals/:id/close')
  close(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeDealSchema)) body: CloseDealInput,
  ) {
    return this.dealState.close(ctx, req.user.sub, id, body);
  }

  // Verification is a permission, not a role (rule 9): any member may reach
  // this route; the service enforces can_verify + owning agency.
  @Post('deals/:id/verify')
  verify(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(verifyDealSchema)) body: VerifyDealInput,
  ) {
    return this.documents.verify(ctx, req.user.sub, id, body);
  }

  @Get('listings/:id/requests')
  queue(@AgencyCtx() ctx: AgencyContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.deals.listingQueue(ctx, id);
  }

  @Get('agency/dashboard')
  dashboard(@AgencyCtx() ctx: AgencyContext) {
    return this.deals.dashboard(ctx);
  }

  @Post('deals/:id/select')
  select(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(selectDealSchema)) body: SelectDealInput,
  ) {
    return this.dealState.select(ctx, req.user.sub, id, body.viewingAt);
  }

  @Post('deals/:id/reschedule')
  reschedule(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rescheduleDealSchema)) body: SelectDealInput,
  ) {
    return this.dealState.reschedule(ctx, req.user.sub, id, body.viewingAt);
  }

  @Post('deals/:id/decline-request')
  declineRequest(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineRequestSchema)) body: DeclineRequestInput,
  ) {
    return this.dealState.declineRequest(ctx, req.user.sub, id, body.reason);
  }

  @Post('deals/:id/viewing-outcome')
  viewingOutcome(
    @Req() req: AuthenticatedRequest,
    @AgencyCtx() ctx: AgencyContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(viewingOutcomeSchema)) body: ViewingOutcomeInput,
  ) {
    return this.dealState.viewingOutcome(ctx, req.user.sub, id, body.result, body.reason);
  }
}
