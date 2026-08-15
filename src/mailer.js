import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export async function sendDigestEmail({ subject, html, text }) {
  const info = await transporter.sendMail({
    from: `"WhatsApp Digest" <${process.env.EMAIL_USER}>`,
    to: process.env.DIGEST_RECIPIENT,
    subject,
    text,
    html,
  });

  console.log('📧 Digest email sent:', info.messageId);
  return info;
}
