const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send a welcome email after registration
 */
const sendWelcomeEmail = async ({ to, name }) => {
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Welcome to Zytha Foods! 🍽️',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #fff8f0; border-radius: 12px;">
        <h1 style="color: #e65c00;">Welcome, ${name}! 🎉</h1>
        <p style="color: #333;">Thank you for creating your Zytha Foods account. Start exploring our fresh, quality products today.</p>
        <a href="${process.env.CLIENT_URL}/shop"
           style="display:inline-block;margin-top:20px;padding:12px 28px;background:#e65c00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          Shop Now
        </a>
        <p style="margin-top:32px;color:#999;font-size:12px;">© 2026 Zytha Foods Private Limited. All rights reserved.</p>
      </div>
    `,
  });
};

/**
 * Send order confirmation email
 */
const sendOrderConfirmationEmail = async ({ to, name, orderId, total, items }) => {
  const itemRows = items.map(i =>
    `<tr>
      <td style="padding:8px;border-bottom:1px solid #eee;">${i.name}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
      <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹${i.price.toFixed(2)}</td>
    </tr>`
  ).join('');

  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Order Confirmed #${orderId} — Zytha Foods`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #fff8f0; border-radius: 12px;">
        <h2 style="color: #e65c00;">Order Confirmed! ✅</h2>
        <p>Hi ${name}, your order <strong>#${orderId}</strong> has been placed successfully.</p>
        <table style="width:100%;border-collapse:collapse;margin-top:16px;">
          <thead>
            <tr style="background:#e65c00;color:#fff;">
              <th style="padding:10px;text-align:left;">Item</th>
              <th style="padding:10px;text-align:center;">Qty</th>
              <th style="padding:10px;text-align:right;">Price</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:10px;font-weight:bold;">Total</td>
              <td style="padding:10px;text-align:right;font-weight:bold;">₹${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
        <a href="${process.env.CLIENT_URL}/account/orders"
           style="display:inline-block;margin-top:24px;padding:12px 28px;background:#e65c00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          Track Your Order
        </a>
        <p style="margin-top:32px;color:#999;font-size:12px;">© 2026 Zytha Foods Private Limited. All rights reserved.</p>
      </div>
    `,
  });
};

/**
 * Send password reset email (magic link)
 */
const sendPasswordResetEmail = async ({ to, name, resetUrl }) => {
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Reset Your Zytha Foods Password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #fff8f0; border-radius: 12px;">
        <h2 style="color: #e65c00;">Password Reset Request</h2>
        <p>Hi ${name}, we received a request to reset your password. Click the button below (valid for 1 hour):</p>
        <a href="${resetUrl}"
           style="display:inline-block;margin-top:20px;padding:12px 28px;background:#e65c00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          Reset Password
        </a>
        <p style="margin-top:20px;color:#666;">If you didn't request this, you can safely ignore this email.</p>
        <p style="margin-top:32px;color:#999;font-size:12px;">© 2026 Zytha Foods Private Limited. All rights reserved.</p>
      </div>
    `,
  });
};

/**
 * Send vendor application status email
 */
const sendVendorStatusEmail = async ({ to, name, status }) => {
  const approved = status === 'approved';
  await resend.emails.send({
    from: process.env.EMAIL_FROM,
    to,
    subject: `Vendor Application ${approved ? 'Approved ✅' : 'Update'} — Zytha Foods`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 32px; background: #fff8f0; border-radius: 12px;">
        <h2 style="color: #e65c00;">Vendor Application ${approved ? 'Approved!' : 'Status Update'}</h2>
        <p>Hi ${name}, ${approved
          ? 'Congratulations! Your vendor application has been approved. You can now log in and start listing your products.'
          : 'We regret to inform you that your vendor application has not been approved at this time. Please contact support for more details.'
        }</p>
        ${approved ? `<a href="${process.env.CLIENT_URL}/vendor/dashboard"
           style="display:inline-block;margin-top:20px;padding:12px 28px;background:#e65c00;color:#fff;border-radius:8px;text-decoration:none;font-weight:bold;">
          Go to Vendor Dashboard
        </a>` : ''}
        <p style="margin-top:32px;color:#999;font-size:12px;">© 2026 Zytha Foods Private Limited. All rights reserved.</p>
      </div>
    `,
  });
};

module.exports = {
  sendWelcomeEmail,
  sendOrderConfirmationEmail,
  sendPasswordResetEmail,
  sendVendorStatusEmail,
};
