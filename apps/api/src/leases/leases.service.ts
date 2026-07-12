import { Injectable, NotFoundException } from '@nestjs/common';
import { LEASE_LIVE_STATUSES, type LogPaymentInput } from '@guri/shared';
import type { LeaseStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AgencyContext } from '../auth/agency.guard';

const LEASE_LIVE = LEASE_LIVE_STATUSES as unknown as LeaseStatus[];

// Tenancies (§5 screen 6, phase-5 slice): live leases + off-platform payment
// records. Renewal/move-out/ending_soon land in phase 7 (§16).
@Injectable()
export class LeasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  // POST /leases/:id/payments — a record of an off-platform payment (§3):
  // the MVP moves no money.
  async logPayment(ctx: AgencyContext, actorId: string, leaseId: string, input: LogPaymentInput) {
    const lease = await this.prisma.lease.findFirst({
      where: { id: leaseId, listing: { agencyId: ctx.agencyId } },
      include: { listing: { include: { owner: { select: { userId: true } } } } },
    });
    if (!lease) throw new NotFoundException('lease_not_found');

    const payment = await this.prisma.payment.create({
      data: {
        leaseId,
        type: input.type,
        amountUsd: input.amountUsd,
        paidOn: input.paidOn,
        note: input.note,
        recordedById: actorId,
      },
    });
    await this.audit.log({
      actorId,
      action: 'payment.logged',
      objectType: 'payment',
      objectId: payment.id,
      meta: { leaseId, type: input.type, amountUsd: input.amountUsd },
    });
    // §7: payment logged → owner (in-app).
    await this.notifications.recordInApp({
      userId: lease.listing.owner.userId,
      template: 'payment_logged',
      payload: { leaseId, paymentId: payment.id, type: input.type, amountUsd: input.amountUsd },
    });
    return {
      id: payment.id,
      type: payment.type,
      amountUsd: Number(payment.amountUsd),
      paidOn: payment.paidOn,
      note: payment.note,
    };
  }

  // GET /agency/tenancies — live leases with term + days-to-end (§5/§16).
  async tenancies(ctx: AgencyContext) {
    const leases = await this.prisma.lease.findMany({
      where: { listing: { agencyId: ctx.agencyId }, status: { in: LEASE_LIVE } },
      orderBy: { endDate: 'asc' },
      include: {
        customer: { select: { name: true, phone: true } },
        listing: { select: { id: true, district: true, neighborhood: true } },
        payments: { orderBy: { paidOn: 'desc' } },
      },
    });
    const now = Date.now();
    return leases.map((l) => ({
      id: l.id,
      status: l.status,
      startDate: l.startDate,
      termMonths: l.termMonths,
      endDate: l.endDate,
      daysToEnd: Math.ceil((l.endDate.getTime() - now) / 86_400_000),
      rentUsd: Number(l.rentUsd),
      depositUsd: Number(l.depositUsd),
      tenant: { name: l.customer.name, phone: l.customer.phone },
      listing: l.listing,
      payments: l.payments.map((p) => ({
        id: p.id,
        type: p.type,
        amountUsd: Number(p.amountUsd),
        paidOn: p.paidOn,
        note: p.note,
      })),
    }));
  }
}
