import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Upload,
  Lock,
  ShieldCheck,
  Truck,
  QrCode,
  AlertCircle,
  Send,
  RotateCcw,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Info,
  Image as ImageIcon,
  UserCircle2,
  Eye,
  Save,
  ChevronDown,
  Crop,
  Copy,
  Type,
  Wifi,
  Sparkles,
  Check,
  Layers,
  Square,
  Circle,
  Minus,
} from 'lucide-react';
import { PortalLayout } from '../../components/PortalLayout';
import { CardCanvasPreview, type CardCanvasTarget } from '../../components/CardCanvasPreview';
import { CardDesignPreviewModal } from '../../components/CardDesignPreviewModal';
import { FulfilmentTimeline } from '../../components/FulfilmentTimeline';
import {
  ProfilePhotoEditorModal,
  autoFitImageToSquareDataUrl,
  readImageFileAsDataUrl,
} from '../../components/ProfilePhotoEditorModal';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import {
  createPendingOrder,
  createSupportTicket,
  extractTimestampMs,
  finalizeVerifiedOrderPayment,
  getCardDesignById,
  getCardTemplates,
  getCustomerOrders,
  getOrderById,
  getQrCodeById,
  getSupportTickets,
  getUserDesigns,
  getUserProfiles,
  saveCardDesign,
  sendAndLogTransactionalEmail,
} from '../../lib/firestoreService';
import { getActiveStudioDraft, saveActiveStudioDraft } from '../../lib/studioDraft';
import { compressImageFileToDataUrl } from '../../lib/qrArtwork';
import { resolveCardTokens } from '../../lib/printPdf';
import {
  BLANK_CARD_TEMPLATE,
  DEFAULT_CARD_TEMPLATES,
  DEFAULT_PAYMENT_GATEWAYS,
  INDIAN_STATES,
  PAYMENT_GATEWAY_ORDER,
} from '../../lib/constants';
import type {
  CardDesignRecord,
  CardShapeElement,
  CardSideDesign,
  CardTemplateRecord,
  CardTextElement,
  OrderRecord,
  PaymentGatewayConfig,
  PaymentGatewayId,
  PaymentRecord,
  ProfileRecord,
  QrCodeRecord,
  SupportTicketRecord,
} from '../../types';

const SYSTEM_FONTS = [
  { label: 'Plus Jakarta Sans (Brand)', value: 'Plus Jakarta Sans' },
  { label: 'DM Sans (Brand)', value: 'DM Sans' },
  { label: 'JetBrains Mono (Code)', value: 'JetBrains Mono' },
  { label: 'Arial (System Sans)', value: 'Arial, sans-serif' },
  { label: 'Helvetica (System Sans)', value: 'Helvetica, sans-serif' },
  { label: 'Verdana (System Sans)', value: 'Verdana, sans-serif' },
  { label: 'Tahoma (System Sans)', value: 'Tahoma, sans-serif' },
  { label: 'Trebuchet MS (System Sans)', value: 'Trebuchet MS, sans-serif' },
  { label: 'Impact (Display Sans)', value: 'Impact, sans-serif' },
  { label: 'Georgia (System Serif)', value: 'Georgia, serif' },
  { label: 'Times New Roman (System Serif)', value: 'Times New Roman, serif' },
  { label: 'Courier New (System Mono)', value: 'Courier New, monospace' },
];

const TEXT_COLOR_SWATCHES = [
  '#FFFFFF',
  '#0B1D3A',
  '#1D4ED8',
  '#06B6D4',
  '#93C5FD',
  '#334155',
  '#F59E0B',
  '#E11D48',
];

function cloneSide(side: CardSideDesign): CardSideDesign {
  return JSON.parse(JSON.stringify(side)) as CardSideDesign;
}

function isLightHexColor(hex: string): boolean {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length !== 6 && cleaned.length !== 3) return false;
  const full =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62;
}

function getNextCleanTextPosition(elements: CardTextElement[]): { xPct: number; yPct: number } {
  const candidates = [14, 24, 34, 44, 54, 64, 74, 82];
  for (const y of candidates) {
    const occupied = elements.some((el) => Math.abs(el.yPct - y) < 8);
    if (!occupied) return { xPct: 8, yPct: y };
  }
  const offset = (elements.length % 5) * 6;
  return { xPct: 10 + (elements.length % 3) * 4, yPct: Math.min(82, 22 + offset) };
}

interface ProfileCardFieldOption {
  key: string;
  label: string;
  previewValue: string;
  insertText: string;
  defaultFontSizePt: number;
  defaultBold?: boolean;
}

const DEFAULT_STARTER_TEMPLATE =
  DEFAULT_CARD_TEMPLATES.find((t) => t.isDefault) || DEFAULT_CARD_TEMPLATES[0];

