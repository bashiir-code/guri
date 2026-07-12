import { Module } from '@nestjs/common';
import { DealsModule } from '../deals/deals.module';
import { IntakesModule } from '../intakes/intakes.module';
import { JobsService } from './jobs.service';
import { JobsScheduler } from './jobs.scheduler';
import { PgBossService } from './pgboss.service';
import { BackupService } from './backup.service';

// DealsModule exports DealStateService (the single state machine); IntakesModule
// exports the §15 intake machine. Jobs are just another caller of both.
@Module({
  imports: [DealsModule, IntakesModule],
  providers: [JobsService, JobsScheduler, PgBossService, BackupService],
  exports: [JobsService, BackupService],
})
export class JobsModule {}
