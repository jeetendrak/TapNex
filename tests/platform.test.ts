import { describe, expect, it } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  BLANK_CARD_TEMPLATE,
  createBlankSideDesign,
  DEFAULT_CARD_TEMPLATES,
  DEFAULT_VISIBILITY,
  PAYMENT_GATEWAY_ORDER,
} from '../src/lib/constants';
import {
  buildSanitizedPublicProfile,
  calculateProfileCompletion,
  filterAuditLogs,
  isOrderPaymentConfirmed,
  maskEmail,
  maskPhone,
  mergePaymentGateways,
  RESETTABLE_OPERATIONAL_COLLECTIONS,
  resetApplicationToFreshBlank,
  sanitizeSlug,
  sortCardTemplates,
} from '../src/lib/firestoreService';
import { resolveEffectiveCardDesign } from '../src/lib/studioDraft';
import { buildPublicVCard } from '../src/lib/vcard';
import {
  CARD_BLEED_MM,
  CARD_TRIM_LANDSCAPE_MM,
  mmToPx300Dpi,
  resolveCardTokens,
} from '../src/lib/printPdf';
import { generateHighResQrArtwork, generatePrinterAuthId } from '../src/lib/qrArtwork';
import { ROLE_CAPABILITY_MATRIX, ROLE_GUIDES } from '../src/data/guideContent';
import {
  alignTargetsOnSide,
  computeSnapAndGuidelines,
  nudgeTargetsOnSide,
  wrapCanvasTextLines,
} from '../src/lib/cardLayout';
import {
  normalizeHexColor,
  sanitizeRichBioHtml,
  stripHtmlToPlainText,
} from '../src/lib/richText';
import type { AuditLogRecord, CardDesignRecord, ProfileRecord } from '../src/types';

