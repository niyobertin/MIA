import nodemailer, { type Transporter } from 'nodemailer';

export type Mail = {
  to: string;
  subject: string;
  text: string;
};

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const user = process.env.SMTP_USER;
    transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(mail: Mail): Promise<void> {
  const transport = getTransporter();
  if (transport) {
    await transport.sendMail({
      from: process.env.MAIL_FROM ?? 'MIA <no-reply@localhost>',
      ...mail,
    });
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SMTP_HOST is not set, so email cannot be sent');
  }
  console.log(`[dev email, SMTP_HOST not set]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
}
