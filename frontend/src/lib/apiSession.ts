/** Transport lifecycle only. Authentication owns it; no Query dependency here. */
export type ApiSession = { id: number; userId: string; reads: AbortController; active: boolean };
let current: ApiSession | null = null;
let sequence = 0;

export function beginApiSession(userId: string): ApiSession {
  if (current) endApiSession(current);
  current = { id: ++sequence, userId, reads: new AbortController(), active: true };
  return current;
}

export function endApiSession(session: ApiSession) {
  session.active = false;
  if (current === session) current = null;
  session.reads.abort();
}

export const getApiSession = () => current;
export const isCurrentApiSession = (session: ApiSession | null) =>
  session !== null && session.active && session === current;
