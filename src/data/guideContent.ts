export type GuideRoleId = 'public' | 'customer' | 'printer' | 'admin' | 'superadmin';

export type ScreenshotSceneId =
  | 'public_landing_and_profile'
  | 'customer_profile_visibility'
  | 'customer_card_studio'
  | 'customer_checkout_fulfilment'
  | 'printer_production_dispatch'
  | 'admin_approved_print_templates'
  | 'admin_orders_audit_logs'
  | 'superadmin_rbac_qr_reset';

export interface ScreenshotCallout {
  num: number;
  title: string;
  detail: string;
}

export interface GuideFeatureSection {
  id: string;
  title: string;
  route: string;
  summary: string;
  screenshotId: ScreenshotSceneId;
  screenshotCaption: string;
  callouts: ScreenshotCallout[];
  steps: string[];
  notes: string[];
}

export interface RoleGuideSpec {
  roleId: GuideRoleId;
  roleTitle: string;
  roleCode: string;
  portalPath: string;
  audience: string;
  overview: string;
  features: GuideFeatureSection[];
}

export interface RoleCapabilityRow {
  role: string;
  accessLevel: string;
  portalEntry: string;
  primaryWorkflows: string;
}

export const ROLE_CAPABILITY_MATRIX: RoleCapabilityRow[] = [
  {
    role: 'Public Visitor',
    accessLevel: 'No Login Required',
    portalEntry: '/ and /p/:slug',
    primaryWorkflows: 'Browse card designs & pricing, tap NFC or scan QR to open /p/:slug, download vCard (.vcf), contact via WhatsApp/Call/Email.',
  },
  {
    role: 'Customer (USER)',
    accessLevel: 'Verified Email / Google Sign-In',
    portalEntry: '/dashboard',
    primaryWorkflows: 'Manage profile(s), crop avatar, auto-save social links, toggle privacy, design 85.6x54mm card, pay via Razorpay, track 12-step fulfilment.',
  },
  {
    role: 'Print Partner (PRINTER)',
    accessLevel: 'Admin-Onboarded Printer UID',
    portalEntry: '/printer/dashboard',
    primaryWorkflows: 'View assigned orders, export 300 DPI print-ready PDF (with 3mm bleed & crop marks) and 1024px QR, advance production, dispatch via courier.',
  },
  {
    role: 'Operations Admin (ADMIN)',
    accessLevel: 'Assigned by SuperAdmin',
    portalEntry: '/admin/dashboard',
    primaryWorkflows: 'Manage users & printers, moderate /p/:slug profiles, Send Approved Designs to Print, edit templates, verify payments, filter audit logs.',
  },
  {
    role: 'SuperAdmin (SUPERADMIN)',
    accessLevel: 'Root Governance Role',
    portalEntry: '/superadmin/dashboard',
    primaryWorkflows: 'Assign ADMIN/PRINTER roles, configure Admin permission matrix, generate direct URL QR artwork, manage INR/GST settings, run Factory Reset.',
  },
];

