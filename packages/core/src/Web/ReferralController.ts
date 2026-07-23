import { Request, Response, Router } from 'express';
import { authenticated, setAuthUser } from './Middleware/auth';
import { ToGODerRequest } from './Model/ToGODerRequest';
import { requireAdmin } from './AdminController';
import { getAnalytics } from '../Analytics/AnalyticsService';
import {
  resolveReferralCode,
  getReferralStats,
} from '../Services/ReferralService';
import { getDbContext } from '../Entity/Database';

// ── REFERRAL_LINK_COOKIE ──────────────────────────────────────────
const COOKIE_NAME = 'referrer_code';
const COOKIE_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days

export function GetReferralRouter(): Router {
  const router = Router();

  // GET /ref/:code — set cookie and redirect to homepage
  router.get('/ref/:code', async (req: Request, res: Response) => {
    const { code } = req.params;

    // Validate the referral code exists
    const referrer = await resolveReferralCode(code);
    if (!referrer) {
      // Invalid code — still redirect, just don't set cookie
      return res.redirect('/');
    }

    // analytics: referral_link_clicked
    getAnalytics().trackEvent('referral_link_clicked', {
      source: 'web',
      props: { referrerCode: code },
    });

    // Set cookie and redirect to homepage
    res.cookie(COOKIE_NAME, code, {
      maxAge: COOKIE_MAX_AGE,
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
    });
    res.redirect('/');
  });

  // GET /api/redeem — placeholder for redemption store
  router.get(
    '/api/redeem',
    authenticated,
    setAuthUser,
    async (req: Request, res: Response) => {
      const togoderReq = req as ToGODerRequest;
      const user = togoderReq.togoder_auth?.user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Placeholder — credits redemption store (future version)
      res.json({
        creditsBalance: user.creditsBalance,
        message:
          'Credits can be redeemed for subscription time, premium features, or donation. Redemption store coming soon.',
      });
    },
  );

  // GET /admin/referrals — admin referral dashboard (HTML)
  router.get(
    '/admin/referrals',
    authenticated,
    setAuthUser,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const stats = await getReferralStats();

        // Build tree for all users who are referrers
        const db = getDbContext();
        const allReferrers = await db.user.findMany({
          where: { referralCode: { not: null } },
        });

        const html = renderReferralAdminPage(stats, allReferrers.length);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (err) {
        console.error('[admin] referrals error:', err);
        res.status(500).send('Internal Server Error');
      }
    },
  );

  // GET /api/admin/referrals — admin referral data as JSON
  router.get(
    '/api/admin/referrals',
    authenticated,
    setAuthUser,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const stats = await getReferralStats();
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.json(stats);
      } catch (err) {
        console.error('[admin] api referrals error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  return router;
}

// ── HTML renderer for /admin/referrals ───────────────────────────

function renderReferralAdminPage(stats: any, referrerCount: number): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const referralRows = (stats.referrals || [])
    .map(
      (r: any) =>
        `<tr>
          <td>${esc(r.referrer?.email || r.referrerUserId)}</td>
          <td>${esc(r.referred?.email || r.referredUserId)}</td>
          <td>L${r.level}</td>
          <td>${r.credited ? '✅ Credited' : '⏳ Pending'}</td>
          <td>${new Date(r.createdAt).toISOString()}</td>
        </tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ToGODer Referrals</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #212529; padding: 2rem; }
  h1 { margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
  .card { background: white; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .card h2 { font-size: 0.85rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.5rem; }
  .big-num { font-size: 2.5rem; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; background: white; border-radius: 10px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  th, td { padding: 10px 12px; border-bottom: 1px solid #eee; text-align: left; }
  th { color: #6c757d; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; background: #fafafa; }
  .refresh { margin-bottom: 1rem; }
  .refresh a { color: #2563eb; font-size: 0.85rem; }
  .muted { color: #6c757d; font-size: 0.85rem; }
  .section { margin-top: 2rem; }
  .section h2 { margin-bottom: 0.75rem; }
</style>
</head>
<body>
<h1>🔗 ToGODer Referrals</h1>
<p class="refresh"><a href="/admin/referrals">⟳ Refresh</a> &middot; <span class="muted">${new Date().toISOString()}</span></p>

<div class="grid">
  <div class="card">
    <h2>Total Referrals</h2>
    <div class="big-num">${stats.totalRefs}</div>
  </div>
  <div class="card">
    <h2>Level 1 (Direct)</h2>
    <div class="big-num">${stats.l1Count}</div>
  </div>
  <div class="card">
    <h2>Level 2 (Upstream)</h2>
    <div class="big-num">${stats.l2Count}</div>
  </div>
  <div class="card">
    <h2>Credited</h2>
    <div class="big-num">${stats.creditedRefs}</div>
  </div>
  <div class="card">
    <h2>Pending</h2>
    <div class="big-num">${stats.totalRefs - stats.creditedRefs}</div>
  </div>
  <div class="card">
    <h2>Active Referrers</h2>
    <div class="big-num">${referrerCount}</div>
  </div>
</div>

<div class="section">
  <h2>📋 All Referral Records</h2>
  <table>
    <thead>
      <tr><th>Referrer</th><th>Referred</th><th>Level</th><th>Status</th><th>Date</th></tr>
    </thead>
    <tbody>
      ${referralRows || '<tr><td colspan="5" class="muted">No referrals yet</td></tr>'}
    </tbody>
  </table>
</div>

<div class="section">
  <h2>📐 Commission Rates</h2>
  <div class="card">
    <table>
      <tr><td>Platform (Tane/fund)</td><td><strong>5%</strong></td></tr>
      <tr><td>Level 1 (Direct referrer)</td><td><strong>2%</strong></td></tr>
      <tr><td>Level 2 (Referrer's referrer)</td><td><strong>3%</strong></td></tr>
    </table>
  </div>
</div>

</body>
</html>`;
}
