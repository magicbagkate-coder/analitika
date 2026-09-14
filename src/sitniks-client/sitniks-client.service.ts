import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AppConfigService } from '../config/app-config.service';

type QueryParams = Record<string, string | number | boolean | string[] | undefined>;

// axios has no timeout by default (waits forever) — a single hung Sitniks request once stalled
// an entire report run with no error, no log, nothing (2026-09-14). Every request needs a bound.
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Low-level HTTP client for the Sitniks CRM open API: base URL and Bearer auth
 * in one place so every per-node module (chats, messages, notes, ...) stays
 * about its own endpoint, not about auth headers.
 */
@Injectable()
export class SitniksClientService {
  constructor(
    private readonly httpService: HttpService,
    private readonly appConfig: AppConfigService,
  ) {}

  async get<Response>(path: string, params?: QueryParams): Promise<Response> {
    const response = await firstValueFrom(
      this.httpService.get<Response>(this.buildUrl(path), { headers: this.buildHeaders(), params, timeout: REQUEST_TIMEOUT_MS }),
    );
    return response.data;
  }

  async post<Response, Body>(path: string, body: Body): Promise<Response> {
    const response = await firstValueFrom(
      this.httpService.post<Response>(this.buildUrl(path), body, { headers: this.buildHeaders(), timeout: REQUEST_TIMEOUT_MS }),
    );
    return response.data;
  }

  async put<Response, Body>(path: string, body: Body): Promise<Response> {
    const response = await firstValueFrom(
      this.httpService.put<Response>(this.buildUrl(path), body, { headers: this.buildHeaders(), timeout: REQUEST_TIMEOUT_MS }),
    );
    return response.data;
  }

  private buildUrl(path: string): string {
    return `${this.appConfig.getSitniksApiUrl()}${path}`;
  }

  private buildHeaders(): Record<string, string> {
    return { Authorization: `Bearer ${this.appConfig.getSitniksApiKey()}` };
  }
}
