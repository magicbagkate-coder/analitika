import Anthropic from '@anthropic-ai/sdk';
import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { createAnthropicClient } from './anthropic-client';
import { collectManagerNames, describeManagerRoles } from './manager-context';
import { formatTranscript, toKyivTime } from './transcript-formatter';
import type { ChatEvaluationResult } from '../evaluation/evaluation.types';
import type { ChatMessage } from '../sitniks-chat-messages/sitniks-chat-messages.types';

const EVALUATION_TOOL_NAME = 'submit_chat_evaluation';

/** Asks Claude to score a manager-client chat and explain the outcome. */
@Injectable()
export class ClaudeService {
  private readonly client: Anthropic;

  constructor(private readonly appConfig: AppConfigService) {
    this.client = createAnthropicClient(this.appConfig.getAnthropicApiKey());
  }

  async evaluateChat(messages: ChatMessage[], clientName: string): Promise<ChatEvaluationResult> {
    const transcript = formatTranscript(messages);
    const managerNames = collectManagerNames(messages);
    const response = await this.client.messages.create({
      model: this.appConfig.getAnthropicModel(),
      // Bumped from 1200 (2026-09-15 incident) — thinking can eat the budget before every field is
      // written, and extractEvaluation now throws on any missing field rather than silently
      // fabricating a score, so a too-tight budget here means a real chat gets skipped this run.
      max_tokens: 2000,
      tools: [this.buildEvaluationTool()],
      tool_choice: { type: 'tool', name: EVALUATION_TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            // Identical on every call — cached so we only pay full price for it once a day.
            { type: 'text', text: this.buildStaticInstructions(), cache_control: { type: 'ephemeral' } },
            { type: 'text', text: this.buildDynamicContext(clientName, managerNames, transcript) },
          ],
        },
      ],
    });

    return this.extractEvaluation(response);
  }

  private buildStaticInstructions(): string {
    return [
      'Ты — опытный эксперт по продажам, который коучит менеджеров магазина женских кожаных сумок',
      'MagicBag (аудитория 35+, преимущественно натуральная кожа, меньшая линейка замши/экокожи/текстиля).',
      'Разбери эту переписку менеджера с клиенткой.',
      'КРИТИЧЕСКИ ВАЖНО: весь разбор пиши ТОЛЬКО на русском языке — независимо от того, что сама',
      'переписка идёт на украинском. Ни одного украинского слова в ответе быть не должно.',
      'Все временные метки в диалоге — уже киевское местное время. Магазин работает с 08:00 до 24:00 —',
      'тишина с 00:00 до 08:00 НЕ является ошибкой менеджера, это нерабочие часы.',
      'В диалоге мог участвовать не один человек — у каждого сообщения менеджера указано',
      'настоящее имя и роль. Если ошибку допустил конкретный человек — называй его прямо по имени,',
      'а не обобщённо "менеджер".',
      'Роли разные по ожиданиям: "молодший менеджер" — скорость (до 5 мин) и корректный базовый',
      'ответ, не жди от него глубокого дожима возражений. "Касатель" — главное: вовремя ли',
      '(ориентировочно через час тишины) и лично ли сделано повторное обращение (касание),',
      'а не закрыл ли сделку сам. "Старший менеджер" и "керівник зміни" — полная ответственность за',
      'консультацию, допродажи и уверенное закрытие сделки, с них самый высокий спрос.',
      '"Сервіс менеджер" занимается уже оформленным заказом (обмен, брак, логистика/ТТН) — это не его',
      'работа консультировать по выбору товара или делать допродажу, не суди его по этим критериям.',
      'ВАЖНО про "касателя": его работа по регламенту — ТОЛЬКО шаблонное действие (например,',
      'повторный вопрос "оформляємо?" / "ще актуально?"), не более. Это не является недоработкой —',
      'касатель осознанно НЕ должен разбирать возражения, консультировать или предлагать допродажу,',
      'это зона ответственности старшого менеджера и керівника зміни. НИКОГДА не пиши в ошибках',
      'касателя "не отработал возражение" или "не сделал допродажу" — это в принципе не его работа.',
      'Детали по ролям (учитывай при оценке, но не выдумывай нарушения там, где их нет):',
      '"Молодший менеджер" — правильный первый ответ идёт в порядке: сначала ценность/описание товара,',
      'потом цена, потом фото, потом уточняющий вопрос (не просто "цена+фото" без описания ценности).',
      'Если клиентка интересуется товаром с рілсу, где показано несколько кольорів — молодший сразу',
      'присылает фото всех доступных кольорів одним пакетом, не спрашивая заранее "який колір?".',
      'ИСКЛЮЧЕНИЕ из правила "сначала ценность, потом фото": в транскрипте сообщения от автоматического',
      'Instagram-бота Manychat (не человек) помечены отдельно как "АВТОМАТИЧНИЙ БОТ Instagram" — обычно',
      'это "Вітаю! Гарний вибір! [товар]. Вартість [ціна]. Надіслати більш детальні фото?" и/или "Зараз',
      'наш менеджер надішле вам більше фотографій обраної моделі". Если такое бот-сообщение есть прямо',
      'перед первым сообщением менеджера — бот уже сам назвал ценность и цену клиентке, и менеджеру',
      'НОРМАЛЬНО сразу после приветствия прислать фото, не повторяя описание — это не ошибка. Это',
      'исключение работает ТОЛЬКО когда перед первым сообщением менеджера реально есть такая пометка',
      '"АВТОМАТИЧНИЙ БОТ Instagram" — во всех остальных случаях стандартный порядок (ценность → цена →',
      'фото → вопрос) действует без исключений.',
      '"Старший менеджер" — допродажу (второй товар, аксессуар) по регламенту предлагают ПОСЛЕ того,',
      'как клиентке уже отправлены реквізити на оплату, не раньше. Пока реквизиты не отправлены —',
      'отсутствие допродажи НЕ ошибка, ещё рано. Если реквизиты уже отправлены, а второй товар или',
      'аксессуар так и не предложили — вот это упущенная возможность, пиши прямо про неё.',
      'Повторное персональное касание после сигнала "важного" лида (клиентка сказала "подумаю",',
      '"порадитись", или это подарок) — по инструкции обязанность ТОЛЬКО "касателя", не старшого',
      'менеджера и не керівника зміни. Если такого касания не было — это недоработка касателя (или',
      'того, что чату вообще не назначили касателя), а НЕ старшого менеджера/керівника зміни — не пиши',
      'это им в ошибки, даже если именно они вели консультацию перед этим сигналом.',
      'Отдельно от касания: если клиентка говорит "подумаю"/"напишу вам" ПРЯМО В ОТВЕТ старшому',
      'менеджеру или керівнику зміни в ходе самой консультации — это отдельный реальный сигнал слабой',
      'отработки возражений в моменте (не выявили причину сомнений, не закрыли на конкретный шаг). Это',
      'стоит писать как недоработку именно с отработкой возражений у того, кто вёл консультацию — а не',
      'как "не сделал повторное касание", это не его функция.',
      'Напоминание клиентке про оплату — правильно сделать за 2-3 часа до конца рабочего дня (24:00),',
      'а не в последние 30-60 минут перед закрытием; если видишь напоминание об оплате впритык к',
      'полуночи — это ошибка тайминга, а не хорошая инициатива.',
      'ВАЖНО: только "касателю" запрещено присылать ссылки на Instagram вместо фото/видео —',
      'всем остальным ролям ссылки разрешены, где это уместно, не считай это ошибкой.',
      'ВАЖНО: все менеджеры ВСЕГДА представляются в приветствии именем руководителя смены (например,',
      'Офіленко Євгенія представляется как "Наталія"), а не своим настоящим именем — это сознательная',
      'политика компании в Instagram, где клиентка в любом случае не знает, кто ей реально пишет.',
      'Это НИКОГДА не ошибка, не путаница и не повод для недоверия клиентки — вообще не упоминай это.',
      'Если менеджер что-то пообещал (прислать фото, написать "завтра" и т.п.) и с того момента в',
      'рамках рабочих часов прошло больше суток без единого следующего сообщения от менеджера — это',
      'грубая ошибка (сорванный follow-up). Пиши об этом прямо, а не "рано судить".',
      'Оценивай жёстко, с позиции hard sales: даже без явной ошибки всегда ищи, где сделку можно было',
      'закрыть быстрее или увереннее — но это про рекомендацию, а НЕ повод занижать саму оценку.',
      'Незакрытая сделка при правильной работе менеджера — это нормально, 4-5/5, а не 2/5 (см. критерии',
      'оценки ниже). Строгость — это точность в поиске реальных ошибок, а не заниженные оценки по умолчанию.',
      'Пиши коротко и по существу, без вступлений — чтобы владелица магазина прочитала за 10 секунд.',
      'ВАЖНО: отдельно от оценки честно определи clientConflict (см. описание поля) — любой явный сигнал',
      'недовольства клиентки самой коммуникацией обязательно должен быть замечен, владелица магазина строит',
      'на этом поле автоматическое попадание чата в раздел "Обратить внимание", не пропускай такие случаи.',
    ].join('\n');
  }

  private buildDynamicContext(clientName: string, managerNames: string[], transcript: string): string {
    return [
      `Клиентка: ${clientName}.`,
      `Текущая дата (Киев): ${toKyivTime(new Date().toISOString())}.`,
      describeManagerRoles(managerNames),
      '',
      transcript,
    ].join('\n');
  }

  private buildEvaluationTool(): Anthropic.Tool {
    const shared = 'На русском языке, 1-3 коротких предложения, без вступлений. Если участвовало несколько ' +
      'менеджеров — называй конкретного человека по имени, а не обобщённо "менеджер".';
    return {
      name: EVALUATION_TOOL_NAME,
      description: 'Submit the chat evaluation score, expert breakdown, and purchase outcome.',
      input_schema: {
        type: 'object',
        properties: {
          score: {
            type: 'integer',
            minimum: 1,
            maximum: 5,
            description:
              'Оценка КАЧЕСТВА РАБОТЫ менеджера, а не факта закрытия сделки — это разные вещи. Сделка ещё не ' +
              'закрыта (клиентка думает/не ответила) САМА ПО СЕБЕ не повод занижать оценку, если менеджер всё ' +
              'сделал правильно и по регламенту: это 4-5/5, а не 2/5. 5 = отличная работа (сделка закрыта, ИЛИ ' +
              'клиентка в процессе, но менеджер всё сделал верно и по регламенту). 4 = хорошая работа, максимум ' +
              'мелкие недочёты. 3 = средне, есть заметные упущенные возможности закрыть быстрее/увереннее. ' +
              '2 = плохо, явные ошибки, которые реально мешают продаже (проигнорировал вопрос, нарушил регламент, ' +
              'грубость). 1 = очень плохо, грубые нарушения. Низкая оценка — только за реальные промахи в ' +
              'процессе, не за то, что клиентка пока не решилась.',
          },
          purchased: { type: ['boolean', 'null'] },
          goodPoints: { type: 'string', description: `Что сделали хорошо. ${shared}` },
          closingSummary: {
            type: 'string',
            description: `Если НЕ закрыли на покупку — короткая причина; если купил — что сработало. ${shared}`,
          },
          mistakes: {
            type: 'string',
            description:
              'Конкретные промахи или упущенные возможности закрыть быстрее/увереннее. Никогда не пиши просто ' +
              `"нет" — если реальных ошибок нет, укажи конкретный более сильный ход, который был бы уместен. ${shared}`,
          },
          recommendation: {
            type: 'string',
            description:
              `Обязательный конкретный тактический совет для этого диалога, даже если ошибок не было. ${shared}`,
          },
          clientConflict: {
            type: 'boolean',
            description:
              'true, если клиентка в переписке явно выразила недовольство САМОЙ КОММУНИКАЦИЕЙ менеджеров — ' +
              'раздражение, просьбу прекратить писать ("зупиніться", "досить"), жалобу на навязчивость/шаблонные ' +
              'скрипты, угрозу пожаловаться публично, грубость в ответ на сообщения. Считается даже одна такая ' +
              'фраза, даже если менеджер потом извинился и всё сгладил. НЕ считается конфликтом обычный отказ от ' +
              'покупки без признаков раздражения ("не потрібно", "не цікаво", "подумаю"). При сомнении — true.',
          },
        },
        required: ['score', 'purchased', 'goodPoints', 'closingSummary', 'mistakes', 'recommendation', 'clientConflict'],
      },
    };
  }

  private extractEvaluation(response: Anthropic.Message): ChatEvaluationResult {
    const toolUse = response.content.find((block) => block.type === 'tool_use');
    if (!toolUse || toolUse.type !== 'tool_use') throw new Error('Claude did not return an evaluation');

    const input = toolUse.input as Partial<ChatEvaluationResult>;
    this.assertComplete(input, response.stop_reason);
    return input as ChatEvaluationResult;
  }

  /**
   * A forced tool call isn't a hard type guarantee — a missing field here once reached escapeHtml
   * downstream unguarded and crashed the whole report (2026-09-15, see project memory). Throwing
   * lets the existing per-chat error isolation (StatusReportService.tryEvaluateOneChat) skip just
   * this one chat instead of a malformed value corrupting the report, or worse, silently
   * fabricating a score that looks like a real evaluation.
   */
  private assertComplete(input: Partial<ChatEvaluationResult>, stopReason: string | null): void {
    const requiredKeys = ['score', 'purchased', 'goodPoints', 'closingSummary', 'mistakes', 'recommendation', 'clientConflict'] as const;
    const missing = requiredKeys.filter((key) => input[key] === undefined);
    if (missing.length > 0) {
      throw new Error(`Claude returned an incomplete evaluation (missing: ${missing.join(', ')}, stop_reason: ${stopReason})`);
    }
  }
}
