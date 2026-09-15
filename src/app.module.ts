import { Module } from '@nestjs/common';
import { BulkTagStatusModule } from './bulk-tag-status/bulk-tag-status.module';
import { AppConfigModule } from './config/app-config.module';
import { DailyStatsStoreModule } from './daily-stats-store/daily-stats-store.module';
import { DatabaseModule } from './database/database.module';
import { EvaluationModule } from './evaluation/evaluation.module';
import { ManagerTrendsModule } from './manager-trends/manager-trends.module';
import { OrderSuccessAnalysisModule } from './order-success-analysis/order-success-analysis.module';
import { ReportSchedulerModule } from './report-scheduler/report-scheduler.module';
import { SitniksChatModule } from './sitniks-chat/sitniks-chat.module';
import { SitniksChatListModule } from './sitniks-chat-list/sitniks-chat-list.module';
import { SitniksChatMessagesModule } from './sitniks-chat-messages/sitniks-chat-messages.module';
import { SitniksChatNotesModule } from './sitniks-chat-notes/sitniks-chat-notes.module';
import { SitniksChatUpdateModule } from './sitniks-chat-update/sitniks-chat-update.module';
import { SitniksManagersModule } from './sitniks-managers/sitniks-managers.module';
import { StatusReportModule } from './status-report/status-report.module';

// Развёрнуто в Docker (Dockerfile + docker-compose.yml), Postgres подключён через DatabaseModule
// (2026-09-14) — провизия на будущее, entity под бизнес-данные пока не заведены.
//
// SitniksChatPollerModule and DailySummaryModule are deliberately NOT wired in (2026-09-10):
// StatusReportModule now runs twice a day (16:00 + 23:59, see status-report.constants.ts) and
// re-evaluates a chat whenever it has new messages since its last score (see needsEvaluation in
// evaluation.constants.ts) — that alone covers TARGET_STATUS end to end. Running the poller too
// would re-score the same chats every ~5 minutes all day (touches happen roughly hourly on
// "Вибір товару"), burning Claude API budget for no benefit and leaving the two scheduled reports
// looking empty since the poller would already have scored everything moments earlier.
// DailySummaryModule would then send a redundant, mostly-empty 23:00 recap on top of that.
// Re-enable SitniksChatPollerModule if/when a different, non-"Вибір товару" status needs its own
// continuous catch-all scoring (it's already scoped to TARGET_STATUS, so scope it there first).
//
// OrderSuccessAnalysisModule (2026-09-14) covers a second status, "Замовлення створено" — deals
// that already closed. It asks Claude a different question there (what specifically led to the
// sale, not a 1-5 quality score) and uses its own tag family (see order-success-analysis.constants.ts)
// so it never touches a chat's оценка-N score from when it was still in "Вибір товару".
//
// ReportSchedulerModule (2026-09-15) owns the twice-daily clock for both StatusReportModule and
// OrderSuccessAnalysisModule and runs them strictly in sequence (order-success first, then
// status-report) — owner's explicit instruction, so the two reports never interleave in Telegram.
// Neither module schedules itself anymore; both only expose an on-demand run method.
//
// ManagerTrendsModule (2026-09-14) reads evaluation_history (written by EvaluationService and
// OrderSuccessAnalysisService via EvaluationHistoryModule) once a week and reports what a single
// twice-daily report can't show: a manager's score rising/falling several weeks running, or one
// specific mistake repeating across weeks.
@Module({
  imports: [
    AppConfigModule,
    DatabaseModule,
    DailyStatsStoreModule,
    SitniksChatModule,
    SitniksChatListModule,
    SitniksChatMessagesModule,
    SitniksChatNotesModule,
    SitniksChatUpdateModule,
    SitniksManagersModule,
    EvaluationModule,
    StatusReportModule,
    OrderSuccessAnalysisModule,
    ReportSchedulerModule,
    ManagerTrendsModule,
    BulkTagStatusModule,
  ],
})
export class AppModule {}