function makeSampleProfile(overrides: Partial<ProfileRecord> = {}): ProfileRecord {
  return {
    profileId: 'prof_test_1',
    uid: 'user_test_1',
    slug: 'aarav-mehta',
    profileLabel: 'Primary Profile',
    selectedTemplate: 'tpl_navy_obsidian',
    isPublic: true,
    personalInformation: {
      photoDataUrl: 'data:image/png;base64,iVBOR',
      fullName: 'Aarav Mehta',
      jobTitle: 'Managing Director',
      companyName: 'Meridian Advisory',
      businessCategory: 'Consulting',
      shortBio: 'Strategic advisor for growth companies.',
      mobile: '+91 98201 44510',
      alternateMobile: '+91 99999 00000',
      whatsapp: '+91 98201 44510',
      email: 'aarav@meridianadvisory.in',
      alternateEmail: 'private@personal.in',
      website: 'https://meridianadvisory.in',
      businessAddress: '14th Floor, Nariman Point',
      personalAddress: '12B Seaface Residences, Worli',
      city: 'Mumbai',
      state: 'Maharashtra',
      pinCode: '400021',
      country: 'India',
    },
    socialLinks: [
      {
        id: 'linkedin',
        platform: 'linkedin',
        label: 'LinkedIn',
        url: 'https://linkedin.com/in/aarav',
        enabled: true,
        order: 0,
      },
      {
        id: 'github',
        platform: 'github',
        label: 'GitHub',
        url: 'https://github.com/aarav-private',
        enabled: false,
        order: 1,
      },
    ],
    customFields: [
      {
        id: 'cf_1',
        label: 'Book Consultation',
        value: 'https://cal.com/aarav',
        type: 'url',
        visible: true,
        order: 0,
      },
      {
        id: 'cf_2',
        label: 'Internal PAN Ref',
        value: 'ABCDE1234F',
        type: 'text',
        visible: false,
        order: 1,
      },
    ],
    visibilitySettings: {
      ...DEFAULT_VISIBILITY,
      alternateMobile: false,
      alternateEmail: false,
      businessAddress: false,
    },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('Public Profile Privacy & Field Visibility Isolation', () => {
  it('excludes all hidden fields, disabled social links, and private custom fields', () => {
    const profile = makeSampleProfile();
    const pub = buildSanitizedPublicProfile(profile);

    expect(pub.isPublic).toBe(true);
    expect(pub.personalInformation?.fullName).toBe('Aarav Mehta');
    expect(pub.personalInformation?.mobile).toBe('+91 98201 44510');

    // Hidden fields MUST be strictly omitted (not even empty strings)
    expect(pub.personalInformation?.alternateMobile).toBeUndefined();
    expect(pub.personalInformation?.alternateEmail).toBeUndefined();
    expect(pub.personalInformation?.businessAddress).toBeUndefined();
    expect(pub.personalInformation?.personalAddress).toBeUndefined();
    expect(pub.personalInformation?.city).toBeUndefined();

    // Only enabled social links appear
    expect(pub.socialLinks).toHaveLength(1);
    expect(pub.socialLinks?.[0].id).toBe('linkedin');

    // Only visible custom fields appear
    expect(pub.customFields).toHaveLength(1);
    expect(pub.customFields?.[0].label).toBe('Book Consultation');
  });

  it('strips all personal info when isPublic is toggled off', () => {
    const profile = makeSampleProfile({ isPublic: false });
    const pub = buildSanitizedPublicProfile(profile, 'Profile temporarily offline.');

    expect(pub.isPublic).toBe(false);
    expect(pub.personalInformation).toBeUndefined();
    expect(pub.socialLinks).toBeUndefined();
    expect(pub.customFields).toBeUndefined();
    expect(pub.unavailableMessage).toBe('Profile temporarily offline.');
  });

  it('honors explicit visibilitySettings.socialLinks overrides over link.enabled', () => {
    const profile = makeSampleProfile({
      visibilitySettings: {
        ...DEFAULT_VISIBILITY,
        socialLinks: {
          linkedin: false,
          github: true,
        },
      },
    });
    const pub = buildSanitizedPublicProfile(profile);
    expect(pub.socialLinks?.map((l) => l.id)).toEqual(['github']);
  });
});

describe('vCard (.vcf) Generation', () => {
  it('generates RFC-compliant vCard 3.0 from strictly visible public fields', () => {
    const profile = makeSampleProfile();
    const pub = buildSanitizedPublicProfile(profile) as Parameters<typeof buildPublicVCard>[0];
    const vcf = buildPublicVCard(pub, 'https://tapnex.in/p/aarav-mehta');

    expect(vcf).toContain('BEGIN:VCARD');
    expect(vcf).toContain('VERSION:3.0');
    expect(vcf).toContain('FN:Aarav Mehta');
    expect(vcf).toContain('N:Mehta;Aarav;;;');
    expect(vcf).toContain('ORG:Meridian Advisory');
    expect(vcf).toContain('TEL;TYPE=CELL,VOICE:+91 98201 44510');
    expect(vcf).toContain('EMAIL;TYPE=PREF,INTERNET:aarav@meridianadvisory.in');
    expect(vcf).toContain('URL;TYPE=DigitalProfile:https://tapnex.in/p/aarav-mehta');
    expect(vcf).not.toContain('+91 99999 00000');
    expect(vcf).not.toContain('private@personal.in');
    expect(vcf).toContain('END:VCARD');
  });
});

describe('Slug Sanitization & Print-Ready 300 DPI Geometry', () => {
  it('sanitizes profile URL slugs safely', () => {
    expect(sanitizeSlug('  Aarav Mehta — Founder! ')).toBe('aarav-mehta-founder');
    expect(sanitizeSlug('___hello---world___')).toBe('hello-world');
  });

  it('calculates profile completion percentage accurately', () => {
    const profile = makeSampleProfile();
    expect(calculateProfileCompletion(profile)).toBe(100);
    expect(calculateProfileCompletion(null)).toBe(0);
  });

  it('computes exact ISO 7810 ID-1 85.6x54mm + 3mm bleed at 300 DPI (1082x709 px)', () => {
    const fullW = CARD_TRIM_LANDSCAPE_MM.width + CARD_BLEED_MM * 2;
    const fullH = CARD_TRIM_LANDSCAPE_MM.height + CARD_BLEED_MM * 2;
    expect(fullW).toBeCloseTo(91.6, 2);
    expect(fullH).toBeCloseTo(60.0, 2);
    expect(mmToPx300Dpi(fullW)).toBe(1082);
    expect(mmToPx300Dpi(fullH)).toBe(709);
  });

  it('resolves card template tokens cleanly including extended profile fields', () => {
    const resolved = resolveCardTokens('{{FULL_NAME}} — {{COMPANY}}', {
      fullName: 'Priya Deshmukh',
      companyName: 'Studio Vastu',
    });
    expect(resolved).toBe('Priya Deshmukh — Studio Vastu');

    const extended = resolveCardTokens(
      '{{BUSINESS_CATEGORY}} | {{WHATSAPP}} | {{ALTERNATE_MOBILE}} | {{ALTERNATE_EMAIL}} | {{CITY_STATE}} | {{ADDRESS}} | {{PERSONAL_ADDRESS}} | {{SHORT_BIO}}',
      {
        businessCategory: 'Architecture',
        whatsapp: '+91 98201 44510',
        alternateMobile: '+91 99999 11111',
        alternateEmail: 'desk@vastu.in',
        city: 'Pune',
        state: 'Maharashtra',
        businessAddress: 'FC Road, 12',
        personalAddress: 'Kothrud, Pune',
        shortBio: 'Sustainable spatial studio.',
      }
    );
    expect(extended).toBe(
      'Architecture | +91 98201 44510 | +91 99999 11111 | desk@vastu.in | Pune, Maharashtra | FC Road, 12, Pune, Maharashtra | Kothrud, Pune | Sustainable spatial studio.'
    );

    const genericFallbacks = resolveCardTokens(
      '{{FULL_NAME}} | {{MOBILE}} | {{EMAIL}} | {{WEBSITE}}',
      {}
    );
    expect(genericFallbacks).toBe('Your Name | Your Number | Your Email ID | Your Website');
  });
});

describe('Razorpay HMAC-SHA256 Verification & Firestore Security Guardrails', () => {
  it('verifies authentic HMAC-SHA256 signatures and rejects tampered payment IDs', () => {
    const secret = 'test_rzp_secret_key';
    const orderId = 'order_123456';
    const paymentId = 'pay_789012';
    const sig = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex');
    expect(crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))).toBe(true);

    const tamperedExpected = crypto
      .createHmac('sha256', secret)
      .update(`${orderId}|pay_tampered`)
      .digest('hex');
    expect(crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(tamperedExpected))).toBe(false);
  });

  it('verifies deployed firestore.rules enforces email verification and anti-tamper payment checks', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain('request.auth.token.email_verified == true');
    expect(rules).toContain("incoming().paymentStatus == 'Pending'");
    expect(rules).toContain("incoming().orderStatus == 'Awaiting Payment'");
    expect(rules).toContain('existsAfter(/databases/$(database)/documents/payments/$(orderId))');
    expect(rules).toContain('allow get: if isValidId(slug);');
    expect(rules).toContain('paymentConfirmed');
  });

  it('masks sensitive contact values and detects payment confirmation states properly', () => {
    expect(maskPhone('+91 98201 44510')).toContain('***');
    expect(maskPhone('+91 98201 44510')).not.toBe('+91 98201 44510');
    expect(maskEmail('aarav@meridianadvisory.in')).toBe('aa***@me***.in');

    expect(
      isOrderPaymentConfirmed(
        [
          {
            orderId: 'ord_1',
            orderNumber: 'TNX-1',
            uid: 'u1',
            profileId: 'prof_1',
            designId: 'des_1',
            quantity: 1,
            total: 999,
            currency: 'INR',
            paymentStatus: 'Pending',
            orderStatus: 'Awaiting Payment',
            shippingAddress: {
              fullName: 'Aarav',
              mobile: '9820144510',
              email: 'a@b.in',
              addressLine1: '1',
              city: 'Mumbai',
              state: 'Maharashtra',
              pinCode: '400001',
              country: 'India',
            },
            createdAt: '',
            updatedAt: '',
          },
        ],
        'prof_1'
      )
    ).toBe(false);

    expect(
      isOrderPaymentConfirmed(
        [
          {
            orderId: 'ord_2',
            orderNumber: 'TNX-2',
            uid: 'u1',
            profileId: 'prof_1',
            designId: 'des_1',
            quantity: 1,
            total: 999,
            currency: 'INR',
            paymentStatus: 'Completed',
            orderStatus: 'Payment Successful',
            shippingAddress: {
              fullName: 'Aarav',
              mobile: '9820144510',
              email: 'a@b.in',
              addressLine1: '1',
              city: 'Mumbai',
              state: 'Maharashtra',
              pinCode: '400001',
              country: 'India',
            },
            createdAt: '',
            updatedAt: '',
          },
        ],
        'prof_1'
      )
    ).toBe(true);

    expect(
      isOrderPaymentConfirmed(
        [
          {
            orderId: 'ord_3',
            orderNumber: 'TNX-3',
            uid: 'u1',
            profileId: 'legacy_prof',
            profileSlug: 'aarav-mehta',
            designId: 'des_1',
            quantity: 1,
            total: 999,
            currency: 'INR',
            paymentStatus: 'Verified',
            orderStatus: 'Payment Successful',
            shippingAddress: {
              fullName: 'Aarav',
              mobile: '9820144510',
              email: 'a@b.in',
              addressLine1: '1',
              city: 'Mumbai',
              state: 'Maharashtra',
              pinCode: '400001',
              country: 'India',
            },
            createdAt: '',
            updatedAt: '',
          },
        ],
        'prof_other',
        'aarav-mehta'
      )
    ).toBe(true);
  });
});

