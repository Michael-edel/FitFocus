import { useEffect, useRef, useState } from 'react';
import { safeSetItem } from '../../storage/hybrid';

export function parseInviteCode(raw: string | null): string {
  return raw ?? '';
}

/** Keeps an invitation code scoped to the active profile without carrying it across sign-in. */
export function useInviteCodeState(userId: string | null | undefined) {
  const [inviteCode, setInviteCode] = useState('');
  const hydratedUserIdRef = useRef<string | null>(null);
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (!userId) {
      hydratedUserIdRef.current = null;
      skipNextSaveRef.current = true;
      setInviteCode('');
      return;
    }
    if (hydratedUserIdRef.current === userId) return;

    const key = `fitfocus_data_${userId}_invite_code`;
    try {
      const next = parseInviteCode(localStorage.getItem(key));
      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setInviteCode(next);
      if (next) safeSetItem(key, next);
    } catch {
      hydratedUserIdRef.current = userId;
      skipNextSaveRef.current = true;
      setInviteCode('');
    }
  }, [userId]);

  useEffect(() => {
    if (!userId || hydratedUserIdRef.current !== userId) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    safeSetItem(`fitfocus_data_${userId}_invite_code`, inviteCode);
  }, [inviteCode, userId]);

  return { inviteCode, setInviteCode };
}
