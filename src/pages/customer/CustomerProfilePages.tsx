import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUp,
  ArrowDown,
  Check,
  Copy,
  ExternalLink,
  Plus,
  Trash2,
  Eye,
  CreditCard,
  Package,
  UserCheck,
  Upload,
  Lock,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { CardDesignPreviewModal } from '../../components/CardDesignPreviewModal';
import { RichBioEditor } from '../../components/RichBioEditor';
import { ScreenProtectionShield } from '../../components/ScreenProtectionShield';
import {
  ProfilePhotoEditorModal,
  autoFitImageToSquareDataUrl,
  readImageFileAsDataUrl,
} from '../../components/ProfilePhotoEditorModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  calculateProfileCompletion,
  createAdditionalProfile,
  deleteDigitalProfile,
  extractTimestampMs,
  getCustomerOrders,
  getUserDesigns,
  getUserProfiles,
  isOrderPaymentConfirmed,
  isSlugAvailable,
  markProfilePaymentCompleted,
  maskEmail,
  maskPhone,
  reconcileDeliveredOrdersToProfiles,
  sanitizeSlug,
  saveProfileAndSyncPublic,
} from '../../lib/firestoreService';
import { sanitizeRichBioHtml } from '../../lib/richText';
import { getActiveStudioDraft, resolveEffectiveCardDesign } from '../../lib/studioDraft';
import { INDIAN_STATES, SOCIAL_PLATFORMS } from '../../lib/constants';
import type {
  CardDesignRecord,
  CustomFieldItem,
  CustomFieldType,
  OrderRecord,
  ProfileRecord,
  SocialLinkItem,
  SocialPlatformId,
} from '../../types';

function useActiveCustomerProfile() {
  const { userRecord } = useAuth();
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [activeProfile, setActiveProfile] = useState<ProfileRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!userRecord) return;
    setLoading(true);
    try {
      const list = await getUserProfiles(userRecord.uid);
      setProfiles(list);
      const savedId =
        localStorage.getItem(`tapnex_active_profile_${userRecord.uid}`) ||
        localStorage.getItem(`tapcraft_active_profile_${userRecord.uid}`);
      const found = list.find((p) => p.profileId === savedId) || list[0] || null;
      setActiveProfile(found);
    } finally {
      setLoading(false);
    }
  }, [userRecord]);

  useEffect(() => {
    reload();
  }, [reload]);

  const selectProfile = (profileId: string) => {
    if (!userRecord) return;
    localStorage.setItem(`tapnex_active_profile_${userRecord.uid}`, profileId);
    const found = profiles.find((p) => p.profileId === profileId) || null;
    setActiveProfile(found);
  };

  return { profiles, activeProfile, setActiveProfile, selectProfile, loading, reload };
}