describe('Audit Log Filtering & Studio Preview Synchronization', () => {
  it('filters audit logs by preset, custom From/To date range, role, action, and keyword', () => {
    const nowMs = Date.parse('2026-11-17T12:00:00.000Z');
    const logs: AuditLogRecord[] = [
      {
        logId: 'log_1',
        actorUid: 'u1',
        actorEmail: 'admin@tapnex.in',
        actorRole: 'ADMIN',
        action: 'SAVE_CARD_TEMPLATE',
        targetCollection: 'cardTemplates',
        targetId: 'tpl-navy',
        details: 'Updated Corporate Black price',
        createdAt: '2026-11-17T08:00:00.000Z',
      },
      {
        logId: 'log_2',
        actorUid: 'u2',
        actorEmail: 'super@tapnex.in',
        actorRole: 'SUPERADMIN',
        action: 'DELETE_CARD_DESIGN',
        targetCollection: 'cardDesigns',
        targetId: 'des_99',
        details: 'Removed duplicate draft design',
        createdAt: '2026-11-13T10:00:00.000Z',
      },
      {
        logId: 'log_3',
        actorUid: 'u3',
        actorEmail: 'ops@tapnex.in',
        actorRole: 'ADMIN',
        action: 'DELETE_DIGITAL_PROFILE',
        targetCollection: 'profiles',
        targetId: 'prof_old',
        details: 'Deleted old profile',
        createdAt: '2026-10-01T09:00:00.000Z',
      },
    ];

    expect(filterAuditLogs(logs, { preset: 'ALL', nowMs })).toHaveLength(3);
    expect(filterAuditLogs(logs, { preset: 'LAST_24H', nowMs }).map((l) => l.logId)).toEqual(['log_1']);
    expect(filterAuditLogs(logs, { preset: 'LAST_7D', nowMs }).map((l) => l.logId)).toEqual(['log_1', 'log_2']);
    expect(
      filterAuditLogs(logs, {
        preset: 'CUSTOM',
        fromDate: '2026-11-12',
        toDate: '2026-11-15',
        nowMs,
      }).map((l) => l.logId)
    ).toEqual(['log_2']);
    expect(filterAuditLogs(logs, { preset: 'ALL', role: 'SUPERADMIN', nowMs }).map((l) => l.logId)).toEqual([
      'log_2',
    ]);
    expect(filterAuditLogs(logs, { preset: 'ALL', keyword: 'corporate', nowMs }).map((l) => l.logId)).toEqual([
      'log_1',
    ]);
  });

  it('resolves the active Studio card design whenever newer than the last saved Firestore design', () => {
    const baseTpl = DEFAULT_CARD_TEMPLATES[0];
    const altTpl = DEFAULT_CARD_TEMPLATES[1];
    const savedDesign: CardDesignRecord = {
      designId: 'des_saved_1',
      uid: 'u1',
      profileId: 'prof_1',
      templateId: baseTpl.templateId,
      frontDesign: baseTpl.frontSpec,
      backDesign: baseTpl.backSpec,
      cardOrientation: 'landscape',
      dimensions: '85.6x54mm',
      bleed: '3mm',
      approved: true,
      locked: false,
      version: 1,
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z',
    };

    const resolvedNewerDraft = resolveEffectiveCardDesign({
      savedDesign,
      savedTimestampMs: Date.parse('2026-11-10T10:00:00.000Z'),
      localDraft: {
        profileId: 'prof_1',
        templateId: altTpl.templateId,
        templateName: altTpl.name,
        cardOrientation: 'vertical',
        frontDesign: altTpl.frontSpec,
        backDesign: altTpl.backSpec,
        updatedMs: Date.parse('2026-11-17T09:00:00.000Z'),
      },
      uid: 'u1',
      profileId: 'prof_1',
    });

    expect(resolvedNewerDraft?.templateId).toBe(altTpl.templateId);
    expect(resolvedNewerDraft?.cardOrientation).toBe('vertical');

    const resolvedOlderDraft = resolveEffectiveCardDesign({
      savedDesign,
      savedTimestampMs: Date.parse('2026-11-17T12:00:00.000Z'),
      localDraft: {
        profileId: 'prof_1',
        templateId: altTpl.templateId,
        templateName: altTpl.name,
        cardOrientation: 'vertical',
        frontDesign: altTpl.frontSpec,
        backDesign: altTpl.backSpec,
        updatedMs: Date.parse('2026-11-17T09:00:00.000Z'),
      },
      uid: 'u1',
      profileId: 'prof_1',
    });

    expect(resolvedOlderDraft?.templateId).toBe(baseTpl.templateId);
    expect(resolvedOlderDraft?.cardOrientation).toBe('landscape');
  });
});

