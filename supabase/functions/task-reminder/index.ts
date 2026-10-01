// Daily task reminder: emails employees and team leaders who have not logged a task for today (IST).
// Triggered by pg_cron at 19:00 IST, Monday to Friday (see supabase/reminder_schedule.sql).
//
// Required secrets (supabase secrets set ...):
//   SMTP_USER     yogesh@zeroado.com
//   SMTP_PASS     Google App Password for that account
//   CRON_SECRET   random string; the cron job sends it in the x-cron-secret header
//   APP_URL       link in the email, e.g. https://tasks.stagex.dev/
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// Add ?dryRun=1 to list who would be emailed without sending anything.
// Add ?testTo=someone@zeroado.com to send one sample reminder to that address only.

import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const FROM_NAME = 'Zeroado'
const ALLOWED_TEST_DOMAIN = '@zeroado.com'
const REMINDER_ROLES = ['employee', 'team_leader']

// Today's date in India as YYYY-MM-DD (task work_date is saved in the user's local date)
function todayInIndia(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date())
}

function formatDateDDMMYYYY(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function reminderEmail(name: string, date: string, appUrl: string) {
  const firstName = escapeHtml(name.split(' ')[0] || name)
  const displayDate = formatDateDDMMYYYY(date)
  const subject = `Reminder: You haven’t logged today’s tasks! - ${displayDate}`
  const text = `Hi ${firstName},<br>
  Don’t forget to log your tasks for today.

You haven’t logged any tasks for (${displayDate}) yet.

Please add your task entries before the end of the day. Tasks can only be logged for the current day. ${appUrl}

Tasks can only be logged for the current day, so today's entries can't be added tomorrow.

Thanks,
Zeroado`

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f0f3fa;font-family:'Instrument Sans',Arial,sans-serif;color:#061237;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f0f3fa;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e3e8ef;border-radius:16px;">
            <tr>
              <td style="padding:32px;">
                <img src="${appUrl}/img/logo/zeroado-logo.png" alt="Zeroado" height="32" style="display:block;height:32px;margin-bottom:24px;" />
                <h1 style="margin:0 0 12px;font-size:20px;line-height:28px;color:#061237;">Hi ${firstName},</h1> 
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#334155;">
                  Don’t forget to log your tasks for today.
                </p>
                <p style="margin:0 0 16px;font-size:14px;line-height:22px;color:#334155;">
                  You haven’t logged any tasks for <strong>${displayDate}</strong> yet.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#334155;">
                  Please add your task entries before the end of the day. Tasks can only be logged for the current day.
                </p>
                <a href="${appUrl}" style="display:inline-block;background:#0156ff;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;">
                  Log Today’s Tasks
                </a>
                <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#64748b;">
                  You’re receiving this reminder because no tasks have been logged for today. Once you log at least one task, you won’t receive any more reminders for today.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`

  return { subject, text, html }
}

// Constant-time comparison so the secret can't be guessed from response timing
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

Deno.serve(async (req) => {
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || !safeEqual(req.headers.get('x-cron-secret') ?? '', cronSecret)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const dryRun = params.get('dryRun') === '1'
  const testTo = params.get('testTo')?.trim().toLowerCase() ?? null
  // Test sends only to company inboxes, so a leaked secret can't be used to email outsiders
  if (testTo && (!testTo.endsWith(ALLOWED_TEST_DOMAIN) || testTo.includes(',') || testTo.includes(' '))) {
    return new Response(JSON.stringify({ error: `testTo must be a single ${ALLOWED_TEST_DOMAIN} address` }), { status: 400 })
  }
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '')
  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  const today = todayInIndia()

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, name, email, role')
    .in('role', REMINDER_ROLES)
  if (profilesError) {
    return new Response(JSON.stringify({ error: profilesError.message }), { status: 500 })
  }

  const { data: todaysLogs, error: logsError } = await supabase
    .from('task_logs')
    .select('user_id')
    .eq('work_date', today)
  if (logsError) {
    return new Response(JSON.stringify({ error: logsError.message }), { status: 500 })
  }

  const loggedUserIds = new Set((todaysLogs ?? []).map((l) => l.user_id))
  const recipients = testTo
    ? [{ id: 'test', name: 'there', email: testTo, role: 'employee' }]
    : (profiles ?? []).filter((p) => !loggedUserIds.has(p.id) && p.email)

  if (dryRun) {
    return new Response(
      JSON.stringify({ date: today, wouldEmail: recipients.map((r) => r.email), alreadyLogged: loggedUserIds.size }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }

  if (!smtpUser || !smtpPass || !appUrl) {
    return new Response(JSON.stringify({ error: 'SMTP_USER, SMTP_PASS and APP_URL secrets are required' }), {
      status: 500,
    })
  }

  // Port 465 (SSL): Supabase Edge Functions block outbound 25 and 587
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const sent: string[] = []
  const failed: { email: string; error: string }[] = []
  for (const person of recipients) {
    const { subject, text, html } = reminderEmail(person.name, today, appUrl)
    try {
      await transporter.sendMail({
        from: `"${FROM_NAME}" <${smtpUser}>`,
        to: person.email,
        subject,
        text,
        html,
      })
      sent.push(person.email)
    } catch (err) {
      failed.push({ email: person.email, error: err instanceof Error ? err.message : String(err) })
    }
  }

  return new Response(JSON.stringify({ date: today, sent: sent.length, failed, alreadyLogged: loggedUserIds.size }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
