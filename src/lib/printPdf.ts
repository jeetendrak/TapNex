import { jsPDF } from 'jspdf';
import {
  CARD_BLEED_MM,
  CARD_SAFE_MARGIN_MM,
  CARD_TRIM_LANDSCAPE_MM,
  CARD_TRIM_VERTICAL_MM,
  PRINT_DPI,
  getElementBoxMetrics,
  getFontWidthRatio,
  getStudioBaseWidthPx,
  wrapCanvasTextLines,
} from './cardLayout';
import { stripHtmlToPlainText } from './richText';
import type { CardDesignRecord, CardSideDesign, PersonalInformation } from '../types';

export {
  CARD_BLEED_MM,
  CARD_SAFE_MARGIN_MM,
  CARD_TRIM_LANDSCAPE_MM,
  CARD_TRIM_VERTICAL_MM,
  PRINT_DPI,
};

export function mmToPx300Dpi(mm: number): number {
  return Math.round((mm / 25.4) * PRINT_DPI);
}

export function resolveCardTokens(text: string, info: Partial<PersonalInformation>): string {
  const cityState = [info.city, info.state].filter(Boolean).join(', ');
  const fullAddress = [info.businessAddress, info.city, info.state, info.pinCode].filter(Boolean).join(', ');
  const plainBio = stripHtmlToPlainText(info.shortBio);
  return text
    .replace(/\{\{FULL_NAME\}\}/g, info.fullName || 'Your Name')
    .replace(/\{\{JOB_TITLE\}\}/g, info.jobTitle || 'Your Designation')
    .replace(/\{\{COMPANY\}\}/g, info.companyName || 'Your Company Name')
    .replace(/\{\{BUSINESS_CATEGORY\}\}/g, info.businessCategory || 'Your Business Category')
    .replace(/\{\{SHORT_BIO\}\}/g, plainBio || 'Your Short Bio')
    .replace(/\{\{MOBILE\}\}/g, info.mobile || 'Your Number')
    .replace(/\{\{ALTERNATE_MOBILE\}\}/g, info.alternateMobile || 'Your Alternate Number')
    .replace(/\{\{WHATSAPP\}\}/g, info.whatsapp || info.mobile || 'Your WhatsApp Number')
    .replace(/\{\{EMAIL\}\}/g, info.email || 'Your Email ID')
    .replace(/\{\{ALTERNATE_EMAIL\}\}/g, info.alternateEmail || 'Your Alternate Email ID')
    .replace(/\{\{WEBSITE\}\}/g, info.website || 'Your Website')
    .replace(/\{\{CITY_STATE\}\}/g, cityState || 'Your City, State')
    .replace(/\{\{ADDRESS\}\}/g, fullAddress || 'Your Business Address')
    .replace(/\{\{PERSONAL_ADDRESS\}\}/g, info.personalAddress || 'Your Personal Address');
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
  const studioBasePx = getStudioBaseWidthPx(params.orientation);
  const scaleFactor = trimPxW / studioBasePx;

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

  // 2a. Optional Card Outer Border along trim bounds
  if (params.side.showBorder) {
    const bwPx = Math.max(2, Math.round((params.side.borderWidthPx ?? 2) * scaleFactor));
    ctx.save();
    ctx.strokeStyle = params.side.borderColor || '#D4AF37';
    ctx.lineWidth = bwPx;
    ctx.strokeRect(
      bleedPx + bwPx / 2,
      bleedPx + bwPx / 2,
      trimPxW - bwPx,
      trimPxH - bwPx
    );
    ctx.restore();
  }

  // 2b. Editable Shape & Accent Elements (positioned relative to trim area)
  for (const shp of params.side.shapes || []) {
    const sx = bleedPx + (shp.xPct / 100) * trimPxW;
    const sy = bleedPx + (shp.yPct / 100) * trimPxH;
    const sw = (shp.widthPct / 100) * trimPxW;
    const sh = Math.max(2, (shp.heightPct / 100) * trimPxH);
    ctx.save();
    ctx.globalAlpha = shp.opacity ?? 1;
    if (shp.rotationDeg) {
      const cx = sx + sw / 2;
      const cy = sy + sh / 2;
      ctx.translate(cx, cy);
      ctx.rotate((shp.rotationDeg * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    ctx.beginPath();
    if (shp.kind === 'circle') {
      ctx.ellipse(sx + sw / 2, sy + sh / 2, sw / 2, sh / 2, 0, 0, Math.PI * 2);
    } else if (shp.kind === 'pill') {
      const r = Math.min(sw, sh) / 2;
      ctx.roundRect(sx, sy, sw, sh, r);
    } else if (shp.borderRadiusPx && shp.borderRadiusPx > 0) {
      const r = Math.min(sw / 2, sh / 2, shp.borderRadiusPx * scaleFactor);
      ctx.roundRect(sx, sy, sw, sh, r);
    } else {
      ctx.rect(sx, sy, sw, sh);
    }

    if (shp.color && shp.color !== 'transparent') {
      if (shp.gradientTo) {
        const g = ctx.createLinearGradient(sx, sy, sx + sw, sy + sh);
        g.addColorStop(0, shp.color);
        g.addColorStop(1, shp.gradientTo);
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = shp.color;
      }
      ctx.fill();
    }

    if (shp.borderWidthPx && shp.borderWidthPx > 0) {
      ctx.strokeStyle = shp.borderColor || '#FFFFFF';
      ctx.lineWidth = Math.max(2, shp.borderWidthPx * scaleFactor);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 3. Logo (positioned relative to trim area, transparent PNG preserved)
  if (params.side.logoDataUrl) {
    const logoImg = await loadImage(params.side.logoDataUrl);
    if (logoImg) {
      const lx = bleedPx + (params.side.logoX / 100) * trimPxW;
      const ly = bleedPx + (params.side.logoY / 100) * trimPxH;
      const lw = mmToPx300Dpi(params.side.logoWidthMm || 14);
      const lh = (logoImg.height / Math.max(1, logoImg.width)) * lw;
      ctx.drawImage(logoImg, lx, ly, lw, lh);
    }
  }

  // 4. Optional Avatar Photo (object-cover center-crop + transparent PNG + optional border)
  if (params.side.showAvatar && params.side.avatarDataUrl) {
    const avImg = await loadImage(params.side.avatarDataUrl);
    if (avImg) {
      const ax = bleedPx + (params.side.avatarX / 100) * trimPxW;
      const ay = bleedPx + (params.side.avatarY / 100) * trimPxH;
      const size = mmToPx300Dpi(params.side.avatarSizeMm || 13);
      const shape = params.side.avatarShape || 'circle';

      const traceAvatarPath = () => {
        ctx.beginPath();
        if (shape === 'circle') {
          ctx.arc(ax + size / 2, ay + size / 2, size / 2, 0, Math.PI * 2);
        } else if (shape === 'rounded') {
          ctx.roundRect(ax, ay, size, size, size * 0.18);
        } else {
          ctx.rect(ax, ay, size, size);
        }
      };

      ctx.save();
      traceAvatarPath();
      ctx.clip();

      const coverScale = Math.max(size / Math.max(1, avImg.width), size / Math.max(1, avImg.height));
      const drawW = avImg.width * coverScale;
      const drawH = avImg.height * coverScale;
      const dx = ax + (size - drawW) / 2;
      const dy = ay + (size - drawH) / 2;
      ctx.drawImage(avImg, dx, dy, drawW, drawH);
      ctx.restore();

      if (params.side.showAvatarBorder) {
        ctx.save();
        traceAvatarPath();
        ctx.strokeStyle = params.side.avatarBorderColor || '#FFFFFF';
        ctx.lineWidth = Math.max(3, Math.round(2 * scaleFactor));
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // 5. SMART Contactless Mark (customizable position & scale inside trim area)
  if (params.side.showNfcIcon) {
    const cx =
      params.side.nfcX !== undefined
        ? bleedPx + (params.side.nfcX / 100) * trimPxW
        : bleedPx + trimPxW - mmToPx300Dpi(8);
    const cy =
      params.side.nfcY !== undefined
        ? bleedPx + (params.side.nfcY / 100) * trimPxH
        : bleedPx + mmToPx300Dpi(8);
    const iconBoxPx = (params.side.nfcSizeMm || 6) * 3.2 * scaleFactor;
    const centerX = cx + iconBoxPx * 0.5;
    const centerY = cy + iconBoxPx * 0.6;
    ctx.save();
    ctx.strokeStyle = params.side.nfcIconColor || '#38BDF8';
    ctx.lineWidth = Math.max(2, Math.round(iconBoxPx * 0.095));
    ctx.lineCap = 'round';
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, iconBoxPx * 0.17 * i, -Math.PI * 0.35, Math.PI * 0.35);
      ctx.stroke();
    }
    ctx.restore();
  }

  // 6. Text Elements (1:1 box wrapping, alignment anchoring, and font scaling)
  for (const el of params.side.elements) {
    const resolved = resolveCardTokens(el.text, params.info);
    const box = getElementBoxMetrics(el);
    const fontPx = Math.round(getFontWidthRatio(el.fontSizePt, params.orientation) * trimPxW);
    const style = el.fontStyle === 'italic' ? 'italic ' : '';
    ctx.font = `${style}${el.fontWeight === 'bold' ? '700' : '400'} ${fontPx}px ${el.fontFamily || '"Plus Jakarta Sans", sans-serif'}`;
    ctx.fillStyle = el.color || '#FFFFFF';
    ctx.textAlign = el.align || 'left';
    ctx.textBaseline = 'top';

    const boxLeft = bleedPx + (box.leftPct / 100) * trimPxW;
    const boxTop = bleedPx + (box.topPct / 100) * trimPxH;
    const maxW = (box.widthPct / 100) * trimPxW;
    const tx = el.align === 'center' ? boxLeft + maxW / 2 : el.align === 'right' ? boxLeft + maxW : boxLeft;

    const wrappedLines = wrapCanvasTextLines((line) => ctx.measureText(line).width, resolved, maxW);
    const lineHeightPx = fontPx * 1.25;

    wrappedLines.forEach((line, idx) => {
      const ly = boxTop + idx * lineHeightPx;
      ctx.fillText(line, tx, ly);
      if (el.textDecoration === 'underline' && line.length > 0) {
        const metrics = ctx.measureText(line);
        const lineW = Math.min(metrics.width, maxW);
        const startX = el.align === 'center' ? tx - lineW / 2 : el.align === 'right' ? tx - lineW : tx;
        ctx.strokeStyle = el.color || '#FFFFFF';
        ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
        ctx.beginPath();
        ctx.moveTo(startX, ly + fontPx * 1.06);
        ctx.lineTo(startX + lineW, ly + fontPx * 1.06);
        ctx.stroke();
      }
    });
  }

  // 7. Actual QR Code (ONLY rendered in print pipeline when verified QR PNG is passed!)
  if (params.side.showQrSlot && params.qrPngDataUrl) {
    const qrImg = await loadImage(params.qrPngDataUrl);
    if (qrImg) {
      const qx = bleedPx + (params.side.qrSlotX / 100) * trimPxW;
      const qy = bleedPx + (params.side.qrSlotY / 100) * trimPxH;
      const qSize = mmToPx300Dpi(params.side.qrSizeMm || 17);
      // White quiet zone backing
      ctx.fillStyle = '#FFFFFF';
      const pad = Math.max(2, Math.round(scaleFactor * 3));
      ctx.fillRect(qx, qy, qSize, qSize);
      ctx.drawImage(qrImg, qx + pad, qy + pad, Math.max(4, qSize - pad * 2), Math.max(4, qSize - pad * 2));
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