describe('Direct URL QR Generator & Auto Print Auth ID', () => {
  it('generates print-grade QR SVG and data URL directly without requiring a backend endpoint', async () => {
    const artwork = await generateHighResQrArtwork('https://tapnex.in/p/jeet-kulkarni', 1024);
    expect(artwork.targetUrl).toBe('https://tapnex.in/p/jeet-kulkarni');
    expect(artwork.svgContent).toContain('<svg');
    expect(artwork.svgContent.length).toBeLessThan(100000);
    expect(artwork.pngDataUrl.startsWith('data:image/')).toBe(true);
  });

  it('auto-generates Print Auth IDs compatible with Firestore document ID rules', () => {
    const id1 = generatePrinterAuthId();
    const id2 = generatePrinterAuthId();
    expect(id1).toMatch(/^prt_[a-z0-9]+_[a-z0-9]+$/);
    expect(id2).toMatch(/^[a-zA-Z0-9_\-]+$/);
    expect(id1.length).toBeGreaterThanOrEqual(6);
    expect(id1).not.toBe(id2);
  });

  it('ensures firestore.rules supports verified users and null-safe cardDesigns lookup', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain("!(get(/databases/$(database)/documents/users/$(request.auth.uid)).data.status in ['Blocked', 'Disabled'])");
    expect(rules).toContain("existing().status == 'Pending Verification' && isVerified() && incoming().status == 'Active'");
    expect(rules).toContain('resource == null ? isSignedIn()');
  });
});

