import { Injectable } from '@nestjs/common';
import { SitniksClientService } from '../sitniks-client/sitniks-client.service';
import type { ListManagersResponse, Manager } from './sitniks-managers.types';

/** Wraps GET /open-api/managers — the manager id-to-name lookup, nothing else. */
@Injectable()
export class SitniksManagersService {
  constructor(private readonly sitniksClient: SitniksClientService) {}

  async listManagers(): Promise<Manager[]> {
    const response = await this.sitniksClient.get<ListManagersResponse>('/open-api/managers', { limit: 100 });
    return response.data.map((manager) => ({ id: manager.id, name: manager.user.fullname }));
  }

  async loadNameById(): Promise<Map<number, string>> {
    const managers = await this.listManagers();
    return new Map(managers.map((manager) => [manager.id, manager.name]));
  }
}
