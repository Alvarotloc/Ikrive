import { describe, expect, it } from 'vitest';
import { notificationListQuerySchema } from './notifications';

describe('notificationListQuerySchema', () => {
  it('defaults limit and offset', () => {
    expect(notificationListQuerySchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('coerces query strings', () => {
    expect(notificationListQuerySchema.parse({ limit: '5', offset: '10' })).toEqual({ limit: 5, offset: 10 });
  });

  it('rejects a limit outside 1-100 and a negative offset', () => {
    for (const query of [
      { limit: '0' },
      { limit: '101' },
      { limit: '2.5' },
      { offset: '-1' },
      { limit: 'abc' },
    ]) {
      expect(notificationListQuerySchema.safeParse(query).success).toBe(false);
    }
    expect(notificationListQuerySchema.parse({ limit: '1' }).limit).toBe(1);
    expect(notificationListQuerySchema.parse({ limit: '100' }).limit).toBe(100);
  });
});
