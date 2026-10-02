// Editor-only type shims for Deno Edge Functions (Supabase runs these with Deno, which provides the real types).

declare namespace Deno {
  export const env: {
    get(key: string): string | undefined
  }
  export function serve(handler: (req: Request) => Response | Promise<Response>): void
}

// Deno's `npm:` specifiers map to the same packages installed for the web app
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}

declare module 'npm:nodemailer@6' {
  interface SendMailOptions {
    from: string
    to: string
    subject: string
    text?: string
    html?: string
  }
  interface Transporter {
    sendMail(options: SendMailOptions): Promise<unknown>
    /** Authenticates against the SMTP server without sending a message. */
    verify(): Promise<true>
  }
  const nodemailer: {
    createTransport(options: {
      host: string
      port: number
      secure: boolean
      auth: { user: string; pass: string }
    }): Transporter
  }
  export default nodemailer
}
