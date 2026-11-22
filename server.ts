import express from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const PORT = 3000;
const app = express();

// Capture raw body for Razorpay webhook signature verification
app.use(
  express.json({
    limit: '4mb',
    verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

const APP_BASE_URL = process.env.APP_URL || process.env.VITE_APP_URL || `http://localhost:${PORT}`;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || process.env.VITE_RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'TapNex <orders@tapnex.in>';

// Deterministic runtime sandbox secret when live Razorpay credentials are not configured
const SANDBOX_SIGNING_SECRET =
  process.env.RAZORPAY_SANDBOX_SECRET ||
  crypto.createHash('sha256').update(`tapnex-sandbox-${process.env.APP_URL || 'local'}`).digest('hex');

// Idempotency store for payment webhooks & verification calls
const processedPaymentIds = new Set<string>();
const processedWebhookEvents = new Set<string>();

// --- Health & Integration Status ---
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    integrations: {
      razorpayMode: RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET ? 'live' : 'sandbox',
      razorpayKeyConfigured: Boolean(RAZORPAY_KEY_ID),
      resendConfigured: Boolean(RESEND_API_KEY),
      superAdminBootstrapEnabled: process.env.SUPERADMIN_BOOTSTRAP_ENABLED === 'true',
      appBaseUrl: APP_BASE_URL,
    },
  });
});

// --- Server-Side QR Code Generator (High-Res PNG + SVG, Error Correction H, Quiet Zone) ---
app.post('/api/qr/generate', async (req, res) => {
  try {
    const { targetUrl, width = 1024 } = req.body as { targetUrl?: string; width?: number };
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).json({ error: 'Valid targetUrl is required.' });
    }
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return res.status(400).json({ error: 'Target URL must use http or https.' });
      }
    } catch {
      return res.status(400).json({ error: 'Malformed targetUrl.' });
    }

    const safeWidth = Math.min(Math.max(Number(width) || 1024, 256), 2048);
    const svgContent = await QRCode.toString(parsed.toString(), {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 4,
      color: { dark: '#0B1D3A', light: '#FFFFFF' },
    });

    const pngDataUrl = await QRCode.toDataURL(parsed.toString(), {
      errorCorrectionLevel: 'H',
      margin: 4,
      width: safeWidth,
      color: { dark: '#0B1D3A', light: '#FFFFFF' },
    });

    return res.json({
      targetUrl: parsed.toString(),
      svgContent,
      pngDataUrl,
      errorCorrectionLevel: 'H',
      quietZoneModules: 4,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('QR generation failed:', err);
    return res.status(500).json({ error: 'Failed to generate QR artwork.' });
  }
});

