import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, AnalyticsEventType } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AnalyticsEventDto } from "./dto/analytics-event.dto";

type CountRow = { value: bigint | number };
type DayRow = { day: Date; pageViews: bigint | number; clicks: bigint | number; uniqueVisitors: bigint | number; authenticatedUsers: bigint | number };
type ServiceRow = { serviceTypeId: number; name: string | null; clicks: bigint | number };
type TargetRow = { target: string; clicks: bigint | number };
const count = (value: bigint | number) => Number(value);

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async track(visitorId: string, events: AnalyticsEventDto[], userId?: number) {
    const now = Date.now();
    const minTime = now - 7 * 24 * 60 * 60 * 1000;
    const maxTime = now + 5 * 60 * 1000;
    const data = events.map((event) => {
      const occurredAt = new Date(event.occurredAt);
      if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() < minTime || occurredAt.getTime() > maxTime) {
        throw new BadRequestException("Время события должно быть не старше 7 дней и не более чем на 5 минут в будущем");
      }
      return { eventId: event.eventId, visitorId, userId, type: event.type, path: event.path, target: event.target, serviceTypeId: event.serviceTypeId, occurredAt };
    });
    const result = await this.prisma.analyticsEvent.createMany({ data, skipDuplicates: true });
    return { accepted: result.count };
  }

  async overview(fromValue?: string, toValue?: string) {
    const { from, to } = this.period(fromValue, toValue);
    const period = Prisma.sql`"occurredAt" >= ${from} AND "occurredAt" < ${to}`;
    const [totals, days, services, targets] = await Promise.all([
      this.prisma.$queryRaw<{ pageViews: bigint | number; clicks: bigint | number; uniqueVisitors: bigint | number; authenticatedUsers: bigint | number }[]>`
        SELECT COUNT(*) FILTER (WHERE "type" = 'page_view') AS "pageViews", COUNT(*) FILTER (WHERE "type" = 'click') AS "clicks", COUNT(DISTINCT "visitorId") AS "uniqueVisitors", COUNT(DISTINCT "userId") AS "authenticatedUsers"
        FROM "AnalyticsEvent" WHERE ${period}`,
      this.prisma.$queryRaw<DayRow[]>`
        SELECT date_trunc('day', "occurredAt") AS day, COUNT(*) FILTER (WHERE "type" = 'page_view') AS "pageViews", COUNT(*) FILTER (WHERE "type" = 'click') AS clicks, COUNT(DISTINCT "visitorId") AS "uniqueVisitors", COUNT(DISTINCT "userId") AS "authenticatedUsers"
        FROM "AnalyticsEvent" WHERE ${period} GROUP BY 1 ORDER BY 1`,
      this.prisma.$queryRaw<ServiceRow[]>`
        SELECT event."serviceTypeId", service.name, COUNT(*) AS clicks FROM "AnalyticsEvent" event
        LEFT JOIN "ServiceType" service ON service.id = event."serviceTypeId"
        WHERE ${period} AND event.type = 'click' AND event."serviceTypeId" IS NOT NULL
        GROUP BY event."serviceTypeId", service.name ORDER BY clicks DESC, event."serviceTypeId" ASC LIMIT 20`,
      this.prisma.$queryRaw<TargetRow[]>`
        SELECT target, COUNT(*) AS clicks FROM "AnalyticsEvent" WHERE ${period} AND type = 'click' AND target IS NOT NULL
        GROUP BY target ORDER BY clicks DESC, target ASC LIMIT 50`,
    ]);
    const total = totals[0] ?? { pageViews: 0, clicks: 0, uniqueVisitors: 0, authenticatedUsers: 0 };
    return {
      period: { from: from.toISOString(), to: to.toISOString() },
      totals: { pageViews: count(total.pageViews), clicks: count(total.clicks), uniqueVisitors: count(total.uniqueVisitors), authenticatedUsers: count(total.authenticatedUsers) },
      days: days.map((day) => ({ date: day.day.toISOString().slice(0, 10), pageViews: count(day.pageViews), clicks: count(day.clicks), uniqueVisitors: count(day.uniqueVisitors), authenticatedUsers: count(day.authenticatedUsers) })),
      topServices: services.map((row) => ({ serviceTypeId: row.serviceTypeId, name: row.name, clicks: count(row.clicks) })),
      topTargets: targets.map((row) => ({ target: row.target, clicks: count(row.clicks) })),
    };
  }

  private period(fromValue?: string, toValue?: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const from = fromValue ? new Date(fromValue) : today;
    const to = toValue ? new Date(toValue) : new Date(today.getTime() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 93 * 24 * 60 * 60 * 1000) {
      throw new BadRequestException("Период аналитики должен быть положительным и не превышать 93 дней");
    }
    return { from, to };
  }
}
