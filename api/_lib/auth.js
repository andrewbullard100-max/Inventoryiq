// Shared auth helper used by every API handler except health.js.
//
// Every API function runs with the Supabase SERVICE ROLE key (see supabase.js), which
// bypasses Row Level Security entirely. That means RLS policies are NOT the enforcement
// boundary for this app -- this file is. Each handler calls requireAuth(req, supabase)
// first, gets back { userId, email, orgId, role }, and is responsible for (a) checking
// role where an action is manager-only, and (b) filtering/verifying every row it
// reads/writes by that orgId. There is no automatic enforcement beyond this -- it has to
// be applied at each call site.
//
// "Auth" here deliberately stays simple, per product decision: Supabase Auth for identity,
// exactly two roles per organization ('manager' | 'counter'), no finer-grained permissions.

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

// Verifies the bearer token in the Authorization header against Supabase Auth. Does NOT
// require the user to already belong to an organization -- a freshly-signed-up account
// legitimately has no membership yet (it's about to redeem an invite/join code). Handlers
// that need org context call requireOrgMembership() on the result; requireAuth alone is
// enough for actions like "who am I" and "redeem this join code".
async function requireAuth(req, supabase) {
  const header = req.headers.authorization || req.headers.Authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (!token) throw new HttpError(401, 'Not signed in');

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) throw new HttpError(401, 'Your session has expired -- please sign in again');
  const user = userData.user;

  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .maybeSingle();

  if (memErr) throw new HttpError(500, 'Failed to look up organization membership');

  return {
    userId: user.id,
    email: user.email,
    orgId: membership?.organization_id ?? null,
    role: membership?.role ?? null,
  };
}

// Call from any handler that needs the caller to actually belong to an org (i.e. almost
// every handler except "me" and "redeem-join-code"). Throws 403 if they don't yet.
function requireOrgMembership(auth) {
  if (!auth.orgId) throw new HttpError(403, 'Your account isn\'t part of an organization yet -- use an invite link or join code');
}

// Call after requireOrgMembership for actions only a manager should be able to do (catalog
// edits, sites/areas, settings, inviting/removing people, viewing/exporting orders).
function requireManager(auth) {
  if (auth.role !== 'manager') throw new HttpError(403, 'Only managers can do this');
}

// Standard error -> response translation, shared by every handler's catch block.
function respondToAuthError(res, err) {
  if (err instanceof HttpError) { res.status(err.statusCode).json({ error: err.message }); return true; }
  return false;
}

export { requireAuth, requireOrgMembership, requireManager, respondToAuthError, HttpError };
