"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("../src/app.module");
const claude_synthesis_service_1 = require("../src/claude/claude-synthesis.service");
const evaluation_service_1 = require("../src/evaluation/evaluation.service");
const evaluation_constants_1 = require("../src/evaluation/evaluation.constants");
const sitniks_chat_list_service_1 = require("../src/sitniks-chat-list/sitniks-chat-list.service");
const sitniks_chat_messages_service_1 = require("../src/sitniks-chat-messages/sitniks-chat-messages.service");
const status_report_formatter_1 = require("../src/status-report/status-report-formatter");
const telegram_service_1 = require("../src/telegram/telegram.service");
// Chat IDs + old scores from the 2026-09-11 15:45 report, evaluated under the pre-recalibration
// criteria (an unclosed sale was pulling scores down even when the manager's process was fine).
const TARGET_CHAT_IDS = [
    '6aa3cda41444b9f412dc1f36', '6aa3cd1a47aa80b7b4da09be', '6aa3cb1c3b8da0d597a003d3',
    '6aa3bf093b8da0d59786cf00', '6aa3b86b47aa80b7b4ade7c6', '6aa3b27e1444b9f412a12fe0',
    '6aa3b235b64ae52d5eef3ece', '6aa3ac903b8da0d5975e3847', '6aa3ac3b1444b9f41292f8e0',
    '6aa3ab971444b9f41291b25b', '6aa3a633b81e7a16bf50a9b6', '6aa39c399ad88a9b7f5afb00',
    '6aa39644b81e7a16bf340a25', '6aa391671444b9f41263fe79', '6aa390d747aa80b7b462cf13',
    '6aa38fb7b81e7a16bf2cae8e', '6aa386413b8da0d597245130', '6aa35d17b81e7a16bf1ea750',
    '6aa33d02b64ae52d5ea21303', '6aa328ed3b8da0d5971c576f', '6aa3258b47aa80b7b450727d',
    '6aa3221ab64ae52d5e9fb35a', '6aa31e98b64ae52d5e9f1c95', '6aa2e1b73b8da0d597d3e5bf',
    '6aa16a3b47aa80b7b43ecfb4', '6aa10a15b81e7a16bf492c64', '6a9f8597b81e7a16bf88f51c',
    '6a9f046847aa80b7b48a7edb', '6a94744e6c7579928cf6422d', '6a900dcdb64ae52d5eb3b195',
    '6a82a949485c373ddb8cf98c', '6a69211973c77dfb29afabfd', '6a68e570ad7b345841298ff6',
    '6a6278915423b333ac68bc68', '6a5a24c2ad7b345841d36b90', '6a5145ba5b99875e4d75d178',
    '6a5094c3e3cdd1a77c6839f5', '6a2fab87a62e27c894767f07', '6a23f47ba96a9df8bdb5f7e7',
    '6a13033379b60d5c8c80f56d', '6a0b22cc58a869ba66a882a7', '6a0b0b20e61df99636871880',
    '6a048a753983fad950b150ca', '69beba8bcc6f6cb2bbc1fd85', '69a415a87c5a815a56d9006f',
    '6999eed32c57150bd0b1aa62', '69713bcd603f75ae1d02ec36', '68ef7f4c3989b14ed518c178',
    '68d43b5c966ca94d93879772', '687be4572487f7afd0ce5891', '6827aaea566033d2c61f0a38',
    '681fa6f9f8b2b69923136e17', '6818d3565cee5304aee14e2c',
];
const DELAY_MS = 1500;
const LOST_THRESHOLD_MINUTES = 20;
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function collectManagerNames(messages) {
    const chronological = [...messages].reverse();
    const names = chronological.map((message) => message.managerName).filter((name) => Boolean(name));
    return Array.from(new Set(names));
}
/** Same rule as StatusReportService.isLost: last message from the client, unanswered for 20+ minutes. */
function isLost(messages) {
    const latestMessage = messages[0];
    if (!latestMessage || latestMessage.managerName)
        return false;
    const minutesSinceLastMessage = (Date.now() - new Date(latestMessage.createdAt).getTime()) / (60 * 1000);
    return minutesSinceLastMessage >= LOST_THRESHOLD_MINUTES;
}
async function fetchAllChatsInStatus(sitniksChatListService) {
    const all = [];
    let skip = 0;
    const pageSize = 50;
    for (;;) {
        const response = await sitniksChatListService.listChats({ status: evaluation_constants_1.TARGET_STATUS, skip, limit: pageSize });
        all.push(...response.data);
        if (response.data.length < pageSize)
            break;
        skip += pageSize;
        await delay(DELAY_MS);
    }
    return all;
}
async function main() {
    const app = await core_1.NestFactory.createApplicationContext(app_module_1.AppModule, { logger: false });
    const sitniksChatListService = app.get(sitniks_chat_list_service_1.SitniksChatListService);
    const sitniksChatMessagesService = app.get(sitniks_chat_messages_service_1.SitniksChatMessagesService);
    const evaluationService = app.get(evaluation_service_1.EvaluationService);
    const claudeSynthesisService = app.get(claude_synthesis_service_1.ClaudeSynthesisService);
    const telegramService = app.get(telegram_service_1.TelegramService);
    const chatsById = new Map((await fetchAllChatsInStatus(sitniksChatListService)).map((chat) => [chat.id, chat]));
    // Optional CLI limit (e.g. `ts-node scripts/recalibrate.ts 2`) to sanity-check a couple of chats first.
    const limitArg = Number(process.argv[2]);
    const targetIds = Number.isInteger(limitArg) && limitArg > 0 ? TARGET_CHAT_IDS.slice(0, limitArg) : TARGET_CHAT_IDS;
    const isTestRun = targetIds.length < TARGET_CHAT_IDS.length;
    const outcomes = [];
    let changed = 0;
    if (!isTestRun) {
        await telegramService.sendMessage(`⚡<b>Пересчёт оценок отчёта 15:45 — обновлена калибровка:</b> оценка теперь отражает качество работы ` +
            'менеджера, а не факт закрытия сделки, и касатель больше не критикуется за то, что вне его роли.');
    }
    for (const chatId of targetIds) {
        try {
            const chat = chatsById.get(chatId);
            if (!chat) {
                console.log(`${chatId}: no longer in "${evaluation_constants_1.TARGET_STATUS}", skipped (status likely changed since 15:45)`);
                continue;
            }
            const messagesResponse = await sitniksChatMessagesService.listMessages({ chatId, limit: 50 });
            if (messagesResponse.data.length === 0) {
                console.log(`${chatId}: no messages, skipped`);
                continue;
            }
            const recentMessages = (0, evaluation_constants_1.filterToRecentWindow)(messagesResponse.data, evaluation_constants_1.ANALYSIS_WINDOW_HOURS);
            const clientName = chat.userNickName ?? chat.userName;
            const oldScoreTag = chat.tags.find((tag) => tag.startsWith('оценка-'));
            const evaluation = await evaluationService.evaluateAndPublish({
                chatId,
                existingTags: chat.tags,
                clientName,
                messages: recentMessages,
            });
            const newScoreTag = `оценка-${evaluation.score}`;
            if (oldScoreTag !== newScoreTag)
                changed += 1;
            console.log(`${clientName}: ${oldScoreTag ?? '(none)'} -> ${newScoreTag}`);
            const outcome = {
                chatId,
                clientName,
                managerNames: collectManagerNames(recentMessages),
                score: evaluation.score,
                purchased: evaluation.purchased,
                goodPoints: evaluation.goodPoints,
                closingSummary: evaluation.closingSummary,
                mistakes: evaluation.mistakes,
                recommendation: evaluation.recommendation,
                isLost: isLost(messagesResponse.data),
            };
            outcomes.push(outcome);
            if (!isTestRun) {
                await telegramService.sendMessage((0, status_report_formatter_1.formatChatBlock)(outcome));
            }
        }
        catch (error) {
            console.error(`${chatId}: FAILED - ${error.message}`);
        }
        await delay(DELAY_MS);
    }
    console.log(`\nDone. ${outcomes.length}/${targetIds.length} recalibrated, ${changed} scores changed.\n`);
    if (isTestRun) {
        console.log('Test-limited run — skipping synthesis and Telegram send. Re-run without a limit for the full batch.');
        await app.close();
        return;
    }
    // Fresh patterns/critical synthesis over the recalibrated data, same pipeline as the real report.
    const draft = await claudeSynthesisService.synthesizePatterns(outcomes);
    console.log('Patterns:', draft.patterns);
    console.log('Critical candidates:', draft.criticalCandidates);
    const confirmed = [];
    for (const name of draft.criticalCandidates) {
        const outcome = outcomes.find((candidate) => candidate.clientName === name);
        if (!outcome)
            continue;
        const messagesResponse = await sitniksChatMessagesService.listMessages({ chatId: outcome.chatId, limit: 50 });
        const description = await claudeSynthesisService.verifyCriticalChat(name, messagesResponse.data);
        if (description.length > 0)
            confirmed.push(description);
        await delay(DELAY_MS);
    }
    const critical = confirmed.join(' ');
    console.log('Critical (verified):', critical);
    await telegramService.sendMessage((0, status_report_formatter_1.formatSummaryBlock)(outcomes.length, outcomes, { critical, patterns: draft.patterns }));
    await app.close();
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
