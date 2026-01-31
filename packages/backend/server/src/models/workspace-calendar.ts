import { Injectable } from '@nestjs/common';

import { BaseModel } from './base';

@Injectable()
export class WorkspaceCalendarModel extends BaseModel {
  async get(id: string) {
    return await this.db.workspaceCalendar.findUnique({
      where: { id },
    });
  }

  async getByWorkspace(workspaceId: string) {
    return await this.db.workspaceCalendar.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getDefault(workspaceId: string) {
    return await this.db.workspaceCalendar.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getOrCreateDefault(workspaceId: string, createdByUserId: string) {
    const existing = await this.getDefault(workspaceId);
    if (existing) {
      return existing;
    }

    return await this.db.workspaceCalendar.create({
      data: {
        workspaceId,
        createdByUserId,
      },
    });
  }

  async updateItems(
    workspaceCalendarId: string,
    items: Array<{
      subscriptionId: string;
      sortOrder?: number | null;
      colorOverride?: string | null;
    }>
  ) {
    await this.db.workspaceCalendarItem.deleteMany({
      where: { workspaceCalendarId },
    });

    if (items.length === 0) {
      return;
    }

    await this.db.workspaceCalendarItem.createMany({
      data: items.map((item, index) => ({
        workspaceCalendarId,
        subscriptionId: item.subscriptionId,
        sortOrder: item.sortOrder ?? index,
        colorOverride: item.colorOverride ?? null,
      })),
    });
  }

  async listItems(workspaceCalendarId: string) {
    return await this.db.workspaceCalendarItem.findMany({
      where: { workspaceCalendarId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async listItemsByWorkspace(workspaceId: string) {
    return await this.db.workspaceCalendarItem.findMany({
      where: { workspaceCalendar: { workspaceId } },
      orderBy: { sortOrder: 'asc' },
      include: { subscription: true },
    });
  }
}
