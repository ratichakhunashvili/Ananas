import { addDoc, collection, serverTimestamp, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { AuditAction, AuditLogEntry } from '../types';

export interface LogAuditInput {
  gameId: string;
  action: AuditAction;
  actorUid: string;
  actorName: string;
  payload?: Record<string, unknown>;
}

export async function logAudit(input: LogAuditInput): Promise<void> {
  if (!input.gameId) return;
  await addDoc(collection(db, 'games', input.gameId, 'auditLog'), {
    action: input.action,
    actorUid: input.actorUid,
    actorName: input.actorName,
    payload: input.payload ?? {},
    timestamp: serverTimestamp(),
  });
}

export function listenAuditLog(gameId: string, cb: (entries: AuditLogEntry[]) => void): () => void {
  const q = query(collection(db, 'games', gameId, 'auditLog'), orderBy('timestamp', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(
      snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AuditLogEntry, 'id'>),
      }))
    );
  });
}