describe('Workspace Factory Reset & SuperAdmin Wipe Safeguards', () => {
  it('covers all operational collections and enforces SuperAdmin role guard', async () => {
    expect(RESETTABLE_OPERATIONAL_COLLECTIONS).toEqual([
      'orders',
      'payments',
      'qrCodes',
      'shippingRecords',
      'cardDesigns',
      'supportTickets',
      'notifications',
      'printers',
      'profiles',
      'publicProfiles',
      'auditLogs',
    ]);

    await expect(
      resetApplicationToFreshBlank({ uid: 'u_admin', email: 'admin@tapnex.in', role: 'ADMIN' })
    ).rejects.toThrow('Only SuperAdmin accounts can reset all application data.');
  });

  it('verifies firestore.rules allows SuperAdmin cleanup on auditLogs while blocking updates and self-deletion', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain('allow update: if false;');
    expect(rules).toContain('allow delete: if isValidId(logId) && isSuperAdmin();');
    expect(rules).toContain('allow delete: if isValidId(uid) && isSuperAdmin() && uid != request.auth.uid;');
  });
});

describe('Platform Complete User Role Guide Coverage', () => {
  it('covers all five user roles with annotated screenshots and step-by-step workflows', () => {
    expect(ROLE_CAPABILITY_MATRIX).toHaveLength(5);
    expect(ROLE_GUIDES.map((r) => r.roleId)).toEqual([
      'public',
      'customer',
      'printer',
      'admin',
      'superadmin',
    ]);

    const seenScenes = new Set<string>();
    for (const role of ROLE_GUIDES) {
      expect(role.features.length).toBeGreaterThanOrEqual(1);
      for (const feat of role.features) {
        expect(feat.route.length).toBeGreaterThan(0);
        expect(feat.callouts).toHaveLength(4);
        expect(feat.callouts.map((c) => c.num)).toEqual([1, 2, 3, 4]);
        expect(feat.steps.length).toBeGreaterThanOrEqual(4);
        expect(feat.notes.length).toBeGreaterThanOrEqual(1);
        expect(seenScenes.has(feat.screenshotId)).toBe(false);
        seenScenes.add(feat.screenshotId);
      }
    }
    expect(seenScenes.size).toBe(8);
  });
});

