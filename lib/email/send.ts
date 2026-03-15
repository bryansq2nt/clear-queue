import nodemailer from 'nodemailer';

export type SendEmailOptions = {
  to: string;
  subject: string;
  html: string;
  from: string;
};

/** SMTP config from env for createTransport (host/port/secure/auth). */
function getSmtpConfig(): {
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
} {
  const host = process.env.SMTP_HOST?.trim()!;
  const port = process.env.SMTP_PORT?.trim();
  const numPort = port ? Number(port) : 587;
  const secure =
    process.env.SMTP_SECURE?.toLowerCase() === 'true' || numPort === 465;
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASSWORD;
  return {
    host,
    port: Number.isNaN(numPort) ? 587 : numPort,
    secure,
    ...(user && pass !== undefined && { auth: { user, pass } }),
  };
}

/**
 * Sends an email via SMTP using env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_SECURE.
 * Returns error if SMTP is not configured (SMTP_HOST unset).
 */
export async function sendEmail(options: SendEmailOptions): Promise<{
  success?: boolean;
  error?: string;
}> {
  if (!process.env.SMTP_HOST?.trim()) {
    return {
      error:
        'SMTP is not configured. Set SMTP_HOST (and optionally SMTP_PORT, SMTP_USER, SMTP_PASSWORD) in your environment.',
    };
  }

  try {
    const transporter = nodemailer.createTransport(getSmtpConfig());
    await transporter.sendMail({
      from: options.from,
      to: options.to.trim().toLowerCase(),
      subject: options.subject,
      html: options.html,
    });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: `Failed to send email: ${message}. Try copying the link and sharing it manually.`,
    };
  }
}
