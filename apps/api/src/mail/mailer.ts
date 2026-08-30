import { env } from '../env.js';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/**
 * Development / not-yet-configured driver. Writes the message to the server log
 * so the password-reset flow is exercisable end-to-end without a provider.
 */
const consoleMailer: Mailer = {
  async send(mail) {
    console.log(
      ['', '--- outbound mail ---', `to:      ${mail.to}`, `subject: ${mail.subject}`, '', mail.text, '---------------------', ''].join(
        '\n',
      ),
    );
  },
};

const resendMailer: Mailer = {
  async send(mail) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      }),
    });
    if (!res.ok) {
      throw new Error(`Resend responded ${res.status}: ${await res.text()}`);
    }
  },
};

export const mailer: Mailer = env.MAIL_PROVIDER === 'resend' ? resendMailer : consoleMailer;

export function passwordResetMail(to: string, link: string): Mail {
  const text = [
    'Reset your Slate password',
    '',
    'Open the link below to choose a new password. It expires in 60 minutes and',
    'can only be used once.',
    '',
    link,
    '',
    'If you did not request this, you can ignore this email — your password has',
    'not changed.',
  ].join('\n');

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:32px;background:#f6f6f5;font-family:Georgia,Cambria,'Times New Roman',serif;color:#1a1a1a">
    <table role="presentation" style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:20px;font-weight:600">Reset your Slate password</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#4a4a4a">
          Open the link below to choose a new password. It expires in 60 minutes
          and can only be used once.
        </p>
        <p style="margin:0 0 24px">
          <a href="${link}" style="display:inline-block;background:#1f7a4d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-family:system-ui,sans-serif;font-size:15px">Choose a new password</a>
        </p>
        <p style="margin:0;font-size:13px;line-height:1.6;color:#7a7a7a">
          If you did not request this, you can ignore this email — your password
          has not changed.
        </p>
      </td></tr>
    </table>
  </body>
</html>`;

  return { to, subject: 'Reset your Slate password', text, html };
}
