// Uses Resend's HTTPS API instead of raw SMTP — Railway blocks outbound
// SMTP ports (465/587), so nodemailer/SMTP could never connect from here.
// Resend just needs a normal fetch() call, which works fine.

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendDigestEmail({ subject, html, text }) {
  const payload = {
    from: process.env.EMAIL_FROM || 'WhatsApp Digest <onboarding@resend.dev>',
    to: process.env.DIGEST_RECIPIENT,
    subject,
    html,
    text,
  };

  const res = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend API error (${res.status}): ${errText}`);
  }

  const data = await res.json();
  console.log('📧 Digest email sent via Resend:', data.id);
  return data;
}
