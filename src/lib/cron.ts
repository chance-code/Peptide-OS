import cron from 'node-cron'

const CRON_SECRET = process.env.CRON_SECRET
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'

async function callCronEndpoint(path: string, method: 'GET' | 'POST' = 'GET') {
  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${CRON_SECRET}`,
      },
    })
    const status = res.ok ? 'OK' : `FAIL(${res.status})`
    console.log(`[cron] ${path} → ${status}`)
  } catch (err) {
    console.error(`[cron] ${path} → ERROR:`, err)
  }
}

export function startCronJobs() {
  if (!CRON_SECRET) {
    console.warn('[cron] CRON_SECRET not set — skipping cron job registration')
    return
  }

  console.log('[cron] Registering cron jobs...')

  // Dose reminders — daily at 2:00 PM UTC
  cron.schedule('0 14 * * *', () => callCronEndpoint('/api/cron/reminders'))

  // Health notifications — daily at 1:00 PM UTC
  cron.schedule('0 13 * * *', () => callCronEndpoint('/api/cron/health-notifications'))

  // Health sync (Oura/WHOOP) — daily at 8:00 AM UTC
  cron.schedule('0 8 * * *', () => callCronEndpoint('/api/cron/health-sync'))

  // Cohort insights — Mondays at 3:00 AM UTC
  cron.schedule('0 3 * * 1', () => callCronEndpoint('/api/cron/cohort-insights', 'POST'))

  console.log('[cron] 4 cron jobs registered')
}
