import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

let transporter: nodemailer.Transporter | null = null;

if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD) {
  try {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT || 587,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASSWORD,
      },
    });
    logger.info(`Configured SMTP email transporter for host: ${env.SMTP_HOST}`);
  } catch (err: any) {
    logger.warn(`Failed to initialize SMTP transporter (${err.message}). Emails will run in mock mode.`);
  }
}

export class EmailService {
  /**
   * Verify SMTP connection status
   */
  static async verifyConnection(): Promise<boolean> {
    if (!transporter) return false;
    try {
      await transporter.verify();
      return true;
    } catch (err: any) {
      logger.warn(`SMTP verification failed: ${err.message}`);
      return false;
    }
  }

  /**
   * Send Email Verification Link
   */
  static async sendVerificationEmail(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<{ sent: boolean }> {
    const clientUrl = env.CLIENT_URL.split(',')[0].trim().replace(/\/+$/, '');
    const verificationUrl = `${clientUrl}/verify-email?token=${encodeURIComponent(params.token)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090b; color: #f4f4f5; border-radius: 12px; border: 1px solid #27272a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6366f1; font-size: 28px; margin: 0; font-weight: 800;">Connectly</h1>
          <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Real-Time Messaging Platform</p>
        </div>
        <div style="background: #18181b; padding: 24px; border-radius: 8px; border: 1px solid #27272a;">
          <h2 style="color: #f4f4f5; margin-top: 0; font-size: 20px;">Welcome to Connectly, ${params.name}!</h2>
          <p style="color: #d4d4d8; font-size: 15px; line-height: 1.5;">
            Thank you for registering. Please confirm your email address to activate all features of your account and begin messaging.
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${verificationUrl}" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; border-radius: 8px; font-size: 15px; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #71717a; font-size: 13px; line-height: 1.4;">
            This verification link will expire in 24 hours. If you did not create an account on Connectly, you can safely ignore this email.
          </p>
        </div>
        <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
          © ${new Date().getFullYear()} Connectly Inc. All rights reserved.
        </div>
      </div>
    `;

    if (!transporter) {
      logger.info(`[EmailService MOCK] Verification email queued for ${params.to}`);
      return { sent: true };
    }

    try {
      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: 'Verify your Connectly email address',
        html,
      });
      logger.info(`Verification email sent to: ${params.to}`);
      return { sent: true };
    } catch (err: any) {
      logger.error(`Failed to send verification email to ${params.to}: ${err.message}`);
      return { sent: false };
    }
  }

  /**
   * Send Password Reset Link
   */
  static async sendPasswordResetEmail(params: {
    to: string;
    name: string;
    token: string;
  }): Promise<{ sent: boolean }> {
    const clientUrl = env.CLIENT_URL.split(',')[0].trim().replace(/\/+$/, '');
    const resetUrl = `${clientUrl}/reset-password?token=${encodeURIComponent(params.token)}`;

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #09090b; color: #f4f4f5; border-radius: 12px; border: 1px solid #27272a;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #6366f1; font-size: 28px; margin: 0; font-weight: 800;">Connectly</h1>
          <p style="color: #a1a1aa; font-size: 14px; margin-top: 4px;">Security & Password Management</p>
        </div>
        <div style="background: #18181b; padding: 24px; border-radius: 8px; border: 1px solid #27272a;">
          <h2 style="color: #f4f4f5; margin-top: 0; font-size: 20px;">Password Reset Request</h2>
          <p style="color: #d4d4d8; font-size: 15px; line-height: 1.5;">
            Hi ${params.name}, we received a request to reset the password for your Connectly account. Click the button below to set a new password:
          </p>
          <div style="text-align: center; margin: 32px 0;">
            <a href="${resetUrl}" style="background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; border-radius: 8px; font-size: 15px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #71717a; font-size: 13px; line-height: 1.4;">
            This link is valid for 1 hour. If you did not request a password reset, your password will remain unchanged and you can safely disregard this email.
          </p>
        </div>
        <div style="text-align: center; margin-top: 24px; color: #71717a; font-size: 12px;">
          © ${new Date().getFullYear()} Connectly Inc. All rights reserved.
        </div>
      </div>
    `;

    if (!transporter) {
      logger.info(`[EmailService MOCK] Password reset email queued for ${params.to}`);
      return { sent: true };
    }

    try {
      await transporter.sendMail({
        from: env.EMAIL_FROM,
        to: params.to,
        subject: 'Reset your Connectly password',
        html,
      });
      logger.info(`Password reset email sent to: ${params.to}`);
      return { sent: true };
    } catch (err: any) {
      logger.error(`Failed to send password reset email to ${params.to}: ${err.message}`);
      return { sent: false };
    }
  }
}

