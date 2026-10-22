import { z } from 'zod';
import { NOTIFICATION_TYPES } from '../enums';

/** In-app notification as returned by the API. `title` and `body` hold user data (rule and vehicle). */
export const notificationSchema = z.object({
  id: z.string(),
  type: z.enum(NOTIFICATION_TYPES),
  title: z.string(),
  body: z.string().nullable(),
  /** Internal SPA path, e.g. `/vehicles/<id>`. */
  link: z.string().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Notification = z.infer<typeof notificationSchema>;

/** Offset pagination; query strings are coerced to numbers. */
export const notificationListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type NotificationListQuery = z.input<typeof notificationListQuerySchema>;

/** A page of notifications, newest first, with the user's totals (not only the page's). */
export const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  total: z.number().int(),
  unreadCount: z.number().int(),
});
export type NotificationList = z.infer<typeof notificationListSchema>;