const WatermarkedProfileModal: React.FC<{
  open: boolean;
  onClose: () => void;
  profile: ProfileRecord;
  isPaid: boolean;
}> = ({ open, onClose, profile, isPaid }) => {
  if (!open) return null;
  const info = profile.personalInformation;
  const v = profile.visibilitySettings;
  const addressParts = [info.businessAddress, info.city, info.state, info.pinCode, info.country].filter(Boolean);
  const visibleSocials = (profile.socialLinks || []).filter((s) => {
    const explicitVis = v.socialLinks?.[s.id];
    return explicitVis !== undefined ? Boolean(explicitVis) : Boolean(s.enabled);
  });
  const visibleCustom = (profile.customFields || []).filter((cf) => cf.visible);
  const showWhatsappInConnect = Boolean(v.whatsapp && info.whatsapp);
  const cleanWaDigits = (info.whatsapp || '').replace(/[^0-9]/g, '');

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto bg-white rounded-3xl border border-slate-200 shadow-2xl">
        <ScreenProtectionShield
          active={!isPaid}
          watermarkLabel={
            isPaid ? `TAPNEX PROTECTED · /p/${profile.slug}` : 'TAPNEX PREVIEW · PAYMENT PENDING'
          }
        >
          {/* Diagonal Watermark Overlay when Payment is Pending */}
          {!isPaid && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-around overflow-hidden opacity-20"
            >
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="-rotate-24 font-display text-lg sm:text-xl font-extrabold tracking-widest text-slate-700 whitespace-nowrap"
                >
                  TAPNEX PREVIEW · PAYMENT PENDING
                </div>
              ))}
            </div>
          )}

          <div className="sticky top-0 z-40 bg-[#050814] text-white px-5 py-4 flex items-center justify-between">
            {isPaid && !profile.adminDisabled ? (
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                <Check className="h-3.5 w-3.5" />
                <span>Live Profile Preview · Active &amp; Unlocked</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
                <Lock className="h-3.5 w-3.5" />
                <span>{profile.adminDisabled ? 'Disabled by Admin' : 'Watermarked Preview (Unpaid)'}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              {isPaid && profile.isPublic && !profile.adminDisabled && (
                <a
                  href={`/p/${profile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-medium text-white"
                >
                  <span>Open Live</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Close preview"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="relative z-10 p-6 space-y-5">
            {!isPaid && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                Phone number, email ID, direct actions, and live share URL remain masked/locked until card payment is confirmed or approved by an admin.
              </div>
            )}

            <div className="flex flex-col items-center text-center">
              {v.photo && info.photoDataUrl ? (
                <img
                  src={info.photoDataUrl}
                  alt={info.fullName || 'Preview'}
                  className="w-20 h-20 rounded-full object-cover border-2 border-slate-200 bg-transparent"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-[#1D4ED8] text-white flex items-center justify-center font-display text-xl font-bold">
                  {(info.fullName || 'T')[0].toUpperCase()}
                </div>
              )}
              {v.fullName && (
                <h3 className="mt-3 font-display text-xl font-bold text-[#0B1D3A]">
                  {info.fullName || 'Your Full Name'}
                </h3>
              )}
              {(v.jobTitle || v.companyName) && (
                <p className="text-xs text-slate-600 mt-1">
                  {[v.jobTitle ? info.jobTitle : '', v.companyName ? info.companyName : ''].filter(Boolean).join(' · ')}
                </p>
              )}
              {v.businessCategory && info.businessCategory && (
                <p className="mt-0.5 text-[11px] text-slate-500">{info.businessCategory}</p>
              )}
              {v.shortBio && info.shortBio && (
                <div
                  className="mt-2.5 w-full text-xs text-slate-600 leading-relaxed [&_p]:my-1"
                  dangerouslySetInnerHTML={{ __html: sanitizeRichBioHtml(info.shortBio) }}
                />
              )}
            </div>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl text-xs">
              {v.mobile && info.mobile && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500">{isPaid ? 'Mobile' : 'Mobile (Masked)'}</span>
                  <span className="font-mono font-semibold text-slate-700 text-right">
                    {isPaid ? info.mobile : maskPhone(info.mobile)}
                  </span>
                </div>
              )}
              {v.alternateMobile && info.alternateMobile && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500">{isPaid ? 'Alternate Mobile' : 'Alternate Mobile (Masked)'}</span>
                  <span className="font-mono font-semibold text-slate-700 text-right">
                    {isPaid ? info.alternateMobile : maskPhone(info.alternateMobile)}
                  </span>
                </div>
              )}
              {v.email && info.email && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500">{isPaid ? 'Email' : 'Email (Masked)'}</span>
                  <span className="font-mono font-semibold text-slate-700 truncate text-right">
                    {isPaid ? info.email : maskEmail(info.email)}
                  </span>
                </div>
              )}
              {v.alternateEmail && info.alternateEmail && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500">{isPaid ? 'Alternate Email' : 'Alternate Email (Masked)'}</span>
                  <span className="font-mono font-semibold text-slate-700 truncate text-right">
                    {isPaid ? info.alternateEmail : maskEmail(info.alternateEmail)}
                  </span>
                </div>
              )}
              {v.website && info.website && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500">{isPaid ? 'Website' : 'Website (Masked)'}</span>
                  <span className="font-semibold text-slate-700 truncate text-right">
                    {isPaid ? info.website : '•••••.••'}
                  </span>
                </div>
              )}
              {v.businessAddress && addressParts.length > 0 && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Business Address</span>
                  <span className="text-slate-600 text-right">
                    {isPaid ? addressParts.join(', ') : `${info.city || 'India'} (Address masked)`}
                  </span>
                </div>
              )}
              {v.personalAddress && info.personalAddress && (
                <div className="px-4 py-3 flex justify-between gap-3">
                  <span className="text-slate-500 shrink-0">Personal Address</span>
                  <span className="text-slate-600 text-right">
                    {isPaid ? info.personalAddress : 'Personal address masked'}
                  </span>
                </div>
              )}
            </div>

            {(visibleSocials.length > 0 || showWhatsappInConnect) && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">Connect Online</div>
                <div className="grid grid-cols-2 gap-2">
                  {showWhatsappInConnect &&
                    (isPaid && cleanWaDigits ? (
                      <a
                        href={`https://wa.me/${cleanWaDigits}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
                      >
                        <span className="truncate">WhatsApp</span>
                        <ExternalLink className="h-3 w-3 text-emerald-700 shrink-0 ml-1" />
                      </a>
                    ) : (
                      <div className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                        <span className="truncate">WhatsApp</span>
                        <Lock className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
                      </div>
                    ))}
                  {visibleSocials.map((s) =>
                    isPaid ? (
                      <a
                        key={s.id}
                        href={s.url.startsWith('http') ? s.url : `https://${s.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-800 hover:bg-slate-100"
                      >
                        <span className="truncate">{s.label || s.platform}</span>
                        <ExternalLink className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
                      </a>
                    ) : (
                      <div
                        key={s.id}
                        className="flex items-center justify-between px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-medium text-slate-500"
                      >
                        <span className="truncate">{s.label || s.platform}</span>
                        <Lock className="h-3 w-3 text-slate-400 shrink-0 ml-1" />
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {visibleCustom.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-2">Additional Details</div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl text-xs">
                  {visibleCustom.map((cf) => (
                    <div key={cf.id} className="px-4 py-2.5 flex justify-between gap-3">
                      <span className="text-slate-500">{cf.label}</span>
                      <span className="font-medium text-slate-800 text-right">
                        {isPaid ? cf.value : '••••••'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <hr className="border-t border-slate-200" />
            <div className="text-center text-xs text-slate-500">
              Get your portfolio at: <span className="font-semibold text-[#0B1D3A]">tapnex.in</span>
            </div>
          </div>
        </ScreenProtectionShield>
      </div>
    </div>
  );
};

const CreateDigitalProfileModal: React.FC<{
  open: boolean;
  onClose: () => void;
  profilesCount: number;
  onCreated: (created: ProfileRecord) => Promise<void> | void;
}> = ({ open, onClose, profilesCount, onCreated }) => {
  const { userRecord } = useAuth();
  const { notify } = useToast();
  const [newLabel, setNewLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [modalSlugStatus, setModalSlugStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [creatingProfile, setCreatingProfile] = useState(false);

  if (!open) return null;

  const handleCheckModalSlug = async () => {
    const clean = sanitizeSlug(newSlug);
    setNewSlug(clean);
    if (clean.length < 3) {
      setModalSlugStatus('taken');
      return;
    }
    const ok = await isSlugAvailable(clean);
    setModalSlugStatus(ok ? 'available' : 'taken');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord) return;
    const labelToUse = newLabel.trim() || `Profile ${profilesCount + 1}`;
    const rawSlug = newSlug.trim() || labelToUse;
    const cleanSlug = sanitizeSlug(rawSlug);
    if (cleanSlug.length < 3) {
      notify('Custom slug too short', 'Please enter at least 3 letters/numbers for your custom profile URL slug.', 'error');
      return;
    }
    setCreatingProfile(true);
    try {
      const available = await isSlugAvailable(cleanSlug);
      if (!available) {
        setModalSlugStatus('taken');
        notify('Slug already taken', 'Please pick a different custom slug for this digital profile.', 'error');
        setCreatingProfile(false);
        return;
      }
      const created = await createAdditionalProfile(
        userRecord.uid,
        labelToUse,
        cleanSlug,
        { fullName: userRecord.displayName || '', email: userRecord.email || '' }
      );
      localStorage.setItem(`tapnex_active_profile_${userRecord.uid}`, created.profileId);
      setNewLabel('');
      setNewSlug('');
      setModalSlugStatus('idle');
      onClose();
      await onCreated(created);
    } catch (err) {
      notify('Unable to create profile', err instanceof Error ? err.message : 'Try a different slug.', 'error');
    } finally {
      setCreatingProfile(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-4 bg-[#0B1D3A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Plus className="h-4 w-4 text-cyan-300" />
            <h3 className="font-display font-bold text-base">Create New Digital Profile</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Choose a label and custom URL slug for your new digital card profile. We will open <strong>My Profile</strong> so you can fill in your details right away.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Profile Label *</label>
            <input
              type="text"
              required
              value={newLabel}
              onChange={(e) => {
                const val = e.target.value;
                setNewLabel(val);
                if (!newSlug || newSlug === sanitizeSlug(newLabel)) {
                  setNewSlug(sanitizeSlug(val));
                  setModalSlugStatus('idle');
                }
              }}
              placeholder="e.g. Consulting, Real Estate, Personal"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Public URL Slug *</label>
            <div className="flex gap-2">
              <div className="flex flex-1 items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                <span className="px-2.5 text-xs font-mono text-slate-500 border-r border-slate-200 py-2.5">
                  /p/
                </span>
                <input
                  type="text"
                  required
                  value={newSlug}
                  onChange={(e) => {
                    setNewSlug(e.target.value.toLowerCase());
                    setModalSlugStatus('idle');
                  }}
                  placeholder="jeet-consulting"
                  className="flex-1 px-3 py-2 bg-white text-sm font-mono focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={handleCheckModalSlug}
                className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
              >
                Check
              </button>
            </div>
            {modalSlugStatus === 'available' && (
              <p className="mt-1 text-xs text-emerald-700 font-medium">Slug is available!</p>
            )}
            {modalSlugStatus === 'taken' && (
              <p className="mt-1 text-xs text-rose-700 font-medium">Slug unavailable or shorter than 3 characters.</p>
            )}
          </div>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingProfile}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{creatingProfile ? 'Creating Profile...' : 'Create & Fill Profile Info'}</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

function resizeImageToDataUrl(file: File, maxDim = 420): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 1. Customer Overview
export const CustomerOverviewPage: React.FC = () => {
  const { userRecord, appSettings } = useAuth();
  const { notify, confirmAction } = useToast();
  const navigate = useNavigate();
  const { profiles, activeProfile, selectProfile, loading, reload } = useActiveCustomerProfile();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [designs, setDesigns] = useState<CardDesignRecord[]>([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [modalSlugStatus, setModalSlugStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);

  useEffect(() => {
    if (!userRecord) return;
    Promise.all([getCustomerOrders(userRecord.uid), getUserDesigns(userRecord.uid)]).then(([o, d]) => {
      setOrders(o);
      setDesigns(d);
      if (profiles.length > 0) {
        reconcileDeliveredOrdersToProfiles(o, userRecord.role, profiles).then((changed) => {
          if (changed) reload();
        });
      }
    });
  }, [userRecord, profiles.length]);

  const completion = calculateProfileCompletion(activeProfile);
  const latestOrder = orders[0];
  const savedProfileDesign =
    (activeProfile && designs.find((d) => d.profileId === activeProfile.profileId)) || designs[0] || null;
  const localStudioDraft =
    activeProfile && userRecord ? getActiveStudioDraft(userRecord.uid, activeProfile.profileId) : null;
  const activeDesign =
    activeProfile && userRecord
      ? resolveEffectiveCardDesign({
          savedDesign: savedProfileDesign,
          savedTimestampMs:
            extractTimestampMs(savedProfileDesign?.updatedAt) ||
            extractTimestampMs(savedProfileDesign?.createdAt),
          localDraft: localStudioDraft,
          uid: userRecord.uid,
          profileId: activeProfile.profileId,
        })
      : savedProfileDesign;
  const hasPaid =
    isOrderPaymentConfirmed(orders, activeProfile?.profileId, activeProfile?.slug) ||
    Boolean(activeProfile?.adminApproved) ||
    Boolean(activeProfile?.paymentConfirmed);
  const isDisabledByAdmin = Boolean(activeProfile?.adminDisabled);
  const publicUrl =
    activeProfile && hasPaid && activeProfile.isPublic && !isDisabledByAdmin
      ? `${window.location.origin}/p/${activeProfile.slug}`
      : '';

  const openAddProfileModal = () => {
    setNewLabel('');
    setNewSlug('');
    setModalSlugStatus('idle');
    setAddModalOpen(true);
  };

  const handleCheckModalSlug = async () => {
    const clean = sanitizeSlug(newSlug);
    setNewSlug(clean);
    if (clean.length < 3) {
      setModalSlugStatus('taken');
      return;
    }
    const ok = await isSlugAvailable(clean);
    setModalSlugStatus(ok ? 'available' : 'taken');
  };

  const handleCreateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord) return;
    const labelToUse = newLabel.trim() || `Profile ${profiles.length + 1}`;
    const rawSlug = newSlug.trim() || labelToUse;
    const cleanSlug = sanitizeSlug(rawSlug);
    if (cleanSlug.length < 3) {
      notify('Custom slug too short', 'Please enter at least 3 letters/numbers for your custom profile URL slug.', 'error');
      return;
    }
    setCreatingProfile(true);
    try {
      const available = await isSlugAvailable(cleanSlug);
      if (!available) {
        setModalSlugStatus('taken');
        notify('Slug already taken', 'Please pick a different custom slug for this digital profile.', 'error');
        setCreatingProfile(false);
        return;
      }
      const created = await createAdditionalProfile(
        userRecord.uid,
        labelToUse,
        cleanSlug,
        { fullName: userRecord.displayName || '', email: userRecord.email || '' }
      );
      localStorage.setItem(`tapnex_active_profile_${userRecord.uid}`, created.profileId);
      setNewLabel('');
      setNewSlug('');
      setAddModalOpen(false);
      await reload();
      notify('Digital profile created', `Now editing "${created.profileLabel}" — fill in your details below.`, 'success');
      navigate('/dashboard/profile');
    } catch (err) {
      notify('Unable to create profile', err instanceof Error ? err.message : 'Try a different slug.', 'error');
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleDeleteProfile = async (target: ProfileRecord) => {
    if (!userRecord) return;
    const ok = await confirmAction({
      title: 'Delete Digital Profile',
      message: `Are you sure you want to permanently delete "${target.profileLabel || target.slug}"? This removes both your private profile and public link.`,
      destructive: true,
      confirmLabel: 'Delete Profile',
    });
    if (!ok) return;
    await deleteDigitalProfile({
      profile: target,
      actor: { uid: userRecord.uid, email: userRecord.email, role: userRecord.role },
    });
    notify('Digital profile deleted', target.profileLabel || target.slug, 'success');
    await reload();
  };

  return (
    <PortalLayout portal="customer" title="Customer Overview">
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top Metric Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Profile Completion</div>
              <div className="mt-2 font-display text-2xl font-bold text-[#0B1D3A] tabular-nums">{completion}%</div>
              <div className="mt-2 w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-[#1D4ED8]" style={{ width: `${completion}%` }} />
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Digital Profile Status</div>
              <div className="mt-2 font-display text-lg font-bold text-[#0B1D3A]">
                {!activeProfile?.isPublic
                  ? 'Paused / Private'
                  : hasPaid
                    ? activeProfile?.adminApproved && !isOrderPaymentConfirmed(orders, activeProfile?.profileId, activeProfile?.slug)
                      ? 'Approved by Admin (Live)'
                      : 'Published & Active'
                    : 'Payment Pending (Locked)'}
              </div>
              {activeProfile && hasPaid && activeProfile.isPublic ? (
                <a
                  href={`/p/${activeProfile.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#1D4ED8] hover:underline"
                >
                  <span>/p/{activeProfile.slug}</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              ) : activeProfile ? (
                <button
                  type="button"
                  onClick={() => setPreviewOpen(true)}
                  className="mt-1.5 inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>View Watermarked Preview</span>
                </button>
              ) : null}
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Latest Card & Order Status</div>
              <div className="mt-2 font-display text-lg font-bold text-[#0B1D3A] truncate">
                {latestOrder ? latestOrder.orderStatus : designs.length > 0 ? 'Design Saved' : 'Not Ordered Yet'}
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500 font-mono tabular-nums">
                <span>{latestOrder ? `${latestOrder.orderNumber} · ₹${latestOrder.total}` : '85.6 × 54 mm Ready'}</span>
                {activeDesign && (
                  <button
                    type="button"
                    onClick={() => setCardPreviewOpen(true)}
                    className="font-sans font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Preview Card
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-500">Profile & Smart Tap Visits</div>
              <div className="mt-2 font-display text-2xl font-bold text-[#0B1D3A] tabular-nums">
                {activeProfile?.viewsCount ?? 0}
              </div>
              <div className="mt-1 text-xs text-slate-500 tabular-nums">
                QR/SMART visits resolve after card activation
              </div>
            </div>
          </div>

          {/* Digital Profiles Switcher & + Digital Profile Trigger */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-base font-bold text-[#0B1D3A]">Your Digital Profiles</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {hasPaid
                    ? 'Active & unlocked — your live profile URL is ready for sharing.'
                    : 'Preview your profile with watermarked protection. Your active URL unlocks upon payment or admin approval.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(appSettings.multipleProfilesEnabled || profiles.length === 0) && (
                  <button
                    type="button"
                    onClick={openAddProfileModal}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-[#1D4ED8] hover:bg-blue-700 text-white text-xs font-semibold whitespace-nowrap min-h-[40px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Digital Profile</span>
                  </button>
                )}
                {activeProfile && (
                  <button
                    type="button"
                    onClick={() => setPreviewOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px]"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Preview Profile</span>
                  </button>
                )}
                {activeDesign && (
                  <button
                    type="button"
                    onClick={() => setCardPreviewOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[#1D4ED8]/30 bg-blue-50 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100 whitespace-nowrap min-h-[40px]"
                  >
                    <CreditCard className="h-3.5 w-3.5" />
                    <span>Preview Card Design</span>
                  </button>
                )}
                {activeProfile && (
                  <button
                    type="button"
                    disabled={!hasPaid || !activeProfile.isPublic}
                    title={hasPaid ? 'Copy active public profile URL' : 'Complete payment to unlock & copy URL'}
                    onClick={async () => {
                      if (!publicUrl) return;
                      await navigator.clipboard.writeText(publicUrl);
                      notify('Copied public URL', publicUrl, 'success');
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap min-h-[40px] disabled:opacity-45 disabled:cursor-not-allowed"
                  >
                    {hasPaid ? <Copy className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5 text-amber-600" />}
                    <span>{hasPaid ? 'Copy Active URL' : 'Copy Active URL (Locked)'}</span>
                  </button>
                )}
                {activeProfile && (
                  <button
                    type="button"
                    onClick={() => handleDeleteProfile(activeProfile)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-rose-200 text-xs font-semibold text-rose-600 hover:bg-rose-50 whitespace-nowrap min-h-[40px]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete Profile</span>
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2.5">
              {profiles.map((p) => {
                const selected = p.profileId === activeProfile?.profileId;
                const pPaid =
                  isOrderPaymentConfirmed(orders, p.profileId, p.slug) ||
                  Boolean(p.adminApproved) ||
                  Boolean(p.paymentConfirmed);
                return (
                  <button
                    key={p.profileId}
                    type="button"
                    onClick={() => selectProfile(p.profileId)}
                    className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-colors min-h-[40px] ${
                      selected
                        ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {p.profileLabel || 'Profile'} {pPaid ? `(/p/${p.slug})` : '(Unpaid Preview)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* + Digital Profile Creation Modal -> Redirects to My Profile */}
          {addModalOpen && (
            <div
              className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
              role="dialog"
              aria-modal="true"
            >
              <form
                onSubmit={handleCreateProfile}
                className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
              >
                <div className="px-6 py-4 bg-[#0B1D3A] text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Plus className="h-4 w-4 text-cyan-300" />
                    <h3 className="font-display font-bold text-base">Create New Digital Profile</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddModalOpen(false)}
                    className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                    aria-label="Close modal"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="p-6 space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Choose a label and custom URL slug for your new digital card profile. We will take you straight to <strong>My Profile</strong> to fill in your details.
                  </p>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Profile Label *</label>
                    <input
                      type="text"
                      required
                      value={newLabel}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNewLabel(val);
                        if (!newSlug || newSlug === sanitizeSlug(newLabel)) {
                          setNewSlug(sanitizeSlug(val));
                          setModalSlugStatus('idle');
                        }
                      }}
                      placeholder="e.g. Consulting, Real Estate, Personal"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Custom Public URL Slug *</label>
                    <div className="flex gap-2">
                      <div className="flex flex-1 items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                        <span className="px-2.5 text-xs font-mono text-slate-500 border-r border-slate-200 py-2.5">
                          /p/
                        </span>
                        <input
                          type="text"
                          required
                          value={newSlug}
                          onChange={(e) => {
                            setNewSlug(e.target.value.toLowerCase());
                            setModalSlugStatus('idle');
                          }}
                          placeholder="jeet-consulting"
                          className="flex-1 px-3 py-2 bg-white text-sm font-mono focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleCheckModalSlug}
                        className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                      >
                        Check
                      </button>
                    </div>
                    {modalSlugStatus === 'available' && (
                      <p className="mt-1 text-xs text-emerald-700 font-medium">Slug is available!</p>
                    )}
                    {modalSlugStatus === 'taken' && (
                      <p className="mt-1 text-xs text-rose-700 font-medium">Slug unavailable or shorter than 3 characters.</p>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setAddModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={creatingProfile}
                      className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#1D4ED8] hover:bg-blue-700 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{creatingProfile ? 'Creating Profile...' : 'Create & Fill Profile Info'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {activeProfile && (
            <WatermarkedProfileModal
              open={previewOpen}
              onClose={() => setPreviewOpen(false)}
              profile={activeProfile}
              isPaid={hasPaid}
            />
          )}

          {activeDesign && (
            <CardDesignPreviewModal
              open={cardPreviewOpen}
              onClose={() => setCardPreviewOpen(false)}
              title="Your Customized Card Design"
              subtitle={`${activeDesign.dimensions} · ${activeDesign.approved ? 'Approved' : 'Draft'}`}
              frontDesign={activeDesign.frontDesign}
              backDesign={activeDesign.backDesign}
              orientation={activeDesign.cardOrientation}
              personalInfo={activeProfile?.personalInformation || {}}
              onEditClick={() => navigate('/dashboard/card-design')}
            />
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link
              to="/dashboard/profile"
              className="bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-3"
            >
              <UserCheck className="h-5 w-5 text-[#1D4ED8] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-sm text-[#0B1D3A]">Edit Business Profile</div>
                <div className="text-xs text-slate-500 mt-1">Update contact details, photo, and custom slug.</div>
              </div>
            </Link>

            <Link
              to="/dashboard/visibility"
              className="bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-3"
            >
              <Eye className="h-5 w-5 text-[#1D4ED8] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-sm text-[#0B1D3A]">Control Public Visibility</div>
                <div className="text-xs text-slate-500 mt-1">Choose which fields appear publicly and in .vcf downloads.</div>
              </div>
            </Link>

            <Link
              to="/dashboard/card-design"
              className="bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-5 transition-colors flex items-start gap-3"
            >
              <CreditCard className="h-5 w-5 text-[#1D4ED8] shrink-0 mt-0.5" />
              <div>
                <div className="font-display font-bold text-sm text-[#0B1D3A]">Design & Order SMART Card</div>
                <div className="text-xs text-slate-500 mt-1">Customize your 85.6 × 54 mm layout and checkout.</div>
              </div>
            </Link>
          </div>

          {latestOrder && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <Package className="h-5 w-5 text-[#1D4ED8] mt-0.5" />
                <div>
                  <h3 className="font-display font-bold text-sm text-[#0B1D3A]">
                    Latest Order: {latestOrder.orderNumber}
                  </h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Status: <strong>{latestOrder.orderStatus}</strong> · Payment: {latestOrder.paymentStatus} · Expected delivery: 10–15 days within India
                  </p>
                </div>
              </div>
              <Link
                to={`/dashboard/orders/${latestOrder.orderId}`}
                className="px-4 py-2 bg-[#0B1D3A] text-white text-xs font-semibold rounded-lg whitespace-nowrap text-center"
              >
                Track Order
              </Link>
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
};

// Shared Grouped Sub-Navigation + Profile Switcher Dropdown + Create Profile CTA for Customer Profile Hub
const CustomerProfileHubHeader: React.FC<{
  activeTab: 'profile' | 'social' | 'custom' | 'visibility';
  profiles: ProfileRecord[];
  activeProfile: ProfileRecord | null;
  onSelectProfile: (profileId: string) => void;
  onOpenCreateModal?: () => void;
  canCreateProfile?: boolean;
}> = ({ activeTab, profiles, activeProfile, onSelectProfile, onOpenCreateModal, canCreateProfile = true }) => {
  const tabs: { id: 'profile' | 'social' | 'custom' | 'visibility'; label: string; to: string }[] = [
    { id: 'profile', label: 'Profile Info', to: '/dashboard/profile' },
    { id: 'social', label: 'Social Links', to: '/dashboard/social-links' },
    { id: 'custom', label: 'Custom Fields', to: '/dashboard/custom-fields' },
    { id: 'visibility', label: 'Public Profile Settings', to: '/dashboard/visibility' },
  ];

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 mb-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1 rounded-xl">
          {tabs.map((tab) => (
            <Link
              key={tab.id}
              to={tab.to}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                activeTab === tab.id
                  ? 'bg-[#0B1D3A] text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {profiles.length > 0 && activeProfile && (
            <div className="flex items-center gap-2">
              <label htmlFor="profile-switcher-select" className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                Active Profile:
              </label>
              <select
                id="profile-switcher-select"
                value={activeProfile.profileId}
                onChange={(e) => onSelectProfile(e.target.value)}
                className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-semibold bg-white text-[#0B1D3A] min-w-[190px]"
              >
                {profiles.map((p) => (
                  <option key={p.profileId} value={p.profileId}>
                    {p.profileLabel || p.personalInformation.fullName || p.slug} (/p/{p.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {onOpenCreateModal && (canCreateProfile || profiles.length === 0) && (
            <button
              type="button"
              onClick={onOpenCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#1D4ED8] hover:bg-blue-700 text-white text-xs font-semibold shadow-xs whitespace-nowrap"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Create Digital Profile</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// 2. My Profile (Personal Information + Slug)
export const CustomerProfilePage: React.FC = () => {
  const { userRecord, appSettings } = useAuth();
  const { profiles, activeProfile, setActiveProfile, selectProfile, loading, reload } = useActiveCustomerProfile();
  const { notify, confirmAction } = useToast();
  const [slugInput, setSlugInput] = useState('');
  const [previousSlug, setPreviousSlug] = useState('');
  const [slugStatus, setSlugStatus] = useState<'idle' | 'available' | 'taken'>('idle');
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [paymentRefInput, setPaymentRefInput] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [pendingPhotoSrc, setPendingPhotoSrc] = useState('');
  const [sameWhatsappAsMobile, setSameWhatsappAsMobile] = useState(false);
  const [samePersonalAsBusiness, setSamePersonalAsBusiness] = useState(false);

  useEffect(() => {
    if (!userRecord) return;
    getCustomerOrders(userRecord.uid).then((o) => {
      setOrders(o);
      if (profiles.length > 0) {
        reconcileDeliveredOrdersToProfiles(o, userRecord.role, profiles).then((changed) => {
          if (changed) reload();
        });
      }
    });
  }, [userRecord, profiles.length]);

  useEffect(() => {
    if (activeProfile) {
      setSlugInput(activeProfile.slug);
      setPreviousSlug(activeProfile.slug);
      setPaymentRefInput(activeProfile.paymentReference || '');
      const pi = activeProfile.personalInformation;
      setSameWhatsappAsMobile(Boolean(pi.mobile && pi.whatsapp === pi.mobile));
      setSamePersonalAsBusiness(Boolean(pi.businessAddress && pi.personalAddress === pi.businessAddress));
    }
  }, [activeProfile?.profileId]);

  const updateInfo = (field: keyof ProfileRecord['personalInformation'], value: string) => {
    if (!activeProfile) return;
    const nextPersonalInfo = {
      ...activeProfile.personalInformation,
      [field]: value,
      ...(field === 'mobile' && sameWhatsappAsMobile ? { whatsapp: value } : {}),
      ...(field === 'businessAddress' && samePersonalAsBusiness ? { personalAddress: value } : {}),
    };
    setActiveProfile({
      ...activeProfile,
      personalInformation: nextPersonalInfo,
    });
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeProfile) return;
    try {
      const rawDataUrl = await readImageFileAsDataUrl(file);
      const autoFitted = await autoFitImageToSquareDataUrl(rawDataUrl);
      updateInfo('photoDataUrl', autoFitted);
      setPendingPhotoSrc(rawDataUrl);
      setPhotoEditorOpen(true);
    } catch {
      notify('Upload failed', 'Could not read image file.', 'error');
    }
  };

  const handleCheckSlug = async () => {
    if (!activeProfile) return;
    const clean = sanitizeSlug(slugInput);
    setSlugInput(clean);
    const ok = await isSlugAvailable(clean, activeProfile.profileId);
    setSlugStatus(ok ? 'available' : 'taken');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    const cleanSlug = sanitizeSlug(slugInput);
    if (cleanSlug.length < 3) {
      notify('Invalid slug', 'Public URL slug must be at least 3 characters.', 'error');
      return;
    }
    setSaving(true);
    try {
      const available = await isSlugAvailable(cleanSlug, activeProfile.profileId);
      if (!available) {
        setSlugStatus('taken');
        notify('Slug unavailable', 'Please choose another unique profile slug.', 'error');
        setSaving(false);
        return;
      }
      const nextProfile: ProfileRecord = { ...activeProfile, slug: cleanSlug };
      await saveProfileAndSyncPublic(nextProfile, previousSlug);
      setActiveProfile(nextProfile);
      setPreviousSlug(cleanSlug);
      setSlugStatus('available');
      notify('Profile saved', 'Your digital business profile and public projection are updated.', 'success');
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <PortalLayout portal="customer" title="My Profile">
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      </PortalLayout>
    );
  }

  if (!activeProfile) {
    return (
      <PortalLayout portal="customer" title="My Profile">
        <CustomerProfileHubHeader
          activeTab="profile"
          profiles={profiles}
          activeProfile={null}
          onSelectProfile={selectProfile}
          onOpenCreateModal={() => setCreateModalOpen(true)}
          canCreateProfile
        />
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-[#1D4ED8] flex items-center justify-center mx-auto">
            <UserCheck className="h-7 w-7" />
          </div>
          <div>
            <h2 className="font-display text-lg font-bold text-[#0B1D3A]">Create Your Digital Profile</h2>
            <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
              You don&apos;t have a digital profile yet. Create your profile right here to customize your public URL, contact details, photo, and SMART card.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#1D4ED8] hover:bg-blue-700 text-white text-sm font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Create Digital Profile</span>
            </button>
            <Link
              to="/dashboard"
              className="px-5 py-3 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Go to Overview
            </Link>
          </div>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async (created) => {
            await reload();
            notify('Digital profile created', `Now editing "${created.profileLabel}".`, 'success');
          }}
        />
      </PortalLayout>
    );
  }

  const info = activeProfile.personalInformation;
  const hasPaid =
    isOrderPaymentConfirmed(orders, activeProfile.profileId, activeProfile.slug) ||
    Boolean(activeProfile.adminApproved) ||
    Boolean(activeProfile.paymentConfirmed);
  const isDisabledByAdmin = Boolean(activeProfile.adminDisabled);

  const handleMarkPaymentDone = async () => {
    if (!userRecord) return;
    setMarkingPaid(true);
    try {
      const updated = await markProfilePaymentCompleted({
        profile: activeProfile,
        completed: true,
        reference: paymentRefInput,
        actor: { uid: userRecord.uid, email: userRecord.email, role: userRecord.role },
        inactiveMessage: appSettings.inactiveProfileMessage,
      });
      setActiveProfile(updated);
      notify(
        'Payment status marked completed',
        `Public profile link /p/${updated.slug} is now unlocked and accessible.`,
        'success'
      );
      await reload();
    } catch (err) {
      notify('Unable to update payment status', err instanceof Error ? err.message : 'Please try again.', 'error');
    } finally {
      setMarkingPaid(false);
    }
  };

  const handleDeleteCurrentProfile = async () => {
    if (!userRecord) return;
    const ok = await confirmAction({
      title: 'Delete Digital Profile',
      message: `Permanently delete "${activeProfile.profileLabel || activeProfile.slug}"?`,
      destructive: true,
      confirmLabel: 'Delete Profile',
    });
    if (!ok) return;
    await deleteDigitalProfile({
      profile: activeProfile,
      actor: { uid: userRecord.uid, email: userRecord.email, role: userRecord.role },
    });
    notify('Profile deleted', 'Your digital profile has been removed.', 'success');
    await reload();
  };

  return (
    <PortalLayout portal="customer" title="My Profile & Visibility">
      <CustomerProfileHubHeader
        activeTab="profile"
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={selectProfile}
        onOpenCreateModal={() => setCreateModalOpen(true)}
        canCreateProfile={appSettings.multipleProfilesEnabled}
      />

      {isDisabledByAdmin && (
        <div className="mb-5 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-center gap-2.5">
          <Lock className="h-4 w-4 text-rose-600 shrink-0" />
          <span>
            <strong>Link Disabled by Administrator:</strong> Your public profile URL is currently deactivated by an admin or superadmin. Please contact support if you believe this is an error.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Profile Photo & Slug */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            {info.photoDataUrl ? (
              <img
                src={info.photoDataUrl}
                alt="Profile"
                className="w-20 h-20 rounded-full object-cover border border-slate-200 bg-transparent"
              />
            ) : (
              <div className="w-20 h-20 rounded-full bg-[#0B1D3A] text-white flex items-center justify-center font-display text-2xl font-bold">
                {(info.fullName || 'T')[0]}
              </div>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Upload className="h-3.5 w-3.5" />
                  <span>{info.photoDataUrl ? 'Replace Photo' : 'Upload Profile Photo'}</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                </label>
                {info.photoDataUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setPendingPhotoSrc(info.photoDataUrl || '');
                      setPhotoEditorOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[#1D4ED8]/30 bg-blue-50 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Edit / Crop &amp; Resize Photo</span>
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Photos auto-fit to the circle frame on upload and preserve transparent PNG backgrounds. Click <strong>Edit / Crop &amp; Resize Photo</strong> anytime to zoom, drag, or fit your full photo.
              </p>
            </div>
          </div>

          <div className="pt-5 border-t border-slate-100 space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Unique Public Profile URL Slug
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex flex-1 items-center border border-slate-300 rounded-lg overflow-hidden bg-slate-50">
                  <span className="px-3 text-xs font-mono text-slate-500 border-r border-slate-200 py-2.5">
                    {window.location.origin}/p/
                  </span>
                  <input
                    type="text"
                    value={slugInput}
                    onChange={(e) => {
                      setSlugInput(e.target.value.toLowerCase());
                      setSlugStatus('idle');
                    }}
                    className="flex-1 px-3 py-2 bg-white text-sm font-mono focus:outline-none"
                    placeholder="jeet-kulkarni"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCheckSlug}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                >
                  Check Availability
                </button>
              </div>
              {slugStatus === 'available' && (
                <p className="mt-1.5 text-xs text-emerald-700 font-medium">Slug is available.</p>
              )}
              {slugStatus === 'taken' && (
                <p className="mt-1.5 text-xs text-rose-700 font-medium">Slug is already registered to another profile.</p>
              )}
            </div>

            {/* Public Profile Link & Payment Lock Banner */}
            <div
              className={`relative overflow-hidden rounded-xl border p-4 ${
                hasPaid && !isDisabledByAdmin && activeProfile.isPublic
                  ? 'border-emerald-200 bg-emerald-50/60'
                  : 'border-amber-200 bg-amber-50/70'
              }`}
            >
              {!hasPaid && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-[0.09] -rotate-6 font-display font-extrabold text-xl tracking-widest text-amber-900 select-none"
                >
                  PAYMENT PENDING · LINK MASKED
                </div>
              )}
              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-[#0B1D3A] flex items-center gap-1.5">
                    {hasPaid && !isDisabledByAdmin ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Public Profile Link (Active &amp; Unlocked)</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-3.5 w-3.5 text-amber-600" />
                        <span>
                          {isDisabledByAdmin
                            ? 'Public Profile Link (Disabled by Admin)'
                            : 'Public Profile Link (Masked Until Payment Completed)'}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-xs select-none">
                    {hasPaid && !isDisabledByAdmin && activeProfile.isPublic ? (
                      <a
                        href={`/p/${activeProfile.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1D4ED8] hover:underline break-all"
                      >
                        {window.location.origin}/p/{activeProfile.slug}
                      </a>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded bg-white/80 border border-amber-300 text-slate-500 blur-[1.5px]">
                        {window.location.origin}/p/••••••••••••
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {hasPaid && !isDisabledByAdmin && activeProfile.isPublic ? (
                    <button
                      type="button"
                      onClick={async () => {
                        const url = `${window.location.origin}/p/${activeProfile.slug}`;
                        await navigator.clipboard.writeText(url);
                        notify('Public URL copied', url, 'success');
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-emerald-300 text-xs font-semibold text-emerald-800 hover:bg-emerald-50"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copy Live Link</span>
                    </button>
                  ) : !hasPaid && !isDisabledByAdmin ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        value={paymentRefInput}
                        onChange={(e) => setPaymentRefInput(e.target.value)}
                        placeholder="Txn / Payment Ref (optional)"
                        className="px-2.5 py-1.5 rounded-lg border border-amber-300 bg-white text-xs font-mono w-44"
                      />
                      <button
                        type="button"
                        disabled={markingPaid}
                        onClick={handleMarkPaymentDone}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5" />
                        <span>{markingPaid ? 'Unlocking...' : 'Mark Payment Completed'}</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Contact Fields */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Profile Label</label>
            <input
              type="text"
              value={activeProfile.profileLabel || ''}
              onChange={(e) => setActiveProfile({ ...activeProfile, profileLabel: e.target.value })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              placeholder="Primary Business Profile"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Full Name *</label>
            <input
              type="text"
              required
              value={info.fullName}
              onChange={(e) => updateInfo('fullName', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Designation / Job Title</label>
            <input
              type="text"
              value={info.jobTitle}
              onChange={(e) => updateInfo('jobTitle', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Company Name</label>
            <input
              type="text"
              value={info.companyName}
              onChange={(e) => updateInfo('companyName', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Business Category</label>
            <input
              type="text"
              value={info.businessCategory}
              onChange={(e) => updateInfo('businessCategory', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              placeholder="e.g. Consulting, Real Estate, Technology"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Website</label>
            <input
              type="text"
              value={info.website}
              onChange={(e) => updateInfo('website', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              placeholder="https://yourcompany.com"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Short Biography (Rich Formatting: Bold, Italic, Underline, Alignment &amp; Colors)
            </label>
            <RichBioEditor
              value={info.shortBio}
              onChange={(html) => updateInfo('shortBio', html)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mobile Number</label>
            <input
              type="tel"
              value={info.mobile}
              onChange={(e) => updateInfo('mobile', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
              placeholder="+91 9876543210"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Alternate Mobile Number</label>
            <input
              type="tel"
              value={info.alternateMobile}
              onChange={(e) => updateInfo('alternateMobile', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-600">WhatsApp Number</label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1D4ED8] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={sameWhatsappAsMobile}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSameWhatsappAsMobile(checked);
                    if (checked) {
                      if (info.mobile) {
                        setActiveProfile({
                          ...activeProfile,
                          personalInformation: { ...info, whatsapp: info.mobile },
                        });
                      } else if (info.whatsapp) {
                        setActiveProfile({
                          ...activeProfile,
                          personalInformation: { ...info, mobile: info.whatsapp },
                        });
                      }
                    }
                  }}
                  className="h-3.5 w-3.5 accent-[#1D4ED8] rounded"
                />
                <span>Same as Mobile Number</span>
              </label>
            </div>
            <input
              type="tel"
              value={sameWhatsappAsMobile ? info.mobile : info.whatsapp}
              readOnly={sameWhatsappAsMobile}
              onChange={(e) => {
                if (sameWhatsappAsMobile) return;
                updateInfo('whatsapp', e.target.value);
              }}
              className={`w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono ${
                sameWhatsappAsMobile ? 'bg-slate-50 text-slate-600' : 'bg-white'
              }`}
              placeholder="919876543210"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Email Address</label>
            <input
              type="email"
              value={info.email}
              onChange={(e) => updateInfo('email', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Alternate Email</label>
            <input
              type="email"
              value={info.alternateEmail}
              onChange={(e) => updateInfo('alternateEmail', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Business Address</label>
            <input
              type="text"
              value={info.businessAddress}
              onChange={(e) => updateInfo('businessAddress', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              placeholder="Office / Building / Street"
            />
          </div>
          <div className="md:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-medium text-slate-600">Personal Address</label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1D4ED8] cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={samePersonalAsBusiness}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSamePersonalAsBusiness(checked);
                    if (checked) {
                      if (info.businessAddress) {
                        setActiveProfile({
                          ...activeProfile,
                          personalInformation: { ...info, personalAddress: info.businessAddress },
                        });
                      } else if (info.personalAddress) {
                        setActiveProfile({
                          ...activeProfile,
                          personalInformation: { ...info, businessAddress: info.personalAddress },
                        });
                      }
                    }
                  }}
                  className="h-3.5 w-3.5 accent-[#1D4ED8] rounded"
                />
                <span>Same as Business Address</span>
              </label>
            </div>
            <input
              type="text"
              value={samePersonalAsBusiness ? info.businessAddress : info.personalAddress || ''}
              readOnly={samePersonalAsBusiness}
              onChange={(e) => {
                if (samePersonalAsBusiness) return;
                updateInfo('personalAddress', e.target.value);
              }}
              className={`w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm ${
                samePersonalAsBusiness ? 'bg-slate-50 text-slate-600' : 'bg-white'
              }`}
              placeholder="Home / Residential Address"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">City</label>
            <input
              type="text"
              value={info.city}
              onChange={(e) => updateInfo('city', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">State</label>
            <select
              value={info.state}
              onChange={(e) => updateInfo('state', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {INDIAN_STATES.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">PIN Code</label>
            <input
              type="text"
              maxLength={6}
              value={info.pinCode}
              onChange={(e) => updateInfo('pinCode', e.target.value.replace(/\D/g, ''))}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
            <input
              type="text"
              value={info.country}
              onChange={(e) => updateInfo('country', e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={handleDeleteCurrentProfile}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-300 text-sm font-semibold text-rose-700 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4" />
            <span>Delete Digital Profile</span>
          </button>

          <div className="flex flex-wrap items-center gap-3">
            {hasPaid ? (
              <a
                href={`/p/${activeProfile.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                <span>Open Public Profile</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Eye className="h-4 w-4" />
                <span>Watermarked Preview</span>
              </button>
            )}
            <Link
              to="/dashboard/visibility"
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Configure Visibility
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-[#0B1D3A] hover:bg-[#132A52] text-white text-sm font-semibold disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      </form>
      <WatermarkedProfileModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        profile={activeProfile}
        isPaid={hasPaid}
      />
      <ProfilePhotoEditorModal
        open={photoEditorOpen}
        imageSrc={pendingPhotoSrc || info.photoDataUrl || ''}
        onClose={() => setPhotoEditorOpen(false)}
        onSave={(croppedUrl) => {
          updateInfo('photoDataUrl', croppedUrl);
          notify('Photo updated', 'Click Save Profile to publish your cropped photo.', 'success');
        }}
      />
      <CreateDigitalProfileModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        profilesCount={profiles.length}
        onCreated={async (created) => {
          await reload();
          notify('Digital profile created', `Now editing "${created.profileLabel}".`, 'success');
        }}
      />
    </PortalLayout>
  );
};

// 3. Social Links Manager (Auto-Saves Immediately on Add / Toggle / Move / Delete)
export const CustomerSocialLinksPage: React.FC = () => {
  const { profiles, activeProfile, setActiveProfile, selectProfile, loading, reload } = useActiveCustomerProfile();
  const { appSettings } = useAuth();
  const { notify } = useToast();
  const [platform, setPlatform] = useState<SocialPlatformId>('linkedin');
  const [label, setLabel] = useState('LinkedIn');
  const [url, setUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoSaveNote, setAutoSaveNote] = useState('');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const persistSocialProfile = async (nextProfile: ProfileRecord, toastTitle?: string) => {
    setActiveProfile(nextProfile);
    setSaving(true);
    setAutoSaveNote('Auto-saving...');
    try {
      await saveProfileAndSyncPublic(nextProfile, undefined, appSettings.inactiveProfileMessage);
      setAutoSaveNote('All changes auto-saved');
      if (toastTitle) notify(toastTitle, 'Synced to your public profile.', 'success');
    } catch (err) {
      setAutoSaveNote('');
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save social link.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;
    try {
      const normalized = url.startsWith('http') ? url : `https://${url}`;
      new URL(normalized);
      const item: SocialLinkItem = {
        id: `soc_${Date.now()}`,
        platform,
        label: label.trim() || platform,
        url: normalized,
        enabled: true,
        order: activeProfile.socialLinks.length,
      };
      const nextProfile: ProfileRecord = {
        ...activeProfile,
        socialLinks: [...activeProfile.socialLinks, item],
        visibilitySettings: {
          ...activeProfile.visibilitySettings,
          socialLinks: { ...activeProfile.visibilitySettings.socialLinks, [item.id]: true },
        },
      };
      setUrl('');
      await persistSocialProfile(nextProfile, `${item.label} added & saved`);
    } catch {
      notify('Invalid URL', 'Please enter a valid web or social URL.', 'error');
    }
  };

  const moveLink = async (idx: number, dir: -1 | 1) => {
    if (!activeProfile) return;
    const list = [...activeProfile.socialLinks];
    const target = idx + dir;
    if (target < 0 || target >= list.length) return;
    [list[idx], list[target]] = [list[target], list[idx]];
    const nextProfile: ProfileRecord = {
      ...activeProfile,
      socialLinks: list.map((item, i) => ({ ...item, order: i })),
    };
    await persistSocialProfile(nextProfile);
  };

  const handleSave = async () => {
    if (!activeProfile) return;
    await persistSocialProfile(activeProfile, 'Social links saved');
  };

  if (loading) {
    return (
      <PortalLayout portal="customer" title="Social Links">
        <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
      </PortalLayout>
    );
  }

  if (!activeProfile) {
    return (
      <PortalLayout portal="customer" title="Social Links">
        <CustomerProfileHubHeader
          activeTab="social"
          profiles={profiles}
          activeProfile={null}
          onSelectProfile={selectProfile}
          onOpenCreateModal={() => setCreateModalOpen(true)}
          canCreateProfile
        />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">Create a digital profile first to add social links.</p>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Create Digital Profile</span>
          </button>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async () => { await reload(); }}
        />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout portal="customer" title="My Profile & Visibility">
      <CustomerProfileHubHeader
        activeTab="social"
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={selectProfile}
        onOpenCreateModal={() => setCreateModalOpen(true)}
        canCreateProfile={appSettings.multipleProfilesEnabled}
      />
      <div className="space-y-6">
        <form onSubmit={handleAdd} className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => {
                const pid = e.target.value as SocialPlatformId;
                setPlatform(pid);
                const found = SOCIAL_PLATFORMS.find((p) => p.id === pid);
                if (found) setLabel(found.label);
              }}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              {SOCIAL_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Display Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Profile URL</label>
            <input
              type="text"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={SOCIAL_PLATFORMS.find((p) => p.id === platform)?.placeholder}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#1D4ED8] text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Add &amp; Save Link</span>
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {activeProfile.socialLinks.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No social links added yet. Add WhatsApp, LinkedIn, Instagram, or portfolio URLs above — links save automatically.
            </div>
          ) : (
            activeProfile.socialLinks.map((item, idx) => (
              <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm text-[#0B1D3A]">{item.label}</div>
                  <div className="text-xs text-slate-500 truncate">{item.url}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 mr-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        const nextLinks = activeProfile.socialLinks.map((s) =>
                          s.id === item.id ? { ...s, enabled: checked } : s
                        );
                        persistSocialProfile({
                          ...activeProfile,
                          socialLinks: nextLinks,
                          visibilitySettings: {
                            ...activeProfile.visibilitySettings,
                            socialLinks: {
                              ...activeProfile.visibilitySettings.socialLinks,
                              [item.id]: checked,
                            },
                          },
                        });
                      }}
                    />
                    <span>Enabled</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => moveLink(idx, -1)}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveLink(idx, 1)}
                    className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSocialMap = { ...(activeProfile.visibilitySettings.socialLinks || {}) };
                      delete nextSocialMap[item.id];
                      persistSocialProfile(
                        {
                          ...activeProfile,
                          socialLinks: activeProfile.socialLinks.filter((s) => s.id !== item.id),
                          visibilitySettings: {
                            ...activeProfile.visibilitySettings,
                            socialLinks: nextSocialMap,
                          },
                        },
                        'Social link removed'
                      );
                    }}
                    className="p-2 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50"
                    aria-label="Delete link"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-emerald-700 font-medium">
            {autoSaveNote || 'Social links save automatically when added, toggled, reordered, or deleted.'}
          </span>
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Social Links'}
          </button>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async () => { await reload(); }}
        />
      </div>
    </PortalLayout>
  );
};

// 4. Custom Fields Manager (Auto-Saves Immediately)
export const CustomerCustomFieldsPage: React.FC = () => {
  const { profiles, activeProfile, setActiveProfile, selectProfile, loading, reload } = useActiveCustomerProfile();
  const { appSettings } = useAuth();
  const { notify } = useToast();
  const [label, setLabel] = useState('');
  const [value, setValue] = useState('');
  const [type, setType] = useState<CustomFieldType>('text');
  const [saving, setSaving] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);

  const persistCustomFields = async (nextProfile: ProfileRecord, toastTitle?: string) => {
    setActiveProfile(nextProfile);
    setSaving(true);
    try {
      await saveProfileAndSyncPublic(nextProfile, undefined, appSettings.inactiveProfileMessage);
      if (toastTitle) notify(toastTitle, 'Only fields marked visible appear on your public URL.', 'success');
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save custom fields.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile || !label.trim() || !value.trim()) return;
    const item: CustomFieldItem = {
      id: `cf_${Date.now()}`,
      label: label.trim(),
      value: value.trim(),
      type,
      order: activeProfile.customFields.length,
      visible: true,
    };
    const nextProfile: ProfileRecord = {
      ...activeProfile,
      customFields: [...activeProfile.customFields, item],
    };
    setLabel('');
    setValue('');
    await persistCustomFields(nextProfile, `${item.label} added & saved`);
  };

  const handleSave = async () => {
    if (!activeProfile) return;
    await persistCustomFields(activeProfile, 'Custom fields updated');
  };

  if (loading) {
    return (
      <PortalLayout portal="customer" title="Custom Fields">
        <div className="h-48 bg-slate-200 rounded-xl animate-pulse" />
      </PortalLayout>
    );
  }

  if (!activeProfile) {
    return (
      <PortalLayout portal="customer" title="Custom Fields">
        <CustomerProfileHubHeader
          activeTab="custom"
          profiles={profiles}
          activeProfile={null}
          onSelectProfile={selectProfile}
          onOpenCreateModal={() => setCreateModalOpen(true)}
          canCreateProfile
        />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">Create a digital profile first to add custom fields.</p>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Create Digital Profile</span>
          </button>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async () => { await reload(); }}
        />
      </PortalLayout>
    );
  }

  return (
    <PortalLayout portal="customer" title="My Profile & Visibility">
      <CustomerProfileHubHeader
        activeTab="custom"
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={selectProfile}
        onOpenCreateModal={() => setCreateModalOpen(true)}
        canCreateProfile={appSettings.multipleProfilesEnabled}
      />
      <div className="space-y-6">
        <form onSubmit={handleAdd} className="bg-white border border-slate-200 rounded-2xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Field Label</label>
            <input
              type="text"
              required
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. GST Number, Booking Link"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="text">Text</option>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="url">URL</option>
              <option value="address">Address</option>
              <option value="date">Date</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Value</label>
            <input
              type="text"
              required
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter field value"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#1D4ED8] text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Add &amp; Save Field</span>
          </button>
        </form>

        <div className="bg-white border border-slate-200 rounded-2xl divide-y divide-slate-100">
          {activeProfile.customFields.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No custom fields yet. Add GST numbers, registration IDs, office numbers, or appointment URLs.
            </div>
          ) : (
            activeProfile.customFields.map((field) => (
              <div key={field.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-[#0B1D3A]">
                    {field.label} <span className="text-xs font-normal text-slate-400">· {field.type}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{field.value}</div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={field.visible}
                      onChange={(e) => {
                        const next = activeProfile.customFields.map((f) =>
                          f.id === field.id ? { ...f, visible: e.target.checked } : f
                        );
                        persistCustomFields({ ...activeProfile, customFields: next });
                      }}
                    />
                    <span>Publicly Visible</span>
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      persistCustomFields(
                        {
                          ...activeProfile,
                          customFields: activeProfile.customFields.filter((f) => f.id !== field.id),
                        },
                        'Custom field deleted'
                      )
                    }
                    className="p-2 border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="px-6 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Custom Fields'}
          </button>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async () => { await reload(); }}
        />
      </div>
    </PortalLayout>
  );
};

// 5. Public Profile Visibility Controls (Auto-Saves & Syncs Immediately)
export const CustomerVisibilityPage: React.FC = () => {
  const { profiles, activeProfile, setActiveProfile, selectProfile, loading, reload } = useActiveCustomerProfile();
  const { userRecord, appSettings } = useAuth();
  const { notify } = useToast();
  const [saving, setSaving] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [syncNote, setSyncNote] = useState('');
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    if (!userRecord) return;
    getCustomerOrders(userRecord.uid).then((o) => {
      setOrders(o);
      if (profiles.length > 0) {
        reconcileDeliveredOrdersToProfiles(o, userRecord.role, profiles).then((changed) => {
          if (changed) reload();
        });
      }
    });
  }, [userRecord, profiles.length]);

  if (loading) {
    return (
      <PortalLayout portal="customer" title="My Profile & Visibility">
        <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
      </PortalLayout>
    );
  }

  if (!activeProfile) {
    return (
      <PortalLayout portal="customer" title="My Profile & Visibility">
        <CustomerProfileHubHeader
          activeTab="visibility"
          profiles={profiles}
          activeProfile={null}
          onSelectProfile={selectProfile}
          onOpenCreateModal={() => setCreateModalOpen(true)}
          canCreateProfile
        />
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <p className="text-sm text-slate-600">Create a digital profile first to configure public visibility settings.</p>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#1D4ED8] text-white text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            <span>Create Digital Profile</span>
          </button>
        </div>
        <CreateDigitalProfileModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          profilesCount={profiles.length}
          onCreated={async () => { await reload(); }}
        />
      </PortalLayout>
    );
  }

  const hasPaid =
    isOrderPaymentConfirmed(orders, activeProfile.profileId, activeProfile.slug) ||
    Boolean(activeProfile.adminApproved) ||
    Boolean(activeProfile.paymentConfirmed);
  const isDisabledByAdmin = Boolean(activeProfile.adminDisabled);
  const vis = activeProfile.visibilitySettings;
  const info = activeProfile.personalInformation;

  const persistVisibility = async (nextProfile: ProfileRecord, toastMsg?: string) => {
    setActiveProfile(nextProfile);
    setSaving(true);
    setSyncNote('Syncing to public profile...');
    try {
      await saveProfileAndSyncPublic(nextProfile, undefined, appSettings.inactiveProfileMessage);
      setSyncNote('Synced with public profile');
      if (toastMsg) notify('Visibility updated', toastMsg, 'success');
    } catch (err) {
      setSyncNote('');
      notify('Sync failed', err instanceof Error ? err.message : 'Unable to sync public profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = (key: keyof Omit<ProfileRecord['visibilitySettings'], 'socialLinks'>) => {
    persistVisibility({
      ...activeProfile,
      visibilitySettings: { ...vis, [key]: !vis[key] },
    });
  };

  const fieldsList: {
    key: keyof Omit<ProfileRecord['visibilitySettings'], 'socialLinks'>;
    label: string;
    hasValue: boolean;
  }[] = [
    { key: 'photo', label: 'Profile Photo', hasValue: Boolean(info.photoDataUrl) },
    { key: 'fullName', label: 'Full Name', hasValue: Boolean(info.fullName) },
    { key: 'jobTitle', label: 'Job Title / Designation', hasValue: Boolean(info.jobTitle) },
    { key: 'companyName', label: 'Company Name', hasValue: Boolean(info.companyName) },
    { key: 'businessCategory', label: 'Business Category', hasValue: Boolean(info.businessCategory) },
    { key: 'shortBio', label: 'Short Biography', hasValue: Boolean(info.shortBio) },
    { key: 'mobile', label: 'Mobile Number', hasValue: Boolean(info.mobile) },
    { key: 'whatsapp', label: 'WhatsApp', hasValue: Boolean(info.whatsapp) },
    { key: 'email', label: 'Email Address', hasValue: Boolean(info.email) },
    { key: 'website', label: 'Website', hasValue: Boolean(info.website) },
    {
      key: 'businessAddress',
      label: 'Business Address',
      hasValue: Boolean(info.businessAddress || info.city || info.state || info.pinCode),
    },
    {
      key: 'personalAddress',
      label: 'Personal Address',
      hasValue: Boolean(info.personalAddress),
    },
    { key: 'alternateMobile', label: 'Alternate Mobile', hasValue: Boolean(info.alternateMobile) },
    { key: 'alternateEmail', label: 'Alternate Email', hasValue: Boolean(info.alternateEmail) },
  ];

  const handleCheckAll = () => {
    const nextSocialMap: Record<string, boolean> = {};
    for (const s of activeProfile.socialLinks) nextSocialMap[s.id] = true;
    persistVisibility(
      {
        ...activeProfile,
        isPublic: true,
        socialLinks: activeProfile.socialLinks.map((s) => ({ ...s, enabled: true })),
        customFields: activeProfile.customFields.map((c) => ({ ...c, visible: true })),
        visibilitySettings: {
          photo: true,
          fullName: true,
          jobTitle: true,
          companyName: true,
          businessCategory: true,
          shortBio: true,
          mobile: true,
          alternateMobile: true,
          whatsapp: true,
          email: true,
          alternateEmail: true,
          website: true,
          businessAddress: true,
          personalAddress: true,
          socialLinks: nextSocialMap,
        },
      },
      'All fields checked and synced to your public profile.'
    );
  };

  const handleSave = async () => {
    await persistVisibility(activeProfile, 'Public profile & vCard export now reflect your selected fields.');
  };

  return (
    <PortalLayout portal="customer" title="My Profile & Visibility">
      <CustomerProfileHubHeader
        activeTab="visibility"
        profiles={profiles}
        activeProfile={activeProfile}
        onSelectProfile={selectProfile}
        onOpenCreateModal={() => setCreateModalOpen(true)}
        canCreateProfile={appSettings.multipleProfilesEnabled}
      />
      <div className="space-y-6">
        {!hasPaid && !isDisabledByAdmin && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-amber-950">
              <div className="font-bold flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-amber-700" />
                <span>Public Profile Link Masked Until Payment Completed</span>
              </div>
              <p className="mt-0.5 text-amber-800">
                External visitors cannot access your public link until payment is marked completed or approved by an admin.
              </p>
            </div>
            <button
              type="button"
              disabled={markingPaid}
              onClick={async () => {
                if (!userRecord) return;
                setMarkingPaid(true);
                try {
                  const updated = await markProfilePaymentCompleted({
                    profile: activeProfile,
                    completed: true,
                    actor: { uid: userRecord.uid, email: userRecord.email, role: userRecord.role },
                    inactiveMessage: appSettings.inactiveProfileMessage,
                  });
                  setActiveProfile(updated);
                  notify('Payment marked completed', `/p/${updated.slug} is now live.`, 'success');
                  await reload();
                } finally {
                  setMarkingPaid(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap disabled:opacity-50"
            >
              {markingPaid ? 'Updating...' : 'Mark Payment Completed'}
            </button>
          </div>
        )}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="font-display font-bold text-base text-[#0B1D3A]">Public Profile Availability</h2>
            <p className="text-xs text-slate-600 mt-1">
              Changes auto-sync to your public profile and vCard (.vcf) downloads. Only fields with saved values appear publicly.
            </p>
            {syncNote && <p className="text-[11px] font-semibold text-emerald-700 mt-1">{syncNote}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleCheckAll}
              className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-[#0B1D3A] hover:bg-slate-50"
            >
              Show All Fields
            </button>
            <label className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
              <input
                type="checkbox"
                checked={activeProfile.isPublic}
                onChange={(e) => persistVisibility({ ...activeProfile, isPublic: e.target.checked })}
              />
              <span className="text-sm font-semibold text-[#0B1D3A]">
                {activeProfile.isPublic ? 'Profile Active (Public)' : 'Profile Deactivated'}
              </span>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6">
            <h3 className="font-display font-bold text-sm text-[#0B1D3A] mb-4">Personal &amp; Contact Fields</h3>
            <div className="space-y-2.5">
              {fieldsList.map((f) => (
                <label
                  key={f.key}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-slate-800">{f.label}</span>
                    {!f.hasValue && (
                      <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        Empty in My Profile
                      </span>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(vis[f.key])}
                    onChange={() => toggleField(f.key)}
                    className="h-4 w-4 accent-[#1D4ED8] shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="font-display font-bold text-sm text-[#0B1D3A] mb-4">Social Links Visibility</h3>
              {activeProfile.socialLinks.length === 0 ? (
                <p className="text-xs text-slate-500">No social links configured yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeProfile.socialLinks.map((link) => {
                    const isVisible =
                      vis.socialLinks?.[link.id] !== undefined
                        ? Boolean(vis.socialLinks[link.id])
                        : Boolean(link.enabled);
                    return (
                      <label
                        key={link.id}
                        className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                      >
                        <span className="text-sm text-slate-800">{link.label}</span>
                        <input
                          type="checkbox"
                          checked={isVisible}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            persistVisibility({
                              ...activeProfile,
                              socialLinks: activeProfile.socialLinks.map((s) =>
                                s.id === link.id ? { ...s, enabled: checked } : s
                              ),
                              visibilitySettings: {
                                ...vis,
                                socialLinks: { ...vis.socialLinks, [link.id]: checked },
                              },
                            });
                          }}
                          className="h-4 w-4 accent-[#1D4ED8]"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <h3 className="font-display font-bold text-sm text-[#0B1D3A] mb-4">Custom Fields Visibility</h3>
              {activeProfile.customFields.length === 0 ? (
                <p className="text-xs text-slate-500">No custom fields configured yet.</p>
              ) : (
                <div className="space-y-2.5">
                  {activeProfile.customFields.map((cf) => (
                    <label
                      key={cf.id}
                      className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer"
                    >
                      <span className="text-sm text-slate-800">
                        {cf.label} <span className="text-xs text-slate-400">({cf.value})</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={cf.visible}
                        onChange={(e) => {
                          const next = activeProfile.customFields.map((item) =>
                            item.id === cf.id ? { ...item, visible: e.target.checked } : item
                          );
                          persistVisibility({ ...activeProfile, customFields: next });
                        }}
                        className="h-4 w-4 accent-[#1D4ED8]"
                      />
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasPaid ? (
            <a
              href={`/p/${activeProfile.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Preview Public Profile</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Eye className="h-4 w-4" />
              <span>Watermarked Preview (URL Locked Until Payment)</span>
            </button>
          )}
          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            <span>{saving ? 'Syncing...' : 'Save & Sync Public Profile'}</span>
          </button>
        </div>
      </div>
      <WatermarkedProfileModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        profile={activeProfile}
        isPaid={hasPaid}
      />
      <CreateDigitalProfileModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        profilesCount={profiles.length}
        onCreated={async () => { await reload(); }}
      />
    </PortalLayout>
  );
};
