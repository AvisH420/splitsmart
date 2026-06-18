import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './auth-context';
import { upsertPushToken } from './repositories/notifications';

/**
 * Registers the device for push notifications once the user is authenticated,
 * stores the Expo push token, and deep-links to the relevant group when a
 * notification is tapped. Safe to call unconditionally - it no-ops until a
 * session exists and swallows the errors that occur on simulators / when no
 * EAS projectId is configured (push tokens require a real device + project).
 */
export function usePushNotifications() {
  const { session } = useAuth();
  const router = useRouter();
  const registeredFor = useRef<string | null>(null);

  // Register + store the token whenever the signed-in user changes.
  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId || registeredFor.current === userId) return;
    registeredFor.current = userId;

    (async () => {
      try {
        if (Platform.OS === 'android') {
          await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.DEFAULT,
          });
        }

        const existing = await Notifications.getPermissionsAsync();
        let status = existing.status;
        if (status !== 'granted') {
          const requested = await Notifications.requestPermissionsAsync();
          status = requested.status;
        }
        if (status !== 'granted') return;

        const projectId =
          Constants?.expoConfig?.extra?.eas?.projectId ??
          Constants?.easConfig?.projectId;

        const tokenResponse = await Notifications.getExpoPushTokenAsync(
          projectId ? { projectId } : undefined
        );
        await upsertPushToken(userId, tokenResponse.data);
      } catch (e) {
        // Expected on simulators / without an EAS projectId - non-fatal.
        console.warn('Push registration skipped:', (e as Error).message);
      }
    })();
  }, [session?.user?.id]);

  // Deep-link to the group referenced by a tapped notification.
  useEffect(() => {
    const navigateFromData = (data: unknown) => {
      const groupId = (data as { group_id?: string } | undefined)?.group_id;
      if (groupId) router.push(`/groups/${groupId}`);
    };

    // Cold start: app opened by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) navigateFromData(response.notification.request.content.data);
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      navigateFromData(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, [router]);
}