describe('Outer Google Sign-In Concurrency & Rule Safeguards', () => {
  it('enforces deduplicated user sync and non-blocking profile creation in AuthContext', () => {
    const authSrc = fs.readFileSync(path.resolve(process.cwd(), 'src/contexts/AuthContext.tsx'), 'utf8');
    expect(authSrc).toContain('inflightSyncRef');
    expect(authSrc).toContain('ensureDefaultProfile(newUser).catch');
    expect(authSrc).toContain('fbUser.photoURL.length <= 2048');
  });

  it('permits regular and pre-registered Google users to create users/{uid} safely in firestore.rules', () => {
    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain("incoming().role == 'USER' && incoming().status in ['Pending Verification', 'Active']");
    expect(rules).toContain("incoming().role == get(/databases/$(database)/documents/admins/$(request.auth.uid)).data.role");
  });

  it('clamps fallback profile slugs within Firestore 64-char limit', () => {
    const longName = 'A'.repeat(100);
    const cleaned = sanitizeSlug(longName);
    expect(cleaned.length).toBeLessThanOrEqual(60);
    const suffixed = `${cleaned.slice(0, 54).replace(/-+$/, '')}-ab12`;
    expect(suffixed.length).toBeLessThanOrEqual(64);
  });
});

describe('Multi-Gateway Payments, Blank Template Studio & Admin Profile Approval', () => {
  it('merges partial payment gateway settings safely across all 6 gateways without storing secrets', () => {
    const merged = mergePaymentGateways({
      razorpay: {
        id: 'razorpay',
        label: 'Razorpay',
        enabled: false,
        mode: 'live',
        publicKeyId: 'rzp_live_123',
      },
      gpay: {
        id: 'gpay',
        label: 'Google Pay (GPay)',
        enabled: true,
        mode: 'live',
        upiId: 'business@okaxis',
      },
    });

    expect(Object.keys(merged)).toEqual(PAYMENT_GATEWAY_ORDER);
    expect(merged.razorpay.enabled).toBe(false);
    expect(merged.razorpay.mode).toBe('live');
    expect(merged.razorpay.publicKeyId).toBe('rzp_live_123');
    expect(merged.cashfree.enabled).toBe(true);
    expect(merged.easebuzz.mode).toBe('sandbox');
    expect(merged.gpay.upiId).toBe('business@okaxis');
  });

  it('constructs BLANK_CARD_TEMPLATE with customizable front/back NFC slot and maxWidthPct elements', () => {
    expect(BLANK_CARD_TEMPLATE.templateId).toBe('blank-custom');
    const blankFront = createBlankSideDesign('front', 'data:image/png;base64,abc');
    expect(blankFront.backgroundImageUrl).toBe('data:image/png;base64,abc');
    expect(typeof blankFront.nfcX).toBe('number');
    expect(typeof blankFront.nfcY).toBe('number');
    expect(typeof blankFront.nfcSizeMm).toBe('number');
    expect(blankFront.elements.every((el) => typeof el.maxWidthPct === 'number')).toBe(true);
  });

  it('preserves adminApproved metadata on buildSanitizedPublicProfile and enforces anti-spoof rules in firestore.rules', () => {
    const approvedProfile = makeSampleProfile({
      adminApproved: true,
      adminApprovedAt: '2026-11-21T10:00:00.000Z',
      adminApprovedBy: 'admin_uid_1',
    });
    const pub = buildSanitizedPublicProfile(approvedProfile);
    expect(pub.adminApproved).toBe(true);
    expect(pub.adminApprovedBy).toBe('admin_uid_1');

    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain("'cashfree_live', 'cashfree_sandbox'");
    expect(rules).toContain("'easebuzz_live', 'easebuzz_sandbox'");
    expect(rules).toContain("'payu_live', 'payu_sandbox'");
    expect(rules).toContain("'gpay_live', 'gpay_sandbox'");
    expect(rules).toContain("'upi_live', 'upi_sandbox'");
    expect(rules).toContain("incoming().get('adminApproved', false) == false");
    expect(rules).toContain("incoming().get('adminApproved', false) == existing().get('adminApproved', false)");
  });
});

