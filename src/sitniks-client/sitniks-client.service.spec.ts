import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';
import { SitniksClientService } from './sitniks-client.service';

function rateLimited(): Error {
  return Object.assign(new Error('Request failed with status code 429'), { response: { status: 429, headers: {} } });
}

describe('SitniksClientService', () => {
  let service: SitniksClientService;
  let httpService: { get: jest.Mock; post: jest.Mock; put: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers();
    httpService = { get: jest.fn(), post: jest.fn(), put: jest.fn() };

    const module = await Test.createTestingModule({
      providers: [
        SitniksClientService,
        { provide: HttpService, useValue: httpService },
        { provide: AppConfigService, useValue: { getSitniksApiUrl: () => 'https://sitniks.test', getSitniksApiKey: () => 'secret' } },
      ],
    }).compile();
    service = module.get(SitniksClientService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('sends the request to the base url with the bearer token', async () => {
    httpService.get.mockReturnValue(of({ data: { count: 1 } }));

    await expect(service.get('/open-api/chats', { limit: 1 })).resolves.toEqual({ count: 1 });

    expect(httpService.get).toHaveBeenCalledWith('https://sitniks.test/open-api/chats', expect.objectContaining({ headers: { Authorization: 'Bearer secret' }, params: { limit: 1 } }));
  });

  it('waits and repeats a GET that hit the rate limit instead of failing the chat', async () => {
    httpService.get.mockReturnValueOnce(throwError(() => rateLimited())).mockReturnValue(of({ data: 'ok' }));

    const pending = service.get('/open-api/chats/1/messages');
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toBe('ok');
    expect(httpService.get).toHaveBeenCalledTimes(2);
  });

  it('does the same for a PUT (tagging a chat)', async () => {
    httpService.put.mockReturnValueOnce(throwError(() => rateLimited())).mockReturnValue(of({ data: undefined }));

    const pending = service.put('/open-api/chats/1', { tags: [] });
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(pending).resolves.toBeUndefined();
    expect(httpService.put).toHaveBeenCalledTimes(2);
  });
});