// --- Razorpay Order Creation (Live API or Explicit Sandbox Mode) ---
app.post('/api/payments/create-order', async (req, res) => {
  try {
    const { orderId, amountInr, receipt, customerEmail } = req.body as {
      orderId?: string;
      amountInr?: number;
      receipt?: string;
      customerEmail?: string;
    };

    if (!orderId || !amountInr || Number(amountInr) <= 0) {
      return res.status(400).json({ error: 'Valid orderId and positive amountInr are required.' });
    }

    const amountPaise = Math.round(Number(amountInr) * 100);
    const isLiveConfigured = Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

    if (isLiveConfigured) {
      const authHeader = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_KEY_SECRET}`).toString('base64');
      const rzpResponse = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authHeader}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountPaise,
          currency: 'INR',
          receipt: receipt || orderId,
          notes: { internalOrderId: orderId, customerEmail: customerEmail || '' },
        }),
      });

      if (!rzpResponse.ok) {
        const errText = await rzpResponse.text();
        return res.status(502).json({ error: 'Razorpay order creation failed.', details: errText });
      }

      const rzpOrder = (await rzpResponse.json()) as { id: string; amount: number; currency: string };
      return res.json({
        mode: 'razorpay_live',
        keyId: RAZORPAY_KEY_ID,
        gatewayOrderId: rzpOrder.id,
        amountPaise: rzpOrder.amount,
        currency: rzpOrder.currency,
      });
    }

    // Explicit Sandbox Mode (when live Razorpay credentials are not configured)
    const sandboxOrderId = `order_sbx_${orderId.slice(0, 12)}_${Date.now()}`;
    return res.json({
      mode: 'razorpay_sandbox',
      keyId: 'rzp_test_sandbox_configured_server',
      gatewayOrderId: sandboxOrderId,
      amountPaise,
      currency: 'INR',
      sandboxNotice:
        'Running in Razorpay Sandbox Mode. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server environment for live payments.',
    });
  } catch (err) {
    console.error('Create payment order error:', err);
    return res.status(500).json({ error: 'Internal payment order creation error.' });
  }
});

// --- Razorpay Sandbox Challenge Signature Helper (Produces Valid HMAC-SHA256 for Sandbox Verification) ---
app.post('/api/payments/sandbox-authorize', (req, res) => {
  if (RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET) {
    return res.status(403).json({ error: 'Sandbox authorization is disabled when live Razorpay keys are active.' });
  }
  const { gatewayOrderId, simulateOutcome = 'success' } = req.body as {
    gatewayOrderId?: string;
    simulateOutcome?: 'success' | 'failure' | 'cancelled';
  };
  if (!gatewayOrderId) {
    return res.status(400).json({ error: 'gatewayOrderId is required.' });
  }
  if (simulateOutcome !== 'success') {
    return res.json({
      outcome: simulateOutcome,
      error: simulateOutcome === 'cancelled' ? 'Payment cancelled by user in Razorpay Sandbox.' : 'Payment declined by bank in Razorpay Sandbox.',
    });
  }
  const gatewayPaymentId = `pay_sbx_${crypto.randomBytes(8).toString('hex')}`;
  const signature = crypto
    .createHmac('sha256', SANDBOX_SIGNING_SECRET)
    .update(`${gatewayOrderId}|${gatewayPaymentId}`)
    .digest('hex');

  return res.json({
    outcome: 'success',
    gatewayOrderId,
    gatewayPaymentId,
    signature,
  });
});

// --- Server-Side Payment Signature Verification + Post-Payment QR Generation ---
app.post('/api/payments/verify', async (req, res) => {
  try {
    const {
      orderId,
      gatewayOrderId,
      gatewayPaymentId,
      signature,
      mode,
      profileSlug,
      appOrigin,
    } = req.body as {
      orderId?: string;
      gatewayOrderId?: string;
      gatewayPaymentId?: string;
      signature?: string;
      mode?: 'razorpay_live' | 'razorpay_sandbox';
      profileSlug?: string;
      appOrigin?: string;
    };

    if (!orderId || !gatewayOrderId || !gatewayPaymentId || !signature || !profileSlug) {
      return res.status(400).json({ error: 'Missing required verification parameters.' });
    }

    if (processedPaymentIds.has(gatewayPaymentId)) {
      return res.status(409).json({ error: 'Duplicate payment processing blocked (idempotent guard).' });
    }

    const secret =
      mode === 'razorpay_live' && RAZORPAY_KEY_SECRET
        ? RAZORPAY_KEY_SECRET
        : SANDBOX_SIGNING_SECRET;

    if (mode === 'razorpay_live' && !RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: 'Server missing RAZORPAY_KEY_SECRET for live verification.' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${gatewayOrderId}|${gatewayPaymentId}`)
      .digest('hex');

    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return res.status(400).json({ verified: false, error: 'Invalid payment cryptographic signature.' });
    }

    processedPaymentIds.add(gatewayPaymentId);

    // Generate actual customer QR code ONLY after verified payment!
    const baseUrl = (appOrigin || APP_BASE_URL).replace(/\/+$/, '');
    const targetUrl = `${baseUrl}/p/${profileSlug}`;

    const svgContent = await QRCode.toString(targetUrl, {
      type: 'svg',
      errorCorrectionLevel: 'H',
      margin: 4,
      color: { dark: '#0B1D3A', light: '#FFFFFF' },
    });

    const pngDataUrl = await QRCode.toDataURL(targetUrl, {
      errorCorrectionLevel: 'H',
      margin: 4,
      width: 1024,
      color: { dark: '#0B1D3A', light: '#FFFFFF' },
    });

    return res.json({
      verified: true,
      orderId,
      gatewayPaymentId,
      verifiedAt: new Date().toISOString(),
      qrArtifact: {
        targetUrl,
        svgContent,
        pngDataUrl,
        format: 'PNG_SVG',
      },
    });
  } catch (err) {
    console.error('Payment verification error:', err);
    return res.status(500).json({ error: 'Payment verification failed.' });
  }
});