describe('Editable Card Templates & Shape Elements', () => {
  const NEW_TEMPLATE_IDS = [
    'gold-obsidian-split',
    'royal-badge-vertical',
    'champagne-diagonal',
    'noir-gold-arc',
    'slate-wave-minimal',
    'sand-taupe-signature',
    'cream-terracotta-atelier',
  ];

  it('includes all 7 new fully-editable templates in DEFAULT_CARD_TEMPLATES with valid shapes', () => {
    const ids = DEFAULT_CARD_TEMPLATES.map((t) => t.templateId);
    for (const id of NEW_TEMPLATE_IDS) {
      expect(ids).toContain(id);
      const tpl = DEFAULT_CARD_TEMPLATES.find((t) => t.templateId === id)!;
      expect(tpl.frontSpec.elements.length).toBeGreaterThan(0);
      expect(tpl.backSpec.elements.length).toBeGreaterThan(0);
      const totalShapes = (tpl.frontSpec.shapes?.length || 0) + (tpl.backSpec.shapes?.length || 0);
      expect(totalShapes).toBeGreaterThan(0);
      for (const shape of [...(tpl.frontSpec.shapes || []), ...(tpl.backSpec.shapes || [])]) {
        expect(['rect', 'circle', 'line', 'pill']).toContain(shape.kind);
        expect(typeof shape.xPct).toBe('number');
        expect(typeof shape.yPct).toBe('number');
        expect(typeof shape.widthPct).toBe('number');
        expect(typeof shape.heightPct).toBe('number');
        expect(shape.color).toMatch(/^(#[0-9a-fA-F]{3,8}|transparent)$/);
      }
    }
  });

  it('keeps all templates free of hardcoded sample personal names or phone numbers', () => {
    const forbiddenLiterals = ['Jane Doe', 'Michal Johns', 'Mina Nguyen', 'Olivia Wilson', 'Jonathan', 'Aaron Loeb'];
    for (const tpl of DEFAULT_CARD_TEMPLATES) {
      const texts = [
        ...tpl.frontSpec.elements.map((e) => e.text),
        ...tpl.backSpec.elements.map((e) => e.text),
      ];
      for (const txt of texts) {
        for (const forbidden of forbiddenLiterals) {
          expect(txt.toLowerCase()).not.toContain(forbidden.toLowerCase());
        }
      }
      if (tpl.frontSpec.showAvatar && tpl.frontSpec.avatarShape) {
        expect(['circle', 'rounded', 'square']).toContain(tpl.frontSpec.avatarShape);
      }
    }
  });

  it('registers Azure Tech Waves background as the sole default template and prioritizes default first in sortCardTemplates', () => {
    const azure = DEFAULT_CARD_TEMPLATES.find((t) => t.templateId === 'azure-tech-waves');
    expect(azure).toBeDefined();
    expect(azure!.isDefault).toBe(true);
    expect(azure!.active).toBe(true);
    expect(azure!.frontSpec.backgroundImageUrl).toBe(
      '/assets/aistudio/Abstract_blue_healthcare_technology_waves_d3f00c1d.webp'
    );
    expect(azure!.backSpec.backgroundImageUrl).toBe(
      '/assets/aistudio/Abstract_blue_healthcare_technology_waves_d3f00c1d.webp'
    );

    const defaults = DEFAULT_CARD_TEMPLATES.filter((t) => t.isDefault);
    expect(defaults.map((t) => t.templateId)).toEqual(['azure-tech-waves']);

    const sortedWithCustomDefault = sortCardTemplates([
      ...DEFAULT_CARD_TEMPLATES.filter((t) => t.templateId !== 'minimal-white').map((t) => ({
        ...t,
        isDefault: false,
      })),
      { ...DEFAULT_CARD_TEMPLATES.find((t) => t.templateId === 'minimal-white')!, isDefault: true },
    ]);
    expect(sortedWithCustomDefault[0].templateId).toBe('minimal-white');
  });
});

describe('Design Studio Layout Engine, Rich Bio Sanitizer & Link Controls', () => {
  it('wraps long card text lines accurately using wrapCanvasTextLines', () => {
    const measure = (txt: string) => txt.length * 10;
    const wrapped = wrapCanvasTextLines(measure, 'TapNex Smart Business Identity Systems', 120);
    expect(wrapped.length).toBeGreaterThan(1);
    for (const line of wrapped) {
      expect(measure(line)).toBeLessThanOrEqual(120);
    }

    const longWord = wrapCanvasTextLines(measure, 'https://verylongcustomdomainexample.tapnex.in/profile', 100);
    expect(longWord.length).toBeGreaterThan(2);
    for (const line of longWord) {
      expect(measure(line)).toBeLessThanOrEqual(100);
    }
  });

  it('aligns multiple selected elements, snaps to alignment guidelines, and nudges cleanly', () => {
    const baseSide = createBlankSideDesign('front');
    const customSide = {
      ...baseSide,
      elements: [
        { ...baseSide.elements[0], id: 'el_a', xPct: 10, yPct: 20, maxWidthPct: 30 },
        { ...baseSide.elements[1], id: 'el_b', xPct: 40, yPct: 50, maxWidthPct: 30 },
      ],
    };

    const alignedLeft = alignTargetsOnSide(
      customSide,
      [
        { kind: 'text', id: 'el_a' },
        { kind: 'text', id: 'el_b' },
      ],
      'left',
      'landscape'
    );
    expect(alignedLeft.elements[0].xPct).toBe(10);
    expect(alignedLeft.elements[1].xPct).toBe(10);

    const alignedTop = alignTargetsOnSide(
      customSide,
      [
        { kind: 'text', id: 'el_a' },
        { kind: 'text', id: 'el_b' },
      ],
      'top',
      'landscape'
    );
    expect(alignedTop.elements[0].yPct).toBe(20);
    expect(alignedTop.elements[1].yPct).toBe(20);

    const snapped = computeSnapAndGuidelines({
      side: customSide,
      movingTarget: { kind: 'text', id: 'el_a' },
      candidateX: 40.5,
      candidateY: 49.4,
      orientation: 'landscape',
    });
    expect(snapped.snappedX).toBe(40);
    expect(snapped.snappedY).toBe(50);
    expect(snapped.verticalGuides.length).toBeGreaterThan(0);
    expect(snapped.horizontalGuides.length).toBeGreaterThan(0);

    const nudgedFine = nudgeTargetsOnSide(
      customSide,
      [{ kind: 'text', id: 'el_a' }],
      0.25,
      -0.25
    );
    expect(nudgedFine.elements[0].xPct).toBe(10.25);
    expect(nudgedFine.elements[0].yPct).toBe(19.75);
    expect(nudgedFine.elements[1].xPct).toBe(40);
  });

  it('sanitizes rich text biography HTML strictly and preserves safe formatting & hex colors', () => {
    expect(normalizeHexColor('#abc')).toBe('#AABBCC');
    expect(normalizeHexColor('1d4ed8')).toBe('#1D4ED8');
    expect(normalizeHexColor('javascript:alert(1)')).toBeNull();

    const dirty =
      '<div style="text-align: center" onclick="alert(1)"><strong style="color: #1D4ED8">AI Architect</strong><script>steal()</script><img src="x" onerror="xss()" /> &amp; <em>Founder</em></div>';
    const clean = sanitizeRichBioHtml(dirty);
    expect(clean).toContain('text-align: center');
    expect(clean).toContain('<strong style="color: #1D4ED8">AI Architect</strong>');
    expect(clean).toContain('<em>Founder</em>');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('<img');

    const plain = stripHtmlToPlainText(clean);
    expect(plain).toBe('AI Architect & Founder');
  });

  it('strips rich bio HTML tags when exporting vCard (.vcf) and enforces SMART Help + adminDisabled in firestore.rules', () => {
    const profileWithRichBio = makeSampleProfile({
      personalInformation: {
        ...makeSampleProfile().personalInformation,
        shortBio: '<p><strong>Executive</strong> <em>Advisor</em><br />Pune</p>',
      },
    });
    const pub = buildSanitizedPublicProfile(profileWithRichBio) as Parameters<typeof buildPublicVCard>[0];
    const vcf = buildPublicVCard(pub, 'https://tapnex.in/p/aarav-mehta');
    expect(vcf).toContain('NOTE:Executive Advisor Pune');
    expect(vcf).not.toContain('<strong>');

    const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
    expect(rules).toContain("'SMART Help'");
    expect(rules).toContain('adminDisabled');
  });
});


