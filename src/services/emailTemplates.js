// Branded emails (verification, password reset). Every email has an HTML version for mail apps
// and a plain-text version for the rest. Email apps ignore <style> blocks and most CSS, so the
// layout uses tables and inline styles only, and no images (Gmail does not show SVG, and many
// apps block remote images until the reader allows them).
const BRAND = {
  navy: '#071a33',
  blue: '#0a66d1',
  aqua: '#2ec4e6',
  coral: '#ff6b57',
  ink: '#0d1b2e',
  muted: '#5b6b82',
  bg: '#f6f8fb',
  line: '#e2e8f0',
};

const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// title: big heading · lines: short paragraphs · button: { text, url } · note: small print under the button
function emailLayout({ preview, title, lines, button, note }) {
  const font = "'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg};padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${BRAND.line};">
        <tr><td style="background:${BRAND.navy};padding:22px 28px;">
          <span style="font-family:${font};font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Octopus</span>
          <span style="font-family:${font};font-size:11px;font-weight:700;color:${BRAND.aqua};letter-spacing:2px;text-transform:uppercase;padding-left:8px;">Sports Academy</span>
        </td></tr>
        <tr><td style="height:4px;background:${BRAND.coral};line-height:4px;font-size:0;">&nbsp;</td></tr>
        <tr><td style="padding:30px 28px 8px;font-family:${font};color:${BRAND.ink};">
          <h1 style="margin:0 0 14px;font-size:22px;line-height:1.25;">${escapeHtml(title)}</h1>
          ${lines.map((l) => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:${BRAND.ink};">${escapeHtml(l)}</p>`).join('')}
        </td></tr>
        <tr><td align="center" style="padding:10px 28px 6px;">
          <a href="${escapeHtml(button.url)}" style="display:inline-block;background:${BRAND.blue};color:#ffffff;font-family:${font};font-size:16px;font-weight:700;text-decoration:none;padding:14px 30px;border-radius:10px;">${escapeHtml(button.text)}</a>
        </td></tr>
        <tr><td style="padding:16px 28px 8px;font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.muted};">
          If the button does not work, copy this link into your browser:<br>
          <a href="${escapeHtml(button.url)}" style="color:${BRAND.blue};word-break:break-all;">${escapeHtml(button.url)}</a>
        </td></tr>
        <tr><td style="padding:8px 28px 26px;font-family:${font};font-size:12px;line-height:1.6;color:${BRAND.muted};">${escapeHtml(note)}</td></tr>
        <tr><td style="background:${BRAND.bg};padding:16px 28px;font-family:${font};font-size:11px;color:${BRAND.muted};border-top:1px solid ${BRAND.line};">
          Octopus Sports Academy · Swimming classes at your condo · Malaysia
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
  const text = [title, '', ...lines, '', `${button.text}: ${button.url}`, '', note, '', 'Octopus Sports Academy'].join('\n');
  return { html, text };
}

function verifyEmail({ username, link }) {
  return {
    subject: 'Confirm your email · Octopus Sports Academy',
    ...emailLayout({
      preview: 'One click to activate your account.',
      title: `Welcome, ${username}!`,
      lines: ['Thanks for signing up. Please confirm this is your email address to activate your account.'],
      button: { text: 'Confirm my email', url: link },
      note: 'This link works for 24 hours. If you did not create an account, you can ignore this email.',
    }),
  };
}

function resetEmail({ username, link }) {
  return {
    subject: 'Reset your password · Octopus Sports Academy',
    ...emailLayout({
      preview: 'Choose a new password for your account.',
      title: 'Reset your password',
      lines: [`Hi ${username}, we received a request to set a new password for your account.`],
      button: { text: 'Choose a new password', url: link },
      note: 'This link works for 1 hour and only once. If you did not ask for this, ignore this email: your password stays the same.',
    }),
  };
}

module.exports = { verifyEmail, resetEmail };
