import { jsPDF } from 'jspdf';
import type { CardDesignRecord, CardSideDesign, PersonalInformation } from '../types';

export const CARD_TRIM_LANDSCAPE_MM = { width: 85.6, height: 54.0 };
export const CARD_TRIM_VERTICAL_MM = { width: 54.0, height: 85.6 };
export const CARD_BLEED_MM = 3.0;
export const CARD_SAFE_MARGIN_MM = 4.0;
export const PRINT_DPI = 300;

export function mmToPx300Dpi(mm: number): number {
  return Math.round((mm / 25.4) * PRINT_DPI);
}

export function resolveCardTokens(text: string, info: Partial<PersonalInformation>): string {
  const cityState = [info.city, info.state].filter(Boolean).join(', ');
  const fullAddress = [info.businessAddress, info.city, info.state, info.pinCode].filter(Boolean).join(', ');
  return text
    .replace(/\{\{FULL_NAME\}\}/g, info.fullName || 'Your Name')
    .replace(/\{\{JOB_TITLE\}\}/g, info.jobTitle || 'Designation')
    .replace(/\{\{COMPANY\}\}/g, info.companyName || 'Company Name')
    .replace(/\{\{BUSINESS_CATEGORY\}\}/g, info.businessCategory || 'Business Category')
    .replace(/\{\{SHORT_BIO\}\}/g, info.shortBio || 'Short Biography')
    .replace(/\{\{MOBILE\}\}/g, info.mobile || '+91 98765 43210')
    .replace(/\{\{ALTERNATE_MOBILE\}\}/g, info.alternateMobile || '+91 98765 00000')
    .replace(/\{\{WHATSAPP\}\}/g, info.whatsapp || info.mobile || '+91 98765 43210')
    .replace(/\{\{EMAIL\}\}/g, info.email || 'name@company.com')
    .replace(/\{\{ALTERNATE_EMAIL\}\}/g, info.alternateEmail || 'alt@company.com')
    .replace(/\{\{WEBSITE\}\}/g, info.website || 'www.company.com')
    .replace(/\{\{CITY_STATE\}\}/g, cityState || 'City, State')
    .replace(/\{\{ADDRESS\}\}/g, fullAddress || 'Business Address')
    .replace(/\{\{PERSONAL_ADDRESS\}\}/g, info.personalAddress || 'Personal Address');
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

async function renderCardSideToCanvas(params: {
  side: CardSideDesign;
  orientation: 'landscape' | 'vertical';
  info: Partial<PersonalInformation>;
  qrPngDataUrl?: string;
  includeProofGuides?: boolean;
}): Promise<HTMLCanvasElement> {
  const trim = params.orientation === 'vertical' ? CARD_TRIM_VERTICAL_MM : CARD_TRIM_LANDSCAPE_MM;
  const fullW = trim.width + CARD_BLEED_MM * 2;
  const fullH = trim.height + CARD_BLEED_MM * 2;

  const pxW = mmToPx300Dpi(fullW);
  const pxH = mmToPx300Dpi(fullH);
  const bleedPx = mmToPx300Dpi(CARD_BLEED_MM);
  const trimPxW = mmToPx300Dpi(trim.width);
  const trimPxH = mmToPx300Dpi(trim.height);

  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d')!;

  // 1. Background fill extending across full 3mm bleed
  if (params.side.gradientTo) {
    const grad = ctx.createLinearGradient(0, 0, pxW, pxH);
    grad.addColorStop(0, params.side.backgroundColor);
    grad.addColorStop(1, params.side.gradientTo);
    ctx.fillStyle = grad;
  } else {
    ctx.fillStyle = params.side.backgroundColor || '#0B1D3A';
  }
  ctx.fillRect(0, 0, pxW, pxH);

  // 2. Optional Background Image
  if (params.side.backgroundImageUrl) {
    const bgImg = await loadImage(params.side.backgroundImageUrl);
    if (bgImg) {
      const scale = Math.max(pxW / bgImg.width, pxH / bgImg.height);
      const drawW = bgImg.width * scale;
      const drawH = bgImg.height * scale;
      ctx.drawImage(bgImg, (pxW - drawW) / 2, (pxH - drawH) / 2, drawW, drawH);
    }
  }

  // 3. Logo (positioned relative to trim area)
  if (params.side.logoDataUrl) {
    const logoImg = await loadImage(params.side.logoDataUrl);
    if (logoImg) {
      const lx = bleedPx + (params.side.logoX / 100) * trimPxW;
      const ly = bleedPx + (params.side.logoY / 100) * trimPxH;
      const lw = mmToPx300Dpi(params.side.logoWidthMm || 14);
      const lh = (logoImg.height / logoImg.width) * lw;
      ctx.drawImage(logoImg, lx, ly, lw, lh);
    }
  }

  // 4. Optional Avatar Photo
  if (params.side.showAvatar && params.side.avatarDataUrl) {
    const avImg = await loadImage(params.side.avatarDataUrl);
    if (avImg) {
      const ax = bleedPx + (params.side.avatarX / 100) * trimPxW;
      const ay = bleedPx + (params.side.avatarY / 100) * trimPxH;
      const size = mmToPx300Dpi(params.side.avatarSizeMm || 13);
      ctx.save();
      ctx.beginPath();
      ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avImg, ax, ay, size, size);
      ctx.restore();
    }
  }

  // 5. NFC Contactless Mark (top-right inside safe area)
  if (params.side.showNfcIcon) {
    const cx = bleedPx + trimPxW - mmToPx300Dpi(8);
    const cy = bleedPx + mmToPx300Dpi(8);
    ctx.strokeStyle = params.side.nfcIconColor || '#38BDF8';
    ctx.lineWidth = Math.max(2, mmToPx300Dpi(0.45));
    ctx.lineCap = 'round';
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, mmToPx300Dpi(1.5 * i), -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
    }
  }

  // 6. Text Elements
  for (const el of params.side.elements) {
    const resolved = resolveCardTokens(el.text, params.info);
    const fontPx = Math.round((el.fontSizePt / 72) * PRINT_DPI);
    const style = el.fontStyle === 'italic' ? 'italic ' : '';
    ctx.font = `${style}${el.fontWeight === 'bold' ? '700' : '400'} ${fontPx}px ${el.fontFamily || '"Plus Jakarta Sans", sans-serif'}`;
    ctx.fillStyle = el.color || '#FFFFFF';
    ctx.textAlign = el.align || 'left';
    ctx.textBaseline = 'top';
    const tx = bleedPx + (el.xPct / 100) * trimPxW;
    const ty = bleedPx + (el.yPct / 100) * trimPxH;
    ctx.fillText(resolved, tx, ty, trimPxW * 0.84);
    if (el.textDecoration === 'underline') {
      const metrics = ctx.measureText(resolved);
      const lineW = Math.min(metrics.width, trimPxW * 0.84);
      const startX = el.align === 'center' ? tx - lineW / 2 : el.align === 'right' ? tx - lineW : tx;
      ctx.strokeStyle = el.color || '#FFFFFF';
      ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
      ctx.beginPath();
      ctx.moveTo(startX, ty + fontPx * 1.08);
      ctx.lineTo(startX + lineW, ty + fontPx * 1.08);
      ctx.stroke();
    }
  }

  // 7. Actual QR Code (ONLY rendered in print pipeline when verified QR PNG is passed!)
  if (params.side.showQrSlot && params.qrPngDataUrl) {
    const qrImg = await loadImage(params.qrPngDataUrl);
    if (qrImg) {
      const qx = bleedPx + (params.side.qrSlotX / 100) * trimPxW;
      const qy = bleedPx + (params.side.qrSlotY / 100) * trimPxH;
      const qSize = mmToPx300Dpi(params.side.qrSizeMm || 20);
      // White quiet zone backing
      ctx.fillStyle = '#FFFFFF';
      const pad = mmToPx300Dpi(1);
      ctx.fillRect(qx - pad, qy - pad, qSize + pad * 2, qSize + pad * 2);
      ctx.drawImage(qrImg, qx, qy, qSize, qSize);
    }
  }

  // 8. Optional Proof Guides (Trim + Safe Area)
  if (params.includeProofGuides) {
    const safePx = mmToPx300Dpi(CARD_SAFE_MARGIN_MM);
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#06B6D4';
    ctx.strokeRect(bleedPx, bleedPx, trimPxW, trimPxH);
    ctx.strokeStyle = '#22C55E';
    ctx.strokeRect(bleedPx + safePx, bleedPx + safePx, trimPxW - safePx * 2, trimPxH - safePx * 2);
    ctx.restore();
  }

  return canvas;
}

