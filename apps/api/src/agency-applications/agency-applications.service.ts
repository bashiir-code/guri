import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { AgencyApplicationInput } from '@guri/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AdminService } from '../admin/admin.service';

// "Become a verified agency" applications (§2/§15). A public submission creates
// a pending lead — never an agency and never a role (rule 15). The platform
// admin reviews the waiting list and either approves it (which runs the SAME
// createAgency path: a real agencies row + its first admin member) or declines
// it. All decisions are mirrored to the append-only audit_log (rule 4).
@Injectable()
export class AgencyApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly admin: AdminService,
  ) {}

  // Public, unauthenticated. Returns only an id — nothing about the queue is
  // exposed to the applicant.
  async create(input: AgencyApplicationInput) {
    const app = await this.prisma.agencyApplication.create({
      data: {
        agencyName: input.agencyName,
        phone: input.phone,
        districts: input.districts,
        contactName: input.contactName,
        contactEmail: input.contactEmail,
        note: input.note,
      },
      select: { id: true },
    });
    return { id: app.id };
  }

  // Admin waiting list: newest pending applications first.
  listPending() {
    return this.prisma.agencyApplication.findMany({
      where: { status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Approve → provision the real agency (agency + founding admin member) from
  // the application, exactly as a hand-created one, then stamp it approved.
  async approve(actorId: string, id: string) {
    const app = await this.prisma.agencyApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('application_not_found');
    if (app.status !== 'pending') throw new BadRequestException('already_reviewed');

    const agency = await this.admin.createAgency(actorId, {
      name: app.agencyName,
      phone: app.phone,
      districts: app.districts,
      adminEmail: app.contactEmail,
      adminName: app.contactName,
      adminPhone: app.phone,
    });

    await this.prisma.agencyApplication.update({
      where: { id },
      data: {
        status: 'approved',
        reviewedById: actorId,
        reviewedAt: new Date(),
        createdAgencyId: agency.id,
      },
    });
    await this.audit.log({
      actorId,
      action: 'agency_application.approved',
      objectType: 'agency_application',
      objectId: id,
      meta: { agencyId: agency.id, name: app.agencyName },
    });
    return { agencyId: agency.id };
  }

  async decline(actorId: string, id: string) {
    const app = await this.prisma.agencyApplication.findUnique({ where: { id } });
    if (!app) throw new NotFoundException('application_not_found');
    if (app.status !== 'pending') throw new BadRequestException('already_reviewed');

    const updated = await this.prisma.agencyApplication.update({
      where: { id },
      data: { status: 'declined', reviewedById: actorId, reviewedAt: new Date() },
    });
    await this.audit.log({
      actorId,
      action: 'agency_application.declined',
      objectType: 'agency_application',
      objectId: id,
      meta: { name: app.agencyName },
    });
    return updated;
  }
}
