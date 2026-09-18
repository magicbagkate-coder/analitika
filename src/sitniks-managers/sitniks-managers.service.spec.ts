import { Test } from '@nestjs/testing';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import { SitniksManagersService } from './sitniks-managers.service';
import type { ListManagersResponse } from './sitniks-managers.types';

describe('SitniksManagersService', () => {
  let service: SitniksManagersService;
  let client: { get: jest.Mock };

  beforeEach(async () => {
    client = { get: jest.fn() };
    const module = await Test.createTestingModule({
      providers: [SitniksManagersService, { provide: SitniksClientService, useValue: client }],
    }).compile();
    service = module.get(SitniksManagersService);
  });

  it('flattens each manager\'s nested user.fullname into a plain name field', async () => {
    const response: ListManagersResponse = {
      data: [
        { id: 1, user: { fullname: 'Ольга Шульц' } },
        { id: 2, user: { fullname: 'Аня' } },
      ],
      count: 2,
    };
    client.get.mockResolvedValue(response);

    const managers = await service.listManagers();

    expect(client.get).toHaveBeenCalledWith('/open-api/managers', { limit: 100 });
    expect(managers).toEqual([
      { id: 1, name: 'Ольга Шульц' },
      { id: 2, name: 'Аня' },
    ]);
  });

  it('builds an id-to-name lookup map', async () => {
    client.get.mockResolvedValue({ data: [{ id: 7, user: { fullname: 'Ірина' } }], count: 1 });

    const byId = await service.loadNameById();

    expect(byId.get(7)).toBe('Ірина');
  });
});
