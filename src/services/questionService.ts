import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import type { DistributiveOmit, DistributivePartial, Question } from '../types';

export function answerLength(answer: string): number {
  return answer.replace(/\s/g, '').length;
}

export async function uploadQuestionImage(file: File, scope = 'misc'): Promise<string> {
  const path = `questions/${scope}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function uploadProblemCaseFile(file: File, scope = 'misc'): Promise<string> {
  const path = `problemCases/${scope}/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function createQuestion(data: DistributiveOmit<Question, 'id' | 'createdAt'>): Promise<string> {
  const docRef = await addDoc(collection(db, 'questions'), {
    ...data,
    createdAt: Date.now(),
  });
  return docRef.id;
}

export async function updateQuestion(id: string, updates: DistributivePartial<Question>): Promise<void> {
  await updateDoc(doc(db, 'questions', id), updates);
}

export async function deleteQuestion(id: string): Promise<void> {
  await deleteDoc(doc(db, 'questions', id));
}

export async function getQuestion(id: string): Promise<Question | null> {
  const snap = await getDoc(doc(db, 'questions', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as DistributiveOmit<Question, 'id'>) };
}

export function listenQuestions(cb: (questions: Question[]) => void): () => void {
  const q = query(collection(db, 'questions'), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as DistributiveOmit<Question, 'id'>) })));
  });
}