function drawCropMarks(pdf: jsPDF, trimW: number, trimH: number, bleed: number) {
  pdf.setDrawColor(0, 0, 0);
  pdf.setLineWidth(0.15);
  const len = 2.2;
  // Top-left
  pdf.line(bleed, 0.3, bleed, len);
  pdf.line(0.3, bleed, len, bleed);
  // Top-right
  pdf.line(bleed + trimW, 0.3, bleed + trimW, len);
  pdf.line(bleed * 2 + trimW - 0.3, bleed, bleed * 2 + trimW - len, bleed);
  // Bottom-left
  pdf.line(bleed, bleed * 2 + trimH - 0.3, bleed, bleed * 2 + trimH - len);
  pdf.line(0.3, bleed + trimH, len, bleed + trimH);
  // Bottom-right
  pdf.line(bleed + trimW, bleed * 2 + trimH - 0.3, bleed + trimW, bleed * 2 + trimH - len);
  pdf.line(bleed * 2 + trimW - 0.3, bleed + trimH, bleed * 2 + trimW - len, bleed + trimH);
}

export async function generatePrintReadyPdfBlob(params: {
  design: CardDesignRecord;
  info: Partial<PersonalInformation>;
  qrPngDataUrl: string;
  includeProofGuides?: boolean;
}): Promise<{ blob: Blob; filename: string; specs: { trimMm: string; bleedMm: string; dpi: number } }> {
  if (!params.qrPngDataUrl) {
    throw new Error('Cannot generate print-ready PDF without a verified post-payment QR code.');
  }

  const isVertical = params.design.cardOrientation === 'vertical';
  const trim = isVertical ? CARD_TRIM_VERTICAL_MM : CARD_TRIM_LANDSCAPE_MM;
  const pageW = +(trim.width + CARD_BLEED_MM * 2).toFixed(2);
  const pageH = +(trim.height + CARD_BLEED_MM * 2).toFixed(2);

  const frontCanvas = await renderCardSideToCanvas({
    side: params.design.frontDesign,
    orientation: params.design.cardOrientation,
    info: params.info,
    qrPngDataUrl: params.design.frontDesign.showQrSlot ? params.qrPngDataUrl : undefined,
    includeProofGuides: params.includeProofGuides,
  });

  const backCanvas = await renderCardSideToCanvas({
    side: params.design.backDesign,
    orientation: params.design.cardOrientation,
    info: params.info,
    qrPngDataUrl: params.design.backDesign.showQrSlot ? params.qrPngDataUrl : undefined,
    includeProofGuides: params.includeProofGuides,
  });

  const pdf = new jsPDF({
    orientation: isVertical ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [pageW, pageH],
    compress: true,
  });

  // Page 1: Front
  pdf.addImage(frontCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  drawCropMarks(pdf, trim.width, trim.height, CARD_BLEED_MM);

  // Page 2: Back
  pdf.addPage([pageW, pageH], isVertical ? 'portrait' : 'landscape');
  pdf.addImage(backCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageW, pageH, undefined, 'FAST');
  drawCropMarks(pdf, trim.width, trim.height, CARD_BLEED_MM);

  const blob = pdf.output('blob');
  return {
    blob,
    filename: `tapnex-print-300dpi-${params.design.designId.slice(0, 8)}.pdf`,
    specs: {
      trimMm: `${trim.width} x ${trim.height} mm`,
      bleedMm: `${CARD_BLEED_MM} mm`,
      dpi: PRINT_DPI,
    },
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
