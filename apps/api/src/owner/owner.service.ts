import { Injectable, NotFoundException } from '@nestjs/common';
import { LEASE_LIVE_STATUSES } from '@guri/shared';
import type { LeaseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService, PHOTO_URL_TTL_SECONDS } from '../storage/storage.service';
import { OwnerContext } from './owner.guard';

const LEASE_LIVE = LEASE_LIVE_STATUSES as unknown as LeaseStatus[];

// The owner dashboard is STRICTLY READ-ONLY (§2/§5): no listing edits, no
// deal or tenant actions, no payment entry. Data comes from what the agency
// recorded (leases + payments); income = sum of payments.
@Injectable()
export class OwnerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private paymentsWhere(ctx: OwnerContext): Prisma.PaymentWhereInput {
    return { lease: { listing: { ownerId: { in: ctx.ownerIds } } } };
  }

  async dashboard(ctx: OwnerContext, userId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const nextYear = new Date(now.getFullYear() + 1, 0, 1);

    const [properties, occupied, monthAgg, yearAgg, recent] = await Promise.all([
      this.prisma.listing.count({ where: { ownerId: { in: ctx.ownerIds } } }),
      this.prisma.lease.count({
        where: { listing: { ownerId: { in: ctx.ownerIds } }, status: { in: LEASE_LIVE } },
      }),
      this.prisma.payment.aggregate({
        where: { ...this.paymentsWhere(ctx), paidOn: { gte: monthStart, lt: nextMonth } },
        _sum: { amountUsd: true },
      }),
      this.prisma.payment.aggregate({
        where: { ...this.paymentsWhere(ctx), paidOn: { gte: yearStart, lt: nextYear } },
        _sum: { amountUsd: true },
      }),
      this.prisma.notification.findMany({
        where: { userId, channel: 'inapp' },
        orderBy: { createdAt: 'desc' },
        take: 6,
      }),
    ]);

    return {
      properties,
      occupied,
      incomeThisMonth: Math.round(Number(monthAgg._sum.amountUsd ?? 0)),
      collectedThisYear: Math.round(Number(yearAgg._sum.amountUsd ?? 0)),
      recentActivity: recent.map((n) => ({
        template: n.template,
        payload: n.payload,
        at: n.createdAt,
      })),
    };
  }

  async properties(ctx: OwnerContext) {
    const listings = await this.prisma.listing.findMany({
      where: { ownerId: { in: ctx.ownerIds } },
      orderBy: { createdAt: 'desc' },
      include: {
        leases: {
          where: { status: { in: LEASE_LIVE } },
          include: { customer: { select: { name: true } } },
          take: 1,
        },
      },
    });
    const now = Date.now();
    return Promise.all(
      listings.map(async (l) => {
        const lease = l.leases[0] ?? null;
        return {
          id: l.id,
          district: l.district,
          neighborhood: l.neighborhood,
          type: l.type,
          bedrooms: l.bedrooms,
          rentUsd: Number(l.rentUsd),
          status: l.status,
          publishedAt: l.publishedAt,
          coverUrl: l.photos[0]
            ? await this.storage.presignGet(l.photos[0], PHOTO_URL_TTL_SECONDS)
            : null,
          currentLease: lease
            ? {
                tenantName: lease.customer.name,
                startDate: lease.startDate,
                endDate: lease.endDate,
                daysToEnd: Math.ceil((lease.endDate.getTime() - now) / 86_400_000),
              }
            : null,
        };
      }),
    );
  }

  async propertyDetail(ctx: OwnerContext, listingId: string) {
    const l = await this.prisma.listing.findFirst({
      where: { id: listingId, ownerId: { in: ctx.ownerIds } },
      include: {
        agency: { select: { name: true, phone: true } },
        leases: {
          orderBy: { createdAt: 'desc' },
          include: {
            customer: { select: { name: true } },
            payments: { orderBy: { paidOn: 'desc' } },
          },
        },
      },
    });
    if (!l) throw new NotFoundException('property_not_found');

    const live = l.leases.find((x) => (LEASE_LIVE as string[]).includes(x.status)) ?? null;
    const renewalCount = l.leases.filter((x) => x.renewedFromLeaseId !== null).length;
    const payments = l.leases
      .flatMap((x) => x.payments)
      .sort((a, b) => b.paidOn.getTime() - a.paidOn.getTime());

    return {
      id: l.id,
      district: l.district,
      neighborhood: l.neighborhood,
      type: l.type,
      bedrooms: l.bedrooms,
      bathrooms: l.bathrooms,
      rentUsd: Number(l.rentUsd),
      depositUsd: Number(l.depositUsd),
      status: l.status,
      publishedAt: l.publishedAt,
      agency: l.agency,
      photos: await Promise.all(
        l.photos.map((k) => this.storage.presignGet(k, PHOTO_URL_TTL_SECONDS)),
      ),
      currentLease: live
        ? {
            tenantName: live.customer.name,
            startDate: live.startDate,
            endDate: live.endDate,
            termMonths: live.termMonths,
            renewalCount,
            daysToEnd: Math.ceil((live.endDate.getTime() - Date.now()) / 86_400_000),
          }
        : null,
      payments: payments.map((p) => ({
        id: p.id,
        type: p.type,
        amountUsd: Math.round(Number(p.amountUsd)),
        paidOn: p.paidOn,
        note: p.note,
      })),
    };
  }

  async payments(ctx: OwnerContext, filters: { listingId?: string; month?: string }) {
    const where: Prisma.PaymentWhereInput = {
      lease: {
        listing: {
          ownerId: { in: ctx.ownerIds },
          ...(filters.listingId ? { id: filters.listingId } : {}),
        },
      },
    };
    if (filters.month && /^\d{4}-\d{2}$/.test(filters.month)) {
      const [y, m] = filters.month.split('-').map(Number);
      where.paidOn = { gte: new Date(y, m - 1, 1), lt: new Date(y, m, 1) };
    }

    const rows = await this.prisma.payment.findMany({
      where,
      orderBy: { paidOn: 'desc' },
      include: {
        lease: {
          select: { listing: { select: { id: true, district: true, neighborhood: true } } },
        },
      },
    });

    const monthlyTotals = new Map<string, number>();
    for (const p of rows) {
      const key = p.paidOn.toISOString().slice(0, 7);
      monthlyTotals.set(key, (monthlyTotals.get(key) ?? 0) + Number(p.amountUsd));
    }

    return {
      items: rows.map((p) => ({
        id: p.id,
        paidOn: p.paidOn,
        type: p.type,
        amountUsd: Math.round(Number(p.amountUsd)),
        note: p.note,
        listing: p.lease.listing,
      })),
      monthlyTotals: Array.from(monthlyTotals.entries())
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([month, total]) => ({ month, totalUsd: Math.round(total) })),
    };
  }
}
