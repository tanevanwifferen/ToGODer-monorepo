import { Request, Response, Router, NextFunction } from 'express';
import { authenticated, setAuthUser } from './Middleware/auth';
import { ToGODerRequest } from './Model/ToGODerRequest';
import { getAnalytics } from '../Analytics/AnalyticsService';

// ── Admin guard ────────────────────────────────────────────────────
// Reads ADMIN_EMAILS from env (comma-separated). Only users whose email
// is in that list may access /admin/* routes. No DB column needed.

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // Must be authenticated first
    if (!req.headers.authorization) {
      return res.status(401).send('Unauthorized');
    }

    const togoderReq = req as ToGODerRequest;
    if (!togoderReq.togoder_auth?.user) {
      return res.status(401).send('Unauthorized');
    }

    const adminEmails = getAdminEmails();
    if (!adminEmails.has(togoderReq.togoder_auth.user.email.toLowerCase())) {
      return res.status(403).send(`
        <!DOCTYPE html>
        <html lang="en">
        <head><meta charset="UTF-8"><title>403 Forbidden</title>
        <style>
          body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f5f5f5; }
          .box { text-align: center; background: white; padding: 3rem; border-radius: 12px; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
          h1 { font-size: 4rem; margin: 0 0 0.5rem; color: #dc2626; }
          p { color: #666; margin: 0 0 1.5rem; }
          a { color: #2563eb; }
        </style></head>
        <body>
          <div class="box">
            <h1>403</h1>
            <p>You do not have permission to access this area.</p>
            <a href="/">Return to ToGODer</a>
          </div>
        </body></html>
      `);
    }

    next();
  } catch (err) {
    console.error('[admin] auth error:', err);
    res.status(500).send('Internal Server Error');
  }
};

// ── Routes ─────────────────────────────────────────────────────────

