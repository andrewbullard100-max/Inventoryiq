// GET /api/health
// Quick check that the required environment variables are present in this
// deployment. Never returns the actual secret values — just whether each is set.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const checks = {
    ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
    SUPABASE_URL: Boolean(process.env.SUPABASE_URL),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  };

  const allOk = Object.values(checks).every(Boolean);

  res.status(allOk ? 200 : 500).json({
    status: allOk ? 'ok' : 'missing_env_vars',
    checks,
  });
};