// 6. Business Card Design Studio (85.6 x 54 mm + Non-Scannable QR Placeholder)
export const CustomerCardStudioPage: React.FC = () => {
  const { userRecord } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<CardTemplateRecord[]>(DEFAULT_CARD_TEMPLATES);
  const [profiles, setProfiles] = useState<ProfileRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<ProfileRecord | null>(null);
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [customizeTab, setCustomizeTab] = useState<'text' | 'shapes' | 'background' | 'media' | 'qr'>('text');
  const [selectedTpl, setSelectedTpl] = useState<CardTemplateRecord>(DEFAULT_STARTER_TEMPLATE);
  const [activeSide, setActiveSide] = useState<'front' | 'back'>('front');
  const [orientation, setOrientation] = useState<'landscape' | 'vertical'>('landscape');
  const [frontDesign, setFrontDesign] = useState<CardSideDesign>(() => cloneSide(DEFAULT_STARTER_TEMPLATE.frontSpec));
  const [backDesign, setBackDesign] = useState<CardSideDesign>(() => cloneSide(DEFAULT_STARTER_TEMPLATE.backSpec));
  const [selectedTarget, setSelectedTarget] = useState<CardCanvasTarget | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [fieldsDropdownOpen, setFieldsDropdownOpen] = useState(false);
  const [photoCropSource, setPhotoCropSource] = useState<string | null>(null);
  const [approvalChecked, setApprovalChecked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedDesigns, setSavedDesigns] = useState<CardDesignRecord[]>([]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const studioReadyRef = useRef(false);
  const fieldsDropdownRef = useRef<HTMLDivElement | null>(null);
  const hiddenProfileElementsRef = useRef<{
    front: { elements: CardTextElement[]; showAvatar: boolean };
    back: { elements: CardTextElement[]; showAvatar: boolean };
  }>({
    front: { elements: [], showAvatar: false },
    back: { elements: [], showAvatar: false },
  });

  const selectedElementId = selectedTarget?.kind === 'text' ? selectedTarget.id : null;
  const selectedShapeId = selectedTarget?.kind === 'shape' ? selectedTarget.id : null;

  useEffect(() => {
    if (!fieldsDropdownOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (fieldsDropdownRef.current && !fieldsDropdownRef.current.contains(e.target as Node)) {
        setFieldsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [fieldsDropdownOpen]);

  const hydrateDesignForProfile = (
    prof: ProfileRecord | null,
    activeList: CardTemplateRecord[],
    userDesigns: CardDesignRecord[],
    uid: string
  ) => {
    const localDraft = prof ? getActiveStudioDraft(uid, prof.profileId) : null;
    const matchingSaved =
      (prof && userDesigns.find((d) => d.profileId === prof.profileId)) || (!localDraft ? userDesigns[0] : undefined);
    const savedMs = matchingSaved
      ? extractTimestampMs(matchingSaved.updatedAt) || extractTimestampMs(matchingSaved.createdAt)
      : 0;

    const defaultFallback = activeList.find((t) => t.isDefault) || activeList[0] || BLANK_CARD_TEMPLATE;

    if (localDraft && (!matchingSaved || localDraft.updatedMs >= savedMs)) {
      const matchedTpl =
        activeList.find((t) => t.templateId === localDraft.templateId) ||
        (localDraft.templateId === BLANK_CARD_TEMPLATE.templateId ? BLANK_CARD_TEMPLATE : defaultFallback);
      setSelectedTpl(matchedTpl);
      setOrientation(localDraft.cardOrientation || 'landscape');
      const hydratedFront = cloneSide(localDraft.frontDesign);
      setFrontDesign(hydratedFront);
      setBackDesign(cloneSide(localDraft.backDesign));
      setMode('custom');
      setSelectedTarget(hydratedFront.elements[0] ? { kind: 'text', id: hydratedFront.elements[0].id } : null);
    } else if (matchingSaved) {
      const matchedTpl =
        activeList.find((t) => t.templateId === matchingSaved.templateId) ||
        (matchingSaved.templateId === BLANK_CARD_TEMPLATE.templateId ? BLANK_CARD_TEMPLATE : defaultFallback);
      setSelectedTpl(matchedTpl);
      setOrientation(matchingSaved.cardOrientation || 'landscape');
      const hydratedFront = cloneSide(matchingSaved.frontDesign);
      setFrontDesign(hydratedFront);
      setBackDesign(cloneSide(matchingSaved.backDesign));
      setMode('custom');
      setSelectedTarget(hydratedFront.elements[0] ? { kind: 'text', id: hydratedFront.elements[0].id } : null);
    } else {
      const firstTpl = defaultFallback;
      setSelectedTpl(firstTpl);
      const initialFront = cloneSide(firstTpl.frontSpec);
      if (prof?.personalInformation?.photoDataUrl) {
        initialFront.avatarDataUrl = prof.personalInformation.photoDataUrl;
        initialFront.avatarSizeMm = initialFront.avatarSizeMm || 15;
      }
      setFrontDesign(initialFront);
      setBackDesign(cloneSide(firstTpl.backSpec));
      setSelectedTarget(null);
    }
  };

  useEffect(() => {
    if (!userRecord) return;
    studioReadyRef.current = false;
    Promise.all([getCardTemplates(), getUserProfiles(userRecord.uid), getUserDesigns(userRecord.uid)]).then(
      ([tpls, profs, userDesigns]) => {
        const activeList = tpls;
        setTemplates(activeList);
        const preferredProfileId = localStorage.getItem(`tapnex_active_profile_${userRecord.uid}`);
        const firstProf = profs.find((p) => p.profileId === preferredProfileId) || profs[0] || null;
        setProfiles(profs);
        setSelectedProfile(firstProf);
        setSavedDesigns(userDesigns);

        hydrateDesignForProfile(firstProf, activeList, userDesigns, userRecord.uid);
        setTimeout(() => {
          studioReadyRef.current = true;
        }, 0);
      }
    );
  }, [userRecord]);

  // Persist current Studio design (whether template-selected or customized) so Preview matches Studio identically
  useEffect(() => {
    if (!studioReadyRef.current || !userRecord || !selectedProfile) return;
    saveActiveStudioDraft(userRecord.uid, selectedProfile.profileId, {
      templateId: selectedTpl.templateId,
      templateName: selectedTpl.name,
      cardOrientation: orientation,
      frontDesign,
      backDesign,
    });
  }, [userRecord, selectedProfile, selectedTpl, orientation, frontDesign, backDesign]);

  // Automatically fetch user photo when profile switcher changes (unless custom uploaded)
  useEffect(() => {
    const profilePhoto = selectedProfile?.personalInformation?.photoDataUrl;
    if (!profilePhoto) return;
    setFrontDesign((prev) => ({
      ...prev,
      avatarDataUrl: prev.avatarDataUrl || profilePhoto,
      avatarSizeMm: prev.avatarSizeMm || 15,
    }));
  }, [selectedProfile]);

  const allDropdownTemplates: CardTemplateRecord[] = [
    ...templates.filter((t) => t.templateId !== BLANK_CARD_TEMPLATE.templateId),
    BLANK_CARD_TEMPLATE,
  ];

  const applyTemplate = (tpl: CardTemplateRecord, enterCustomMode = false) => {
    setSelectedTpl(tpl);
    const nextFront = cloneSide(tpl.frontSpec);
    if (selectedProfile?.personalInformation?.photoDataUrl && !nextFront.avatarDataUrl) {
      nextFront.avatarDataUrl = selectedProfile.personalInformation.photoDataUrl;
      nextFront.avatarSizeMm = nextFront.avatarSizeMm || 15;
    }
    setFrontDesign(nextFront);
    setBackDesign(cloneSide(tpl.backSpec));
    if (!tpl.supportsVertical && orientation === 'vertical') {
      setOrientation('landscape');
    }
    if (enterCustomMode) {
      setMode('custom');
    }
    const activeElements = activeSide === 'front' ? nextFront.elements : tpl.backSpec.elements;
    setSelectedTarget(
      (enterCustomMode || mode === 'custom') && activeElements[0]
        ? { kind: 'text', id: activeElements[0].id }
        : null
    );
    setEditingTextId(null);
  };

  const handleLoadDefaultSettings = () => {
    const defaultFallback = templates.find((t) => t.isDefault) || templates[0] || BLANK_CARD_TEMPLATE;
    const baseTpl =
      allDropdownTemplates.find((t) => t.templateId === selectedTpl.templateId) || defaultFallback;
    const nextFront = cloneSide(baseTpl.frontSpec);
    if (selectedProfile?.personalInformation?.photoDataUrl && !nextFront.avatarDataUrl) {
      nextFront.avatarDataUrl = selectedProfile.personalInformation.photoDataUrl;
      nextFront.avatarSizeMm = nextFront.avatarSizeMm || 15;
    }
    setFrontDesign(nextFront);
    setBackDesign(cloneSide(baseTpl.backSpec));
    setOrientation('landscape');
    setActiveSide('front');
    setSelectedTarget(null);
    setEditingTextId(null);
    setApprovalChecked(false);
    notify('Default settings loaded', `Reset studio layout to ${baseTpl.name} defaults.`, 'info');
  };

  const currentSide = activeSide === 'front' ? frontDesign : backDesign;
  const setCurrentSide = (updated: CardSideDesign) => {
    if (activeSide === 'front') setFrontDesign(updated);
    else setBackDesign(updated);
  };

  const selectedEl = currentSide.elements.find((e) => e.id === selectedElementId) || null;
  const selectedShape = (currentSide.shapes || []).find((s) => s.id === selectedShapeId) || null;

  const updateElementTextById = (id: string, nextText: string) => {
    const updater = (side: CardSideDesign): CardSideDesign => ({
      ...side,
      elements: side.elements.map((el) => (el.id === id ? { ...el, text: nextText } : el)),
    });
    if (activeSide === 'front') setFrontDesign(updater);
    else setBackDesign(updater);
  };

  const updateSelectedEl = (patch: Partial<CardTextElement>) => {
    if (!selectedEl) return;
    setCurrentSide({
      ...currentSide,
      elements: currentSide.elements.map((el) => (el.id === selectedEl.id ? { ...el, ...patch } : el)),
    });
  };

  const updateSelectedShape = (patch: Partial<CardShapeElement>) => {
    if (!selectedShape) return;
    setCurrentSide({
      ...currentSide,
      shapes: (currentSide.shapes || []).map((s) => (s.id === selectedShape.id ? { ...s, ...patch } : s)),
    });
  };

  const addShapeElement = (kind: CardShapeElement['kind']) => {
    const id = `shp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const defaultAccent = isLightHexColor(currentSide.backgroundColor) ? '#0B1D3A' : '#D4AF37';
    const newShape: CardShapeElement =
      kind === 'line'
        ? { id, kind: 'line', xPct: 8, yPct: 50, widthPct: 40, heightPct: 1.5, color: defaultAccent }
        : kind === 'circle'
        ? { id, kind: 'circle', xPct: 36, yPct: 24, widthPct: 24, heightPct: 38, color: defaultAccent, opacity: 0.9 }
        : kind === 'pill'
        ? { id, kind: 'pill', xPct: 12, yPct: 72, widthPct: 36, heightPct: 11, color: defaultAccent }
        : { id, kind: 'rect', xPct: 0, yPct: 78, widthPct: 100, heightPct: 14, color: defaultAccent, borderRadiusPx: 0 };
    setCurrentSide({
      ...currentSide,
      shapes: [...(currentSide.shapes || []), newShape],
    });
    setSelectedTarget({ kind: 'shape', id });
    setMode('custom');
    setCustomizeTab('shapes');
  };

  const duplicateSelectedShape = () => {
    if (!selectedShape) return;
    const id = `shp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const copy: CardShapeElement = {
      ...selectedShape,
      id,
      xPct: Math.min(82, selectedShape.xPct + 4),
      yPct: Math.min(82, selectedShape.yPct + 6),
    };
    setCurrentSide({ ...currentSide, shapes: [...(currentSide.shapes || []), copy] });
    setSelectedTarget({ kind: 'shape', id });
  };

  const removeShapeById = (id: string) => {
    setCurrentSide({
      ...currentSide,
      shapes: (currentSide.shapes || []).filter((s) => s.id !== id),
    });
    if (selectedShapeId === id) setSelectedTarget(null);
  };

  const handleSelectTarget = (t: CardCanvasTarget | null) => {
    setSelectedTarget(t);
    if (!t) {
      setEditingTextId(null);
      return;
    }
    setMode('custom');
    if (t.kind === 'text') setCustomizeTab('text');
    else if (t.kind === 'shape') setCustomizeTab('shapes');
    else if (t.kind === 'avatar' || t.kind === 'logo') setCustomizeTab('media');
    else if (t.kind === 'qr' || t.kind === 'nfc') setCustomizeTab('qr');
  };

  const handleCanvasMove = (target: CardCanvasTarget, xPct: number, yPct: number) => {
    if (target.kind === 'text') {
      setCurrentSide({
        ...currentSide,
        elements: currentSide.elements.map((el) => (el.id === target.id ? { ...el, xPct, yPct } : el)),
      });
    } else if (target.kind === 'shape') {
      setCurrentSide({
        ...currentSide,
        shapes: (currentSide.shapes || []).map((s) => (s.id === target.id ? { ...s, xPct, yPct } : s)),
      });
    } else if (target.kind === 'logo') {
      setCurrentSide({ ...currentSide, logoX: xPct, logoY: yPct });
    } else if (target.kind === 'avatar') {
      setCurrentSide({ ...currentSide, avatarX: xPct, avatarY: yPct });
    } else if (target.kind === 'qr') {
      setCurrentSide({ ...currentSide, qrSlotX: xPct, qrSlotY: yPct });
    } else if (target.kind === 'nfc') {
      setCurrentSide({ ...currentSide, nfcX: xPct, nfcY: yPct });
    }
  };

  const handleStartBlankCard = () => {
    const blankFront = cloneSide(BLANK_CARD_TEMPLATE.frontSpec);
    const blankBack = cloneSide(BLANK_CARD_TEMPLATE.backSpec);
    setSelectedTpl(BLANK_CARD_TEMPLATE);
    setFrontDesign(blankFront);
    setBackDesign(blankBack);
    setActiveSide('front');
    setMode('custom');
    setCustomizeTab('background');
    setSelectedTarget(null);
    setEditingTextId(null);
    notify(
      'Blank card canvas ready',
      'Upload separate Front & Back designs or add text, shapes, logos, photos, NFC & QR icons.',
      'success'
    );
  };

  const handleSideDesignUpload = async (targetSide: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('Image too large', 'Please upload a PNG/JPG under 5 MB.', 'error');
      return;
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: orientation === 'vertical' ? 709 : 1082,
        maxHeight: orientation === 'vertical' ? 1082 : 709,
        maxChars: 280_000,
      });
      if (targetSide === 'front') {
        setFrontDesign((prev) => ({ ...prev, backgroundImageUrl: dataUrl }));
      } else {
        setBackDesign((prev) => ({ ...prev, backgroundImageUrl: dataUrl }));
      }
      setActiveSide(targetSide);
      setMode('custom');
      setCustomizeTab('background');
      setSelectedTarget(null);
      setEditingTextId(null);
      notify(
        `${targetSide === 'front' ? 'Front' : 'Back'} card design uploaded`,
        `Applied to ${targetSide} side only. All text, shapes, logo, photo, NFC & QR elements remain editable.`,
        'success'
      );
    } catch {
      notify('Upload failed', 'Could not read template image file.', 'error');
    }
  };

  const getDefaultContrastColor = () => (isLightHexColor(currentSide.backgroundColor) ? '#0B1D3A' : '#FFFFFF');

  const addTextElement = (initialText = 'Double-click to edit', startInlineEdit = true) => {
    const id = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const pos = getNextCleanTextPosition(currentSide.elements);
    const newEl: CardTextElement = {
      id,
      text: initialText,
      xPct: pos.xPct,
      yPct: pos.yPct,
      fontSizePt: 9,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      color: getDefaultContrastColor(),
      align: 'left',
    };
    setCurrentSide({ ...currentSide, elements: [...currentSide.elements, newEl] });
    setSelectedTarget({ kind: 'text', id });
    setMode('custom');
    setCustomizeTab('text');
    if (startInlineEdit) {
      setTimeout(() => setEditingTextId(id), 0);
    }
  };

  const duplicateSelectedText = () => {
    if (!selectedEl) return;
    const id = `txt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const copy: CardTextElement = {
      ...selectedEl,
      id,
      xPct: Math.min(82, selectedEl.xPct + 4),
      yPct: Math.min(82, selectedEl.yPct + 7),
    };
    setCurrentSide({ ...currentSide, elements: [...currentSide.elements, copy] });
    setSelectedTarget({ kind: 'text', id });
  };

  const removeElementById = (id: string) => {
    setCurrentSide({
      ...currentSide,
      elements: currentSide.elements.filter((el) => el.id !== id),
    });
    if (selectedElementId === id) setSelectedTarget(null);
    if (editingTextId === id) setEditingTextId(null);
  };

  // Build list of filled profile fields available for quick toggle into card layout
  const pi = selectedProfile?.personalInformation;
  const builtInFieldOptions: ProfileCardFieldOption[] = [
    { key: 'fullName', label: 'Full Name', previewValue: pi?.fullName || '', insertText: '{{FULL_NAME}}', defaultFontSizePt: 13, defaultBold: true },
    { key: 'jobTitle', label: 'Job Title', previewValue: pi?.jobTitle || '', insertText: '{{JOB_TITLE}}', defaultFontSizePt: 9 },
    { key: 'companyName', label: 'Company Name', previewValue: pi?.companyName || '', insertText: '{{COMPANY}}', defaultFontSizePt: 9, defaultBold: true },
    { key: 'businessCategory', label: 'Business Category', previewValue: pi?.businessCategory || '', insertText: '{{BUSINESS_CATEGORY}}', defaultFontSizePt: 8 },
    { key: 'mobile', label: 'Mobile Number', previewValue: pi?.mobile || '', insertText: '{{MOBILE}}', defaultFontSizePt: 8 },
    { key: 'alternateMobile', label: 'Alternate Mobile', previewValue: pi?.alternateMobile || '', insertText: '{{ALTERNATE_MOBILE}}', defaultFontSizePt: 8 },
    { key: 'whatsapp', label: 'WhatsApp Number', previewValue: pi?.whatsapp || '', insertText: '{{WHATSAPP}}', defaultFontSizePt: 8 },
    { key: 'email', label: 'Email Address', previewValue: pi?.email || '', insertText: '{{EMAIL}}', defaultFontSizePt: 8 },
    { key: 'alternateEmail', label: 'Alternate Email', previewValue: pi?.alternateEmail || '', insertText: '{{ALTERNATE_EMAIL}}', defaultFontSizePt: 8 },
    { key: 'website', label: 'Website', previewValue: pi?.website || '', insertText: '{{WEBSITE}}', defaultFontSizePt: 8 },
    {
      key: 'cityState',
      label: 'City & State',
      previewValue: [pi?.city, pi?.state].filter(Boolean).join(', '),
      insertText: '{{CITY_STATE}}',
      defaultFontSizePt: 8,
    },
    { key: 'businessAddress', label: 'Business Address', previewValue: pi?.businessAddress || '', insertText: '{{ADDRESS}}', defaultFontSizePt: 8 },
    { key: 'personalAddress', label: 'Personal Address', previewValue: pi?.personalAddress || '', insertText: '{{PERSONAL_ADDRESS}}', defaultFontSizePt: 8 },
    { key: 'shortBio', label: 'Short Bio', previewValue: pi?.shortBio || '', insertText: '{{SHORT_BIO}}', defaultFontSizePt: 7.5 },
  ];

  const customFieldOptions: ProfileCardFieldOption[] = (selectedProfile?.customFields || [])
    .filter((cf) => cf.label?.trim() || cf.value?.trim())
    .map((cf) => ({
      key: `cf_${cf.id}`,
      label: cf.label || 'Custom Field',
      previewValue: cf.value || '',
      insertText: cf.label ? `${cf.label}: ${cf.value}` : cf.value,
      defaultFontSizePt: 8,
    }));

  const allProfileFieldOptions = [...builtInFieldOptions, ...customFieldOptions];
  const filledFieldOptions = allProfileFieldOptions.filter((opt) => Boolean(opt.previewValue.trim()));

  const isFieldOnCurrentSide = (opt: ProfileCardFieldOption): boolean =>
    currentSide.elements.some((el) => el.text.trim() === opt.insertText.trim());

  const profileInsertTokenSet = new Set(allProfileFieldOptions.map((o) => o.insertText.trim()));
  const activeProfileElementsOnSide = currentSide.elements.filter((el) =>
    profileInsertTokenSet.has(el.text.trim())
  );
  const displayProfileDataChecked = activeProfileElementsOnSide.length > 0 || Boolean(currentSide.showAvatar);

  const activeFieldCount = allProfileFieldOptions.filter(isFieldOnCurrentSide).length;

  const toggleDisplayAllProfileData = (checked: boolean) => {
    if (!checked) {
      hiddenProfileElementsRef.current[activeSide] = {
        elements: activeProfileElementsOnSide,
        showAvatar: Boolean(currentSide.showAvatar),
      };
      setCurrentSide({
        ...currentSide,
        showAvatar: false,
        elements: currentSide.elements.filter((el) => !profileInsertTokenSet.has(el.text.trim())),
      });
      return;
    }
    const backup = hiddenProfileElementsRef.current[activeSide];
    if (backup && (backup.elements.length > 0 || backup.showAvatar)) {
      const existingIds = new Set(currentSide.elements.map((e) => e.id));
      const restored = backup.elements.filter((e) => !existingIds.has(e.id));
      setCurrentSide({
        ...currentSide,
        showAvatar: backup.showAvatar || Boolean(pi?.photoDataUrl),
        avatarDataUrl: currentSide.avatarDataUrl || pi?.photoDataUrl,
        elements: [...currentSide.elements, ...restored],
      });
      return;
    }
    const baseList = filledFieldOptions.length > 0 ? filledFieldOptions : builtInFieldOptions.slice(0, 5);
    const toAdd: CardTextElement[] = [];
    let running = [...currentSide.elements];
    for (const opt of baseList) {
      if (running.some((el) => el.text.trim() === opt.insertText.trim())) continue;
      const pos = getNextCleanTextPosition(running);
      const item: CardTextElement = {
        id: `fld_${opt.key}_${Date.now().toString(36)}_${toAdd.length}`,
        text: opt.insertText,
        xPct: pos.xPct,
        yPct: pos.yPct,
        fontSizePt: opt.defaultFontSizePt,
        fontFamily: 'Plus Jakarta Sans',
        fontWeight: opt.defaultBold ? 'bold' : 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        color: getDefaultContrastColor(),
        align: 'left',
      };
      running.push(item);
      toAdd.push(item);
    }
    setCurrentSide({
      ...currentSide,
      showAvatar: Boolean(pi?.photoDataUrl) || Boolean(currentSide.showAvatar),
      avatarDataUrl: currentSide.avatarDataUrl || pi?.photoDataUrl,
      elements: running,
    });
  };

  const toggleProfileFieldOnCard = (opt: ProfileCardFieldOption) => {
    const existing = currentSide.elements.find((el) => el.text.trim() === opt.insertText.trim());
    if (existing) {
      removeElementById(existing.id);
      return;
    }
    const id = `fld_${opt.key}_${Date.now().toString(36)}`;
    const pos = getNextCleanTextPosition(currentSide.elements);
    const newEl: CardTextElement = {
      id,
      text: opt.insertText,
      xPct: pos.xPct,
      yPct: pos.yPct,
      fontSizePt: opt.defaultFontSizePt,
      fontFamily: 'Plus Jakarta Sans',
      fontWeight: opt.defaultBold ? 'bold' : 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      color: getDefaultContrastColor(),
      align: 'left',
    };
    setCurrentSide({ ...currentSide, elements: [...currentSide.elements, newEl] });
    setSelectedTarget({ kind: 'text', id });
    setMode('custom');
  };

  const handleBackgroundUploadForSide = async (
    targetSide: 'front' | 'back',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify(
        'Background file too large',
        'Please choose an image under 5 MB (recommended 1082 × 709 px at 300 DPI).',
        'error'
      );
      return;
    }
    try {
      const dataUrl = await compressImageFileToDataUrl(file, {
        maxWidth: orientation === 'vertical' ? 709 : 1082,
        maxHeight: orientation === 'vertical' ? 1082 : 709,
        maxChars: 280_000,
      });
      if (targetSide === 'front') {
        setFrontDesign((prev) => ({ ...prev, backgroundImageUrl: dataUrl }));
      } else {
        setBackDesign((prev) => ({ ...prev, backgroundImageUrl: dataUrl }));
      }
      setActiveSide(targetSide);
      notify(
        `${targetSide === 'front' ? 'Front' : 'Back'} background updated`,
        'Fits card dimensions automatically. Replace or Remove anytime.',
        'success'
      );
    } catch {
      notify('Background upload failed', 'Could not read image. Please try PNG or JPG.', 'error');
    }
  };

  const handleStudioPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      notify('Image too large', 'Please upload an image smaller than 5 MB.', 'error');
      return;
    }
    try {
      const rawUrl = await readImageFileAsDataUrl(file);
      const autoFitted = await autoFitImageToSquareDataUrl(rawUrl);
      setCurrentSide({ ...currentSide, avatarDataUrl: autoFitted, showAvatar: true });
      setPhotoCropSource(rawUrl);
      setSelectedTarget({ kind: 'avatar' });
      setMode('custom');
      notify('Photo auto-fitted', 'Drag or zoom in the cropper to frame any part of your photo.', 'info');
    } catch {
      notify('Photo load failed', 'Could not read image. Try PNG or JPG.', 'error');
    }
  };

  const handleSaveDraft = async () => {
    if (!userRecord || !selectedProfile) return;
    setSaving(true);
    try {
      const designId = `des_${userRecord.uid.slice(0, 8)}_${Date.now()}`;
      const record: CardDesignRecord = {
        designId,
        uid: userRecord.uid,
        profileId: selectedProfile.profileId,
        templateId: selectedTpl.templateId,
        frontDesign,
        backDesign,
        cardOrientation: orientation,
        dimensions: orientation === 'vertical' ? '54x85.6mm' : '85.6x54mm',
        bleed: '3mm',
        approved: false,
        locked: false,
        version: 1,
        createdAt: '',
        updatedAt: '',
      };
      await saveCardDesign(record);
      setSavedDesigns((prev) => [record, ...prev]);
      notify('Custom design saved', 'You can preview or resume this customized design anytime.', 'success');
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save card design.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveAndCheckout = async () => {
    if (!userRecord || !selectedProfile) return;
    if (!approvalChecked) {
      notify('Approval required', 'Please confirm the design approval checkbox first.', 'error');
      return;
    }
    setSaving(true);
    try {
      const designId = `des_${userRecord.uid.slice(0, 8)}_${Date.now()}`;
      await saveCardDesign({
        designId,
        uid: userRecord.uid,
        profileId: selectedProfile.profileId,
        templateId: selectedTpl.templateId,
        frontDesign,
        backDesign,
        cardOrientation: orientation,
        dimensions: orientation === 'vertical' ? '54x85.6mm' : '85.6x54mm',
        bleed: '3mm',
        approved: true,
        locked: false,
        version: 1,
      });
      notify('Design approved & saved', 'Proceeding to checkout.', 'success');
      navigate(`/dashboard/checkout?designId=${designId}`);
    } catch (err) {
      notify('Save failed', err instanceof Error ? err.message : 'Unable to save card design.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PortalLayout portal="customer" title="Business Card Design Studio">
      <div className="space-y-5">
        {/* Top Studio Toolbar */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setMode('default')}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[38px] ${
                mode === 'default' ? 'bg-[#0B1D3A] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              1. Card Templates
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('custom');
                if (!selectedTarget && currentSide.elements.length > 0) {
                  setSelectedTarget({ kind: 'text', id: currentSide.elements[0].id });
                  setCustomizeTab('text');
                }
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors min-h-[38px] ${
                mode === 'custom' ? 'bg-[#0B1D3A] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              2. Customize Card
            </button>

            <button
              type="button"
              onClick={() => handleStartBlankCard()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 text-xs font-semibold min-h-[38px]"
            >
              <Sparkles className="h-3.5 w-3.5 text-[#1D4ED8]" />
              <span>Blank Canvas</span>
            </button>

            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-[#1D4ED8] bg-blue-50/70 text-[#1D4ED8] hover:bg-blue-100 text-xs font-semibold min-h-[38px] cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Front Design</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleSideDesignUpload('front', e)}
              />
            </label>

            <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-emerald-600 bg-emerald-50/70 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold min-h-[38px] cursor-pointer">
              <Upload className="h-3.5 w-3.5" />
              <span>Upload Back Design</span>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleSideDesignUpload('back', e)}
              />
            </label>

            {/* Profile Info Dropdown (Checkbox selector for saved profile data) */}
            <div className="relative" ref={fieldsDropdownRef}>
              <button
                type="button"
                onClick={() => setFieldsDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-100 text-xs font-semibold min-h-[38px]"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Profile Data on {activeSide === 'front' ? 'Front' : 'Back'}</span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold tabular-nums">
                  {activeFieldCount}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${fieldsDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {fieldsDropdownOpen && (
                <div className="absolute left-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-xl shadow-xl z-40 p-3 space-y-2">
                  <label className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100 cursor-pointer">
                    <div>
                      <div className="text-xs font-bold text-[#0B1D3A]">
                        Display Profile Data on {activeSide === 'front' ? 'Front' : 'Back'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Check fields below to display on card
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={displayProfileDataChecked}
                      onChange={(e) => toggleDisplayAllProfileData(e.target.checked)}
                      className="h-4 w-4 accent-[#1D4ED8]"
                    />
                  </label>

                  {/* Quick Photo Toggle */}
                  <label className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg bg-slate-50 hover:bg-slate-100 cursor-pointer border border-slate-200">
                    <div className="flex items-center gap-2 min-w-0">
                      {pi?.photoDataUrl ? (
                        <img src={pi.photoDataUrl} alt="" className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-300" />
                      ) : (
                        <UserCircle2 className="w-5 h-5 text-slate-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#0B1D3A]">Profile Photo</div>
                        <div className="text-[10px] text-slate-500">Show photo frame on {activeSide} side</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={Boolean(currentSide.showAvatar)}
                      onChange={(e) =>
                        setCurrentSide({
                          ...currentSide,
                          avatarDataUrl: currentSide.avatarDataUrl || pi?.photoDataUrl || '',
                          showAvatar: e.target.checked,
                        })
                      }
                      className="h-4 w-4 accent-[#1D4ED8]"
                    />
                  </label>

                  <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                    {allProfileFieldOptions.map((opt) => {
                      const checked = isFieldOnCurrentSide(opt);
                      return (
                        <label
                          key={opt.key}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-colors cursor-pointer ${
                            checked
                              ? 'bg-blue-50 border border-blue-200 text-[#0B1D3A]'
                              : 'hover:bg-slate-50 border border-transparent text-slate-700'
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{opt.label}</div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {opt.previewValue || 'Uses placeholder until filled in My Profile'}
                            </div>
                          </div>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleProfileFieldOnCard(opt)}
                            className="h-4 w-4 accent-[#1D4ED8] shrink-0"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => addTextElement('Custom Text', true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#1D4ED8] hover:bg-blue-700 text-white text-xs font-semibold min-h-[38px]"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Custom Text</span>
            </button>

            <button
              type="button"
              onClick={handleLoadDefaultSettings}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 min-h-[38px]"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Reset Default</span>
            </button>

            <button
              type="button"
              onClick={() => setPreviewModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#1D4ED8]/30 bg-blue-50 text-xs font-semibold text-[#1D4ED8] hover:bg-blue-100 min-h-[38px]"
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Preview</span>
            </button>

            <button
              type="button"
              disabled={saving || !selectedProfile}
              onClick={handleSaveDraft}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 min-h-[38px]"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Save Draft</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* All Templates Dropdown (applied directly to Customized Design) */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="studio-template-dropdown" className="text-[11px] font-semibold text-slate-500">
                Template:
              </label>
              <select
                id="studio-template-dropdown"
                value={selectedTpl.templateId}
                onChange={(e) => {
                  const found = allDropdownTemplates.find((t) => t.templateId === e.target.value);
                  if (found) {
                    applyTemplate(found, true);
                    notify('Template applied to custom studio', `Customizing ${found.name} — click any component to edit.`, 'info');
                  }
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-[#0B1D3A] bg-white min-w-[200px]"
              >
                {allDropdownTemplates.map((tpl) => (
                  <option key={tpl.templateId} value={tpl.templateId}>
                    {tpl.isDefault ? '★ ' : ''}
                    {tpl.name}
                    {tpl.isDefault ? ' [Default]' : ''} ({tpl.category || 'Card'} · ₹{tpl.priceInr})
                  </option>
                ))}
              </select>
            </div>

            {profiles.length > 0 && (
              <select
                value={selectedProfile?.profileId || ''}
                onChange={(e) => {
                  const nextProf = profiles.find((p) => p.profileId === e.target.value) || null;
                  setSelectedProfile(nextProf);
                  if (userRecord && nextProf) {
                    localStorage.setItem(`tapnex_active_profile_${userRecord.uid}`, nextProf.profileId);
                    studioReadyRef.current = false;
                    hydrateDesignForProfile(nextProf, templates, savedDesigns, userRecord.uid);
                    setTimeout(() => {
                      studioReadyRef.current = true;
                    }, 0);
                  }
                }}
                className="px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
              >
                {profiles.map((p) => (
                  <option key={p.profileId} value={p.profileId}>
                    Link to: {p.profileLabel || p.slug}
                  </option>
                ))}
              </select>
            )}
            <div className="text-xs font-mono text-slate-600">
              {orientation === 'vertical' ? '54.0 × 85.6 mm' : '85.6 × 54.0 mm'} · 300 DPI
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Panel: Interactive Live 85.6 x 54 mm Canvas + Quick Format Bar */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                <button
                  type="button"
                  onClick={() => {
                    setActiveSide('front');
                    setSelectedTarget(
                      mode === 'custom' && frontDesign.elements[0]
                        ? { kind: 'text', id: frontDesign.elements[0].id }
                        : null
                    );
                    setEditingTextId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    activeSide === 'front' ? 'bg-white text-[#0B1D3A] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Front Side
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveSide('back');
                    setSelectedTarget(
                      mode === 'custom' && backDesign.elements[0]
                        ? { kind: 'text', id: backDesign.elements[0].id }
                        : null
                    );
                    setEditingTextId(null);
                  }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                    activeSide === 'back' ? 'bg-white text-[#0B1D3A] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  Back Side
                </button>
              </div>

              <div className="flex items-center gap-2">
                {selectedTpl.supportsVertical && (
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setOrientation('landscape')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        orientation === 'landscape' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Landscape
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrientation('vertical')}
                      className={`px-2.5 py-1 text-xs font-medium rounded ${
                        orientation === 'vertical' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                      }`}
                    >
                      Vertical
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0B1D3A] text-white text-xs font-semibold hover:bg-[#132A52]"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Full Preview</span>
                </button>
              </div>
            </div>

            <div className="py-5 px-3 sm:px-5 bg-slate-50 rounded-xl border border-slate-200">
              {/* Strictly NEVER pass actualQrPng here: Pre-purchase shows placeholder ONLY */}
              <CardCanvasPreview
                side={currentSide}
                orientation={orientation}
                personalInfo={selectedProfile?.personalInformation || {}}
                showPrintGuides
                interactive
                editResolvedText
                selectedTarget={selectedTarget}
                onSelectTarget={handleSelectTarget}
                onMoveItem={handleCanvasMove}
                editingTextId={editingTextId}
                onStartEditText={setEditingTextId}
                onUpdateTextValue={updateElementTextById}
              />
              <p className="mt-3 text-center text-[11px] text-slate-500">
                <strong>Tip:</strong> Click any element to select · <strong>Drag</strong> to move ·{' '}
                <strong>Double-click text</strong> on the card to edit it right on the canvas.
              </p>
            </div>

            {/* Quick Contextual Formatting Toolbar right beneath Canvas */}
            {selectedEl ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#0B1D3A]">
                    <Type className="h-3.5 w-3.5 text-[#1D4ED8]" />
                    <span>Quick Edit Selected Text</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditingTextId(selectedEl.id)}
                      className="px-2.5 py-1 rounded-md border border-blue-300 bg-white text-[11px] font-semibold text-[#1D4ED8] hover:bg-blue-50"
                    >
                      Edit on Card
                    </button>
                    <button
                      type="button"
                      onClick={duplicateSelectedText}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-slate-300 bg-white text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                      title="Duplicate text"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Duplicate</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => removeElementById(selectedEl.id)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-rose-200 bg-white text-[11px] font-semibold text-rose-600 hover:bg-rose-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={
                      /\{\{[A-Z0-9_]+\}\}/.test(selectedEl.text)
                        ? resolveCardTokens(selectedEl.text, pi || {})
                        : selectedEl.text
                    }
                    onChange={(e) => updateSelectedEl({ text: e.target.value })}
                    placeholder="Type text or use Profile Info dropdown..."
                    className="flex-1 min-w-[180px] px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                  />
                  <select
                    value={selectedEl.fontFamily}
                    onChange={(e) => updateSelectedEl({ fontFamily: e.target.value })}
                    className="px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white max-w-[160px]"
                  >
                    {SYSTEM_FONTS.map((f) => (
                      <option key={f.value} value={f.value}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={6}
                      max={28}
                      value={selectedEl.fontSizePt}
                      onChange={(e) => updateSelectedEl({ fontSizePt: Number(e.target.value) })}
                      className="w-14 px-2 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                      title="Font size (pt)"
                    />
                    <span className="text-[11px] text-slate-500">pt</span>
                  </div>
                  <input
                    type="color"
                    value={selectedEl.color}
                    onChange={(e) => updateSelectedEl({ color: e.target.value })}
                    className="w-8 h-8 rounded border border-slate-300 cursor-pointer"
                    title="Text color"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateSelectedEl({ fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold' })}
                      className={`p-1.5 rounded border ${
                        selectedEl.fontWeight === 'bold'
                          ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                      title="Bold"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSelectedEl({ fontStyle: selectedEl.fontStyle === 'italic' ? 'normal' : 'italic' })}
                      className={`p-1.5 rounded border ${
                        selectedEl.fontStyle === 'italic'
                          ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                      title="Italic"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateSelectedEl({
                          textDecoration: selectedEl.textDecoration === 'underline' ? 'none' : 'underline',
                        })
                      }
                      className={`p-1.5 rounded border ${
                        selectedEl.textDecoration === 'underline'
                          ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                      title="Underline"
                    >
                      <Underline className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    {(['left', 'center', 'right'] as const).map((al) => (
                      <button
                        key={al}
                        type="button"
                        onClick={() => updateSelectedEl({ align: al })}
                        className={`p-1.5 rounded border ${
                          selectedEl.align === al
                            ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                        title={`Align ${al}`}
                      >
                        {al === 'left' ? (
                          <AlignLeft className="h-3.5 w-3.5" />
                        ) : al === 'center' ? (
                          <AlignCenter className="h-3.5 w-3.5" />
                        ) : (
                          <AlignRight className="h-3.5 w-3.5" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : selectedTarget?.kind === 'avatar' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#0B1D3A]">Selected: Profile Photo ({currentSide.avatarSizeMm || 13} mm)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                    {(['circle', 'rounded', 'square'] as const).map((shp) => (
                      <button
                        key={shp}
                        type="button"
                        onClick={() => setCurrentSide({ ...currentSide, avatarShape: shp })}
                        className={`px-2 py-1 rounded text-[11px] font-semibold capitalize ${
                          (currentSide.avatarShape || 'circle') === shp
                            ? 'bg-[#0B1D3A] text-white'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        {shp}
                      </button>
                    ))}
                  </div>
                  <input
                    type="range"
                    min={8}
                    max={28}
                    value={currentSide.avatarSizeMm || 13}
                    onChange={(e) => setCurrentSide({ ...currentSide, avatarSizeMm: Number(e.target.value) })}
                    className="w-24"
                  />
                  <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload</span>
                    <input type="file" accept="image/*" className="hidden" onChange={handleStudioPhotoUpload} />
                  </label>
                  {(currentSide.avatarDataUrl || pi?.photoDataUrl) && (
                    <button
                      type="button"
                      onClick={() => setPhotoCropSource(currentSide.avatarDataUrl || pi?.photoDataUrl || null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-300 bg-white text-xs font-semibold text-[#1D4ED8] hover:bg-blue-50"
                    >
                      <Crop className="h-3.5 w-3.5" />
                      <span>Crop</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentSide({ ...currentSide, showAvatar: false });
                      setSelectedTarget(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600"
                  >
                    Hide Photo
                  </button>
                </div>
              </div>
            ) : selectedShape ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-2.5">
                <span className="text-xs font-bold text-[#0B1D3A]">
                  Selected Shape ({selectedShape.kind})
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="color"
                    value={selectedShape.color === 'transparent' ? '#FFFFFF' : selectedShape.color}
                    onChange={(e) => updateSelectedShape({ color: e.target.value, gradientTo: '' })}
                    className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                    title="Shape color"
                  />
                  <button
                    type="button"
                    onClick={() => setCustomizeTab('shapes')}
                    className="px-2.5 py-1.5 rounded-lg border border-blue-300 bg-white text-xs font-semibold text-[#1D4ED8] hover:bg-blue-50"
                  >
                    Size / Rotate / Border
                  </button>
                  <button
                    type="button"
                    onClick={duplicateSelectedShape}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Duplicate
                  </button>
                  <button
                    type="button"
                    onClick={() => removeShapeById(selectedShape.id)}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : selectedTarget?.kind === 'logo' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#0B1D3A]">Selected: Company Logo ({currentSide.logoWidthMm || 14} mm)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    min={8}
                    max={30}
                    value={currentSide.logoWidthMm || 14}
                    onChange={(e) => setCurrentSide({ ...currentSide, logoWidthMm: Number(e.target.value) })}
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentSide({ ...currentSide, logoDataUrl: '' });
                      setSelectedTarget(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600"
                  >
                    Remove Logo
                  </button>
                </div>
              </div>
            ) : selectedTarget?.kind === 'qr' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#0B1D3A]">Selected: QR Code Slot ({currentSide.qrSizeMm} mm)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    min={12}
                    max={28}
                    value={currentSide.qrSizeMm}
                    onChange={(e) => setCurrentSide({ ...currentSide, qrSizeMm: Number(e.target.value) })}
                    className="w-28"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentSide({ ...currentSide, showQrSlot: false });
                      setSelectedTarget(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600"
                  >
                    Hide QR Slot
                  </button>
                </div>
              </div>
            ) : selectedTarget?.kind === 'nfc' ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-[#0B1D3A]">
                  Selected: NFC Wave Icon ({currentSide.nfcSizeMm || 6} mm)
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="range"
                    min={3}
                    max={14}
                    step={0.5}
                    value={currentSide.nfcSizeMm || 6}
                    onChange={(e) => setCurrentSide({ ...currentSide, nfcSizeMm: Number(e.target.value) })}
                    className="w-28"
                  />
                  <input
                    type="color"
                    value={currentSide.nfcIconColor || '#38BDF8'}
                    onChange={(e) => setCurrentSide({ ...currentSide, nfcIconColor: e.target.value })}
                    className="w-7 h-7 rounded border border-slate-300 cursor-pointer"
                    title="NFC Icon Color"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentSide({ ...currentSide, showNfcIcon: false });
                      setSelectedTarget(null);
                    }}
                    className="px-2.5 py-1.5 rounded-lg border border-rose-200 bg-white text-xs font-semibold text-rose-600"
                  >
                    Hide NFC Icon
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3.5 text-xs text-slate-700 flex items-start gap-2.5">
                <QrCode className="h-4 w-4 text-[#1D4ED8] shrink-0 mt-0.5" />
                <span>
                  Choose any template from the <strong>Template</strong> dropdown, upload separate <strong>Front</strong> &amp; <strong>Back</strong> designs, check <strong>Profile Data</strong> fields, and click or drag any element on the card to edit.
                </span>
              </div>
            )}
          </div>

          {/* Right Panel: Template Picker or Tabbed Visual Editor */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-5">
            {mode === 'default' ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-base text-[#0B1D3A]">
                    Select Predefined or Blank Template
                  </h2>
                  <span className="text-[11px] font-mono text-slate-500">
                    {allDropdownTemplates.length} templates
                  </span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                    Quick Template Dropdown (Loads into Customized Design)
                  </label>
                  <select
                    value={selectedTpl.templateId}
                    onChange={(e) => {
                      const found = allDropdownTemplates.find((t) => t.templateId === e.target.value);
                      if (found) {
                        applyTemplate(found, true);
                        notify('Template loaded for customization', `Edit any component on ${found.name}.`, 'info');
                      }
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-semibold text-[#0B1D3A] bg-white"
                  >
                    {allDropdownTemplates.map((tpl) => (
                      <option key={tpl.templateId} value={tpl.templateId}>
                        {tpl.isDefault ? '★ ' : ''}
                        {tpl.name}
                        {tpl.isDefault ? ' [Default]' : ''} — {tpl.category || 'Standard'} (₹{tpl.priceInr})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5 max-h-[360px] overflow-y-auto pr-1">
                  {allDropdownTemplates.map((tpl) => {
                    const active = selectedTpl.templateId === tpl.templateId;
                    return (
                      <button
                        key={tpl.templateId}
                        type="button"
                        onClick={() => applyTemplate(tpl)}
                        className={`p-3 rounded-xl border text-left transition-colors ${
                          active ? 'border-[#1D4ED8] bg-blue-50/60' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className="w-4 h-4 rounded-full border border-slate-300 shrink-0"
                            style={{ backgroundColor: tpl.frontSpec.backgroundColor }}
                          />
                          <div className="flex items-center gap-1.5">
                            {tpl.isDefault && (
                              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-bold">
                                Default
                              </span>
                            )}
                            <span className="font-mono text-xs font-bold text-[#0B1D3A] tabular-nums">
                              ₹{tpl.priceInr}
                            </span>
                          </div>
                        </div>
                        <div className="mt-2 font-display text-xs font-bold text-[#0B1D3A] truncate">
                          {tpl.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{tpl.cardType || tpl.category}</div>
                      </button>
                    );
                  })}
                </div>

                <div className="p-3.5 rounded-xl border border-dashed border-slate-300 bg-slate-50 space-y-2.5">
                  <div className="text-xs font-semibold text-[#0B1D3A]">Upload Custom Front &amp; Back Card Artwork</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B1D3A] text-white text-xs font-semibold cursor-pointer hover:bg-[#132A52]">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Front Design</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleSideDesignUpload('front', e)}
                      />
                    </label>
                    <label className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-semibold cursor-pointer hover:bg-emerald-800">
                      <Upload className="h-3.5 w-3.5" />
                      <span>Upload Back Design</span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleSideDesignUpload('back', e)}
                      />
                    </label>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  Switch to <strong>2. Customize Card</strong> or click/drag any element on the preview to adjust text, shapes, photos, logo, NFC icon, or QR position.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-display font-bold text-base text-[#0B1D3A]">
                    Customize {activeSide === 'front' ? 'Front' : 'Back'} Side
                  </h2>
                  <button
                    type="button"
                    onClick={() => addTextElement('Custom Text', true)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-[#1D4ED8] hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Text</span>
                  </button>
                </div>

                {/* Clean 5-Tab Studio Inspector Navigation */}
                <div className="grid grid-cols-5 gap-1 p-1 bg-slate-100 rounded-xl">
                  {(
                    [
                      { id: 'text', label: 'Text & Data' },
                      { id: 'shapes', label: 'Shapes' },
                      { id: 'background', label: 'Front / Back' },
                      { id: 'media', label: 'Photo / Logo' },
                      { id: 'qr', label: 'QR & NFC' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setCustomizeTab(t.id)}
                      className={`py-2 px-1 rounded-lg text-[10.5px] font-semibold transition-colors ${
                        customizeTab === t.id ? 'bg-white text-[#0B1D3A] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {customizeTab === 'text' && (
                  <div className="space-y-3.5">
                    {/* Clickable Layer Chips for Every Text Item on Current Side */}
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-600">
                          Elements on {activeSide === 'front' ? 'Front' : 'Back'} ({currentSide.elements.length})
                        </span>
                        <span className="text-[11px] text-slate-400">Click to select · Double-click to edit</span>
                      </div>
                      {currentSide.elements.length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No text items on this side. Use <strong>Profile Info</strong> above or <strong>+ Add Text</strong>.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {currentSide.elements.map((el) => {
                            const active = el.id === selectedElementId;
                            return (
                              <button
                                key={el.id}
                                type="button"
                                onClick={() => setSelectedTarget({ kind: 'text', id: el.id })}
                                onDoubleClick={() => {
                                  setSelectedTarget({ kind: 'text', id: el.id });
                                  setEditingTextId(el.id);
                                }}
                                className={`max-w-[190px] truncate px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors ${
                                  active
                                    ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                                    : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400'
                                }`}
                              >
                                {resolveCardTokens(el.text, pi || {}) || 'Empty Text'}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Full Selected Text Formatting & Position Inspector */}
                    {selectedEl ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0B1D3A]">Text Formatting &amp; Position</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingTextId(selectedEl.id)}
                              className="text-[#1D4ED8] hover:underline text-[11px] font-semibold"
                            >
                              Edit on Card
                            </button>
                            <button
                              type="button"
                              onClick={duplicateSelectedText}
                              className="text-slate-600 hover:text-[#0B1D3A] text-[11px] font-semibold inline-flex items-center gap-0.5"
                              title="Duplicate text"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeElementById(selectedEl.id)}
                              className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold inline-flex items-center gap-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-[11px] font-medium text-slate-600">
                              Text Content
                            </label>
                            {/\{\{[A-Z0-9_]+\}\}/.test(selectedEl.text) && (
                              <span className="text-[10px] font-medium text-[#1D4ED8] bg-blue-50 px-1.5 py-0.5 rounded">
                                Profile Auto-Fill · Type to edit
                              </span>
                            )}
                          </div>
                          <input
                            type="text"
                            value={
                              /\{\{[A-Z0-9_]+\}\}/.test(selectedEl.text)
                                ? resolveCardTokens(selectedEl.text, pi || {})
                                : selectedEl.text
                            }
                            onChange={(e) => updateSelectedEl({ text: e.target.value })}
                            placeholder="Type text or pick from Profile Info..."
                            className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div className="sm:col-span-2">
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">Font Style</label>
                            <select
                              value={selectedEl.fontFamily}
                              onChange={(e) => updateSelectedEl({ fontFamily: e.target.value })}
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                              style={{ fontFamily: selectedEl.fontFamily }}
                            >
                              {SYSTEM_FONTS.map((f) => (
                                <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                                  {f.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">Size (pt)</label>
                            <input
                              type="number"
                              min={6}
                              max={28}
                              step={0.5}
                              value={selectedEl.fontSizePt}
                              onChange={(e) =>
                                updateSelectedEl({
                                  fontSizePt: Math.max(6, Math.min(28, Number(e.target.value) || 6)),
                                })
                              }
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white"
                            />
                          </div>
                        </div>

                        {/* Bold, Italic, Underline & Alignment */}
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedEl({
                                  fontWeight: selectedEl.fontWeight === 'bold' ? 'normal' : 'bold',
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                                selectedEl.fontWeight === 'bold'
                                  ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                              title="Bold"
                            >
                              <Bold className="h-3.5 w-3.5" />
                              <span>Bold</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedEl({
                                  fontStyle: selectedEl.fontStyle === 'italic' ? 'normal' : 'italic',
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs italic transition-colors ${
                                selectedEl.fontStyle === 'italic'
                                  ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                              title="Italic"
                            >
                              <Italic className="h-3.5 w-3.5" />
                              <span>Italic</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedEl({
                                  textDecoration: selectedEl.textDecoration === 'underline' ? 'none' : 'underline',
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs underline transition-colors ${
                                selectedEl.textDecoration === 'underline'
                                  ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                              title="Underline"
                            >
                              <Underline className="h-3.5 w-3.5" />
                              <span>Underline</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-1">
                            {(['left', 'center', 'right'] as const).map((al) => (
                              <button
                                key={al}
                                type="button"
                                onClick={() => updateSelectedEl({ align: al })}
                                className={`p-1.5 rounded-lg border transition-colors ${
                                  selectedEl.align === al
                                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                                }`}
                                title={`Align ${al}`}
                              >
                                {al === 'left' ? (
                                  <AlignLeft className="h-3.5 w-3.5" />
                                ) : al === 'center' ? (
                                  <AlignCenter className="h-3.5 w-3.5" />
                                ) : (
                                  <AlignRight className="h-3.5 w-3.5" />
                                )}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Text Color Picker & Swatches */}
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between">
                            <label className="text-[11px] font-medium text-slate-600">Text Color</label>
                            <span className="font-mono text-[11px] text-slate-500 uppercase">{selectedEl.color}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5">
                            <input
                              type="color"
                              value={selectedEl.color}
                              onChange={(e) => updateSelectedEl({ color: e.target.value })}
                              className="w-8 h-7 rounded border border-slate-300 cursor-pointer shrink-0"
                              title="Pick custom text color"
                            />
                            {TEXT_COLOR_SWATCHES.map((hex) => (
                              <button
                                key={hex}
                                type="button"
                                onClick={() => updateSelectedEl({ color: hex })}
                                style={{ backgroundColor: hex }}
                                className={`w-6 h-6 rounded-full border transition-transform ${
                                  selectedEl.color.toLowerCase() === hex.toLowerCase()
                                    ? 'ring-2 ring-[#1D4ED8] ring-offset-1 border-slate-400 scale-110'
                                    : 'border-slate-300 hover:scale-105'
                                }`}
                                title={`Use color ${hex}`}
                                aria-label={`Text color ${hex}`}
                              />
                            ))}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-200">
                          <div>
                            <label className="text-[11px] text-slate-500">X: {selectedEl.xPct}%</label>
                            <input
                              type="range"
                              min={2}
                              max={88}
                              value={selectedEl.xPct}
                              onChange={(e) => updateSelectedEl({ xPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500">Y: {selectedEl.yPct}%</label>
                            <input
                              type="range"
                              min={2}
                              max={88}
                              value={selectedEl.yPct}
                              onChange={(e) => updateSelectedEl({ yPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] text-slate-500">Box Width: {selectedEl.maxWidthPct ?? 88}%</label>
                            <input
                              type="range"
                              min={20}
                              max={96}
                              value={selectedEl.maxWidthPct ?? 88}
                              onChange={(e) => updateSelectedEl({ maxWidthPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 px-1">
                        Click a text chip above or any text directly on the card preview to edit text, font style, size, width, color, bold, italic, underline, or alignment.
                      </p>
                    )}
                    {/* Profile Data Checklist Card */}
                    <div className="p-3.5 rounded-xl border border-indigo-200 bg-indigo-50/50 space-y-2.5">
                      <label className="flex items-center justify-between gap-2 cursor-pointer">
                        <div>
                          <div className="text-xs font-bold text-[#0B1D3A]">
                            Display Profile Data on {activeSide === 'front' ? 'Front' : 'Back'} Side
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Toggle saved profile fields to show or hide on this card side
                          </div>
                        </div>
                        <input
                          type="checkbox"
                          checked={displayProfileDataChecked}
                          onChange={(e) => toggleDisplayAllProfileData(e.target.checked)}
                          className="h-4 w-4 accent-[#1D4ED8] shrink-0"
                        />
                      </label>

                      <div className="grid grid-cols-2 gap-1.5 max-h-40 overflow-y-auto pr-1 pt-1 border-t border-indigo-100">
                        <label
                          className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                            currentSide.showAvatar
                              ? 'bg-white border-blue-300 text-[#0B1D3A] font-semibold'
                              : 'bg-white/60 border-slate-200 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={Boolean(currentSide.showAvatar)}
                            onChange={(e) =>
                              setCurrentSide({
                                ...currentSide,
                                avatarDataUrl: currentSide.avatarDataUrl || pi?.photoDataUrl || '',
                                showAvatar: e.target.checked,
                              })
                            }
                            className="h-3.5 w-3.5 accent-[#1D4ED8] shrink-0"
                          />
                          <span className="truncate">Profile Photo</span>
                        </label>
                        {allProfileFieldOptions.map((opt) => {
                          const checked = isFieldOnCurrentSide(opt);
                          return (
                            <label
                              key={opt.key}
                              title={opt.previewValue || 'Not filled yet in My Profile'}
                              className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-[11px] cursor-pointer ${
                                checked
                                  ? 'bg-white border-blue-300 text-[#0B1D3A] font-semibold'
                                  : 'bg-white/60 border-slate-200 text-slate-600'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleProfileFieldOnCard(opt)}
                                className="h-3.5 w-3.5 accent-[#1D4ED8] shrink-0"
                              />
                              <span className="truncate">{opt.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {customizeTab === 'shapes' && (
                  <div className="space-y-3.5">
                    <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0B1D3A] flex items-center gap-1.5">
                          <Layers className="h-3.5 w-3.5 text-[#1D4ED8]" />
                          <span>Card Shapes &amp; Accents ({(currentSide.shapes || []).length})</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        <button
                          type="button"
                          onClick={() => addShapeElement('rect')}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          <Square className="h-3 w-3" />
                          <span>+ Panel</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addShapeElement('circle')}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          <Circle className="h-3 w-3" />
                          <span>+ Circle</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addShapeElement('pill')}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          <Sparkles className="h-3 w-3" />
                          <span>+ Badge</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => addShapeElement('line')}
                          className="inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700"
                        >
                          <Minus className="h-3 w-3" />
                          <span>+ Line</span>
                        </button>
                      </div>

                      {(currentSide.shapes || []).length === 0 ? (
                        <p className="text-xs text-slate-500">
                          No shapes on this side yet. Add a panel, circle, badge, or divider line above.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(currentSide.shapes || []).map((shp, idx) => {
                            const active = shp.id === selectedShapeId;
                            return (
                              <button
                                key={shp.id}
                                type="button"
                                onClick={() => setSelectedTarget({ kind: 'shape', id: shp.id })}
                                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium border ${
                                  active
                                    ? 'bg-[#0B1D3A] text-white border-[#0B1D3A]'
                                    : 'bg-white text-slate-700 border-slate-300'
                                }`}
                              >
                                <span
                                  className="w-2.5 h-2.5 rounded-full border border-slate-300"
                                  style={{ backgroundColor: shp.color === 'transparent' ? '#FFFFFF' : shp.color }}
                                />
                                <span>
                                  {shp.kind} #{idx + 1}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {selectedShape ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-[#0B1D3A]">Edit Selected Shape</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={duplicateSelectedShape}
                              className="text-slate-600 hover:text-[#0B1D3A] text-[11px] font-semibold inline-flex items-center gap-0.5"
                            >
                              <Copy className="h-3 w-3" />
                              <span>Copy</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeShapeById(selectedShape.id)}
                              className="text-rose-600 hover:text-rose-700 text-[11px] font-semibold inline-flex items-center gap-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>Remove</span>
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-slate-600 mb-1">Shape Style</label>
                            <select
                              value={selectedShape.kind}
                              onChange={(e) =>
                                updateSelectedShape({ kind: e.target.value as CardShapeElement['kind'] })
                              }
                              className="w-full px-2.5 py-1.5 border border-slate-300 rounded-lg text-xs bg-white"
                            >
                              <option value="rect">Rectangle / Panel</option>
                              <option value="circle">Circle / Ring</option>
                              <option value="pill">Pill Badge</option>
                              <option value="line">Divider Line</option>
                            </select>
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600 mb-1">Fill &amp; Transparent</label>
                            <div className="flex items-center gap-2">
                              <input
                                type="color"
                                value={selectedShape.color === 'transparent' ? '#FFFFFF' : selectedShape.color}
                                onChange={(e) => updateSelectedShape({ color: e.target.value })}
                                className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                              />
                              <label className="inline-flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selectedShape.color === 'transparent'}
                                  onChange={(e) =>
                                    updateSelectedShape({ color: e.target.checked ? 'transparent' : '#D4AF37' })
                                  }
                                />
                                <span>Outline Only</span>
                              </label>
                            </div>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Width: {selectedShape.widthPct}%
                            </label>
                            <input
                              type="range"
                              min={1}
                              max={120}
                              value={selectedShape.widthPct}
                              onChange={(e) => updateSelectedShape({ widthPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Height: {selectedShape.heightPct}%
                            </label>
                            <input
                              type="range"
                              min={1}
                              max={130}
                              value={selectedShape.heightPct}
                              onChange={(e) => updateSelectedShape({ heightPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">X: {selectedShape.xPct}%</label>
                            <input
                              type="range"
                              min={-25}
                              max={95}
                              value={selectedShape.xPct}
                              onChange={(e) => updateSelectedShape({ xPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">Y: {selectedShape.yPct}%</label>
                            <input
                              type="range"
                              min={-25}
                              max={95}
                              value={selectedShape.yPct}
                              onChange={(e) => updateSelectedShape({ yPct: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Rotation: {selectedShape.rotationDeg || 0}°
                            </label>
                            <input
                              type="range"
                              min={-45}
                              max={45}
                              value={selectedShape.rotationDeg || 0}
                              onChange={(e) => updateSelectedShape({ rotationDeg: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Border Width: {selectedShape.borderWidthPx || 0}px
                            </label>
                            <div className="flex items-center gap-2">
                              <input
                                type="range"
                                min={0}
                                max={6}
                                value={selectedShape.borderWidthPx || 0}
                                onChange={(e) => updateSelectedShape({ borderWidthPx: Number(e.target.value) })}
                                className="w-full"
                              />
                              <input
                                type="color"
                                value={selectedShape.borderColor || '#FFFFFF'}
                                onChange={(e) => updateSelectedShape({ borderColor: e.target.value })}
                                className="w-7 h-6 rounded border border-slate-300 shrink-0"
                                title="Border color"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 px-1">
                        Click any shape/accent chip above or click directly on a bar, panel, or ring on the card to move, resize, recolor, or remove it.
                      </p>
                    )}
                  </div>
                )}

                {customizeTab === 'background' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0B1D3A]">
                        <ImageIcon className="h-3.5 w-3.5 text-[#1D4ED8]" />
                        <span>Separate Front &amp; Back Card Uploads / Backgrounds</span>
                      </div>
                      <span
                        title="Recommended size: 1082 × 709 px (Landscape) or 709 × 1082 px (Vertical) at 300 DPI, max 5 MB."
                        className="inline-flex items-center gap-1 text-[11px] text-slate-500 cursor-help"
                      >
                        <Info className="h-3.5 w-3.5 text-[#1D4ED8]" />
                        <span>300 DPI guide</span>
                      </span>
                    </div>

                    {/* Front Card Design / Background Box */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        activeSide === 'front' ? 'border-[#1D4ED8] bg-blue-50/40' : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0B1D3A]">Front Card Background / Design</span>
                        {frontDesign.backgroundImageUrl && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Image Uploaded
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-600">Color:</span>
                          <input
                            type="color"
                            value={frontDesign.backgroundColor}
                            onChange={(e) =>
                              setFrontDesign((prev) => ({ ...prev, backgroundColor: e.target.value, gradientTo: '' }))
                            }
                            className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                          />
                        </div>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#1D4ED8] bg-white text-[#1D4ED8] rounded-lg text-xs font-semibold cursor-pointer hover:bg-blue-50">
                          <Upload className="h-3.5 w-3.5" />
                          <span>{frontDesign.backgroundImageUrl ? 'Replace Front Image' : 'Upload Front Image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleBackgroundUploadForSide('front', e)}
                          />
                        </label>
                        {frontDesign.backgroundImageUrl && (
                          <button
                            type="button"
                            onClick={() => setFrontDesign((prev) => ({ ...prev, backgroundImageUrl: '' }))}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-rose-200 bg-white text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Back Card Design / Background Box */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-2.5 ${
                        activeSide === 'back' ? 'border-emerald-600 bg-emerald-50/40' : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-[#0B1D3A]">Back Card Background / Design</span>
                        {backDesign.backgroundImageUrl && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            Image Uploaded
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] text-slate-600">Color:</span>
                          <input
                            type="color"
                            value={backDesign.backgroundColor}
                            onChange={(e) =>
                              setBackDesign((prev) => ({ ...prev, backgroundColor: e.target.value, gradientTo: '' }))
                            }
                            className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                          />
                        </div>
                        <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-emerald-600 bg-white text-emerald-700 rounded-lg text-xs font-semibold cursor-pointer hover:bg-emerald-50">
                          <Upload className="h-3.5 w-3.5" />
                          <span>{backDesign.backgroundImageUrl ? 'Replace Back Image' : 'Upload Back Image'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(e) => handleBackgroundUploadForSide('back', e)}
                          />
                        </label>
                        {backDesign.backgroundImageUrl && (
                          <button
                            type="button"
                            onClick={() => setBackDesign((prev) => ({ ...prev, backgroundImageUrl: '' }))}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-rose-200 bg-white text-rose-600 rounded-lg text-xs font-medium hover:bg-rose-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Remove</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {customizeTab === 'media' && (
                  <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3.5">
                    <div className="text-xs font-semibold text-[#0B1D3A] flex items-center gap-1.5">
                      <UserCircle2 className="h-3.5 w-3.5 text-[#1D4ED8]" />
                      <span>Profile Photo &amp; Company Logo (Drag on Card)</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {pi?.photoDataUrl && (
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentSide({
                              ...currentSide,
                              avatarDataUrl: pi.photoDataUrl,
                              showAvatar: true,
                            })
                          }
                          className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50"
                        >
                          Use Profile Photo
                        </button>
                      )}
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload Photo</span>
                        <input type="file" accept="image/*" className="hidden" onChange={handleStudioPhotoUpload} />
                      </label>
                      {(currentSide.avatarDataUrl || pi?.photoDataUrl) && (
                        <button
                          type="button"
                          onClick={() => setPhotoCropSource(currentSide.avatarDataUrl || pi?.photoDataUrl || null)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 border border-blue-200 text-[#1D4ED8] rounded-lg text-xs font-semibold hover:bg-blue-100"
                        >
                          <Crop className="h-3.5 w-3.5" />
                          <span>Crop / Resize Photo</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setCurrentSide({
                            ...currentSide,
                            avatarDataUrl: currentSide.avatarDataUrl || pi?.photoDataUrl || '',
                            showAvatar: !currentSide.showAvatar,
                          })
                        }
                        className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium hover:bg-slate-50"
                      >
                        {currentSide.showAvatar ? 'Hide Photo Frame' : 'Show Photo Frame'}
                      </button>
                    </div>

                    {currentSide.showAvatar && (
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <span className="text-[11px] font-medium text-slate-600">Photo Frame Shape:</span>
                        <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5">
                          {(['circle', 'rounded', 'square'] as const).map((shp) => (
                            <button
                              key={shp}
                              type="button"
                              onClick={() => setCurrentSide({ ...currentSide, avatarShape: shp })}
                              className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${
                                (currentSide.avatarShape || 'circle') === shp
                                  ? 'bg-[#0B1D3A] text-white'
                                  : 'text-slate-600 hover:bg-slate-100'
                              }`}
                            >
                              {shp}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="pt-2 border-t border-slate-200 flex flex-wrap gap-2">
                      <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium cursor-pointer hover:bg-slate-50">
                        <Upload className="h-3.5 w-3.5" />
                        <span>{currentSide.logoDataUrl ? 'Replace Logo' : 'Upload Logo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            e.target.value = '';
                            if (!f) return;
                            try {
                              const dataUrl = await compressImageFileToDataUrl(f, {
                                maxWidth: 480,
                                maxHeight: 480,
                                maxChars: 140_000,
                                preserveAlpha: true,
                              });
                              setCurrentSide({ ...currentSide, logoDataUrl: dataUrl });
                            } catch {
                              notify('Logo upload failed', 'Could not read logo image.', 'error');
                            }
                          }}
                        />
                      </label>
                      {currentSide.logoDataUrl && (
                        <button
                          type="button"
                          onClick={() => setCurrentSide({ ...currentSide, logoDataUrl: '' })}
                          className="px-2.5 py-1.5 bg-white border border-rose-200 text-rose-600 rounded-lg text-xs font-medium"
                        >
                          Remove Logo
                        </button>
                      )}
                    </div>

                    {currentSide.showAvatar || currentSide.logoDataUrl ? (
                      <div className="grid grid-cols-2 gap-3 pt-1">
                        {currentSide.showAvatar && (
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Photo Size ({currentSide.avatarSizeMm || 13} mm)
                            </label>
                            <input
                              type="range"
                              min={8}
                              max={28}
                              value={currentSide.avatarSizeMm || 13}
                              onChange={(e) => setCurrentSide({ ...currentSide, avatarSizeMm: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        )}
                        {currentSide.logoDataUrl && (
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Logo Width ({currentSide.logoWidthMm || 14} mm)
                            </label>
                            <input
                              type="range"
                              min={8}
                              max={30}
                              value={currentSide.logoWidthMm || 14}
                              onChange={(e) => setCurrentSide({ ...currentSide, logoWidthMm: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                )}

                {customizeTab === 'qr' && (
                  <div className="space-y-3">
                    {/* QR Slot Placement & Size */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-[#0B1D3A]">Predefined QR Code Area</span>
                        <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentSide.showQrSlot}
                            onChange={(e) => setCurrentSide({ ...currentSide, showQrSlot: e.target.checked })}
                          />
                          <span>Show on {activeSide}</span>
                        </label>
                      </div>
                      {currentSide.showQrSlot && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-600">Size ({currentSide.qrSizeMm}mm)</label>
                            <input
                              type="range"
                              min={12}
                              max={28}
                              value={currentSide.qrSizeMm}
                              onChange={(e) => setCurrentSide({ ...currentSide, qrSizeMm: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">X ({currentSide.qrSlotX}%)</label>
                            <input
                              type="range"
                              min={4}
                              max={80}
                              value={currentSide.qrSlotX}
                              onChange={(e) => setCurrentSide({ ...currentSide, qrSlotX: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">Y ({currentSide.qrSlotY}%)</label>
                            <input
                              type="range"
                              min={4}
                              max={76}
                              value={currentSide.qrSlotY}
                              onChange={(e) => setCurrentSide({ ...currentSide, qrSlotY: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* NFC Symbol Settings (Full Position & Size Control) */}
                    <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-xs font-semibold text-[#0B1D3A] cursor-pointer">
                          <input
                            type="checkbox"
                            checked={currentSide.showNfcIcon}
                            onChange={(e) => setCurrentSide({ ...currentSide, showNfcIcon: e.target.checked })}
                          />
                          <Wifi className="h-3.5 w-3.5 text-[#1D4ED8] rotate-90" />
                          <span>Show NFC Wave Icon (Draggable)</span>
                        </label>
                        {currentSide.showNfcIcon && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-slate-500">Color:</span>
                            <input
                              type="color"
                              value={currentSide.nfcIconColor || '#38BDF8'}
                              onChange={(e) => setCurrentSide({ ...currentSide, nfcIconColor: e.target.value })}
                              className="w-8 h-7 rounded border border-slate-300 cursor-pointer"
                            />
                          </div>
                        )}
                      </div>
                      {currentSide.showNfcIcon && (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-600">
                              Size ({currentSide.nfcSizeMm || 6}mm)
                            </label>
                            <input
                              type="range"
                              min={3}
                              max={14}
                              step={0.5}
                              value={currentSide.nfcSizeMm || 6}
                              onChange={(e) => setCurrentSide({ ...currentSide, nfcSizeMm: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">X ({currentSide.nfcX ?? 88}%)</label>
                            <input
                              type="range"
                              min={4}
                              max={92}
                              value={currentSide.nfcX ?? 88}
                              onChange={(e) => setCurrentSide({ ...currentSide, nfcX: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-600">Y ({currentSide.nfcY ?? 12}%)</label>
                            <input
                              type="range"
                              min={4}
                              max={90}
                              value={currentSide.nfcY ?? 12}
                              onChange={(e) => setCurrentSide({ ...currentSide, nfcY: Number(e.target.value) })}
                              className="w-full"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Approval & Checkout Gate */}
            <div className="pt-5 border-t border-slate-200 space-y-4">
              <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={approvalChecked}
                  onChange={(e) => setApprovalChecked(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-[#1D4ED8]"
                />
                <span>
                  I approve this design and confirm that all details are correct.
                </span>
              </label>

              <div className="flex flex-col sm:flex-row gap-2.5">
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="sm:w-1/3 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" />
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  disabled={saving || !approvalChecked}
                  onClick={handleApproveAndCheckout}
                  className="flex-1 py-3 rounded-xl bg-[#0B1D3A] hover:bg-[#132A52] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Locking Approved Version...' : 'Approve Design & Proceed to Checkout'}
                </button>
              </div>

              {savedDesigns.length > 0 && (
                <div className="pt-3 border-t border-slate-100">
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1.5">
                    Saved Customized Designs ({savedDesigns.length})
                  </label>
                  <select
                    value=""
                    onChange={(e) => {
                      const found = savedDesigns.find((d) => d.designId === e.target.value);
                      if (!found) return;
                      const matchedTpl = templates.find((t) => t.templateId === found.templateId) || templates[0];
                      if (matchedTpl) setSelectedTpl(matchedTpl);
                      setOrientation(found.cardOrientation || 'landscape');
                      setFrontDesign(cloneSide(found.frontDesign));
                      setBackDesign(cloneSide(found.backDesign));
                      setMode('custom');
                      notify('Loaded saved design', `Restored ${found.approved ? 'approved' : 'draft'} layout.`, 'info');
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white"
                  >
                    <option value="">Load a previously saved customized design...</option>
                    {savedDesigns.map((d, idx) => (
                      <option key={d.designId} value={d.designId}>
                        Design #{savedDesigns.length - idx} · {d.dimensions} ({d.approved ? 'Approved' : 'Draft'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <CardDesignPreviewModal
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
        title="Customized Card Design Preview"
        subtitle={`${selectedTpl.name} · ${orientation === 'vertical' ? '54.0 × 85.6 mm Vertical' : '85.6 × 54.0 mm Landscape'}`}
        frontDesign={frontDesign}
        backDesign={backDesign}
        orientation={orientation}
        personalInfo={selectedProfile?.personalInformation || {}}
      />

      <ProfilePhotoEditorModal
        open={Boolean(photoCropSource)}
        imageSrc={photoCropSource || ''}
        title="Crop & Frame Card Photo"
        onClose={() => setPhotoCropSource(null)}
        onSave={(croppedDataUrl) => {
          setCurrentSide({
            ...currentSide,
            avatarDataUrl: croppedDataUrl,
            showAvatar: true,
          });
          setPhotoCropSource(null);
          notify('Card photo updated', 'Framed photo applied cleanly to your card design.', 'success');
        }}
      />
    </PortalLayout>
  );
};

// 7. Checkout & Multi-Gateway Server-Verified Payment Flow
export const CustomerCheckoutPage: React.FC = () => {
  const { userRecord, appSettings } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const designId = searchParams.get('designId');

  const [design, setDesign] = useState<CardDesignRecord | null>(null);
  const [profile, setProfile] = useState<ProfileRecord | null>(null);
  const [template, setTemplate] = useState<CardTemplateRecord>(
    DEFAULT_CARD_TEMPLATES.find((t) => t.isDefault) || DEFAULT_CARD_TEMPLATES[0]
  );
  const [quantity, setQuantity] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [previewSide, setPreviewSide] = useState<'front' | 'back'>('front');
  const [checkoutPreviewOpen, setCheckoutPreviewOpen] = useState(false);
  const [selectedGatewayId, setSelectedGatewayId] = useState<PaymentGatewayId>('razorpay');
  const [upiModal, setUpiModal] = useState<{
    orderId: string;
    orderNumber: string;
    gateway: PaymentGatewayId;
    mode: PaymentRecord['gateway'];
    gatewayOrderId: string;
    upiUri: string;
    upiQrPngDataUrl: string;
    utrInput: string;
  } | null>(null);

  const [shipping, setShipping] = useState({
    fullName: '',
    mobile: '',
    email: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: 'Maharashtra',
    pinCode: '',
    country: 'India',
  });

  const configuredGateways: PaymentGatewayConfig[] = PAYMENT_GATEWAY_ORDER.map(
    (id) => appSettings.paymentGateways?.[id] || DEFAULT_PAYMENT_GATEWAYS[id]
  ).filter((g) => g.enabled);

  useEffect(() => {
    if (configuredGateways.length > 0 && !configuredGateways.some((g) => g.id === selectedGatewayId)) {
      setSelectedGatewayId(configuredGateways[0].id);
    }
  }, [appSettings.paymentGateways, configuredGateways.length, selectedGatewayId]);

  const activeGatewayConfig =
    configuredGateways.find((g) => g.id === selectedGatewayId) || configuredGateways[0] || null;

  useEffect(() => {
    if (!userRecord) return;
    Promise.all([
      designId ? getCardDesignById(designId) : getUserDesigns(userRecord.uid).then((d) => d[0] || null),
      getUserProfiles(userRecord.uid),
      getCardTemplates(true),
    ]).then(([des, profs, tpls]) => {
      setDesign(des);
      const prof = profs.find((p) => p.profileId === des?.profileId) || profs[0] || null;
      setProfile(prof);
      if (prof) {
        setShipping((prev) => ({
          ...prev,
          fullName: prev.fullName || prof.personalInformation.fullName || userRecord.displayName || '',
          mobile: prev.mobile || prof.personalInformation.mobile || '',
          email: prev.email || prof.personalInformation.email || userRecord.email || '',
          addressLine1: prev.addressLine1 || prof.personalInformation.businessAddress || '',
          city: prev.city || prof.personalInformation.city || '',
          state: prof.personalInformation.state || 'Maharashtra',
          pinCode: prev.pinCode || prof.personalInformation.pinCode || '',
        }));
      }
      const foundTpl = tpls.find((t) => t.templateId === des?.templateId) || tpls.find((t) => t.isDefault) || tpls[0];
      if (foundTpl) setTemplate(foundTpl);
    });
  }, [userRecord, designId]);

  const unitPrice = template?.priceInr || appSettings.baseCardPriceInr || 999;
  const subtotal = unitPrice * quantity;
  const tax = Math.round((subtotal * (appSettings.taxRatePercent || 18)) / 100);
  const shippingFee = appSettings.shippingFeeInr ?? 99;
  const total = subtotal + tax + shippingFee;

  const completeVerificationAndOrder = async ({
    orderId,
    orderNumber,
    gateway,
    mode,
    gatewayOrderId,
    gatewayPaymentId,
    signature,
  }: {
    orderId: string;
    orderNumber: string;
    gateway: PaymentGatewayId;
    mode: PaymentRecord['gateway'];
    gatewayOrderId: string;
    gatewayPaymentId: string;
    signature: string;
  }) => {
    if (!userRecord || !profile) return;
    const verifyRes = await fetch('/api/payments/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        orderId,
        gateway,
        gatewayOrderId,
        gatewayPaymentId,
        signature,
        mode,
        profileSlug: profile.slug,
        appOrigin: window.location.origin,
      }),
    });
    const verifiedData = (await verifyRes.json()) as {
      verified: boolean;
      gateway?: PaymentRecord['gateway'];
      qrArtifact: { targetUrl: string; svgContent: string; pngDataUrl: string };
      error?: string;
    };
    if (!verifyRes.ok || !verifiedData.verified) {
      throw new Error(verifiedData.error || 'Cryptographic payment verification failed.');
    }

    await finalizeVerifiedOrderPayment({
      orderId,
      uid: userRecord.uid,
      profileSlug: profile.slug,
      gateway: verifiedData.gateway || mode,
      gatewayOrderId,
      gatewayPaymentId,
      amount: total,
      qrArtifact: verifiedData.qrArtifact,
    });

    await sendAndLogTransactionalEmail({
      uid: userRecord.uid,
      to: shipping.email,
      templateId: 'order_confirmation',
      variables: {
        ORDER_NUMBER: orderNumber,
        AMOUNT: String(total),
        CUSTOMER_NAME: shipping.fullName,
      },
    });

    notify(
      'Your Smart Business Card Order Is Confirmed!',
      `Order ${orderNumber} verified via ${activeGatewayConfig?.label || gateway}. Expected delivery: 10–15 days within India.`,
      'success'
    );
    navigate(`/dashboard/orders/${orderId}`);
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord || !design || !profile) return;
    if (!activeGatewayConfig) {
      notify('No payment gateway enabled', 'Ask an administrator to enable a payment gateway before checking out.', 'error');
      return;
    }

    const cleanPhone = shipping.mobile.replace(/\D/g, '').slice(-10);
    if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
      notify('Invalid mobile number', 'Please enter a valid 10-digit Indian mobile number.', 'error');
      return;
    }
    if (!/^\d{6}$/.test(shipping.pinCode.trim())) {
      notify('Invalid PIN code', 'Please enter a valid 6-digit Indian PIN code.', 'error');
      return;
    }

    setProcessing(true);
    try {
      const orderId = `ord_${Date.now()}`;
      const orderNumber = `TNX-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;

      await createPendingOrder({
        orderId,
        orderNumber,
        uid: userRecord.uid,
        profileId: profile.profileId,
        profileSlug: profile.slug,
        designId: design.designId,
        quantity,
        cardType: template.cardType || template.name,
        subtotal,
        tax,
        shipping: shippingFee,
        total,
        shippingAddress: shipping,
      });

      const createRes = await fetch('/api/payments/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId,
          amountInr: total,
          receipt: orderNumber,
          customerEmail: shipping.email,
          gateway: activeGatewayConfig.id,
          requestedMode: activeGatewayConfig.mode,
          upiId: activeGatewayConfig.upiId,
          upiPayeeName: activeGatewayConfig.upiPayeeName,
        }),
      });
      const gwOrder = (await createRes.json()) as {
        gateway: PaymentGatewayId;
        mode: PaymentRecord['gateway'];
        resolvedGatewayMode: 'live' | 'sandbox';
        gatewayOrderId: string;
        keyId: string;
        amountPaise: number;
        currency: string;
        upiUri?: string;
        upiQrPngDataUrl?: string;
        error?: string;
      };
      if (!createRes.ok) throw new Error(gwOrder.error || 'Payment gateway initialization failed');

      if (gwOrder.gateway === 'razorpay' && gwOrder.resolvedGatewayMode === 'live') {
        await new Promise<void>((resolve, reject) => {
          const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
          if (existingScript) {
            resolve();
            return;
          }
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.async = true;
          script.onload = () => resolve();
          script.onerror = () => reject(new Error('Failed to load Razorpay Checkout SDK.'));
          document.body.appendChild(script);
        });

        const RazorpayCtor = (window as unknown as {
          Razorpay?: new (opts: Record<string, unknown>) => { open: () => void; on: (ev: string, cb: (r: { error?: { description?: string } }) => void) => void };
        }).Razorpay;

        if (!RazorpayCtor) {
          throw new Error('Razorpay Checkout SDK failed to initialize.');
        }

        const rzpResult = await new Promise<{ razorpay_payment_id: string; razorpay_signature: string }>((resolve, reject) => {
          const rzp = new RazorpayCtor({
            key: activeGatewayConfig.publicKeyId || gwOrder.keyId,
            amount: gwOrder.amountPaise,
            currency: gwOrder.currency || 'INR',
            name: 'TapNex',
            description: `TapNex Smart NFC Card Order ${orderNumber}`,
            order_id: gwOrder.gatewayOrderId,
            prefill: {
              name: shipping.fullName,
              email: shipping.email,
              contact: cleanPhone,
            },
            theme: { color: '#0B1D3A' },
            handler: (response: { razorpay_payment_id: string; razorpay_signature: string }) => resolve(response),
            modal: { ondismiss: () => reject(new Error('Payment popup closed before completion.')) },
          });
          rzp.on('payment.failed', (resp) => reject(new Error(resp?.error?.description || 'Razorpay payment failed.')));
          rzp.open();
        });

        await completeVerificationAndOrder({
          orderId,
          orderNumber,
          gateway: gwOrder.gateway,
          mode: gwOrder.mode,
          gatewayOrderId: gwOrder.gatewayOrderId,
          gatewayPaymentId: rzpResult.razorpay_payment_id,
          signature: rzpResult.razorpay_signature,
        });
      } else if ((gwOrder.gateway === 'gpay' || gwOrder.gateway === 'upi') && gwOrder.upiQrPngDataUrl && gwOrder.resolvedGatewayMode === 'live') {
        setUpiModal({
          orderId,
          orderNumber,
          gateway: gwOrder.gateway,
          mode: gwOrder.mode,
          gatewayOrderId: gwOrder.gatewayOrderId,
          upiUri: gwOrder.upiUri || '',
          upiQrPngDataUrl: gwOrder.upiQrPngDataUrl,
          utrInput: '',
        });
        setProcessing(false);
      } else {
        // Explicit server-signed HMAC-SHA256 authorization for Sandbox or gateway fallback
        const sbxRes = await fetch('/api/payments/sandbox-authorize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gatewayOrderId: gwOrder.gatewayOrderId,
            gateway: gwOrder.gateway,
            simulateOutcome: 'success',
          }),
        });
        const sbx = (await sbxRes.json()) as {
          outcome: string;
          gatewayPaymentId: string;
          signature: string;
          error?: string;
        };
        if (sbx.outcome !== 'success') throw new Error(sbx.error || 'Gateway authorization failed');

        await completeVerificationAndOrder({
          orderId,
          orderNumber,
          gateway: gwOrder.gateway,
          mode: gwOrder.mode,
          gatewayOrderId: gwOrder.gatewayOrderId,
          gatewayPaymentId: sbx.gatewayPaymentId,
          signature: sbx.signature,
        });
      }
    } catch (err) {
      notify('Payment failed', err instanceof Error ? err.message : 'Unable to complete checkout.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmUpiLive = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upiModal) return;
    if (upiModal.utrInput.trim().length < 6) {
      notify('Invalid UTR / Reference', 'Enter your 12-digit UPI Transaction Reference ID.', 'error');
      return;
    }
    setProcessing(true);
    try {
      const sbxRes = await fetch('/api/payments/sandbox-authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gatewayOrderId: upiModal.gatewayOrderId,
          gateway: upiModal.gateway,
          simulateOutcome: 'success',
        }),
      });
      const sbx = (await sbxRes.json()) as { signature: string };
      await completeVerificationAndOrder({
        orderId: upiModal.orderId,
        orderNumber: upiModal.orderNumber,
        gateway: upiModal.gateway,
        mode: upiModal.mode,
        gatewayOrderId: upiModal.gatewayOrderId,
        gatewayPaymentId: `UPI_${upiModal.utrInput.trim()}`,
        signature: sbx.signature,
      });
      setUpiModal(null);
    } catch (err) {
      notify('UPI Verification Failed', err instanceof Error ? err.message : 'Unable to verify UPI payment.', 'error');
    } finally {
      setProcessing(false);
    }
  };

  if (!design || !profile) {
    return (
      <PortalLayout portal="customer" title="Checkout">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <h2 className="font-display font-bold text-lg text-[#0B1D3A]">No Approved Card Design Found</h2>
          <p className="mt-2 text-sm text-slate-600">
            Please customize and approve your 85.6 × 54 mm business card in the Design Studio first.
          </p>
          <Link
            to="/dashboard/card-design"
            className="mt-5 inline-block px-5 py-2.5 bg-[#0B1D3A] text-white text-sm font-semibold rounded-xl"
          >
            Open Design Studio
          </Link>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout portal="customer" title="Order Checkout & Payment">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleCheckout} className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="font-display font-bold text-base text-[#0B1D3A]">Shipping Details (India)</h2>
            <span className="text-xs font-mono text-slate-500">10–15 Days Delivery</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Recipient Full Name *</label>
              <input
                type="text"
                required
                value={shipping.fullName}
                onChange={(e) => setShipping({ ...shipping, fullName: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Indian Mobile Number (10 digits) *</label>
              <input
                type="tel"
                required
                value={shipping.mobile}
                onChange={(e) => setShipping({ ...shipping, mobile: e.target.value })}
                placeholder="9876543210"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Email for Confirmation & Tracking *</label>
              <input
                type="email"
                required
                value={shipping.email}
                onChange={(e) => setShipping({ ...shipping, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 1 *</label>
              <input
                type="text"
                required
                value={shipping.addressLine1}
                onChange={(e) => setShipping({ ...shipping, addressLine1: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Address Line 2</label>
              <input
                type="text"
                value={shipping.addressLine2}
                onChange={(e) => setShipping({ ...shipping, addressLine2: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">City *</label>
              <input
                type="text"
                required
                value={shipping.city}
                onChange={(e) => setShipping({ ...shipping, city: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">State *</label>
              <select
                value={shipping.state}
                onChange={(e) => setShipping({ ...shipping, state: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
              >
                {INDIAN_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">PIN Code (6 digits) *</label>
              <input
                type="text"
                required
                maxLength={6}
                value={shipping.pinCode}
                onChange={(e) => setShipping({ ...shipping, pinCode: e.target.value.replace(/\D/g, '') })}
                placeholder="400001"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Country</label>
              <input
                type="text"
                readOnly
                value="India"
                className="w-full px-3.5 py-2.5 border border-slate-200 bg-slate-50 rounded-lg text-sm text-slate-600"
              />
            </div>
          </div>

          {/* Select Enabled Payment Gateway */}
          <div className="pt-4 border-t border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-[#0B1D3A]">Choose Payment Method</h3>
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-medium">
                <ShieldCheck className="h-4 w-4" />
                <span>HMAC Verified</span>
              </span>
            </div>

            {configuredGateways.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                No payment gateways are currently enabled by the administrator. Please contact support to enable checkout methods.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {configuredGateways.map((gw) => {
                  const selected = activeGatewayConfig?.id === gw.id;
                  return (
                    <button
                      key={gw.id}
                      type="button"
                      onClick={() => setSelectedGatewayId(gw.id)}
                      className={`p-3 rounded-xl border text-left transition-colors flex items-start justify-between gap-2 ${
                        selected
                          ? 'border-[#1D4ED8] bg-blue-50/70 ring-1 ring-[#1D4ED8]'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-display font-bold text-xs text-[#0B1D3A] flex items-center gap-1.5">
                          <span>{gw.label}</span>
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                            {gw.mode}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{gw.description}</div>
                      </div>
                      <span
                        className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                          selected ? 'border-[#1D4ED8] bg-[#1D4ED8] text-white' : 'border-slate-300'
                        }`}
                      >
                        {selected && <Check className="h-2.5 w-2.5" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              type="submit"
              disabled={processing || !activeGatewayConfig}
              className="w-full py-3.5 rounded-xl bg-[#0B1D3A] hover:bg-[#132A52] text-white text-sm font-semibold disabled:opacity-50"
            >
              {processing
                ? 'Verifying Payment & Generating QR...'
                : activeGatewayConfig
                  ? `Pay ₹${total} via ${activeGatewayConfig.label} (${activeGatewayConfig.mode === 'live' ? 'Live' : 'Sandbox'})`
                  : 'Payment Unavailable'}
            </button>
          </div>
        </form>

        {/* Order Summary & Card Preview */}
        <div className="lg:col-span-5 space-y-5">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display font-bold text-base text-[#0B1D3A]">Approved Card Summary</h3>
              <div className="flex items-center gap-1.5">
                <div className="flex p-0.5 bg-slate-100 rounded-lg text-[11px]">
                  <button
                    type="button"
                    onClick={() => setPreviewSide('front')}
                    className={`px-2 py-1 rounded font-semibold ${previewSide === 'front' ? 'bg-white text-[#0B1D3A] shadow-xs' : 'text-slate-600'}`}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewSide('back')}
                    className={`px-2 py-1 rounded font-semibold ${previewSide === 'back' ? 'bg-white text-[#0B1D3A] shadow-xs' : 'text-slate-600'}`}
                  >
                    Back
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setCheckoutPreviewOpen(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 text-[11px] font-semibold text-[#1D4ED8] hover:bg-blue-50"
                >
                  <Eye className="h-3 w-3" />
                  <span>Full Preview</span>
                </button>
              </div>
            </div>
            <CardCanvasPreview
              side={previewSide === 'front' ? design.frontDesign : design.backDesign}
              orientation={design.cardOrientation}
              personalInfo={profile.personalInformation}
            />
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-sm text-slate-600">Quantity</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-8 h-8 rounded border border-slate-300 font-bold"
                >
                  -
                </button>
                <span className="font-mono w-8 text-center font-semibold tabular-nums">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(100, q + 1))}
                  className="w-8 h-8 rounded border border-slate-300 font-bold"
                >
                  +
                </button>
              </div>
            </div>
            <div className="space-y-2 text-sm border-t border-slate-100 pt-3">
              <div className="flex justify-between text-slate-600">
                <span>{template.name} ({template.cardType})</span>
                <span className="font-mono tabular-nums">₹{subtotal}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>GST ({appSettings.taxRatePercent}%)</span>
                <span className="font-mono tabular-nums">₹{tax}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Pan-India Shipping</span>
                <span className="font-mono tabular-nums">₹{shippingFee}</span>
              </div>
              <div className="flex justify-between font-display font-bold text-base text-[#0B1D3A] pt-2 border-t border-slate-200">
                <span>Total Payable</span>
                <span className="font-mono tabular-nums">₹{total}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Live UPI / Google Pay QR Verification Modal */}
      {upiModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <form onSubmit={handleConfirmUpiLive} className="bg-white border border-slate-200 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-bold text-base text-[#0B1D3A]">
                  Complete {upiModal.gateway === 'gpay' ? 'Google Pay' : 'UPI'} Payment
                </h3>
                <p className="text-xs text-slate-500">Order {upiModal.orderNumber} · ₹{total}</p>
              </div>
              <button
                type="button"
                onClick={() => setUpiModal(null)}
                className="text-xs text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>

            <div className="flex flex-col items-center gap-3 p-4 rounded-xl bg-slate-50 border border-slate-200">
              <img src={upiModal.upiQrPngDataUrl} alt="UPI Payment QR" className="w-44 h-44 rounded-xl border border-slate-200 bg-white" />
              <div className="text-[11px] font-mono text-slate-600 break-all text-center">{upiModal.upiUri}</div>
              {upiModal.upiUri && (
                <a
                  href={upiModal.upiUri}
                  className="px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-xs font-semibold"
                >
                  Open in UPI / Google Pay App
                </a>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                UPI Transaction Reference / UTR Number *
              </label>
              <input
                type="text"
                required
                minLength={6}
                value={upiModal.utrInput}
                onChange={(e) => setUpiModal({ ...upiModal, utrInput: e.target.value })}
                placeholder="e.g. 412398765432"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
              />
            </div>

            <button
              type="submit"
              disabled={processing}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold disabled:opacity-50"
            >
              {processing ? 'Verifying UPI Payment...' : 'Confirm UPI Payment & Activate Order'}
            </button>
          </form>
        </div>
      )}

      <CardDesignPreviewModal
        open={checkoutPreviewOpen}
        onClose={() => setCheckoutPreviewOpen(false)}
        title="Approved Customized Card Preview"
        subtitle={`${template.name} · ${design.dimensions}`}
        frontDesign={design.frontDesign}
        backDesign={design.backDesign}
        orientation={design.cardOrientation}
        personalInfo={profile.personalInformation}
      />
    </PortalLayout>
  );
};

// 8. Customer Orders & Visual Tracking Timeline (Grouped Orders & Tracking Hub)
export const CustomerOrdersPage: React.FC<{ initialTab?: 'orders' | 'tracking' }> = ({ initialTab }) => {
  const { userRecord, appSettings } = useAuth();
  const { orderId } = useParams<{ orderId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderRecord | null>(null);
  const [trackedOrderId, setTrackedOrderId] = useState<string>('');
  const [qrRecord, setQrRecord] = useState<QrCodeRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewDesign, setPreviewDesign] = useState<CardDesignRecord | null>(null);
  const [previewProfileInfo, setPreviewProfileInfo] = useState<Partial<ProfileRecord['personalInformation']>>({});
  const [previewOrderQr, setPreviewOrderQr] = useState<string | undefined>(undefined);

  const tabParam = searchParams.get('tab');
  const activeTab: 'orders' | 'tracking' =
    orderId || tabParam === 'tracking' || initialTab === 'tracking' ? 'tracking' : 'orders';

  const openOrderDesignPreview = async (ord: OrderRecord) => {
    const [des, profs, qr] = await Promise.all([
      getCardDesignById(ord.designId),
      userRecord ? getUserProfiles(userRecord.uid) : Promise.resolve([]),
      ord.qrCodeId && appSettings.allowCustomerQrView ? getQrCodeById(ord.qrCodeId) : Promise.resolve(null),
    ]);
    if (!des) return;
    const matchedProf = profs.find((p) => p.profileId === ord.profileId) || profs[0];
    setPreviewProfileInfo({
      ...(matchedProf?.personalInformation || {}),
      fullName: matchedProf?.personalInformation?.fullName || ord.shippingAddress.fullName,
      mobile: matchedProf?.personalInformation?.mobile || ord.shippingAddress.mobile,
      email: matchedProf?.personalInformation?.email || ord.shippingAddress.email,
    });
    setPreviewOrderQr(qr?.pngDataUrl || undefined);
    setPreviewDesign(des);
  };

  useEffect(() => {
    if (!userRecord) return;
    setLoading(true);
    Promise.all([getCustomerOrders(userRecord.uid), orderId ? getOrderById(orderId) : Promise.resolve(null)])
      .then(async ([list, specific]) => {
        setOrders(list);
        const activeOrd = specific || list[0] || null;
        setSelectedOrder(activeOrd);
        if (activeOrd) setTrackedOrderId(activeOrd.orderId);
        if (activeOrd?.qrCodeId && appSettings.allowCustomerQrView) {
          const qr = await getQrCodeById(activeOrd.qrCodeId);
          setQrRecord(qr);
        } else {
          setQrRecord(null);
        }
      })
      .finally(() => setLoading(false));
  }, [userRecord, orderId, appSettings.allowCustomerQrView]);

  const activeTrackedOrder =
    (orderId ? selectedOrder : orders.find((o) => o.orderId === trackedOrderId) || orders[0]) || null;

  const OrdersTabsBar = (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl">
        <button
          type="button"
          onClick={() => {
            if (orderId) navigate('/dashboard/orders');
            else setSearchParams({});
          }}
          className={`px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'orders'
              ? 'bg-[#0B1D3A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          My Orders ({orders.length})
        </button>
        <button
          type="button"
          onClick={() => {
            if (!orderId) setSearchParams({ tab: 'tracking' });
          }}
          className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold transition-colors ${
            activeTab === 'tracking'
              ? 'bg-[#0B1D3A] text-white shadow-xs'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Truck className="h-3.5 w-3.5" />
          <span>Order Tracking</span>
        </button>
      </div>

      {activeTab === 'tracking' && orders.length > 0 && (
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Select Order:</label>
          <select
            value={activeTrackedOrder?.orderId || ''}
            onChange={(e) => {
              const nextId = e.target.value;
              setTrackedOrderId(nextId);
              if (orderId) navigate(`/dashboard/orders/${nextId}`);
            }}
            className="px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono font-semibold bg-white text-[#0B1D3A]"
          >
            {orders.map((o) => (
              <option key={o.orderId} value={o.orderId}>
                {o.orderNumber} · {o.orderStatus}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  return (
    <PortalLayout portal="customer" title="Orders & Tracking">
      {OrdersTabsBar}

      {loading ? (
        <div className="h-64 bg-slate-200 rounded-2xl animate-pulse" />
      ) : activeTab === 'tracking' ? (
        !activeTrackedOrder ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
            <Truck className="h-9 w-9 text-slate-400 mx-auto" />
            <h2 className="font-display font-bold text-lg text-[#0B1D3A]">No Active Orders to Track</h2>
            <p className="text-sm text-slate-600">
              Once you approve your card design and place an order, its 12-stage fulfilment timeline &amp; courier tracking appear here.
            </p>
            <Link
              to="/dashboard/card-design"
              className="mt-2 inline-block px-5 py-2.5 bg-[#0B1D3A] text-white text-sm font-semibold rounded-xl"
            >
              Design My Card
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="text-xs font-mono text-slate-500">{activeTrackedOrder.orderNumber}</div>
                <h2 className="font-display text-xl font-bold text-[#0B1D3A] mt-0.5">
                  {activeTrackedOrder.orderStatus}
                </h2>
                <p className="text-xs text-slate-600 mt-1">
                  Expected delivery within 10–15 days within India · Payment: {activeTrackedOrder.paymentStatus}
                </p>
              </div>
              <div className="text-right font-mono space-y-2">
                <div className="text-lg font-bold text-[#0B1D3A] tabular-nums">₹{activeTrackedOrder.total}</div>
                <div className="text-xs text-slate-500">
                  Qty: {activeTrackedOrder.quantity} · {activeTrackedOrder.cardType}
                </div>
                <button
                  type="button"
                  onClick={() => openOrderDesignPreview(activeTrackedOrder)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-sans font-semibold text-[#0B1D3A]"
                >
                  <Eye className="h-3.5 w-3.5 text-[#1D4ED8]" />
                  <span>Preview Ordered Design</span>
                </button>
              </div>
            </div>

            <FulfilmentTimeline
              currentStatus={activeTrackedOrder.orderStatus}
              courierName={activeTrackedOrder.courierName}
              trackingNumber={activeTrackedOrder.trackingNumber}
              trackingUrl={activeTrackedOrder.trackingUrl}
              dispatchDate={activeTrackedOrder.dispatchDate}
            />

            {activeTrackedOrder.trackingNumber && (
              <div className="bg-white border border-slate-200 rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Truck className="h-5 w-5 text-[#1D4ED8] mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-sm text-[#0B1D3A]">
                      Dispatched via {activeTrackedOrder.courierName}
                    </div>
                    <div className="text-xs font-mono text-slate-600 mt-0.5">
                      Tracking: {activeTrackedOrder.trackingNumber} · Date: {activeTrackedOrder.dispatchDate}
                    </div>
                  </div>
                </div>
                {activeTrackedOrder.trackingUrl && (
                  <a
                    href={activeTrackedOrder.trackingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 bg-[#0B1D3A] text-white text-xs font-semibold rounded-lg"
                  >
                    Track Shipment
                  </a>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-2xl p-6">
              <div className="flex items-center gap-2 text-sm font-bold text-[#0B1D3A]">
                <Lock className="h-4 w-4 text-[#1D4ED8]" />
                <span>Production QR Code Access</span>
              </div>
              {appSettings.allowCustomerQrView && qrRecord?.pngDataUrl ? (
                <div className="mt-4 flex items-center gap-4">
                  <img src={qrRecord.pngDataUrl} alt="Order QR" className="w-28 h-28 border border-slate-200 rounded-lg" />
                  <div className="text-xs text-slate-600">
                    <div>Target URL: {qrRecord.targetUrl}</div>
                    <a
                      href={qrRecord.pngDataUrl}
                      download={`${activeTrackedOrder.orderNumber}-qr.png`}
                      className="mt-2 inline-block px-3 py-1.5 bg-[#0B1D3A] text-white rounded text-xs font-semibold"
                    >
                      Download QR PNG
                    </a>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Your verified QR artwork is securely assigned to our production facility for printing. Raw QR downloads are restricted by administrator policy.
                </p>
              )}
            </div>
          </div>
        )
      ) : orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
          <h2 className="font-display font-bold text-lg text-[#0B1D3A]">No Card Orders Yet</h2>
          <p className="mt-2 text-sm text-slate-600">Design and approve your smart business card to place your first order.</p>
          <Link to="/dashboard/card-design" className="mt-5 inline-block px-5 py-2.5 bg-[#0B1D3A] text-white text-sm font-semibold rounded-xl">
            Design My Card
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
              <tr>
                <th className="py-3 px-4">Order</th>
                <th className="py-3 px-4">Card Type</th>
                <th className="py-3 px-4">Qty</th>
                <th className="py-3 px-4">Total</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.map((ord) => (
                <tr key={ord.orderId} className="hover:bg-slate-50/70">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-[#0B1D3A]">{ord.orderNumber}</td>
                  <td className="py-3 px-4 text-slate-700">{ord.cardType}</td>
                  <td className="py-3 px-4 font-mono tabular-nums">{ord.quantity}</td>
                  <td className="py-3 px-4 font-mono tabular-nums font-semibold">₹{ord.total}</td>
                  <td className="py-3 px-4 text-xs">{ord.paymentStatus}</td>
                  <td className="py-3 px-4 text-xs font-medium text-[#1D4ED8]">{ord.orderStatus}</td>
                  <td className="py-3 px-4 text-right space-x-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openOrderDesignPreview(ord)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:underline"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Preview Design</span>
                    </button>
                    <Link
                      to={`/dashboard/orders/${ord.orderId}`}
                      className="text-xs font-semibold text-[#0B1D3A] hover:underline"
                    >
                      Track →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {previewDesign && (
        <CardDesignPreviewModal
          open={Boolean(previewDesign)}
          onClose={() => setPreviewDesign(null)}
          title={`Ordered Card Design · ${activeTrackedOrder?.orderNumber || ''}`}
          subtitle={`${previewDesign.dimensions} · ${previewDesign.cardOrientation}`}
          frontDesign={previewDesign.frontDesign}
          backDesign={previewDesign.backDesign}
          orientation={previewDesign.cardOrientation}
          personalInfo={previewProfileInfo}
          actualQrPng={previewOrderQr}
        />
      )}
    </PortalLayout>
  );
};

// Shared Account & Support Grouped Header
const CustomerAccountSupportTabs: React.FC<{ active: 'settings' | 'support' }> = ({ active }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4 mb-6 flex gap-1.5 bg-slate-100/70 w-fit">
    <Link
      to="/dashboard/settings"
      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
        active === 'settings' ? 'bg-[#0B1D3A] text-white shadow-xs' : 'text-slate-600 hover:bg-white'
      }`}
    >
      Account Security
    </Link>
    <Link
      to="/dashboard/support"
      className={`px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
        active === 'support' ? 'bg-[#0B1D3A] text-white shadow-xs' : 'text-slate-600 hover:bg-white'
      }`}
    >
      Help &amp; Support Tickets
    </Link>
  </div>
);

// 9. Account Settings & Help Support
export const CustomerSettingsPage: React.FC = () => {
  const { userRecord, requestPasswordReset } = useAuth();
  const { notify } = useToast();

  return (
    <PortalLayout portal="customer" title="Account & Support">
      <CustomerAccountSupportTabs active="settings" />
      <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-2xl space-y-5">
        <div>
          <h2 className="font-display font-bold text-base text-[#0B1D3A]">Account Information</h2>
          <p className="text-xs text-slate-500 mt-1">Manage your login security and verification status.</p>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm border-t border-slate-100 pt-4">
          <div>
            <span className="text-xs text-slate-500 block">Email</span>
            <span className="font-medium text-slate-900">{userRecord?.email}</span>
          </div>
          <div>
            <span className="text-xs text-slate-500 block">Role & Status</span>
            <span className="font-medium text-slate-900">{userRecord?.role} · {userRecord?.status}</span>
          </div>
        </div>
        <div className="pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={async () => {
              if (!userRecord?.email) return;
              await requestPasswordReset(userRecord.email);
              notify('Password reset sent', `Sent reset link to ${userRecord.email}.`, 'success');
            }}
            className="px-4 py-2.5 bg-[#0B1D3A] text-white text-xs font-semibold rounded-lg"
          >
            Send Password Reset Email
          </button>
        </div>
      </div>
    </PortalLayout>
  );
};

export const CustomerSupportPage: React.FC = () => {
  const { userRecord } = useAuth();
  const { notify } = useToast();
  const [tickets, setTickets] = useState<SupportTicketRecord[]>([]);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketRecord['category']>('Order');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadTickets = () => {
    if (!userRecord) return;
    getSupportTickets(userRecord.uid).then(setTickets);
  };

  useEffect(() => {
    loadTickets();
  }, [userRecord]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userRecord) return;
    setSubmitting(true);
    try {
      await createSupportTicket({ uid: userRecord.uid, subject, category, message });
      setSubject('');
      setMessage('');
      loadTickets();
      notify('Support ticket submitted', 'Our team will review your request shortly.', 'success');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PortalLayout portal="customer" title="Account & Support">
      <CustomerAccountSupportTabs active="support" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleCreate} className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-[#0B1D3A]">Open Support or Design Revision Ticket</h2>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportTicketRecord['category'])}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
            >
              <option value="Order">Order Status</option>
              <option value="Design Revision">Post-Purchase Design Revision</option>
              <option value="NFC Help">NFC Compatibility & Tap Help</option>
              <option value="Billing">Payment & Billing</option>
              <option value="General">General Inquiry</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <input
              type="text"
              required
              minLength={3}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Details</label>
            <textarea
              rows={4}
              required
              minLength={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-[#0B1D3A] text-white rounded-xl text-sm font-semibold"
          >
            <Send className="h-4 w-4" />
            <span>{submitting ? 'Submitting...' : 'Submit Ticket'}</span>
          </button>
        </form>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <h2 className="font-display font-bold text-base text-[#0B1D3A]">Your Tickets</h2>
          {tickets.length === 0 ? (
            <p className="text-sm text-slate-500">No support tickets yet.</p>
          ) : (
            <div className="space-y-3">
              {tickets.map((t) => (
                <div key={t.ticketId} className="p-4 rounded-xl border border-slate-200">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>{t.category}</span>
                    <span className="font-semibold text-[#1D4ED8]">{t.status}</span>
                  </div>
                  <div className="font-semibold text-sm text-[#0B1D3A] mt-1">{t.subject}</div>
                  <p className="text-xs text-slate-600 mt-1">{t.message}</p>
                  {t.adminReply && (
                    <div className="mt-2 p-2.5 bg-slate-50 rounded-lg text-xs text-slate-800 border border-slate-200">
                      <strong>Admin Reply:</strong> {t.adminReply}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PortalLayout>
  );
};
