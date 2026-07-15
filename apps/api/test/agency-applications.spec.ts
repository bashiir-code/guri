import { describe, expect, it, beforeEach, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AgencyApplicationsService } from '../src/agency-applications/agency-applications.service';
import { AdminService } from '../src/admin/admin.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { AuditService } from '../src/audit/audit.service';

// ── in-memory world ─────────────────────────────────────────────────────────
// Just enough Prisma to run the REAL AgencyApplicationsService against the REAL
// AdminService.createAgency. Load-bearing checks (§2/§15, rule 15): a public
// submission creates a lead only — no agency, no member — until the platform
// admin approves, at which point the ONE createAgency path provisions the real
// agency + its founding admin member. Declining never provisions anything.

interface AnyRow {
  [k: string]: any;
}
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ADMIN = uuid(1);

function makeWorld() {
  const applications: AnyRow[] = [];
  const users: AnyRow[] = [{ id: ADMIN, email: 'admin@guri.test', name: 'Platform Admin' }];
  const agencies: AnyRow[] = [];
  const members: AnyRow[] = [];
  let seq = 100;
  const nextId = () => uuid(++seq);

  const prisma = {
    // createAgency uses the callback form; support it (and the array form).
    $transaction: async (arg: any) =>
      typeof arg === 'function' ? arg(prisma) : Promise.all(arg),
    user: {
      findUnique: async ({ where }: AnyRow) =>
        users.find((u) => (where.id ? u.id === where.id : u.email === where.email)) ?? null,
      create: async ({ data }: AnyRow) => {
        const row = { id: nextId(), ...data };
        users.push(row);
        return row;
      },
    },
    agency: {
      create: async ({ data }: AnyRow) => {
        const row = {
          id: nextId(),
          name: data.name,
          phone: data.phone,
          districts: data.districts,
          status: data.status,
        };
        agencies.push(row);
        // nested members.create → one membership row
        if (data.members?.create) {
          members.push({ ...data.members.create, agencyId: row.id });
        }
        return { ...row, members: members.filter((m) => m.agencyId === row.id) };
      },
    },
    agencyApplication: {
      create: async ({ data, select }: AnyRow) => {
        const row = { id: nextId(), status: 'pending', ...data };
        applications.push(row);
        return select ? { id: row.id } : row;
      },
      findUnique: async ({ where }: AnyRow) =>
        applications.find((a) => a.id === where.id) ?? null,
      findMany: async ({ where }: AnyRow = {}) =>
        applications.filter((a) => !where?.status || a.status === where.status),
      update: async ({ where, data }: AnyRow) => {
        const row = applications.find((a) => a.id === where.id);
        Object.assign(row, data);
        return row;
      },
    },
  } as unknown as PrismaService;

  const audit = { log: vi.fn(async () => undefined) } as unknown as AuditService;
  const admin = new AdminService(prisma, audit);
  const service = new AgencyApplicationsService(prisma, audit, admin);
  return { service, prisma, audit, applications, agencies, members, users };
}

const validInput = {
  agencyName: 'Test Homes Co',
  phone: '+252612345678',
  districts: ['Hodan'],
  contactName: 'Amina Yusuf',
  contactEmail: 'amina@testhomes.example',
  note: 'We manage 12 units in Hodan.',
};

describe('AgencyApplicationsService', () => {
  let world: ReturnType<typeof makeWorld>;
  beforeEach(() => {
    world = makeWorld();
  });

  it('a public submission creates a pending lead — not an agency or member', async () => {
    const { service, applications, agencies, members } = world;
    const res = await service.create(validInput);

    expect(res.id).toBeTruthy();
    expect(applications).toHaveLength(1);
    expect(applications[0].status).toBe('pending');
    // Rule 15: no agency access is provisioned on submit.
    expect(agencies).toHaveLength(0);
    expect(members).toHaveLength(0);
  });

  it('lists only pending applications for the admin waiting list', async () => {
    const { service, applications } = world;
    await service.create(validInput);
    applications.push({ id: uuid(999), status: 'declined', agencyName: 'Old' });

    const pending = await service.listPending();
    expect(pending).toHaveLength(1);
    expect(pending[0].agencyName).toBe('Test Homes Co');
  });

  it('approval provisions the real agency + founding admin member via createAgency', async () => {
    const { service, agencies, members, users, applications, audit } = world;
    const { id } = await service.create(validInput);

    const { agencyId } = await service.approve(ADMIN, id);

    // Real agency created, active, with the applicant as its founding admin.
    const agency = agencies.find((a) => a.id === agencyId);
    expect(agency).toMatchObject({ name: 'Test Homes Co', status: 'active', districts: ['Hodan'] });
    const member = members.find((m) => m.agencyId === agencyId);
    expect(member).toMatchObject({ role: 'admin', canVerify: true });
    // The applicant email became a linked user (Clerk links on sign-in, rule 13).
    expect(users.some((u) => u.email === 'amina@testhomes.example')).toBe(true);
    // Application is stamped approved and linked to the agency it created.
    expect(applications[0]).toMatchObject({ status: 'approved', createdAgencyId: agencyId });
    // Decision is audited (rule 4): createAgency + application approval.
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'agency_application.approved' }),
    );
  });

  it('refuses to approve or decline an already-reviewed application', async () => {
    const { service } = world;
    const { id } = await service.create(validInput);
    await service.approve(ADMIN, id);

    await expect(service.approve(ADMIN, id)).rejects.toThrow(BadRequestException);
    await expect(service.decline(ADMIN, id)).rejects.toThrow(BadRequestException);
  });

  it('decline stamps the lead declined and provisions nothing', async () => {
    const { service, applications, agencies } = world;
    const { id } = await service.create(validInput);

    await service.decline(ADMIN, id);
    expect(applications[0].status).toBe('declined');
    expect(agencies).toHaveLength(0);
  });

  it('throws NotFound for an unknown application id', async () => {
    const { service } = world;
    await expect(service.approve(ADMIN, uuid(777))).rejects.toThrow(NotFoundException);
  });
});
