import type { NotificationChannel } from '@ikrive/shared';
import { describe, expect, it } from 'vitest';
import {
  type ChannelFormValues,
  channelFormSchema,
  channelSummary,
  defaultsFrom,
  toCreateBody,
  toUpdateBody,
} from './form';

const values = (
  type: ChannelFormValues['type'],
  config: Partial<ChannelFormValues['config']>,
): ChannelFormValues => ({
  type,
  config: { ...defaultsFrom().config, ...config },
});

const dto = {
  id: 'c1',
  enabled: true,
  hasToken: true,
  lastError: null,
  createdAt: '2026-10-23T08:00:00.000Z',
  updatedAt: '2026-10-23T08:00:00.000Z',
} as const;

describe('toCreateBody', () => {
  it('builds the create body for each type', () => {
    // Fields of other types (typed before switching) and blank optional fields are left out.
    expect(
      toCreateBody(
        values('ntfy', { serverUrl: ' https://ntfy.sh ', topic: 'car', url: 'https://x.example.com' }),
      ),
    ).toEqual({ type: 'ntfy', enabled: true, config: { serverUrl: 'https://ntfy.sh', topic: 'car' } });
    expect(toCreateBody(values('gotify', { serverUrl: 'https://gotify.example.com', token: 'AbC' }))).toEqual(
      {
        type: 'gotify',
        enabled: true,
        config: { serverUrl: 'https://gotify.example.com', token: 'AbC' },
      },
    );
    expect(
      toCreateBody(values('apprise', { serverUrl: 'http://apprise:8000', key: 'ikrive', tag: 'phone' })),
    ).toEqual({
      type: 'apprise',
      enabled: true,
      config: { serverUrl: 'http://apprise:8000', key: 'ikrive', tag: 'phone' },
    });
    expect(toCreateBody(values('webhook', { url: 'https://hooks.example.com/x', token: 's3' }))).toEqual({
      type: 'webhook',
      enabled: true,
      config: { url: 'https://hooks.example.com/x', token: 's3' },
    });
  });
});

describe('toUpdateBody', () => {
  it('omits an empty token from the update body', () => {
    expect(toUpdateBody(values('gotify', { serverUrl: 'https://gotify.example.com', token: '  ' }))).toEqual({
      type: 'gotify',
      config: { serverUrl: 'https://gotify.example.com' },
    });
    expect(toUpdateBody(values('webhook', { url: 'https://hooks.example.com/x', token: 'new' }))).toEqual({
      type: 'webhook',
      config: { url: 'https://hooks.example.com/x', token: 'new' },
    });
  });
});

describe('channelFormSchema', () => {
  it('requires the Gotify token only when creating', () => {
    const gotify = values('gotify', { serverUrl: 'https://gotify.example.com' });
    const created = channelFormSchema('create').safeParse(gotify);
    expect(created.success).toBe(false);
    expect(created.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['config.token']);
    expect(channelFormSchema('edit').safeParse(gotify).success).toBe(true);
  });

  it('reports invalid fields of the selected type only', () => {
    const result = channelFormSchema('create').safeParse(
      values('webhook', { url: 'ftp://example.com', serverUrl: 'not validated' }),
    );
    expect(result.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['config.url']);
  });
});

describe('defaultsFrom', () => {
  it('starts a new channel as ntfy and an edited one with its config and a blank token', () => {
    expect(defaultsFrom()).toEqual(values('ntfy', {}));
    expect(
      defaultsFrom({
        ...dto,
        type: 'apprise',
        config: { serverUrl: 'http://apprise:8000', key: 'k', tag: null },
      }),
    ).toEqual(values('apprise', { serverUrl: 'http://apprise:8000', key: 'k' }));
  });
});

describe('channelSummary', () => {
  it('summarises each channel type', () => {
    const channels: NotificationChannel[] = [
      { ...dto, type: 'ntfy', config: { serverUrl: 'https://ntfy.sh', topic: 'car' } },
      { ...dto, type: 'gotify', config: { serverUrl: 'http://192.168.1.10:8080/gotify' } },
      { ...dto, type: 'apprise', config: { serverUrl: 'http://apprise:8000', key: 'ikrive' } },
      { ...dto, type: 'webhook', config: { url: 'https://hooks.example.com/ikrive?token=x' } },
    ];
    expect(channels.map(channelSummary)).toEqual([
      'ntfy.sh/car',
      '192.168.1.10:8080',
      'apprise:8000/ikrive',
      'hooks.example.com',
    ]);
  });
});
