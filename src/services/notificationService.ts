// src/services/notificationService.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export interface NotificationParams {
  email: string;
  subject?: string;
  message: string;
}

export async function notifyCustomer(params: NotificationParams): Promise<void> {
  console.log(`[notify] ${params.email}: ${params.message}`);

  if (process.env.RESEND_API_KEY) {
    try {
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "RecoverPay <noreply@recoverpay.io>",
        to: params.email,
        subject: params.subject || "Payment Update — RecoverPay",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
            <div style="background:#0B1426;padding:20px;border-radius:8px;margin-bottom:20px">
              <h2 style="color:#F59E0B;margin:0">RecoverPay</h2>
            </div>
            <div style="background:#f8f9fa;padding:20px;border-radius:8px">
              <p style="color:#333;white-space:pre-line;line-height:1.6">${params.message}</p>
            </div>
            <p style="color:#999;font-size:12px;margin-top:20px">
              This is an automated payment notification. Do not reply to this email.
            </p>
          </div>
        `,
      });
      console.log(`[notify] Email sent to ${params.email}`);
    } catch (err) {
      console.error("[notify] Email failed:", err);
    }
  }
}