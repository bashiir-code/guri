import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// The ONLY write path to audit_log. Append-only: no update or delete method
// exists here or anywhere else in the app (§3, §9).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(entry: {
    actorId: string | null;
    action: string;
    objectType: string;
    objectId: string;
    meta?: Prisma.InputJsonValue;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        objectType: entry.objectType,
        objectId: entry.objectId,
        meta: entry.meta ?? {},
      },
    });
  }
}
