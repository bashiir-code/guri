import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ClerkAuthGuard, AuthenticatedRequest } from '../auth/clerk-auth.guard';
import { NotificationsService } from './notifications.service';

// The in-app bell (§7): per-user list + unread count, rendered bilingually on
// the web from template + payload. No new console screens.
@Controller('me/notifications')
@UseGuards(ClerkAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() req: AuthenticatedRequest) {
    return this.notifications.listForUser(req.user.sub);
  }

  @Post('read')
  markRead(@Req() req: AuthenticatedRequest) {
    return this.notifications.markAllRead(req.user.sub);
  }
}
