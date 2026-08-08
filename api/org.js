// /api/org
//
// Consolidated (like count-session.js) to stay within Vercel Hobby's 12-Serverless-Function
// cap -- see the comment at the top of count-session.js for why this project consolidates
// related endpoints into one action-routed file instead of one file per action.
//
// GET  /api/org?action=me
//   -> who the caller is: their org, their role, their email. The frontend calls this once
//      after sign-in to decide what to render.
//
// GET  /api/org?action=members
//   -> manager-only. Lists everyone in the caller's organization with their role.
//
// POST /api/org   body: { action: "invite-email", email, role }
//   -> manager-only. Sends a Supabase Auth invite email; the invited person clicks the
//      link, sets a password, and is already a member of this org with this role when they
//      land back in the app.
//
// POST /api/org   body: { action: "create-join-code", role, expiresInHours? }
//   -> manager-only. Mints a short shareable code for this org + role (default: expires in
//      7 days). Meant for quickly onboarding shift-based staff without an email round trip.
//
// POST /api/org   body: { action: "redeem-join-code", code }
//   -> any signed-in user with no existing organization membership. Joins them to the
//      code's org with the code's role.
//
// POST /api/org   body: { action: "update-role", userId, role }
// POST /api/org   body: { action: "remove-member", userId }
//   -> manager-only. Both refuse to demote/remove the organization's last manager, so an
//      org can never end up with zero managers.

import { getSupabaseAdmin } from './_lib/supabase.js';
import { requireAuth, requireOrgMembership, requireManager, respondToAuthError, HttpError } from './_lib/auth.js';