export function GetAdminRouter(): Router {
  const router = Router();

  // GET /admin/metrics — admin-gated metrics dashboard (HTML)
  router.get(
    '/admin/metrics',
    authenticated,
    setAuthUser,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const analytics = getAnalytics();
        const metrics = await analytics.getMetrics();

        // Render as minimal HTML page — just numbers, no charts
        const html = renderMetricsPage(metrics);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (err) {
        console.error('[admin] metrics error:', err);
        res.status(500).send('Internal Server Error');
      }
    },
  );

  // GET /api/admin/metrics — admin-gated metrics as JSON for the React dashboard
  router.get(
    '/api/admin/metrics',
    authenticated,
    setAuthUser,
    requireAdmin,
    async (_req: Request, res: Response) => {
      try {
        const analytics = getAnalytics();
        const metrics = await analytics.getMetrics();
        res.json(metrics);
      } catch (err) {
        console.error('[admin] api metrics error:', err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    },
  );

  return router;
}

// ── Minimal HTML renderer ──────────────────────────────────────────

function renderMetricsPage(m: any): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const funnelRows = (m.funnel || [])
    .map(
      (f: any) =>
        `<tr><td>${esc(f.stage)}</td><td style="text-align:right">${f.count}</td></tr>`,
    )
    .join('');

  const topQ = (m.topQuestions || [])
    .map(
      (q: any, i: number) =>
        `<tr><td>${i + 1}</td><td>${esc(q.question)}</td><td style="text-align:right">${q.count}</td></tr>`,
    )
    .join('');

  const dauRows = (m.dailyActive || [])
    .map(
      (d: any) =>
        `<tr><td>${d.date}</td><td style="text-align:right">${d.count}</td></tr>`,
    )
    .join('');

  const wauRows = (m.weeklyActive || [])
    .map(
      (w: any) =>
        `<tr><td>${w.week}</td><td style="text-align:right">${w.count}</td></tr>`,
    )
    .join('');

  const mauRows = (m.monthlyActive || [])
    .map(
      (m2: any) =>
        `<tr><td>${m2.month}</td><td style="text-align:right">${m2.count}</td></tr>`,
    )
    .join('');

  const cohortRows = (m.cohortRetention || [])
    .map(
      (c: any) =>
        `<tr><td>${c.cohortWeek}</td><td style="text-align:right">${c.w1}%</td><td style="text-align:right">${c.w2}%</td><td style="text-align:right">${c.w4}%</td></tr>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>ToGODer Metrics</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #212529; padding: 2rem; }
  h1 { margin-bottom: 1.5rem; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 1.5rem; }
  .card { background: white; border-radius: 10px; padding: 1.5rem; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }
  .card h2 { font-size: 1rem; color: #6c757d; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 0.75rem; }
  .big-num { font-size: 2.5rem; font-weight: 700; }
  table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
  th, td { padding: 6px 8px; border-bottom: 1px solid #eee; text-align: left; }
  th { color: #6c757d; font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
  .funnel-bar { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
  .funnel-bar .bar { height: 20px; background: #3b82f6; border-radius: 3px; min-width: 4px; transition: width 0.3s; }
  .funnel-bar .label { font-size: 0.85rem; white-space: nowrap; }
  .section { margin-top: 2rem; }
  .section h2 { margin-bottom: 0.75rem; }
  .muted { color: #6c757d; font-size: 0.85rem; }
  .refresh { margin-bottom: 1rem; }
  .refresh a { color: #2563eb; font-size: 0.85rem; }
</style>
</head>
<body>
<h1>📊 ToGODer Metrics</h1>
<p class="refresh"><a href="/admin/metrics">⟳ Refresh</a> &middot; <span class="muted">${new Date().toISOString()}</span></p>

<div class="grid">
  <div class="card">
    <h2>Daily Active Users</h2>
    <div class="big-num">${m.dau}</div>
  </div>
  <div class="card">
    <h2>Weekly Active Users (7d)</h2>
    <div class="big-num">${m.wau}</div>
  </div>
  <div class="card">
    <h2>Monthly Active Users (30d)</h2>
    <div class="big-num">${m.mau}</div>
  </div>
  <div class="card">
    <h2>Today — New Conversations</h2>
    <div class="big-num">${m.todayNewConversations}</div>
  </div>
  <div class="card">
    <h2>Today — Returning</h2>
    <div class="big-num">${m.todayReturningConversations}</div>
  </div>
  <div class="card">
    <h2>Time to First Message (median)</h2>
    <div class="big-num">${m.timeToFirstMessageMedian != null ? m.timeToFirstMessageMedian + 's' : '—'}</div>
  </div>
  <div class="card">
    <h2>Newsletter Subscriptions</h2>
    <div class="big-num">${m.subscriptionCount}</div>
  </div>
</div>

<div class="section">
  <h2>🔽 Funnel</h2>
  <div class="card">
    ${renderFunnelBars(m.funnel || [])}
  </div>
</div>

<div class="section">
  <h2>🔥 Top Questions</h2>
  <div class="card">
    <table>
      <thead><tr><th>#</th><th>Question</th><th>Count</th></tr></thead>
      <tbody>${topQ || '<tr><td colspan="3" class="muted">No data yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>📈 Daily Active Users</h2>
  <div class="card">
    <table>
      <thead><tr><th>Date</th><th>Users</th></tr></thead>
      <tbody>${dauRows || '<tr><td colspan="2" class="muted">No data yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>📈 Weekly Active Users</h2>
  <div class="card">
    <table>
      <thead><tr><th>Week</th><th>Users</th></tr></thead>
      <tbody>${wauRows || '<tr><td colspan="2" class="muted">No data yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>📈 Monthly Active Users</h2>
  <div class="card">
    <table>
      <thead><tr><th>Month</th><th>Users</th></tr></thead>
      <tbody>${mauRows || '<tr><td colspan="2" class="muted">No data yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

<div class="section">
  <h2>👥 Cohort Retention</h2>
  <div class="card">
    <table>
      <thead><tr><th>Cohort Week</th><th>W+1</th><th>W+2</th><th>W+4</th></tr></thead>
      <tbody>${cohortRows || '<tr><td colspan="4" class="muted">No data yet</td></tr>'}</tbody>
    </table>
  </div>
</div>

</body>
</html>`;
}

function renderFunnelBars(
  funnel: { stage: string; count: number }[],
): string {
  if (!funnel.length) return '<p class="muted">No data yet</p>';
  const max = Math.max(...funnel.map((f) => Number(f.count)), 1);
  return funnel
    .map(
      (f) =>
        `<div class="funnel-bar">
          <span class="label">${f.stage}</span>
          <div class="bar" style="width:${Math.max((Number(f.count) / max) * 100, 2)}%"></div>
          <span style="font-size:0.85rem;color:#6c757d;">${f.count}</span>
        </div>`,
    )
    .join('');
}