// --- Razorpay Webhook Verification ---
app.post('/api/payments/webhook', (req: express.Request & { rawBody?: Buffer }, res) => {
  const signature = req.headers['x-razorpay-signature'];
  if (!RAZORPAY_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'RAZORPAY_WEBHOOK_SECRET not configured.' });
  }
  if (!signature || typeof signature !== 'string' || !req.rawBody) {
    return res.status(400).json({ error: 'Missing webhook signature or payload.' });
  }
  const expected = crypto
    .createHmac('sha256', RAZORPAY_WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Invalid webhook signature.' });
  }

  const eventId = (req.headers['x-razorpay-event-id'] as string) || JSON.stringify(req.body).slice(0, 64);
  if (processedWebhookEvents.has(eventId)) {
    return res.json({ status: 'already_processed' });
  }
  processedWebhookEvents.add(eventId);
  return res.json({ status: 'ok', event: req.body?.event || 'unknown' });
});

// --- Transactional Email via Resend (Server-Side Only) ---
app.post('/api/email/send', async (req, res) => {
  try {
    const { to, subject, html } = req.body as { to?: string; subject?: string; html?: string };
    if (!to || !subject || !html) {
      return res.status(400).json({ error: 'to, subject, and html are required.' });
    }

    if (!RESEND_API_KEY) {
      return res.json({
        delivered: false,
        mode: 'unconfigured',
        missingCredential: 'RESEND_API_KEY',
        message: 'Resend API key is not configured. Email queued in notification log for preview.',
      });
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [to],
        subject,
        html,
      }),
    });

    if (!emailRes.ok) {
      const errBody = await emailRes.text();
      return res.status(502).json({ delivered: false, error: 'Resend API error', details: errBody });
    }

    const data = await emailRes.json();
    return res.json({ delivered: true, mode: 'resend_live', id: (data as { id?: string }).id });
  } catch (err) {
    console.error('Transactional email error:', err);
    return res.status(500).json({ error: 'Email dispatch failed.' });
  }
});

// --- Print Spec Validation (85.6mm x 54mm, 3mm Bleed, 300 DPI) ---
app.post('/api/print/validate-spec', (req, res) => {
  const { orientation = 'landscape', hasActualQr } = req.body as {
    orientation?: 'landscape' | 'vertical';
    hasActualQr?: boolean;
  };
  const trim = orientation === 'vertical' ? { w: 54, h: 85.6 } : { w: 85.6, h: 54 };
  const bleedMm = 3;
  const fullMm = { w: +(trim.w + bleedMm * 2).toFixed(2), h: +(trim.h + bleedMm * 2).toFixed(2) };
  const dpi = 300;
  const px = {
    w: Math.round((fullMm.w / 25.4) * dpi),
    h: Math.round((fullMm.h / 25.4) * dpi),
  };
  return res.json({
    valid: Boolean(hasActualQr),
    trimMm: trim,
    bleedMm,
    fullBleedMm: fullMm,
    dpi,
    pixelDimensions300Dpi: px,
    safeMarginMm: 4,
    message: hasActualQr
      ? 'Print specification verified with embedded QR code.'
      : 'Rejected: Print-ready PDF requires a verified post-payment QR code.',
  });
});

// --- Protected SuperAdmin Bootstrap Validation ---
app.post('/api/auth/bootstrap-superadmin', (req, res) => {
  if (process.env.SUPERADMIN_BOOTSTRAP_ENABLED !== 'true') {
    return res.status(403).json({
      error: 'One-time SuperAdmin bootstrap is disabled. Set SUPERADMIN_BOOTSTRAP_ENABLED=true in server environment variables to run initial setup.',
    });
  }
  const { username, password } = req.body as { username?: string; password?: string };
  const expectedUser = process.env.SUPERADMIN_INITIAL_USERNAME;
  const expectedPass = process.env.SUPERADMIN_INITIAL_PASSWORD;
  const targetEmail = process.env.SUPERADMIN_INITIAL_EMAIL;

  if (!expectedUser || !expectedPass || !targetEmail) {
    return res.status(500).json({ error: 'Bootstrap credentials not configured in environment.' });
  }
  if (username !== expectedUser || password !== expectedPass) {
    return res.status(401).json({ error: 'Invalid bootstrap credentials.' });
  }
  return res.json({
    authorized: true,
    email: targetEmail,
    mustChangePassword: true,
    notice: 'Disable SUPERADMIN_BOOTSTRAP_ENABLED after first login and password rotation.',
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`TapNex server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
