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
import { db } from '../lib/firebase';
import type { DistributiveOmit, DistributivePartial, Question } from '../types';

export function answerLength(answer: string): number {
  return answer.replace(/\s/g, '').length;
}

// ---------------------------------------------------------------------------
// Question images
//
// Uploaded images live in Firestore, not Firebase Storage: Storage needs the
// paid Blaze plan on new projects, and on the production project it was never
// provisioned, so every upload failed and questions were saved without their
// images. Each image is compressed in the browser and stored as a data: URL in
// its own `questionImages` doc (kept apart from the question so the question
// bank listener doesn't pull every image). The question then holds a
// `qimg:<docId>` reference in its usual imageUrl / imageUrls / fileUrls field;
// plain https:// links pasted by URL are stored unchanged.
//
// questionImages is admin-only, like questions. Contestants never read it:
// when a question goes live the admin client resolves the references and
// writes the actual image data into the Realtime Database projection.
// ---------------------------------------------------------------------------

const IMAGE_REF_PREFIX = 'qimg:';
// Firestore caps a document at 1 MiB; stay well under it.
const MAX_IMAGE_DATA_LENGTH = 700_000;
const MAX_IMAGE_DIMENSION = 1600;

export function isStoredImageRef(src: string): boolean {
  return src.startsWith(IMAGE_REF_PREFIX);
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/** Downscales and re-encodes as JPEG until the data URL fits in a Firestore doc. */
async function compressImage(file: File): Promise<string> {
  const img = await loadImage(file);
  let maxDim = MAX_IMAGE_DIMENSION;
  for (let attempt = 0; attempt < 8; attempt++) {
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('This browser cannot process images.');
    // JPEG has no transparency; give transparent PNGs a white background
    // instead of black.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55]) {
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      if (dataUrl.length <= MAX_IMAGE_DATA_LENGTH) return dataUrl;
    }
    maxDim = Math.round(maxDim * 0.75);
  }
  throw new Error('That image is too large, even after compressing it. Try a smaller image.');
}

async function storeImage(file: File, scope: string): Promise<string> {
  const data = await compressImage(file);
  const docRef = await addDoc(collection(db, 'questionImages'), {
    data,
    scope,
    fileName: file.name,
    createdAt: Date.now(),
  });
  return IMAGE_REF_PREFIX + docRef.id;
}

export function uploadQuestionImage(file: File, scope = 'misc'): Promise<string> {
  return storeImage(file, `questions/${scope}`);
}

export function uploadProblemCaseFile(file: File, scope = 'misc'): Promise<string> {
  return storeImage(file, `problemCases/${scope}`);
}

const resolvedImages = new Map<string, Promise<string | null>>();

/**
 * Turns an image reference into something an <img> can show: a `qimg:` ref
 * becomes its stored data URL (null if the image doc is gone), anything else
 * is returned as-is.
 */
export function resolveImageSrc(src: string): Promise<string | null> {
  if (!isStoredImageRef(src)) return Promise.resolve(src);
  let pending = resolvedImages.get(src);
  if (!pending) {
    pending = getDoc(doc(db, 'questionImages', src.slice(IMAGE_REF_PREFIX.length)))
      .then((snap) => (snap.exists() ? (snap.data().data as string) : null))
      .catch((err) => {
        // Don't cache failures - a later attempt (e.g. after reconnecting) may work.
        resolvedImages.delete(src);
        throw err;
      });
    resolvedImages.set(src, pending);
  }
  return pending;
}

/** Resolves a list of references, dropping any that no longer exist. */
export async function resolveImageSrcs(srcs: string[]): Promise<string[]> {
  const resolved = await Promise.all(srcs.map(resolveImageSrc));
  return resolved.filter((s): s is string => !!s);
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
