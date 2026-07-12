import { Injectable } from '@nestjs/common';
import type { ListingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// Public agency directory (§15). Only ACTIVE agencies appear — a pending or
// suspended agency cannot receive leads. The live-listing count is the same
// "currently browseable" set the public browse uses (published + available or
// reserved), so the number an owner sees reflects real, visible inventory and
// becomes meaningful now that agencies are actually live.
@Injectable()
export class AgenciesDirectoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(district?: string) {
    const agencies = await this.prisma.agency.findMany({
      where: {
        status: 'active',
        ...(district ? { districts: { has: district } } : {}),
      },
      orderBy: { name: 'asc' },
    });

    const withCounts = await Promise.all(
      agencies.map(async (a) => ({
        id: a.id,
        name: a.name,
        phone: a.phone,
        districts: a.districts,
        liveListings: await this.prisma.listing.count({
          where: {
            agencyId: a.id,
            publishedAt: { not: null },
            status: { in: ['available', 'reserved'] as ListingStatus[] },
          },
        }),
      })),
    );

    // Busiest agencies first — a proxy for "actually active on the platform".
    return withCounts.sort((x, y) => y.liveListings - x.liveListings);
  }
}