export const ROLE_GUIDES: RoleGuideSpec[] = [
  {
    roleId: 'public',
    roleTitle: 'Public Visitor & Card Recipient',
    roleCode: 'PUBLIC',
    portalPath: '/ and /p/:slug',
    audience: 'Prospects, networking contacts, and NFC/QR scanners',
    overview:
      'Anyone who visits the TapNex storefront or taps a physical NFC business card (or scans its fallback QR code) lands on a fast, login-free experience tailored for instant contact exchange.',
    features: [
      {
        id: 'public-profile-page',
        title: 'Live Digital Business Profile & Marketing Site',
        route: '/p/:slug · /card-designs · /pricing · /nfc-guide',
        summary:
          'When a recipient taps an NFC card or scans its QR code, /p/:slug renders only the fields explicitly allowed by the card owner in Visibility Settings.',
        screenshotId: 'public_landing_and_profile',
        screenshotCaption: 'Public Digital Profile (/p/:slug) showing prominent TapNex logo, cropped avatar, bio, and one-tap vCard download.',
        callouts: [
          {
            num: 1,
            title: 'Prominent Brand Header & Share Action',
            detail: 'Displays the high-contrast TapNex Smart Connections logo alongside a native Share button for copying or sharing the profile link.',
          },
          {
            num: 2,
            title: 'Profile Identity & Biography',
            detail: 'Shows the circular auto-fitted avatar, full name, job title, company, and biography when enabled in Public Profile Settings.',
          },
          {
            num: 3,
            title: 'One-Click Save Contact (.vcf) & WhatsApp',
            detail: 'Generates a standards-compliant vCard 3.0 file containing strictly public fields—never exposing hidden alternate phone or private email values.',
          },
          {
            num: 4,
            title: 'Verified Contact, Addresses & Social Links',
            detail: 'Renders mobile, email, website, business/personal address, custom fields, and enabled social icons in clean order.',
          },
        ],
        steps: [
          'Tap the physical NFC card against the top edge of an iPhone (XS or newer) or back center of an Android phone, or scan the printed QR code.',
          'Review the contact card, bio, and business details on /p/:slug without needing any app install or account login.',
          'Tap Save Contact to download the .vcf file directly into your phone address book, or tap WhatsApp / Call / Email for instant outreach.',
          'If a profile owner temporarily disables public visibility, visitors safely see the configured deactivated profile notice instead of personal data.',
        ],
        notes: [
          'Private fields unchecked in Public Profile Settings are omitted from Firestore publicProfiles/{slug} and from generated .vcf downloads.',
          'Customers with verified card purchases display a verified smart-card holder status on their live profile.',
        ],
      },
    ],
  },
  {
    roleId: 'customer',
    roleTitle: 'Customer Portal (Card Owner)',
    roleCode: 'USER',
    portalPath: '/dashboard',
    audience: 'Professionals, founders, and teams creating NFC smart cards',
    overview:
      'Authenticated customers manage one or more digital identities, design print-grade front and back card layouts, complete Razorpay checkout, and track their 12-step physical card fulfilment.',
    features: [
      {
        id: 'customer-profile-visibility',
        title: 'Digital Profile Editor, Photo Cropper, Social Links & Privacy',
        route: '/dashboard/profile · /dashboard/social-links · /dashboard/visibility',
        summary:
          'Complete identity workspace with auto-fit photo cropping, smart same-as-mobile/address checkboxes, automatic social link saving, and field-level privacy isolation.',
        screenshotId: 'customer_profile_visibility',
        screenshotCaption: 'Customer Profile & Public Availability controls with photo cropper, smart copy checkboxes, and granular privacy toggles.',
        callouts: [
          {
            num: 1,
            title: 'Multi-Profile Switcher & Slug Availability',
            detail: 'Create Personal, Business, or Real Estate profiles under one login (when enabled) and claim a unique /p/your-slug URL.',
          },
          {
            num: 2,
            title: 'Auto-Fit Photo Upload & Interactive Cropper',
            detail: 'Automatically centers uploaded portraits and lets you zoom, pan, and frame the exact face region before saving.',
          },
          {
            num: 3,
            title: 'Smart Copy Checkboxes & Instant Social Save',
            detail: 'One-click "Same as Mobile Number" for WhatsApp, "Same as Business Address" for Personal Address, and auto-saved Social Links across 16+ platforms.',
          },
          {
            num: 4,
            title: 'Public Profile Visibility Checkboxes',
            detail: 'Every checked item (including Alternate Mobile, Alternate Email, Business/Personal Address, Social Links, and Custom Fields) syncs immediately to /p/:slug.',
          },
        ],
        steps: [
          'Sign in via Google or verified Email/Password from /login and open Customer Portal -> My Profile.',
          'Upload a profile photo and adjust the crop/zoom framing so the subject sits cleanly inside the circular avatar.',
          'Fill in designation, company, bio, phone, email, and addresses—use the checkboxes to mirror Mobile -> WhatsApp and Business -> Personal Address.',
          'Open Social Links to add, reorder, or toggle links (changes save automatically without needing an extra save click), then verify checked fields in Public Profile Settings.',
        ],
        notes: [
          'Every save synchronizes both private profiles/{profileId} and sanitized publicProfiles/{slug} atomically.',
          'Social links added or toggled persist automatically right after each action.',
        ],
      },
      {
        id: 'customer-card-studio',
        title: 'Business Card Design Studio (85.6 × 54 mm Print Canvas)',
        route: '/dashboard/card-design',
        summary:
          'Full WYSIWYG front-and-back NFC card designer with profile data dropdown insertion, double-click inline text editing, rich typography toolbar, and finished preview.',
        screenshotId: 'customer_card_studio',
        screenshotCaption: 'Business Design Studio showing template picker, rich text formatting bar, draggable card elements, and Finished Preview.',
        callouts: [
          {
            num: 1,
            title: 'Template, Orientation & Background Controls',
            detail: 'Switch between ISO 7810 ID-1 Landscape (85.6 x 54 mm) or Vertical (54 x 85.6 mm), pick a preset template, or upload custom background artwork.',
          },
          {
            num: 2,
            title: 'Rich Text & Element Styling Toolbar',
            detail: 'Edit any default or custom text element: Bold, Italic, Underline, Font Family, Font Size (pt), Text Color, Alignment, or double-click text right on the card.',
          },
          {
            num: 3,
            title: 'Profile Details Dropdown & Drag-and-Drop Canvas',
            detail: 'Insert pre-filled profile fields (Full Name, Job Title, Mobile, WhatsApp, Email, Business/Personal Address) from a single clean dropdown and drag freely inside 3mm bleed & 4mm safe guides.',
          },
          {
            num: 4,
            title: 'Preview Finished Card & Approve Design',
            detail: 'Open the Front & Back / Flip Card finished preview (hiding bleed lines) to inspect the exact final look before clicking Approve Design.',
          },
        ],
        steps: [
          'Open Design My Card and pick a base template or upload your own background image and company logo.',
          'Use the Profile Details dropdown to place any already-saved profile fields onto the Front or Back side without retyping.',
          'Click or double-click any text element (default or custom) to edit wording, then format with Bold, Italic, Underline, Font, Size, and Color.',
          'Click Preview Card to inspect the finished Front & Back (or Flip Card) look, then click Save Draft or Approve Design to unlock Checkout.',
        ],
        notes: [
          'QR codes appear as a placement slot in Studio prior to purchase; actual high-res QR artwork is generated automatically only after payment verification or Admin Send-to-Print.',
          'Local Studio changes are cached safely in browser drafts and synchronized to Firestore when saved or approved.',
        ],
      },
      {
        id: 'customer-checkout-fulfilment',
        title: 'Razorpay Checkout & 12-Step Fulfilment Tracking',
        route: '/dashboard/checkout · /dashboard/orders · /dashboard/support',
        summary:
          'Approve a design to proceed to GST-inclusive checkout, verify payment via Razorpay, and follow real-time production through the 12-stage fulfilment timeline.',
        screenshotId: 'customer_checkout_fulfilment',
        screenshotCaption: 'Customer Orders view featuring the 12-step end-to-end fulfilment progress tracker, courier tracking, and invoice summary.',
        callouts: [
          {
            num: 1,
            title: 'Order Breakdown & GST Calculation',
            detail: 'Computes card quantity x unit price + configurable GST % + India shipping charge before launching Razorpay checkout.',
          },
          {
            num: 2,
            title: '12-Step End-to-End Fulfilment Timeline',
            detail: 'Tracks every milestone from Design Pending, Design Approved, and Payment Successful through Printing, Quality Check, Dispatched, and Delivered.',
          },
          {
            num: 3,
            title: 'Courier Tracking & Post-Purchase QR Access',
            detail: 'Displays courier partner, AWB tracking number, dispatch date, and customer QR download (when permitted in Global Settings).',
          },
          {
            num: 4,
            title: 'Support & Design Revision Tickets',
            detail: 'Submit Order, Design Revision, NFC Help, or Billing tickets directly from Help & Support.',
          },
        ],
        steps: [
          'From an approved design in Studio, click Proceed to Checkout, select card quantity, and enter your Indian delivery address.',
          'Complete Razorpay payment (live checkout or sandbox HMAC verification); your approved design locks automatically for print accuracy.',
          'Track live manufacturing and courier status on My Orders via the 12-step Fulfilment Timeline.',
          'Use Help & Support if you need a post-order revision before printing starts or assistance testing NFC.',
        ],
        notes: [
          'Standard pan-India manufacturing and courier delivery timeline is 10-15 days from payment verification.',
          'Order totals and payment signatures are validated server-side against Firestore security rules before marking orders Verified.',
        ],
      },
    ],
  },
  {
    roleId: 'printer',
    roleTitle: 'Print Partner Portal',
    roleCode: 'PRINTER',
    portalPath: '/printer/dashboard',
    audience: 'Authorized printing and NFC encoding facilities',
    overview:
      'Print partners receive assigned, print-ready customer jobs complete with exact 300 DPI dual-sided PDFs, 1024px/SVG QR artwork, shipping labels, and fulfilment stage controls.',
    features: [
      {
        id: 'printer-production-dispatch',
        title: 'Print Queue, 300 DPI PDF Export & Courier Dispatch',
        route: '/printer/dashboard · /printer/orders/:orderId · /printer/profile',
        summary:
          'Dedicated production console displaying only orders assigned to the authenticated printer facility, with print-ready PDF downloads and dispatch tracking.',
        screenshotId: 'printer_production_dispatch',
        screenshotCaption: 'Printer Order Detail screen with 300 DPI PDF export, verified QR artwork, 12-step progress controls, and courier dispatch.',
        callouts: [
          {
            num: 1,
            title: 'Assigned Print Queue & Order Summary',
            detail: 'Lists assigned orders with card material, quantity, NFC encoding target URL (/p/:slug), and customer shipping address.',
          },
          {
            num: 2,
            title: '300 DPI Print-Ready PDF & QR Downloads',
            detail: 'Exports exact 85.6 x 54 mm (plus 3 mm bleed = 91.6 x 60 mm, 1082 x 709 px) front/back PDFs with crop marks and embedded verified QR code.',
          },
          {
            num: 3,
            title: 'Production Stage Advancement',
            detail: 'Move jobs forward cleanly across Assigned to Printer -> Printing in Progress -> Quality Check -> Ready for Dispatch -> In Transit -> Delivered.',
          },
          {
            num: 4,
            title: 'Courier Dispatch Form',
            detail: 'Record Courier Name, Tracking Number, Tracking URL, and Dispatch Date—automatically updating the customer timeline and shipping ledger.',
          },
        ],
        steps: [
          'Log in to the Printer Portal and open Assigned Orders to inspect newly routed jobs.',
          'Open an order and download the 300 DPI Print-Ready PDF (with or without proof guides) along with standalone 1024px PNG/SVG QR files if needed.',
          'Encode the NTAG215 NFC chip with the displayed customer profile URL (/p/:slug) and update status to Printing in Progress -> Quality Check -> Ready for Dispatch.',
          'Once handed to the courier, enter Courier Name, Tracking Number, and Dispatch Date and click Mark Dispatched.',
        ],
        notes: [
          'Printers can only read and update orders explicitly assigned to their printerId; customer payment mutations are locked.',
          'Verify NFC chip readability and QR scan contrast during Quality Check before marking Ready for Dispatch.',
        ],
      },
    ],
  },
  {
    roleId: 'admin',
    roleTitle: 'Operations Admin Portal',
    roleCode: 'ADMIN',
    portalPath: '/admin/dashboard',
    audience: 'Operations managers overseeing designs, orders, printers, and support',
    overview:
      'Admins run day-to-day platform operations: onboarding print partners, sending approved customer designs directly to print, managing card templates, moderating public profiles, and auditing activity.',
    features: [
      {
        id: 'admin-approved-templates',
        title: 'Approved Designs Direct-to-Print & Card Templates Studio',
        route: '/admin/approved-designs · /admin/card-designs · /admin/printers',
        summary:
          'Turn approved customer designs straight into print-ready orders with zero manual workarounds, and visually customize card templates with drag positioning and custom backgrounds.',
        screenshotId: 'admin_approved_print_templates',
        screenshotCaption: 'Admin Approved Designs queue with Send to Print / Delete controls alongside Card Template visual editor.',
        callouts: [
          {
            num: 1,
            title: 'Send Approved Design Directly to Print',
            detail: 'Creates or updates the order, generates the 1024px QR artifact, locks the design, assigns a print partner, and initiates the 12-step timeline.',
          },
          {
            num: 2,
            title: 'Design Preview & Trash Bin Delete',
            detail: 'Inspect exact Front & Back artwork (matching Studio design) or delete obsolete/test designs with confirmation.',
          },
          {
            num: 3,
            title: 'Visual Template Editor & Background Upload',
            detail: 'Edit template name, INR price, finish, description, base colors, upload background artwork, and drag elements with the mouse before saving.',
          },
          {
            num: 4,
            title: 'Print Partners Auto Auth ID',
            detail: 'Automatically generates valid Print Auth UIDs when onboarding new printing press partners.',
          },
        ],
        steps: [
          'Open Admin -> Approved Designs to review customer-approved cards. Click Preview to inspect or trash bin to remove unwanted entries.',
          'Click Send to Print on any approved design, choose quantity, pricing, payment status, Print Partner, and initial workflow stage, then confirm.',
          'Open Admin -> Card Templates to create new templates or edit existing ones—upload backgrounds and drag text/QR/NFC slots directly on the preview.',
          'Use Admin -> Printers to onboard facilities with auto-generated Print Auth UIDs and toggle active/blocked status.',
        ],
        notes: [
          'Sending an approved design to print automatically prepares the verified QR code so printers can download the 300 DPI PDF immediately.',
          'Every admin action (template edits, design deletions, direct print routing, payment updates) is recorded in Audit Logs.',
        ],
      },
      {
        id: 'admin-orders-audit',
        title: 'Orders & Payment Control, Profiles Moderation & Audit Logs',
        route: '/admin/orders · /admin/profiles · /admin/audit-logs · /admin/reports',
        summary:
          'Complete order intervention tools, digital profile moderation, CSV/Excel reporting, support ticket replies, and filter-driven security audit logs.',
        screenshotId: 'admin_orders_audit_logs',
        screenshotCaption: 'Admin Orders 12-Step Fulfilment Control and Audit Logs with All / From-To Date / Role / Keyword filters.',
        callouts: [
          {
            num: 1,
            title: '12-Step Order & Payment Override',
            detail: 'Update payment status (Pending/Verified/Completed), assign print partners, advance any of the 12 fulfilment stages, and download 300 DPI PDFs.',
          },
          {
            num: 2,
            title: 'Digital Profiles Moderation',
            detail: 'Search all customer /p/:slug pages, inspect completion and views, enable/disable public visibility, or delete profiles.',
          },
          {
            num: 3,
            title: 'Filter-First Audit Logs',
            detail: 'Logs stay hidden until you select a preset (All, Last 24h, Last 7d, Last 30d, Custom From/To dates), Role, Action, or Keyword.',
          },
          {
            num: 4,
            title: 'Payments Ledger, Shipping & Reports',
            detail: 'Export orders, transactions, and shipment records to CSV/Excel and reply to customer support tickets.',
          },
        ],
        steps: [
          'Open Orders & Payments -> select any order to verify Razorpay payments, assign a printer, or advance fulfilment milestones.',
          'Open Digital Profiles to toggle public availability or clean up unused /p/:slug pages.',
          'Open Audit Logs, pick a Date Range (or All / Last 24h / Custom From-To), optionally enter a keyword or actor role, and click Apply Filter to load matching entries.',
          'Visit Reports and Settings & Email to export operational spreadsheets, customize transactional email copy, and resolve open support tickets.',
        ],
        notes: [
          'Audit logs do not load noisily on page open—they render cleanly only after selecting filter criteria.',
          'Admin permissions can be scoped per capability by a SuperAdmin in the Permissions Matrix.',
        ],
      },
    ],
  },
  {
    roleId: 'superadmin',
    roleTitle: 'SuperAdmin Control Plane',
    roleCode: 'SUPERADMIN',
    portalPath: '/superadmin/dashboard',
    audience: 'Platform owners with unrestricted governance & system reset control',
    overview:
      'SuperAdmins hold root authority over role assignments, per-admin RBAC permissions, direct public URL QR generation, global INR/GST pricing, and full workspace factory reset.',
    features: [
      {
        id: 'superadmin-governance-reset',
        title: 'RBAC Control, Direct URL QR Generator, Global Pricing & Factory Reset',
        route: '/superadmin/roles · /superadmin/permissions · /superadmin/qr-generator · /superadmin/system-settings',
        summary:
          'Manage administrator privileges, generate standalone print-grade QR artwork for any URL, tune global pricing & QR privacy rules, or reset all test data back to a fresh blank state.',
        screenshotId: 'superadmin_rbac_qr_reset',
        screenshotCaption: 'SuperAdmin Control Plane showing Role/Permission Matrix, Direct URL QR Generator, Global Settings, and Danger Zone Factory Reset.',
        callouts: [
          {
            num: 1,
            title: 'Roles & Granular Admin Permissions',
            detail: 'Promote or demote accounts across USER, PRINTER, ADMIN, and SUPERADMIN (protecting the last active SuperAdmin) and toggle 9 modular admin capabilities.',
          },
          {
            num: 2,
            title: 'Direct Public URL QR Generator',
            detail: 'Generate Error-Correction-H 1024px PNG & Vector SVG QR codes for any public URL directly without requiring a customer order.',
          },
          {
            num: 3,
            title: 'Global Pricing, GST, Shipping & Privacy Flags',
            detail: 'Configure company name, support email, base INR card price, GST %, shipping charge, multi-profile flag, and customer post-purchase QR view.',
          },
          {
            num: 4,
            title: 'Danger Zone: Clear All Data & Reset App',
            detail: 'Type RESET to wipe all Firestore orders, payments, designs, profiles, QR codes, printers, tickets, audit logs, and local drafts while keeping your SuperAdmin account active.',
          },
        ],
        steps: [
          'Open Roles & Administrators to promote team members to ADMIN or PRINTER, then configure exact capability checkboxes under Admin Permissions.',
          'Use Generate QR from Any URL to enter any public HTTPS URL and immediately download print-ready 1024px PNG or SVG vector artwork.',
          'Open System Settings to adjust GST %, India shipping fees, or toggle Multi-Profile and Customer Post-Purchase QR visibility.',
          'To return the platform to a fresh blank production state after testing, scroll to Danger Zone, verify options, type RESET, and click Clear All Data & Reset App.',
        ],
        notes: [
          'Security rules prevent demoting the last active SuperAdmin or self-deleting your active SuperAdmin record during a factory reset.',
          'Secondary email/password accounts created in Firebase Authentication can additionally be removed from Firebase Console -> Authentication -> Users.',
        ],
      },
    ],
  },
];
