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
    primaryWorkflows:
      'Browse card designs & pricing, tap NFC or scan QR to open /p/:slug without signing in, download vCard (.vcf), contact via WhatsApp/Call/Email.',
  },
  {
    role: 'Customer (USER)',
    accessLevel: 'Verified Email / Google Sign-In',
    portalEntry: '/dashboard',
    primaryWorkflows:
      'Create multiple profiles with + Digital Profile modal (Label & Slug), switch profiles via dropdown, design blank/preset 85.6x54mm cards (all elements draggable/resizable), pay via 6 gateways, track 12-step Orders & Tracking.',
  },
  {
    role: 'Print Partner (PRINTER)',
    accessLevel: 'Admin-Onboarded Printer UID',
    portalEntry: '/printer/dashboard',
    primaryWorkflows:
      'View assigned orders, export 300 DPI print-ready PDF (with 3mm bleed & crop marks) and 1024px QR, advance production, dispatch via courier.',
  },
  {
    role: 'Operations Admin (ADMIN)',
    accessLevel: 'Assigned by SuperAdmin',
    portalEntry: '/admin/dashboard',
    primaryWorkflows:
      'Use grouped 6-item hubs to manage Users, Profiles & Printers, inspect full customer profile data, approve profile links without payment, configure/enable 6 payment gateways, Send Approved Designs to Print, and filter audit logs.',
  },
  {
    role: 'SuperAdmin (SUPERADMIN)',
    accessLevel: 'Root Governance Role',
    portalEntry: '/superadmin/dashboard',
    primaryWorkflows:
      'Assign ADMIN/PRINTER roles & permissions, inspect/approve profiles, configure & toggle 6 payment gateways (Razorpay, Cashfree, Easebuzz, PayU, Google Pay, UPI), generate direct URL QRs, tune INR/GST, and run Factory Reset.',
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
      'Anyone who visits the TapNex storefront or taps a physical NFC business card (or scans its fallback QR code) lands on a fast, login-free experience at /p/:slug tailored for instant contact exchange.',
    features: [
      {
        id: 'public-profile-page',
        title: 'Live Digital Business Profile & Marketing Site (No Login Required)',
        route: '/p/:slug · /card-designs · /pricing · /nfc-guide',
        summary:
          'When a recipient taps an NFC card or scans its QR code, /p/:slug opens directly without any sign-in prompt and renders only fields allowed by the owner once payment is verified or Admin-approved.',
        screenshotId: 'public_landing_and_profile',
        screenshotCaption:
          'Public Digital Profile (/p/:slug) showing prominent TapNex logo, cropped avatar, bio, and one-tap vCard download without login.',
        callouts: [
          {
            num: 1,
            title: 'Prominent Brand Header & Share Action',
            detail:
              'Displays the high-contrast TapNex Smart Connections logo alongside a native Share button for copying or sharing the /p/:slug link.',
          },
          {
            num: 2,
            title: 'Profile Identity & Biography',
            detail:
              'Shows the circular auto-fitted avatar, full name, job title, company, and biography when enabled in Visibility settings.',
          },
          {
            num: 3,
            title: 'One-Click Save Contact (.vcf) & WhatsApp',
            detail:
              'Generates a standards-compliant vCard 3.0 file containing strictly public fields—never exposing hidden alternate phone or private email values.',
          },
          {
            num: 4,
            title: 'Verified Contact, Addresses & Social Links',
            detail:
              'Renders mobile, email, website, business/personal address, custom fields, and enabled social icons once payment or Admin approval is active.',
          },
        ],
        steps: [
          'Tap the physical NFC card against the top edge of an iPhone (XS or newer) or back center of an Android phone, or scan the printed QR code.',
          'View the digital profile immediately at /p/:slug with zero login or app install required.',
          'Tap Save Contact to download the .vcf file directly into your phone address book, or tap WhatsApp / Call / Email for instant outreach.',
          'If a profile is paused or awaiting payment without Admin approval, visitors see a safe status banner instead of exposing private information.',
        ],
        notes: [
          'Admins and SuperAdmins can manually activate any /p/:slug link via "Approve Profile Link (No Payment)" even while physical card payment is still pending.',
          'If a deployed custom host (such as Netlify) prompts visitors to log in before the app loads, disable Visitor Access / Password Protection in Netlify Site Configuration -> Access & security.',
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
      'The Customer Portal uses a clean 6-item grouped sidebar (Overview, My Profile & Visibility, Design My Card, Orders & Tracking, Account & Support, User Guide) so you never have to hunt across cluttered menus.',
    features: [
      {
        id: 'customer-profile-visibility',
        title: '+ Digital Profile Workflow, Profile Dropdown, Photo Cropper & Privacy Hub',
        route: '/dashboard · /dashboard/profile · /dashboard/social-links · /dashboard/visibility',
        summary:
          'Create new profiles straight from Overview via the + Digital Profile modal (Label & Custom Slug), switch profiles using the top dropdown under My Profile & Visibility, and manage Social Links, Custom Fields, and Privacy Tabs in one grouped hub.',
        screenshotId: 'customer_profile_visibility',
        screenshotCaption:
          'Grouped My Profile & Visibility hub showing Profile Dropdown switcher, + Digital Profile workflow, smart copy checkboxes, and privacy controls.',
        callouts: [
          {
            num: 1,
            title: 'Grouped Sidebar & Hub Tab Bar',
            detail:
              'Access Profile Details, Social Links, Custom Fields, and Public Visibility from one unified sidebar entry ("My Profile & Visibility") and top tab strip.',
          },
          {
            num: 2,
            title: 'Profile Switcher Dropdown & + Digital Profile Modal',
            detail:
              'Click + Digital Profile on Dashboard Overview to enter a Profile Label and Custom Slug, or use the top dropdown in My Profile to switch between multiple profiles.',
          },
          {
            num: 3,
            title: 'Photo Auto-Fit Cropper & Smart Copy Checkboxes',
            detail:
              'Upload and center/zoom your portrait, then tick "Same as Mobile Number" for WhatsApp and "Same as Business Address" for Personal Address.',
          },
          {
            num: 4,
            title: 'Auto-Saved Social Links & Field Privacy Toggles',
            detail:
              'Switch to the Social Links or Visibility tabs in the same hub to add links (auto-saved immediately) and control exactly what renders on /p/:slug.',
          },
        ],
        steps: [
          'Sign in via Google or verified Email/Password from /login. On Overview, click + Digital Profile, enter your Profile Label (e.g., "Work") and Custom Slug, and submit to jump straight into My Profile.',
          'When managing multiple profiles under My Profile & Visibility, use the top Select Active Profile dropdown to switch profiles instantly across all tabs.',
          'Upload your photo, adjust crop/zoom, fill in contact and address details (with Same-as checkboxes), and click Save Profile Changes.',
          'Use the top hub tabs (Social Links, Custom Fields, Visibility) inside the same view to configure links and privacy checkboxes.',
        ],
        notes: [
          'Every save synchronizes private profiles/{profileId} and sanitized publicProfiles/{slug} atomically.',
          'Legacy direct URLs (/dashboard/social-links, /dashboard/custom-fields, /dashboard/visibility) continue working seamlessly inside the grouped hub.',
        ],
      },
      {
        id: 'customer-card-studio',
        title: 'Blank Canvas & Full Element Card Design Studio (85.6 × 54 mm)',
        route: '/dashboard/card-design',
        summary:
          'Start from curated finishes OR upload your own Blank Card Template artwork, then drag, resize, style, and edit every single element on both sides—including text width, fonts, colors, logo, avatar, QR slot, and NFC wave icon.',
        screenshotId: 'customer_card_studio',
        screenshotCaption:
          'Card Design Studio featuring Blank Template Upload, draggable/resizable NFC icon & text width sliders, B/I/U formatting, and Finished Preview.',
        callouts: [
          {
            num: 1,
            title: 'Blank Canvas & Upload Blank Template Artwork',
            detail:
              'Choose "Blank Custom Card" or upload your own front/back blank template PNG/JPG artwork and solid background colors in ISO 7810 Landscape or Vertical orientation.',
          },
          {
            num: 2,
            title: 'Rich Typography, B/I/U, Font & Box Width (%)',
            detail:
              'Click or double-click any default or custom text element to edit wording, toggle Bold/Italic/Underline, pick font family, size (pt), color, alignment, and text wrap width (%).',
          },
          {
            num: 3,
            title: 'Full Drag-and-Drop for Every Element (Including NFC Icon)',
            detail:
              'Drag text, Logo, Avatar, QR slot, and the NFC wave icon freely on the canvas, and adjust Logo size, Avatar size, QR size, and NFC icon size (mm) from the inspector.',
          },
          {
            num: 4,
            title: 'Finished Card Preview & Approve Design',
            detail:
              'Inspect the clean Front & Back / Flip Card finished preview (bleed guides hidden) before clicking Approve Design to unlock Checkout.',
          },
        ],
        steps: [
          'Open Design My Card from the sidebar and select "Blank Custom Card (Start From Scratch)" or any preset finish, or upload your own Front/Back blank template image.',
          'Use the Profile Details dropdown to drop pre-filled profile fields onto the Front or Back canvas without retyping.',
          'Drag any element (text, Logo, Avatar, QR slot, or NFC wave icon) into place with your mouse; resize element dimensions, text wrap width %, font, color, and B/I/U styling.',
          'Click Preview Card to verify the finished look, then click Approve Design to unlock multi-gateway Checkout.',
        ],
        notes: [
          'Double-clicking any text item right on the card lets you edit its copy inline without hunting for sidebar inputs.',
          'Local Studio drafts cache automatically in browser storage and sync to Firestore on Save Draft or Approve Design.',
        ],
      },
      {
        id: 'customer-checkout-fulfilment',
        title: 'Multi-Gateway Checkout & Grouped Orders & Tracking Hub',
        route: '/dashboard/checkout · /dashboard/orders · /dashboard/tracking · /dashboard/support',
        summary:
          'Complete GST-inclusive checkout across any admin-enabled payment gateway (Razorpay, Cashfree, Easebuzz, PayU, Google Pay, or UPI), then monitor all orders and live 12-step fulfilment under the unified Orders & Tracking link.',
        screenshotId: 'customer_checkout_fulfilment',
        screenshotCaption:
          'Grouped Orders & Tracking hub showing Multi-Gateway selector, My Orders | Order Tracking tab bar, 12-step fulfilment progress, and AWB tracking.',
        callouts: [
          {
            num: 1,
            title: '6 Configurable Payment Gateways at Checkout',
            detail:
              'Select from Razorpay, Cashfree, Easebuzz, PayU, Google Pay (GPay), or Direct UPI—only gateways enabled by your Admin/SuperAdmin appear here.',
          },
          {
            num: 2,
            title: 'Grouped Orders & Tracking Navigation + Tabs',
            detail:
              'Click "Orders & Tracking" in the sidebar (or visit /dashboard/tracking) and toggle cleanly between "My Orders" and "Order Tracking" with an order selector dropdown.',
          },
          {
            num: 3,
            title: '12-Step Fulfilment Timeline & Courier AWB',
            detail:
              'Follow every production stage from Design Pending and Payment Successful through Printing, Quality Check, Dispatched, and Delivered.',
          },
          {
            num: 4,
            title: 'Grouped Account & Support Hub',
            detail:
              'Access Account Security and Help & Support Tickets cleanly from the single "Account & Support" sidebar group.',
          },
        ],
        steps: [
          'From an approved design in Studio, click Proceed to Checkout, select card quantity, and confirm your Indian shipping address.',
          'Pick your preferred active payment gateway (Razorpay, Cashfree, Easebuzz, PayU, Google Pay, or Direct UPI) and complete verification.',
          'Open Orders & Tracking in the sidebar, select Order Tracking (or click Track on any order), and choose your order from the dropdown to inspect the 12-stage timeline.',
          'Use Account & Support -> Help & Support Tickets if you need a post-order revision or NFC setup assistance.',
        ],
        notes: [
          'Standard pan-India manufacturing and courier delivery timeline is 10–15 days from payment verification.',
          'Server endpoints validate HMAC signatures and payment records before unlocking verified orders.',
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
        screenshotCaption:
          'Printer Order Detail screen with 300 DPI PDF export, verified QR artwork, 12-step progress controls, and courier dispatch.',
        callouts: [
          {
            num: 1,
            title: 'Assigned Print Queue & Order Summary',
            detail:
              'Lists assigned orders with card material, quantity, NFC encoding target URL (/p/:slug), and customer shipping address.',
          },
          {
            num: 2,
            title: '300 DPI Print-Ready PDF & QR Downloads',
            detail:
              'Exports exact 85.6 x 54 mm (plus 3 mm bleed = 91.6 x 60 mm, 1082 x 709 px) front/back PDFs with crop marks, NFC slot, and embedded verified QR code.',
          },
          {
            num: 3,
            title: 'Production Stage Advancement',
            detail:
              'Move jobs forward cleanly across Assigned to Printer -> Printing in Progress -> Quality Check -> Ready for Dispatch -> In Transit -> Delivered.',
          },
          {
            num: 4,
            title: 'Courier Dispatch Form',
            detail:
              'Record Courier Name, Tracking Number, Tracking URL, and Dispatch Date—automatically updating the customer timeline and shipping ledger.',
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
    audience: 'Operations managers overseeing users, profiles, designs, orders, and gateways',
    overview:
      'Admins operate from a streamlined 6-item grouped sidebar (Dashboard, Users/Profiles/Printers, Cards & Approved Designs, Orders/Payments/Shipping, Gateways/QR/Reports, User Guide) with instant hub tabs across every operational workflow.',
    features: [
      {
        id: 'admin-approved-templates',
        title: 'Cards & Approved Designs Hub, Blank Templates & Print Partners',
        route: '/admin/card-designs · /admin/approved-designs · /admin/printers',
        summary:
          'Manage card templates (including Blank Canvas / custom background uploads and mouse-drag positioning), route approved customer designs straight to print, and onboard printing presses with auto Print Auth UIDs.',
        screenshotId: 'admin_approved_print_templates',
        screenshotCaption:
          'Grouped Cards & Approved Designs hub with Send to Print, Delete controls, Visual Template Editor, and Auto Print Auth IDs.',
        callouts: [
          {
            num: 1,
            title: 'Send Approved Design Directly to Print',
            detail:
              'Creates or updates the order, generates the 1024px QR artifact, locks the design, assigns a print partner, and initiates the 12-step timeline.',
          },
          {
            num: 2,
            title: 'Design Preview & Trash Bin Delete',
            detail:
              'Inspect exact Front & Back artwork (matching Studio design) or delete obsolete/test designs with confirmation.',
          },
          {
            num: 3,
            title: 'Visual Template Studio & Blank Upload Support',
            detail:
              'Edit template name, INR price, finish, description, base colors, upload background/blank card artwork, and drag elements (including NFC slot) before saving.',
          },
          {
            num: 4,
            title: 'Print Partners Auto Auth ID',
            detail:
              'Grouped under Users, Profiles & Printers—automatically generates valid Print Auth UIDs when onboarding new printing press partners.',
          },
        ],
        steps: [
          'Open Cards & Approved Designs -> switch to Approved Designs to review customer-approved cards, inspect Front/Back artwork, or delete unwanted drafts.',
          'Click Send to Print on any approved design, choose quantity, pricing, payment status, Print Partner, and initial workflow stage, then confirm.',
          'Switch to the Card Templates tab to create new templates or edit existing ones—upload backgrounds and drag text/QR/NFC slots directly on the preview.',
          'Open Users, Profiles & Printers -> Printers tab to onboard press partners with auto-generated Print Auth UIDs and toggle active status.',
        ],
        notes: [
          'Sending an approved design to print automatically prepares the verified QR code so printers can download the 300 DPI PDF immediately.',
          'Every admin action (template edits, design deletions, direct print routing, payment updates) is recorded in Audit Logs.',
        ],
      },
      {
        id: 'admin-orders-audit',
        title: 'Full Profile Inspector, Approve Link Without Payment, Gateways & Audit Logs',
        route: '/admin/profiles · /admin/orders · /admin/settings · /admin/audit-logs',
        summary:
          'Inspect complete private customer profiles, manually approve /p/:slug links even while payment is pending, toggle enable/disable checkboxes across 6 payment gateways, manage 12-step orders, and filter audit logs.',
        screenshotId: 'admin_orders_audit_logs',
        screenshotCaption:
          'Admin Profile Inspector + Approve Profile Link (No Payment), 6-Gateway Enable Checkboxes, Order Overrides, and Audit Logs.',
        callouts: [
          {
            num: 1,
            title: 'Inspect Full User Profile & Approve Without Payment',
            detail:
              'Open any profile in Digital Profiles or User Detail to inspect all private/public fields and click "Approve Profile Link (No Payment)" so /p/:slug works live immediately.',
          },
          {
            num: 2,
            title: '6 Payment Gateways Enable/Disable Checkboxes',
            detail:
              'Under Gateways, QR & Reports -> Settings -> Payment Gateways tab, enable/disable Razorpay, Cashfree, Easebuzz, PayU, Google Pay, and UPI via checkboxes and set Live/Sandbox public IDs.',
          },
          {
            num: 3,
            title: 'Filter-First Security Audit Logs',
            detail:
              'Audit logs stay clean until you pick a preset (All, Last 24h, Last 7d, Last 30d, Custom From/To dates), Role, Action, or Keyword and click Apply Filter.',
          },
          {
            num: 4,
            title: 'Orders, Payments, Shipping & CSV Reports',
            detail:
              'Switch across grouped Orders, Payments & Shipping tabs to verify payments, assign printers, export CSV reports, or reply to support tickets.',
          },
        ],
        steps: [
          'Open Users, Profiles & Printers -> Digital Profiles (or click View User on any customer) and click Inspect Profile to review all contact details, addresses, social links, and custom fields.',
          'Click "Approve Profile Link (No Payment)" to unlock /p/:slug immediately even when payment is pending, or "Open /p/:slug" to verify the live public page.',
          'Open Gateways, QR & Reports -> Settings -> Payment Gateways to toggle gateway checkboxes, set Live/Sandbox mode, enter public Merchant/Key/UPI IDs, and click Save Gateway Settings.',
          'Open Orders, Payments & Shipping for 12-step overrides or Gateways, QR & Reports -> Audit Logs to query activity by date, role, or keyword.',
        ],
        notes: [
          'Private gateway API secrets and salts stay strictly in server environment variables (.env) and are never stored in Firestore or exposed to browsers.',
          'Admin-approved public profiles preserve their manual approval status across customer profile edits until explicitly revoked.',
        ],
      },
    ],
  },
  {
    roleId: 'superadmin',
    roleTitle: 'SuperAdmin Control Plane',
    roleCode: 'SUPERADMIN',
    portalPath: '/superadmin/dashboard',
    audience: 'Platform owners with unrestricted governance, gateway & system reset control',
    overview:
      'SuperAdmins operate from a consolidated 6-item sidebar (SuperAdmin Overview, Roles & Permissions, Profiles/Orders/Designs, URL QR Generator, Gateways & System Settings, User Guide) with full control over RBAC, payment gateways, and factory reset.',
    features: [
      {
        id: 'superadmin-governance-reset',
        title: 'Roles & Permissions, Direct URL QR, 6 Payment Gateways & Factory Reset',
        route: '/superadmin/roles · /superadmin/permissions · /superadmin/qr-generator · /superadmin/system-settings',
        summary:
          'Manage administrator privileges in one grouped hub, generate standalone print-grade QR artwork for any URL, enable/configure all 6 payment gateways alongside INR/GST policies, or wipe test data back to blank.',
        screenshotId: 'superadmin_rbac_qr_reset',
        screenshotCaption:
          'SuperAdmin Control Plane showing grouped Roles & Permissions, Direct URL QR Generator, 6-Gateway Enable Checkboxes, and Danger Zone Reset.',
        callouts: [
          {
            num: 1,
            title: 'Grouped Roles & Admin Permissions Hub',
            detail:
              'Promote or demote accounts across USER, PRINTER, ADMIN, and SUPERADMIN (protecting the last active SuperAdmin) and toggle 9 modular admin capabilities from one hub.',
          },
          {
            num: 2,
            title: 'Direct Public URL QR Generator',
            detail:
              'Generate Error-Correction-H 1024px PNG & Vector SVG QR codes for any public URL directly without requiring a customer order.',
          },
          {
            num: 3,
            title: '6 Payment Gateways Checkboxes & Global Pricing',
            detail:
              'In Gateways & System Settings, toggle between Pricing & Global Policies and Payment Gateways (Razorpay, Cashfree, Easebuzz, PayU, Google Pay, UPI) using per-gateway checkboxes.',
          },
          {
            num: 4,
            title: 'Danger Zone: Clear All Data & Reset App',
            detail:
              'Under the Danger Zone tab, type RESET to wipe all Firestore orders, payments, designs, profiles, QR codes, printers, tickets, audit logs, and local drafts while keeping your SuperAdmin active.',
          },
        ],
        steps: [
          'Open Roles & Permissions to promote team members to ADMIN or PRINTER, then switch to the Admin Permissions Matrix tab to toggle capability checkboxes.',
          'Use URL QR Generator to enter any public HTTPS URL and immediately download print-ready 1024px PNG or SVG vector artwork.',
          'Open Gateways & System Settings -> Payment Gateways tab to enable/disable gateways with checkboxes, configure Live/Sandbox modes & public keys, and save.',
          'Use the Pricing & Global Policies tab for GST/shipping rules, or open the Danger Zone tab and type RESET to return the workspace to a fresh blank state.',
        ],
        notes: [
          'Security rules prevent demoting the last active SuperAdmin, self-deleting your active SuperAdmin record during reset, or storing private gateway secrets in Firestore.',
          'Secondary email/password accounts created in Firebase Authentication can additionally be removed from Firebase Console -> Authentication -> Users.',
        ],
      },
    ],
  },
];
