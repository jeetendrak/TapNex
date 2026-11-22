import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Phone,
  Mail,
  Globe,
  MapPin,
  Download,
  Share2,
  MessageCircle,
  Copy,
  Check,
  ExternalLink,
  AlertCircle,
  Lock,
} from 'lucide-react';
import {
  getAllOrders,
  getPublicProfileBySlug,
  getAppSettings,
  getCustomerOrders,
  isOrderPaymentConfirmed,
  maskEmail,
  maskPhone,
  reconcileDeliveredOrdersToProfiles,
} from '../../lib/firestoreService';
import { downloadVCard } from '../../lib/vcard';
import { sanitizeRichBioHtml } from '../../lib/richText';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { TAPNEX_PUBLIC_BADGE_LOGO_URL } from '../../components/PublicLayout';
import { ScreenProtectionShield } from '../../components/ScreenProtectionShield';
import type { PublicProfileRecord } from '../../types';

export const PublicProfilePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const { userRecord } = useAuth();
  const { notify } = useToast();
  const [profile, setProfile] = useState<PublicProfileRecord | null>(null);
  const [inactiveFallback, setInactiveFallback] = useState(
    'This digital business profile is currently inactive or unavailable.'
  );
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const publicUrl = typeof window !== 'undefined' ? `${window.location.origin}/p/${slug}` : '';

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const [data, settings] = await Promise.all([
          slug ? getPublicProfileBySlug(slug).catch(() => null) : Promise.resolve(null),
          getAppSettings().catch(() => null),
        ]);
        if (!active) return;
        setProfile(data);
        if (settings?.inactiveProfileMessage) {
          setInactiveFallback(settings.inactiveProfileMessage);
        }
      } catch {
        if (active) setProfile(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [slug]);

  const [ownerPaidConfirmed, setOwnerPaidConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    async function verifyOwnerPayment() {
      if (!profile || !userRecord) {
        if (active) setOwnerPaidConfirmed(false);
        return;
      }
      const isOwner = userRecord.uid === profile.uid;
      const isAdminRole = userRecord.role === 'ADMIN' || userRecord.role === 'SUPERADMIN';
      if (!isOwner && !isAdminRole) {
        if (active) setOwnerPaidConfirmed(false);
        return;
      }
      if (profile.paymentConfirmed && profile.isPublic) {
        if (active) setOwnerPaidConfirmed(false);
        return;
      }
      try {
        const orders = isOwner
          ? await getCustomerOrders(userRecord.uid)
          : await getAllOrders();
        if (!active) return;
        const confirmed = isOrderPaymentConfirmed(orders, profile.profileId, profile.slug);
        if (isOwner) setOwnerPaidConfirmed(confirmed);
        if (confirmed && !profile.adminDisabled) {
          const matching = orders.filter(
            (o) => o.profileId === profile.profileId || o.profileSlug === profile.slug
          );
          const changed = await reconcileDeliveredOrdersToProfiles(matching, userRecord.role).catch(() => false);
          if (changed && active) {
            setProfile((prev) => (prev ? { ...prev, paymentConfirmed: true, isPublic: true } : prev));
          }
        }
      } catch {
        // ignore if unable to read orders
      }
    }
    verifyOwnerPayment();
    return () => {
      active = false;
    };
  }, [profile, userRecord]);

  const isOwnerViewer = Boolean(userRecord && profile && userRecord.uid === profile.uid);
  const isPrivilegedViewer = userRecord?.role === 'ADMIN' || userRecord?.role === 'SUPERADMIN';
  const isPaymentUnlocked = Boolean(
    profile?.paymentConfirmed || profile?.adminApproved || ownerPaidConfirmed
  );
  const isPaidLive = Boolean(isPaymentUnlocked || isPrivilegedViewer);

  const handleCopyUrl = async () => {
    if (!isPaidLive) return;
    await navigator.clipboard.writeText(publicUrl);
    setCopied(true);
    notify('Profile link copied', publicUrl, 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleNativeShare = async () => {
    if (!isPaidLive) return;
    const title = profile?.personalInformation?.fullName || 'TapNex Smart Business Card';
    if (navigator.share) {
      try {
        await navigator.share({ title, text: `Connect with ${title}`, url: publicUrl });
        return;
      } catch {
        // fallback to copy
      }
    }
    await handleCopyUrl();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 border border-slate-200">
          <div className="h-24 w-24 rounded-full bg-slate-200 mx-auto animate-pulse" />
          <div className="h-6 w-48 bg-slate-200 mx-auto rounded animate-pulse" />
          <div className="h-12 w-full bg-slate-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!profile || ((!profile.isPublic || profile.adminDisabled) && !isPrivilegedViewer)) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 text-center border border-slate-200 shadow-xs">
          <AlertCircle className="h-10 w-10 text-slate-400 mx-auto mb-3" />
          <h1 className="font-display text-xl font-bold text-[#0B1D3A]">Profile Unavailable</h1>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">
            {profile?.adminDisabled
              ? 'This digital profile link has been disabled by an administrator.'
              : profile?.unavailableMessage || inactiveFallback}
          </p>
          <Link
            to="/"
            className="mt-6 inline-block px-5 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold"
          >
            Visit TapNex
          </Link>
        </div>
      </div>
    );
  }

  // Unpaid profile URLs are not publicly accessible unless payment is confirmed or admin-approved
  if (!isPaymentUnlocked && !isOwnerViewer && !isPrivilegedViewer) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-3xl p-8 text-center border border-amber-200 shadow-xs space-y-3">
          <Lock className="h-10 w-10 text-amber-500 mx-auto" />
          <h1 className="font-display text-xl font-bold text-[#0B1D3A]">Profile Link Pending Activation</h1>
          <p className="text-sm text-slate-600 leading-relaxed">
            This public digital card link is watermarked and locked until payment is confirmed or approved by an administrator.
          </p>
          <Link
            to="/"
            className="mt-4 inline-block px-5 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold"
          >
            Visit TapNex
          </Link>
        </div>
      </div>
    );
  }

  const info = profile.personalInformation || {};
  const displayedMobile = isPaidLive ? info.mobile : maskPhone(info.mobile);
  const displayedAltMobile = isPaidLive ? info.alternateMobile : maskPhone(info.alternateMobile);
  const displayedWhatsapp = isPaidLive ? info.whatsapp : maskPhone(info.whatsapp);
  const displayedEmail = isPaidLive ? info.email : maskEmail(info.email);
  const displayedAltEmail = isPaidLive ? info.alternateEmail : maskEmail(info.alternateEmail);
  const displayedWebsite = isPaidLive ? info.website : info.website ? '•••••.••' : '';
  const whatsappNumber = isPaidLive ? (info.whatsapp || info.mobile || '').replace(/[^0-9]/g, '') : '';
  const hasWhatsappItem = Boolean(displayedWhatsapp);
  const addressParts = [info.businessAddress, info.city, info.state, info.pinCode, info.country].filter(Boolean);

  return (
    <ScreenProtectionShield active={!isPaidLive} watermarkLabel={`TAPNEX PROTECTED · /p/${profile.slug}`}>
    <div className="min-h-screen bg-slate-100 py-6 sm:py-12 px-4">
      <div
        className={`relative max-w-lg mx-auto bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm ${
          !isPaidLive ? 'select-none' : ''
        }`}
      >
        {/* Preview Watermark Overlay when Payment Not Yet Confirmed */}
        {!isPaidLive && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-around overflow-hidden opacity-20"
          >
            {[0, 1, 2, 3].map((row) => (
              <div
                key={row}
                className="-rotate-24 font-display text-xl sm:text-2xl font-extrabold tracking-widest text-slate-700 whitespace-nowrap"
              >
                TAPNEX PREVIEW · PAYMENT PENDING
              </div>
            ))}
          </div>
        )}

        {/* Executive Navy Header Banner */}
        <div className="bg-[#050814] px-5 sm:px-7 pt-6 pb-20 text-white flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-3.5 sm:gap-4 group" aria-label="TapNex">
            <img
              src={TAPNEX_PUBLIC_BADGE_LOGO_URL}
              alt="TapNex — Smart Connections. One Tap."
              className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-contain shrink-0 shadow-[0_8px_28px_rgba(56,189,248,0.28)] ring-1 ring-white/15 group-hover:scale-[1.03] transition-transform"
            />
            <div className="min-w-0">
              <div className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white leading-none">
                TapNex
              </div>
              <div className="mt-1.5 text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/90">
                Smart Connections
              </div>
            </div>
          </Link>
          {isPaidLive ? (
            <button
              type="button"
              onClick={handleNativeShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-semibold text-white min-h-[38px] shrink-0"
            >
              <Share2 className="h-3.5 w-3.5" />
              <span>Share</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-xs font-medium text-amber-200 shrink-0">
              <Lock className="h-3.5 w-3.5" />
              <span>Preview Mode</span>
            </span>
          )}
        </div>

        {/* Profile Identity */}
        <div className="relative z-10 px-5 sm:px-6 pb-8 -mt-11">
          {!isPaidLive && (
            <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
              <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <span>
                <strong>Watermarked Preview:</strong> Phone numbers, email IDs, and direct contact actions stay masked until card payment or Admin approval is confirmed.
              </span>
            </div>
          )}

          {!profile.isPublic && isPrivilegedViewer && (
            <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800">
              <strong>Admin View:</strong> This profile is currently disabled for public visitors.
            </div>
          )}

          <div className="flex flex-col items-center text-center">
            {info.photoDataUrl ? (
              <img
                src={info.photoDataUrl}
                alt={info.fullName || profile.slug}
                referrerPolicy="no-referrer"
                className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-md bg-transparent"
              />
            ) : (
              <div className="w-24 h-24 rounded-full border-4 border-white shadow-md bg-[#1D4ED8] text-white flex items-center justify-center font-display text-2xl font-bold">
                {(info.fullName || profile.slug || 'T')[0].toUpperCase()}
              </div>
            )}

            <h1 className="mt-3 font-display text-2xl font-bold text-[#0B1D3A]">
              {info.fullName || `@${profile.slug}`}
            </h1>
            {(info.jobTitle || info.companyName) && (
              <p className="mt-1 text-sm font-medium text-slate-600">
                {[info.jobTitle, info.companyName].filter(Boolean).join(' · ')}
              </p>
            )}
            {info.businessCategory && (
              <p className="mt-0.5 text-xs text-slate-500">{info.businessCategory}</p>
            )}
            {info.shortBio && (
              <div
                className="mt-3 text-sm text-slate-600 leading-relaxed max-w-md w-full [&_p]:my-1"
                dangerouslySetInnerHTML={{ __html: sanitizeRichBioHtml(info.shortBio) }}
              />
            )}
          </div>

          {/* Primary Mobile-Friendly Actions */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={!isPaidLive}
              onClick={() => {
                if (!isPaidLive) return;
                downloadVCard(profile, publicUrl);
                notify('Contact downloaded', 'Open the .vcf file to save directly to your address book.', 'success');
              }}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-[#0B1D3A] hover:bg-[#132A52] text-white text-sm font-semibold transition-colors min-h-[48px] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <Download className="h-4 w-4" />
              <span>Save Contact</span>
            </button>

            <button
              type="button"
              disabled={!isPaidLive}
              onClick={handleCopyUrl}
              className="flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-800 text-sm font-semibold min-h-[48px] disabled:opacity-45 disabled:cursor-not-allowed"
            >
              {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              <span>{isPaidLive ? (copied ? 'Link Copied' : 'Copy Profile URL') : 'URL Locked Until Payment'}</span>
            </button>
          </div>

          {/* Visible Contact Rows */}
          <div className="mt-6 divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
            {displayedMobile && (
              isPaidLive ? (
                <a
                  href={`tel:${info.mobile}`}
                  className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors min-h-[52px]"
                >
                  <Phone className="h-4 w-4 text-[#1D4ED8] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Mobile</div>
                    <div className="text-sm font-medium text-slate-900 font-mono">{displayedMobile}</div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[52px]">
                  <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Mobile (Masked)</div>
                    <div className="text-sm font-medium text-slate-600 font-mono">{displayedMobile}</div>
                  </div>
                </div>
              )
            )}
            {displayedAltMobile && (
              isPaidLive ? (
                <a
                  href={`tel:${info.alternateMobile}`}
                  className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors min-h-[52px]"
                >
                  <Phone className="h-4 w-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Alternate Mobile</div>
                    <div className="text-sm font-medium text-slate-900 font-mono">{displayedAltMobile}</div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[52px]">
                  <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Alternate Mobile (Masked)</div>
                    <div className="text-sm font-medium text-slate-600 font-mono">{displayedAltMobile}</div>
                  </div>
                </div>
              )
            )}
            {displayedEmail && (
              isPaidLive ? (
                <a
                  href={`mailto:${info.email}`}
                  className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors min-h-[52px]"
                >
                  <Mail className="h-4 w-4 text-[#1D4ED8] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Email</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{displayedEmail}</div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[52px]">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Email (Masked)</div>
                    <div className="text-sm font-medium text-slate-600 truncate">{displayedEmail}</div>
                  </div>
                </div>
              )
            )}
            {displayedAltEmail && (
              isPaidLive ? (
                <a
                  href={`mailto:${info.alternateEmail}`}
                  className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors min-h-[52px]"
                >
                  <Mail className="h-4 w-4 text-slate-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Alternate Email</div>
                    <div className="text-sm font-medium text-slate-900 truncate">{displayedAltEmail}</div>
                  </div>
                </a>
              ) : (
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[52px]">
                  <Mail className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Alternate Email (Masked)</div>
                    <div className="text-sm font-medium text-slate-600 truncate">{displayedAltEmail}</div>
                  </div>
                </div>
              )
            )}
            {displayedWebsite && (
              isPaidLive && info.website ? (
                <a
                  href={info.website.startsWith('http') ? info.website : `https://${info.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50 transition-colors min-h-[52px]"
                >
                  <Globe className="h-4 w-4 text-[#1D4ED8] shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Website</div>
                    <div className="text-sm font-medium text-[#1D4ED8] truncate">{displayedWebsite}</div>
                  </div>
                  <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
                </a>
              ) : (
                <div className="flex items-center gap-3.5 px-4 py-3.5 min-h-[52px]">
                  <Globe className="h-4 w-4 text-slate-400 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-slate-500">Website (Masked)</div>
                    <div className="text-sm font-medium text-slate-500 truncate">{displayedWebsite}</div>
                  </div>
                </div>
              )
            )}
            {addressParts.length > 0 && (
              <div className="flex items-start gap-3.5 px-4 py-3.5">
                <MapPin className="h-4 w-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">Business Address</div>
                  <div className="text-sm text-slate-800">
                    {isPaidLive ? addressParts.join(', ') : `${info.city || 'India'} (Full address hidden in preview)`}
                  </div>
                </div>
              </div>
            )}
            {info.personalAddress && (
              <div className="flex items-start gap-3.5 px-4 py-3.5">
                <MapPin className="h-4 w-4 text-slate-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-slate-500">Personal Address</div>
                  <div className="text-sm text-slate-800">
                    {isPaidLive ? info.personalAddress : 'Personal address hidden in preview'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Connect Online (includes WhatsApp & Social Links) */}
          {((profile.socialLinks && profile.socialLinks.length > 0) || hasWhatsappItem) && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold text-slate-500 mb-3">Connect Online</h2>
              <div className="grid grid-cols-2 gap-2.5">
                {hasWhatsappItem &&
                  (isPaidLive && whatsappNumber ? (
                    <a
                      href={`https://wa.me/${whatsappNumber}?text=${encodeURIComponent(`Hi ${info.fullName || ''}, connecting via your TapNex smart card.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-emerald-200 hover:border-emerald-300 bg-emerald-50 text-sm font-semibold text-emerald-900 min-h-[44px]"
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <MessageCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                        <span className="truncate">WhatsApp</span>
                      </span>
                      <ExternalLink className="h-3.5 w-3.5 text-emerald-600 shrink-0 ml-2" />
                    </a>
                  ) : (
                    <div className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-medium text-slate-500 min-h-[44px]">
                      <span className="inline-flex items-center gap-2 truncate">
                        <MessageCircle className="h-4 w-4 text-slate-400 shrink-0" />
                        <span className="truncate">WhatsApp</span>
                      </span>
                      <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </div>
                  ))}
                {(profile.socialLinks || []).map((link) =>
                  isPaidLive ? (
                    <a
                      key={link.id}
                      href={link.url.startsWith('http') ? link.url : `https://${link.url}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-slate-200 hover:border-slate-300 bg-slate-50/70 text-sm font-medium text-slate-800 min-h-[44px]"
                    >
                      <span className="truncate">{link.label || link.platform}</span>
                      <ExternalLink className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </a>
                  ) : (
                    <div
                      key={link.id}
                      className="flex items-center justify-between px-3.5 py-3 rounded-xl border border-slate-200 bg-slate-50/70 text-sm font-medium text-slate-500 min-h-[44px]"
                    >
                      <span className="truncate">{link.label || link.platform}</span>
                      <Lock className="h-3.5 w-3.5 text-slate-400 shrink-0 ml-2" />
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Visible Custom Fields */}
          {profile.customFields && profile.customFields.length > 0 && (
            <div className="mt-6">
              <h2 className="text-xs font-semibold text-slate-500 mb-3">Additional Details</h2>
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
                {profile.customFields.map((field) => (
                  <div key={field.id} className="px-4 py-3 flex items-center justify-between gap-4">
                    <span className="text-xs text-slate-500">{field.label}</span>
                    {!isPaidLive ? (
                      <span className="text-sm font-medium text-slate-500 text-right">••••••</span>
                    ) : field.type === 'url' ? (
                      <a
                        href={field.value.startsWith('http') ? field.value : `https://${field.value}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm font-medium text-[#1D4ED8] hover:underline truncate max-w-[60%]"
                      >
                        {field.value}
                      </a>
                    ) : field.type === 'phone' ? (
                      <a href={`tel:${field.value}`} className="text-sm font-medium text-slate-900 font-mono">
                        {field.value}
                      </a>
                    ) : field.type === 'email' ? (
                      <a href={`mailto:${field.value}`} className="text-sm font-medium text-[#1D4ED8]">
                        {field.value}
                      </a>
                    ) : (
                      <span className="text-sm font-medium text-slate-900 text-right">{field.value}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Share Bar */}
          {isPaidLive && (
            <div className="mt-6 pt-5 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleCopyUrl}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Link</span>
              </button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(`${info.fullName || profile.slug} — Digital Business Card: ${publicUrl}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                <Share2 className="h-3.5 w-3.5" />
                <span>Share via WhatsApp</span>
              </a>
            </div>
          )}

          {/* Horizontal Line & Portfolio Footer Text after User Info Ends */}
          <hr className="border-t border-slate-200 my-6" />
          <div className="text-center text-xs text-slate-500">
            Get your portfolio at:{' '}
            <Link to="/" className="font-semibold text-[#0B1D3A] hover:text-[#1D4ED8] hover:underline">
              tapnex.in
            </Link>
          </div>
        </div>
      </div>
    </div>
    </ScreenProtectionShield>
  );
};
