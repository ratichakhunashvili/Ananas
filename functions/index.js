const { randomInt } = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');

initializeApp();

const db = getFirestore();
const passwordAlphabet = 'abcdefghjkmnpqrstuvwxyz23456789';

function generatePassword(length = 10) {
  return Array.from({ length }, () => passwordAlphabet[randomInt(passwordAlphabet.length)]).join('');
}

exports.resetTeamPassword = onCall({ region: 'us-central1' }, async (request) => {
  const adminUid = request.auth?.uid;
  if (!adminUid) {
    throw new HttpsError('unauthenticated', 'Sign in as an admin to reset a team password.');
  }

  const { gameId, teamId } = request.data ?? {};
  if (typeof gameId !== 'string' || !gameId || typeof teamId !== 'string' || !teamId) {
    throw new HttpsError('invalid-argument', 'A game ID and team ID are required.');
  }

  try {
    const adminSnap = await db.collection('users').doc(adminUid).get();
    if (!adminSnap.exists || adminSnap.data().role !== 'admin' || adminSnap.data().disabled) {
      throw new HttpsError('permission-denied', 'Only an active admin can reset team passwords.');
    }

    const teamRef = db.collection('games').doc(gameId).collection('teams').doc(teamId);
    const teamSnap = await teamRef.get();
    const team = teamSnap.data();
    if (!teamSnap.exists || team.disabled || typeof team.uid !== 'string' || !team.uid) {
      throw new HttpsError('not-found', 'This team does not have an active login.');
    }

    const profileSnap = await db.collection('users').doc(team.uid).get();
    const profile = profileSnap.data();
    if (
      !profileSnap.exists ||
      profile.role !== 'team' ||
      profile.disabled ||
      profile.gameId !== gameId ||
      profile.teamId !== teamId
    ) {
      throw new HttpsError('failed-precondition', 'The team login is not active or does not match this team.');
    }

    const password = generatePassword();
    await getAuth().updateUser(team.uid, { password });

    try {
      await db.collection('games').doc(gameId).collection('auditLog').add({
        action: 'TEAM_PASSWORD_RESET',
        actorUid: adminUid,
        actorName: adminSnap.data().displayName || 'Admin',
        payload: { teamId, teamName: team.name, username: team.username },
        timestamp: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logger.error('Password was reset, but its audit entry could not be written.', {
        gameId,
        teamId,
        adminUid,
        error,
      });
    }

    return { password };
  } catch (error) {
    if (error instanceof HttpsError) throw error;
    logger.error('Team password reset failed.', { gameId, teamId, adminUid, error });
    throw new HttpsError('internal', 'Could not reset this team password. Please try again.');
  }
});
