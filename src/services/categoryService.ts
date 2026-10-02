import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import type { Category } from '../types';

export async function createCategory(name: string): Promise<string> {
  const docRef = await addDoc(collection(db, 'categories'), {
    name: name.trim(),
    createdAt: Date.now(),
  });
  return docRef.id;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await updateDoc(doc(db, 'categories', id), { name: name.trim() });
}

/**
 * Clears the category off its questions before removing it, so they fall back
 * to "no category" instead of pointing at a tombstone (which rendered as a
 * blank cell and silently broke category filtering).
 */
export async function deleteCategory(id: string): Promise<void> {
  const affected = await getDocs(query(collection(db, 'questions'), where('categoryId', '==', id)));
  if (!affected.empty) {
    const batch = writeBatch(db);
    affected.docs.forEach((d) => batch.update(d.ref, { categoryId: null }));
    await batch.commit();
  }
  await deleteDoc(doc(db, 'categories', id));
}

export function listenCategories(cb: (categories: Category[]) => void): () => void {
  const q = query(collection(db, 'categories'), orderBy('name', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Category, 'id'>) })));
  });
}
