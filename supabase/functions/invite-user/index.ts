// Sends an invitation to join the workspace.
//
// The caller must be a signed-in admin: this function forwards their JWT to the
// `admin_invite_user` / `admin_resend_invitation` RPCs, which enforce the admin
// check in the database. The raw invite token is returned by the RPC exactly
// once; it is put straight into the emailed link and into the response (so the
// admin can copy the link if the mail bounces) and is never stored in plaintext.
//
// Required secrets (supabase secrets set ...):
//   SMTP_USER     yogesh@zeroado.com
//   SMTP_PASS     Google App Password for that account
//   APP_URL       the deployed app, e.g. https://tasks.stagex.dev
// Provided automatically by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY
//
// POST body:
//   { "action": "invite", "name": "Asha Rao", "email": "asha@zeroado.com", "role": "employee" }
//   { "action": "resend", "invitationId": "<uuid>" }

import { createClient } from 'npm:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6'

const FROM_NAME = 'Zeroado'
const APPROVED_DOMAIN = '@zeroado.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

function formatExpiry(isoDate: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(isoDate))
}

function invitationEmail(name: string, inviteLink: string, expiresAt: string, invitedBy: string, appUrl: string) {
  const firstName = escapeHtml(name.split(' ')[0] || name)
  const expiry = formatExpiry(expiresAt)
  const inviter = escapeHtml(invitedBy)

  const subject = `You have been invited to Zeroado TaskLog`

  const text = `Hi ${firstName},

${invitedBy} has invited you to Zeroado TaskLog, the portal where the team records daily task logs.

Accept your invitation and sign in with your ${APPROVED_DOMAIN} Google account:
${inviteLink}

This invitation link expires on ${expiry}. Access is limited to invited ${APPROVED_DOMAIN} accounts, so please use the same address this invitation was sent to.

If you were not expecting this, you can ignore this email.

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
                  <strong>${inviter}</strong> has invited you to <strong>Zeroado TaskLog</strong>, the portal where the team records daily task logs.
                </p>
                <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#334155;">
                  Accept the invitation below and sign in with your ${APPROVED_DOMAIN} Google account.
                </p>
                <a href="${inviteLink}" style="display:inline-block;background:#0156ff;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:100px;">
                  Accept Invitation
                </a>
                <p style="margin:24px 0 0;font-size:12px;line-height:18px;color:#64748b;">
                  This link expires on <strong>${expiry}</strong>. Access is limited to invited ${APPROVED_DOMAIN} accounts, so please sign in with the same address this invitation was sent to.
                </p>
                <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#94a3b8;word-break:break-all;">
                  If the button does not work, paste this link into your browser:<br />${inviteLink}
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Sign in as an admin to send invitations.' }, 401)
  }

  let body: { action?: string; name?: string; email?: string; role?: string; invitationId?: string }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const action = body.action ?? 'invite'
  const appUrl = (Deno.env.get('APP_URL') || '').replace(/\/$/, '')
  const smtpUser = Deno.env.get('SMTP_USER')
  const smtpPass = Deno.env.get('SMTP_PASS')

  // A bad APP_URL mints invitation links that silently go nowhere, so refuse
  // before creating the invitation rather than after.
  if (!appUrl) {
    return json({ error: 'The APP_URL secret is not set. Run: supabase secrets set APP_URL=https://your-real-domain' }, 500)
  }
  if (appUrl.includes('<') || appUrl.includes('>') || /your-app-domain|your-domain|example\.com/i.test(appUrl)) {
    return json(
      {
        error: `APP_URL is still a placeholder ("${appUrl}"). Set it to the real address people will open, e.g. supabase secrets set APP_URL=https://tasks.zeroado.com`,
      },
      500
    )
  }
  try {
    const parsed = new URL(appUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('bad protocol')
  } catch {
    return json({ error: `APP_URL is not a valid URL ("${appUrl}"). It must start with https:// and contain no placeholders.` }, 500)
  }

  // The caller's own JWT: every RPC below re-checks `is_admin()` in the database,
  // so this function adds no privilege of its own.
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const {
    data: { user: caller },
  } = await supabase.auth.getUser()
  if (!caller) {
    return json({ error: 'Your session has expired. Sign in again.' }, 401)
  }

  const { data: callerProfile, error: profileError } = await supabase
    .from('profiles')
    .select('name, email, role, status')
    .eq('id', caller.id)
    .single()

  if (profileError) {
    // 42703 undefined_column / 42P01 undefined_table: the invite-only migration
    // has not been applied, so `status` (and the admin RPCs) do not exist yet.
    // Without this branch the missing column looks exactly like "not an admin".
    if (profileError.code === '42703' || profileError.code === '42P01') {
      return json(
        {
          error:
            'This Supabase project is missing the invite-only schema. Run supabase/invite_access.sql in the SQL editor, then try again.',
        },
        500
      )
    }
    return json({ error: `Could not read your profile: ${profileError.message}` }, 500)
  }

  if (!callerProfile) {
    return json({ error: 'No profile found for your account. Sign out and sign in again.' }, 403)
  }
  if (callerProfile.role !== 'admin') {
    return json({ error: `Only admins can send invitations. Your role is "${callerProfile.role}".` }, 403)
  }
  if (callerProfile.status !== 'active') {
    return json({ error: `Your access status is "${callerProfile.status}", so you cannot send invitations.` }, 403)
  }

  // ---- Create or refresh the invitation ----------------------------------
  let rpcResult: {
    invitation_id: string
    invite_name: string
    invite_email: string
    invite_role: string
    token: string
    expires_at: string
    send_count: number
  } | null = null

  if (action === 'resend') {
    if (!body.invitationId) {
      return json({ error: 'invitationId is required to resend an invitation.' }, 400)
    }
    const { data, error } = await supabase.rpc('admin_resend_invitation', {
      p_invitation_id: body.invitationId,
    })
    if (error) return json({ error: error.message }, 400)
    rpcResult = Array.isArray(data) ? data[0] : data
  } else {
    const name = (body.name ?? '').trim()
    const email = (body.email ?? '').trim().toLowerCase()
    if (!name) return json({ error: 'Please enter the person’s name.' }, 400)
    if (!email.endsWith(APPROVED_DOMAIN)) {
      return json({ error: `Only ${APPROVED_DOMAIN} addresses can be invited.` }, 400)
    }
    const { data, error } = await supabase.rpc('admin_invite_user', {
      p_name: name,
      p_email: email,
      p_role: body.role ?? 'employee',
    })
    if (error) return json({ error: error.message }, 400)
    rpcResult = Array.isArray(data) ? data[0] : data
  }

  if (!rpcResult) {
    return json({ error: 'The invitation could not be created.' }, 500)
  }

  const inviteLink = `${appUrl}/?invite=${rpcResult.token}`

  // ---- Send the email ----------------------------------------------------
  // The invitation exists either way; if SMTP fails the admin can still copy
  // the link from the response, so a mail problem never loses the invitation.
  if (!smtpUser || !smtpPass) {
    return json({
      invitation_id: rpcResult.invitation_id,
      email: rpcResult.invite_email,
      name: rpcResult.invite_name,
      expires_at: rpcResult.expires_at,
      invite_link: inviteLink,
      emailed: false,
      email_error: 'SMTP_USER and SMTP_PASS secrets are not configured; share the link manually.',
    })
  }

  // Port 465 (SSL): Supabase Edge Functions block outbound 25 and 587
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: smtpUser, pass: smtpPass },
  })

  const { subject, text, html } = invitationEmail(
    rpcResult.invite_name,
    inviteLink,
    rpcResult.expires_at,
    callerProfile.name || 'An administrator',
    appUrl
  )

  try {
    await transporter.sendMail({
      from: `"${FROM_NAME}" <${smtpUser}>`,
      to: rpcResult.invite_email,
      subject,
      text,
      html,
    })
  } catch (err) {
    const raw = err instanceof Error ? err.message : String(err)
    // Gmail's 535 is almost always an app-password problem, and its own text
    // does not say so. Translate it into the thing that actually needs doing.
    const emailError = /535|BadCredentials|Username and Password not accepted/i.test(raw)
      ? `Gmail rejected the SMTP_USER / SMTP_PASS secrets. SMTP_PASS must be a 16-character Google App Password with the spaces removed (not the account password), generated for ${smtpUser} with 2-Step Verification switched on. Original error: ${raw}`
      : raw

    return json({
      invitation_id: rpcResult.invitation_id,
      email: rpcResult.invite_email,
      name: rpcResult.invite_name,
      expires_at: rpcResult.expires_at,
      invite_link: inviteLink,
      emailed: false,
      email_error: emailError,
    })
  }

  return json({
    invitation_id: rpcResult.invitation_id,
    email: rpcResult.invite_email,
    name: rpcResult.invite_name,
    expires_at: rpcResult.expires_at,
    invite_link: inviteLink,
    emailed: true,
  })
})