async function countManagers(supabase, orgId) {
  const { count, error } = await supabase
    .from('organization_members')
    .select('user_id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('role', 'manager');
  if (error) throw new HttpError(500, 'Failed to check manager count');
  return count || 0;
}

async function handleMe(req, res, supabase, auth) {
  if (!auth.orgId) { res.status(200).json({ userId: auth.userId, email: auth.email, orgId: null, orgName: null, role: null }); return; }
  const { data: org, error } = await supabase.from('organizations').select('name').eq('id', auth.orgId).single();
  if (error) throw new HttpError(500, 'Failed to load organization');
  res.status(200).json({ userId: auth.userId, email: auth.email, orgId: auth.orgId, orgName: org.name, role: auth.role });
}

async function handleMembers(req, res, supabase, auth) {
  requireOrgMembership(auth);
  requireManager(auth);
  const { data: members, error } = await supabase
    .from('organization_members')
    .select('user_id, role, created_at')
    .eq('organization_id', auth.orgId)
    .order('created_at', { ascending: true });
  if (error) throw new HttpError(500, 'Failed to load members');

  // organization_members doesn't store email (that lives on auth.users) -- look each one up.
  // Fine at pilot team sizes; would want a view/join if this org ever has hundreds of members.
  const withEmails = await Promise.all((members || []).map(async (m) => {
    const { data } = await supabase.auth.admin.getUserById(m.user_id);
    return { userId: m.user_id, role: m.role, joinedAt: m.created_at, email: data?.user?.email || '(unknown)' };
  }));
  res.status(200).json({ members: withEmails });
}

async function handleInviteEmail(req, res, supabase, auth) {
  requireOrgMembership(auth);
  requireManager(auth);
  const { email, role } = req.body || {};
  if (!email || typeof email !== 'string') throw new HttpError(400, 'email is required');
  if (role !== 'manager' && role !== 'counter') throw new HttpError(400, 'role must be "manager" or "counter"');

  const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(email);
  if (inviteErr) throw new HttpError(500, `Failed to send invite: ${inviteErr.message}`);

  const { error: memErr } = await supabase
    .from('organization_members')
    .insert({ organization_id: auth.orgId, user_id: invited.user.id, role });
  if (memErr) throw new HttpError(500, `Invite sent, but failed to add them to the organization: ${memErr.message}`);

  res.status(200).json({ invited: true, email, role });
}

function generateJoinCode() {
  return Math.random().toString(36).slice(2, 10).toUpperCase();
}

async function handleCreateJoinCode(req, res, supabase, auth) {
  requireOrgMembership(auth);
  requireManager(auth);
  const { role, expiresInHours } = req.body || {};
  if (role !== 'manager' && role !== 'counter') throw new HttpError(400, 'role must be "manager" or "counter"');

  const code = generateJoinCode();
  const expiresAt = new Date(Date.now() + (Number(expiresInHours) > 0 ? Number(expiresInHours) : 24 * 7) * 3600 * 1000).toISOString();

  const { error } = await supabase.from('organization_join_codes').insert({
    code, organization_id: auth.orgId, role, created_by: auth.userId, expires_at: expiresAt,
  });
  if (error) throw new HttpError(500, `Failed to create join code: ${error.message}`);

  res.status(200).json({ code, role, expiresAt });
}

async function handleRedeemJoinCode(req, res, supabase, auth) {
  const { code } = req.body || {};
  if (!code || typeof code !== 'string') throw new HttpError(400, 'code is required');

  // One org per user for now, matching the "keep it simple" scope -- see auth.js.
  const { data: existingMembership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', auth.userId).maybeSingle();
  if (existingMembership) throw new HttpError(409, 'This account already belongs to an organization');

  const { data: joinCode, error: jcErr } = await supabase
    .from('organization_join_codes').select('organization_id, role, expires_at, revoked')
    .eq('code', code.trim().toUpperCase()).maybeSingle();
  if (jcErr) throw new HttpError(500, 'Failed to look up join code');
  if (!joinCode) throw new HttpError(404, 'That join code was not found');
  if (joinCode.revoked) throw new HttpError(410, 'That join code has been revoked');
  if (joinCode.expires_at && new Date(joinCode.expires_at) < new Date()) throw new HttpError(410, 'That join code has expired');

  const { error: insertErr } = await supabase
    .from('organization_members')
    .insert({ organization_id: joinCode.organization_id, user_id: auth.userId, role: joinCode.role });
  if (insertErr) throw new HttpError(500, `Failed to join organization: ${insertErr.message}`);

  res.status(200).json({ joined: true, orgId: joinCode.organization_id, role: joinCode.role });
}

async function handleUpdateRole(req, res, supabase, auth) {
  requireOrgMembership(auth);
  requireManager(auth);
  const { userId, role } = req.body || {};
  if (!userId) throw new HttpError(400, 'userId is required');
  if (role !== 'manager' && role !== 'counter') throw new HttpError(400, 'role must be "manager" or "counter"');

  if (role === 'counter') {
    const { data: target } = await supabase
      .from('organization_members').select('role').eq('organization_id', auth.orgId).eq('user_id', userId).maybeSingle();
    if (target?.role === 'manager' && (await countManagers(supabase, auth.orgId)) <= 1) {
      throw new HttpError(409, 'Cannot demote the last manager -- promote someone else first');
    }
  }

  const { error } = await supabase
    .from('organization_members').update({ role }).eq('organization_id', auth.orgId).eq('user_id', userId);
  if (error) throw new HttpError(500, `Failed to update role: ${error.message}`);
  res.status(200).json({ updated: true });
}

async function handleRemoveMember(req, res, supabase, auth) {
  requireOrgMembership(auth);
  requireManager(auth);
  const { userId } = req.body || {};
  if (!userId) throw new HttpError(400, 'userId is required');

  const { data: target } = await supabase
    .from('organization_members').select('role').eq('organization_id', auth.orgId).eq('user_id', userId).maybeSingle();
  if (target?.role === 'manager' && (await countManagers(supabase, auth.orgId)) <= 1) {
    throw new HttpError(409, 'Cannot remove the last manager of an organization');
  }

  const { error } = await supabase
    .from('organization_members').delete().eq('organization_id', auth.orgId).eq('user_id', userId);
  if (error) throw new HttpError(500, `Failed to remove member: ${error.message}`);
  res.status(200).json({ removed: true });
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabaseAdmin();
    const auth = await requireAuth(req, supabase);

    if (req.method === 'GET') {
      const { action } = req.query || {};
      if (action === 'me') { await handleMe(req, res, supabase, auth); return; }
      if (action === 'members') { await handleMembers(req, res, supabase, auth); return; }
      res.status(400).json({ error: 'Unknown or missing action. Expected one of: me, members' });
      return;
    }

    if (req.method === 'POST') {
      const { action } = req.body || {};
      if (action === 'invite-email') { await handleInviteEmail(req, res, supabase, auth); return; }
      if (action === 'create-join-code') { await handleCreateJoinCode(req, res, supabase, auth); return; }
      if (action === 'redeem-join-code') { await handleRedeemJoinCode(req, res, supabase, auth); return; }
      if (action === 'update-role') { await handleUpdateRole(req, res, supabase, auth); return; }
      if (action === 'remove-member') { await handleRemoveMember(req, res, supabase, auth); return; }
      res.status(400).json({ error: 'Unknown or missing action. Expected one of: invite-email, create-join-code, redeem-join-code, update-role, remove-member' });
      return;
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    if (respondToAuthError(res, err)) return;
    res.status(500).json({ error: 'Unexpected server error', details: err.message });
  }
}
