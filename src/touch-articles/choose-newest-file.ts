const COPY_NUMBER = /\((\d+)\)/;

function copyNumber(fileName: string): number {
  const match = COPY_NUMBER.exec(fileName);
  return match ? Number(match[1]) : 0;
}

/**
 * Owner's rule (2026-11-25): a file with "(1)", "(2)" in its name is a re-shot video of the same article, so
 * the highest number is the newest one and wins over the plain file. Without numbers the first file stays.
 */
export function chooseNewestFile(fileNames: string[]): string | undefined {
  return fileNames.reduce<string | undefined>((newest, fileName) => (newest === undefined || copyNumber(fileName) > copyNumber(newest) ? fileName : newest), undefined);
}
