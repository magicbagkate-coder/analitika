export type UsedDetail = { detail: string; quote: string };

// Words that name a feature of a bag: a message may use one only if the dialog itself already has it.
const DETAIL_STEMS = [
  'замш', 'шкір', 'крокодил', 'тиснен', 'італ', 'туреч', 'китай', 'натурал', 'розмір', 'габарит', 'міні', 'місткий', 'містк',
  'регульов', 'відділен', 'кишен', 'клапан', 'металев', 'фурнітур', 'ремінц', 'ремінь', 'підклад', 'застібк', 'блискавк',
];
const MIN_QUOTE_LENGTH = 3;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

/**
 * Details of the bag in a touch message must come from the dialog (owner, 2026-11-26: "don't invent details").
 * The writer lists every detail it used with a literal quote; a quote that is not in the dialog, or a feature word in
 * the message that the dialog never uses, is returned as unproven. An empty list means the message may go out.
 */
export function findUnprovenDetails(params: { messageText: string; transcript: string; usedDetails: UsedDetail[] }): string[] {
  const dialog = normalize(params.transcript);
  const message = normalize(params.messageText);
  const unprovenWords = DETAIL_STEMS.filter((stem) => message.includes(stem) && !dialog.includes(stem));
  const unprovenQuotes = params.usedDetails
    .filter((used) => normalize(used.quote).length < MIN_QUOTE_LENGTH || !dialog.includes(normalize(used.quote)))
    .map((used) => used.detail);
  return [...unprovenWords, ...unprovenQuotes];
}
