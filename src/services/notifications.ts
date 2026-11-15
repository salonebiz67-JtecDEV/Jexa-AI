import { LocalNotifications, Weekday } from '@capacitor/local-notifications';
import { ScheduleItem } from '../../shared/types';
import { isAppInBackground, isNative } from '../utils/platform';

export type NotificationPermissionState = 'granted' | 'denied' | 'default' | 'unsupported';

const REPLY_CHANNEL_ID = 'jexa_replies';
const REMINDER_CHANNEL_ID = 'jexa_reminders';
const REMINDER_ID_MIN = 500000;
const REMINDER_ID_MAX = 899999;

const OPEN_CONVERSATION_EVENT = 'jexa:open-conversation';

let channelsInitialized = false;
let webReminderInterval: ReturnType<typeof setInterval> | null = null;
let lastWebReminderMinuteKey = '';
let activeWebSchedules: ScheduleItem[] = [];

/**
 * Generates a deterministic positive 32-bit integer notification ID safe for Android.
 */
function toSafeIntId(seed: string, offset: number, range: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return offset + ((hash >>> 0) % range);
}

function mapNativePermissionState(display?: string): NotificationPermissionState {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

async function ensureNativeChannels(): Promise<void> {
  if (!isNative() || channelsInitialized) return;
  channelsInitialized = true;

  try {
    await LocalNotifications.createChannel({
      id: REPLY_CHANNEL_ID,
      name: 'JEXA Replies',
      description: 'Notifications when JEXA finishes replying in the background',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
    await LocalNotifications.createChannel({
      id: REMINDER_CHANNEL_ID,
      name: 'Scheduled Reminders',
      description: 'Scheduled task reminders configured in JEXA',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    // Channel creation only applies on Android 8+
  }
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (isNative()) {
    try {
      const status = await LocalNotifications.checkPermissions();
      return mapNativePermissionState(status.display);
    } catch {
      return 'default';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (isNative()) {
    try {
      const result = await LocalNotifications.requestPermissions();
      const mapped = mapNativePermissionState(result.display);
      if (mapped === 'granted') {
        await ensureNativeChannels();
      }
      return mapped;
    } catch {
      return 'denied';
    }
  }

  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const result = await window.Notification.requestPermission();
    return result;
  } catch {
    return window.Notification.permission;
  }
}

export function emitOpenConversation(conversationId: string): void {
  if (typeof window === 'undefined' || !conversationId) return;
  window.dispatchEvent(new CustomEvent(OPEN_CONVERSATION_EVENT, { detail: { conversationId } }));
}

export function registerNotificationTapListener(
  onOpenConversation: (conversationId: string) => void
): () => void {
  const handleWindowOpen = (e: Event) => {
    const convId = (e as CustomEvent<{ conversationId?: string }>).detail?.conversationId;
    if (convId) {
      onOpenConversation(convId);
    }
  };

  if (typeof window !== 'undefined') {
    window.addEventListener(OPEN_CONVERSATION_EVENT, handleWindowOpen);
  }

  let nativeHandle: { remove: () => Promise<void> } | null = null;
  let disposed = false;

  if (isNative()) {
    void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
      const extra = action?.notification?.extra;
      const conversationId =
        typeof extra?.conversationId === 'string' ? extra.conversationId : undefined;
      if (conversationId) {
        onOpenConversation(conversationId);
      }
    })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
        } else {
          nativeHandle = handle;
        }
      })
      .catch(() => {
        // Ignore listener errors
      });
  }

  return () => {
    disposed = true;
    if (typeof window !== 'undefined') {
      window.removeEventListener(OPEN_CONVERSATION_EVENT, handleWindowOpen);
    }
    if (nativeHandle) {
      void nativeHandle.remove();
      nativeHandle = null;
    }
  };
}

function formatNotificationPreview(content: string): string {
  const normalized = (content || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*#_`~>\[\]]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!normalized) return 'Tap to view response';
  return normalized.slice(0, 80);
}

/**
 * Notifies the user when a reply finishes while the app is in the background.
 */
export async function notifyReplyReceived(params: {
  conversationId: string;
  content: string;
}): Promise<void> {
  if (!params.conversationId) return;
  if (!isAppInBackground()) return;

  const perm = await getNotificationPermissionState();
  if (perm !== 'granted') return;

  const body = formatNotificationPreview(params.content);

  if (isNative()) {
    try {
      await ensureNativeChannels();
      const id = toSafeIntId(`${params.conversationId}:${Date.now()}`, 100000, 399999);
      await LocalNotifications.schedule({
        notifications: [
          {
            id,
            title: 'JEXA replied',
            body,
            channelId: REPLY_CHANNEL_ID,
            autoCancel: true,
            isExactNotification: false,
            schedule: {
              at: new Date(Date.now() + 200),
              allowWhileIdle: true,
            },
            extra: {
              type: 'chat_reply',
              conversationId: params.conversationId,
            },
          },
        ],
      });
    } catch (err) {
      console.warn('[Notifications] Failed to schedule native reply notification:', err);
    }
    return;
  }

  if (typeof window !== 'undefined' && 'Notification' in window) {
    try {
      const n = new window.Notification('JEXA replied', {
        body,
        tag: `jexa-reply-${params.conversationId}`,
      });
      n.onclick = () => {
        try {
          window.focus();
        } catch {
          // ignore
        }
        emitOpenConversation(params.conversationId);
        n.close();
      };
    } catch (err) {
      console.warn('[Notifications] Failed to show web notification:', err);
    }
  }
}

function parseScheduleTime(timeStr: string): { hour: number; minute: number } {
  const cleaned = (timeStr || '').trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!match) {
    return { hour: 8, minute: 0 };
  }

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (meridiem === 'PM' && hour < 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 8,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0,
  };
}

function checkWebSchedules(): void {
  if (isNative() || typeof window === 'undefined' || !('Notification' in window)) return;
  if (window.Notification.permission !== 'granted') return;

  const now = new Date();
  const minuteKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  if (minuteKey === lastWebReminderMinuteKey) return;
  lastWebReminderMinuteKey = minuteKey;

  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon ... 6 = Sat

  for (const item of activeWebSchedules) {
    if (!item.active) continue;
    const { hour, minute } = parseScheduleTime(item.time);
    if (hour !== currentHour || minute !== currentMinute) continue;

    const freqLower = (item.frequency || '').toLowerCase();
    if (freqLower.includes('monday') && currentDay !== 1) continue;
    if (freqLower.includes('weekday') && (currentDay === 0 || currentDay === 6)) continue;

    try {
      new window.Notification('JEXA Reminder', {
        body: item.title,
        tag: `jexa-schedule-${item.id}`,
      });
    } catch {
      // ignore
    }
  }
}

/**
 * Syncs Schedule reminders cleanly: uses Capacitor LocalNotifications on native Android
 * and a lightweight minute-checker with browser Notifications on the web.
 */
export async function syncScheduleReminders(schedules: ScheduleItem[]): Promise<void> {
  if (isNative()) {
    try {
      const pending = await LocalNotifications.getPending();
      const existingReminderIds = pending.notifications
        .map((n) => n.id)
        .filter((id) => id >= REMINDER_ID_MIN && id <= REMINDER_ID_MAX);

      if (existingReminderIds.length > 0) {
        await LocalNotifications.cancel({
          notifications: existingReminderIds.map((id) => ({ id })),
        });
      }

      const activeItems = schedules.filter((s) => s.active);
      if (activeItems.length === 0) return;

      const perm = await getNotificationPermissionState();
      if (perm !== 'granted') return;

      await ensureNativeChannels();

      const notificationsToSchedule = activeItems.map((item) => {
        const { hour, minute } = parseScheduleTime(item.time);
        const freqLower = (item.frequency || '').toLowerCase();
        const isWeeklyMonday = freqLower.includes('monday');

        return {
          id: toSafeIntId(item.id, REMINDER_ID_MIN, REMINDER_ID_MAX - REMINDER_ID_MIN),
          title: 'JEXA Reminder',
          body: item.title,
          channelId: REMINDER_CHANNEL_ID,
          autoCancel: true,
          isExactNotification: false,
          schedule: {
            on: isWeeklyMonday
              ? { weekday: Weekday.Monday, hour, minute }
              : { hour, minute },
            allowWhileIdle: true,
          },
          extra: {
            type: 'schedule',
            scheduleId: item.id,
          },
        };
      });

      await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    } catch (err) {
      console.warn('[Notifications] Failed to sync native schedule reminders:', err);
    }
    return;
  }

  activeWebSchedules = schedules.filter((s) => s.active);
  if (activeWebSchedules.length > 0 && !webReminderInterval && typeof window !== 'undefined') {
    webReminderInterval = setInterval(checkWebSchedules, 30000);
  } else if (activeWebSchedules.length === 0 && webReminderInterval) {
    clearInterval(webReminderInterval);
    webReminderInterval = null;
  }
}
