import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { acceptInvitation } from './repositories/invitations';

/** Build a shareable invite deep link for a token, e.g. splitsmart://invite?token=… */
export function inviteUrl(token: string): string {
  return Linking.createURL('invite', { queryParams: { token } });
}

/**
 * Handle incoming `…/invite?token=…` deep links: accept the invitation and
 * navigate into the joined group. Mounted inside the authenticated tree, so a
 * cold-start link opened while signed-out is processed once the user has
 * logged in and this tree mounts (getInitialURL still returns that link).
 */
export function useInviteLink() {
  const router = useRouter();
  const processed = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handle = async (url: string | null) => {
      if (!url) return;
      const { path, queryParams } = Linking.parse(url);
      const isInvite = (path ?? '').replace(/^\/+/, '') === 'invite';
      const token =
        typeof queryParams?.token === 'string' ? queryParams.token : null;
      if (!isInvite || !token || processed.current.has(token)) return;

      processed.current.add(token);
      try {
        const groupId = await acceptInvitation(token);
        router.push(`/groups/${groupId}`);
      } catch (e) {
        Alert.alert('Invitation', (e as Error).message);
      }
    };

    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => sub.remove();
  }, [router]);
}
