import { retryOnRateLimit } from './retry-on-rate-limit';

function httpFailure(status: number, headers: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), { response: { status, headers } });
}

describe('retryOnRateLimit', () => {
  let sleep: jest.Mock;

  beforeEach(() => {
    sleep = jest.fn().mockResolvedValue(undefined);
  });

  it('returns the result straight away when the first try works', async () => {
    const request = jest.fn().mockResolvedValue('ok');

    await expect(retryOnRateLimit(request, { sleep })).resolves.toBe('ok');

    expect(sleep).not.toHaveBeenCalled();
  });

  it('waits and tries again after a 429, then returns the result', async () => {
    const request = jest.fn().mockRejectedValueOnce(httpFailure(429)).mockResolvedValue('ok');

    await expect(retryOnRateLimit(request, { sleep })).resolves.toBe('ok');

    expect(request).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2_000);
  });

  it('waits longer each time: 2s, 4s, 8s', async () => {
    const request = jest
      .fn()
      .mockRejectedValueOnce(httpFailure(429))
      .mockRejectedValueOnce(httpFailure(429))
      .mockRejectedValueOnce(httpFailure(429))
      .mockResolvedValue('ok');

    await retryOnRateLimit(request, { sleep });

    expect(sleep.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([2_000, 4_000, 8_000]);
  });

  it('follows the wait Sitniks asks for in Retry-After', async () => {
    const request = jest.fn().mockRejectedValueOnce(httpFailure(429, { 'retry-after': '3' })).mockResolvedValue('ok');

    await retryOnRateLimit(request, { sleep });

    expect(sleep).toHaveBeenCalledWith(3_000);
  });

  it('never waits longer than 15 seconds, even if asked to', async () => {
    const request = jest.fn().mockRejectedValueOnce(httpFailure(429, { 'retry-after': '120' })).mockResolvedValue('ok');

    await retryOnRateLimit(request, { sleep });

    expect(sleep).toHaveBeenCalledWith(15_000);
  });

  it('gives up after 4 retries and hands the 429 to the caller', async () => {
    const request = jest.fn().mockRejectedValue(httpFailure(429));

    await expect(retryOnRateLimit(request, { sleep })).rejects.toThrow('status code 429');

    expect(request).toHaveBeenCalledTimes(5);
    expect(sleep).toHaveBeenCalledTimes(4);
  });

  it.each([[500], [404], [403]])('does not retry a %i, the caller handles it as before', async (status) => {
    const request = jest.fn().mockRejectedValue(httpFailure(status));

    await expect(retryOnRateLimit(request, { sleep })).rejects.toThrow(`status code ${status}`);

    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry an error that is not an HTTP answer at all (timeout, network)', async () => {
    const request = jest.fn().mockRejectedValue(new Error('timeout of 30000ms exceeded'));

    await expect(retryOnRateLimit(request, { sleep })).rejects.toThrow('timeout');

    expect(request).toHaveBeenCalledTimes(1);
  });
});
