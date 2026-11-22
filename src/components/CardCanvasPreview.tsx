import React, { useEffect, useRef, useState } from 'react';
import { User, Wifi } from 'lucide-react';
import { resolveCardTokens } from '../lib/printPdf';
import type { CardSideDesign, PersonalInformation } from '../types';

export type CardCanvasTarget =
  | { kind: 'text'; id: string }
  | { kind: 'shape'; id: string }
  | { kind: 'logo' }
  | { kind: 'avatar' }
  | { kind: 'qr' }
  | { kind: 'nfc' };

interface CardCanvasPreviewProps {
  side: CardSideDesign;
  orientation: 'landscape' | 'vertical';
  personalInfo: Partial<PersonalInformation>;
  /**
   * CRITICAL BUSINESS RULE:
   * Before purchase: actualQrPng must remain undefined!
   * Only post-payment Printer/Admin views pass the real QR artwork.
   */
  actualQrPng?: string;
  showPrintGuides?: boolean;
  interactive?: boolean;
  selectedTarget?: CardCanvasTarget | null;
  onSelectTarget?: (target: CardCanvasTarget | null) => void;
  onMoveItem?: (target: CardCanvasTarget, xPct: number, yPct: number) => void;
  editingTextId?: string | null;
  onStartEditText?: (id: string | null) => void;
  onUpdateTextValue?: (id: string, nextText: string) => void;
  /**
   * When true, double-clicking a {{TOKEN}} text element pre-fills the inline editor
   * with its resolved profile text so users can edit default text directly.
   */
  editResolvedText?: boolean;
  // Backward-compatible text selection callbacks
  onSelectElement?: (id: string) => void;
  selectedElementId?: string | null;
}

export const CardCanvasPreview: React.FC<CardCanvasPreviewProps> = ({
  side,
  orientation,
  personalInfo,
  actualQrPng,
  showPrintGuides = false,
  interactive = false,
  selectedTarget,
  onSelectTarget,
  onMoveItem,
  editingTextId,
  onStartEditText,
  onUpdateTextValue,
  editResolvedText = false,
  onSelectElement,
  selectedElementId,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<{
    target: CardCanvasTarget;
    startX: number;
    startY: number;
    origXPct: number;
    origYPct: number;
    moved: boolean;
  } | null>(null);
  const [localEditingId, setLocalEditingId] = useState<string | null>(null);
  const [inlineDraft, setInlineDraft] = useState('');
  const inlineInitialShownRef = useRef('');
  const inlineOrigRawRef = useRef('');

  const activeEditingId = editingTextId !== undefined ? editingTextId : localEditingId;

  const setActiveEditing = (id: string | null) => {
    if (onStartEditText) onStartEditText(id);
    else setLocalEditingId(id);
  };

  useEffect(() => {
    if (!activeEditingId) return;
    const found = side.elements.find((e) => e.id === activeEditingId);
    if (found) {
      inlineOrigRawRef.current = found.text;
      const shown = editResolvedText ? resolveCardTokens(found.text, personalInfo) : found.text;
      inlineInitialShownRef.current = shown;
      setInlineDraft(shown);
    }
  }, [activeEditingId]);

  const isVertical = orientation === 'vertical';
  const aspectRatio = isVertical ? '54 / 85.6' : '85.6 / 54';

  const bgStyle: React.CSSProperties = side.gradientTo
    ? { background: `linear-gradient(135deg, ${side.backgroundColor}, ${side.gradientTo})` }
    : { backgroundColor: side.backgroundColor || '#0B1D3A' };

  useEffect(() => {
    if (!dragging || !onMoveItem) return;

    const handleMove = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - dragging.startX, e.clientY - dragging.startY);
      if (!dragging.moved && dist < 4) return;
      const box = containerRef.current?.getBoundingClientRect();
      if (!box || box.width <= 0 || box.height <= 0) return;
      const dxPct = ((e.clientX - dragging.startX) / box.width) * 100;
      const dyPct = ((e.clientY - dragging.startY) / box.height) * 100;
      const minBound = dragging.target.kind === 'shape' ? -25 : 2;
      const maxBound = dragging.target.kind === 'shape' ? 95 : 88;
      const nextX = Math.max(minBound, Math.min(maxBound, Math.round(dragging.origXPct + dxPct)));
      const nextY = Math.max(minBound, Math.min(maxBound, Math.round(dragging.origYPct + dyPct)));
      if (!dragging.moved) {
        setDragging((prev) => (prev ? { ...prev, moved: true } : null));
      }
      onMoveItem(dragging.target, nextX, nextY);
    };

    const handleUp = () => {
      setDragging(null);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragging, onMoveItem]);

  const startDrag = (
    e: React.PointerEvent,
    target: CardCanvasTarget,
    origXPct: number,
    origYPct: number
  ) => {
    e.stopPropagation();
    if (target.kind === 'text') {
      onSelectElement?.(target.id);
    }
    onSelectTarget?.(target);
    if (!interactive || !onMoveItem) return;
    if (target.kind === 'text' && activeEditingId === target.id) return;
    setDragging({
      target,
      startX: e.clientX,
      startY: e.clientY,
      origXPct,
      origYPct,
      moved: false,
    });
  };

  const commitInlineEdit = () => {
    if (!activeEditingId) return;
    const trimmed = inlineDraft.trim();
    if (trimmed && inlineDraft !== inlineInitialShownRef.current && onUpdateTextValue) {
      onUpdateTextValue(activeEditingId, trimmed);
    }
    setActiveEditing(null);
  };

  const isTargetSelected = (t: CardCanvasTarget) => {
    if (selectedTarget) {
      if (t.kind !== selectedTarget.kind) return false;
      if (t.kind === 'text' && selectedTarget.kind === 'text') return t.id === selectedTarget.id;
      if (t.kind === 'shape' && selectedTarget.kind === 'shape') return t.id === selectedTarget.id;
      return true;
    }
    return t.kind === 'text' && selectedElementId === t.id;
  };

  const studioBasePx = isVertical ? 270 : 440;

  return (
    <div className="w-full flex flex-col items-center">
      <div
        ref={containerRef}
        onClick={() => {
          if (activeEditingId) commitInlineEdit();
          onSelectTarget?.(null);
        }}
        className={`relative w-full overflow-hidden rounded-xl shadow-md border border-slate-300 select-none ${
          isVertical ? 'max-w-[270px]' : 'max-w-[440px]'
        }`}
        style={{ aspectRatio, containerType: 'inline-size', ...bgStyle }}
      >
        {/* Fixed Fit-to-Size Background Image (Locked — user cannot drag or resize once applied) */}
        {side.backgroundImageUrl && (
          <img
            src={side.backgroundImageUrl}
            alt="Card background"
            referrerPolicy="no-referrer"
            draggable={false}
            className="pointer-events-none select-none absolute inset-0 w-full h-full object-cover"
          />
        )}

        {/* Print Bleed & Safe Area Proof Guides */}
        {showPrintGuides && (
          <>
            <div
              className="pointer-events-none absolute inset-[3.3%] border border-dashed border-cyan-400/90 rounded-sm"
              title="Trim Line (85.6 x 54 mm)"
            />
            <div
              className="pointer-events-none absolute inset-[7.5%] border border-dashed border-emerald-400/90 rounded-sm"
              title="Safe Margin (4 mm)"
            />
          </>
        )}

        {/* Editable Shape / Accent / Divider Layers (Freely Selectable & Draggable in Studio) */}
        {(side.shapes || []).map((shp) => {
          const isSelected = isTargetSelected({ kind: 'shape', id: shp.id });
          const shapeBg: React.CSSProperties =
            shp.color === 'transparent'
              ? { backgroundColor: 'transparent' }
              : shp.gradientTo
              ? { background: `linear-gradient(135deg, ${shp.color}, ${shp.gradientTo})` }
              : { backgroundColor: shp.color };
          const radius =
            shp.kind === 'circle' || shp.kind === 'pill'
              ? '9999px'
              : shp.borderRadiusPx !== undefined
              ? `${shp.borderRadiusPx}px`
              : '0px';

          return (
            <button
              key={shp.id}
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => startDrag(e, { kind: 'shape', id: shp.id }, shp.xPct, shp.yPct)}
              style={{
                left: `${shp.xPct}%`,
                top: `${shp.yPct}%`,
                width: `${shp.widthPct}%`,
                height: `${Math.max(0.8, shp.heightPct)}%`,
                borderRadius: radius,
                opacity: shp.opacity ?? 1,
                border: shp.borderWidthPx ? `${shp.borderWidthPx}px solid ${shp.borderColor || '#FFFFFF'}` : undefined,
                transform: shp.rotationDeg ? `rotate(${shp.rotationDeg}deg)` : undefined,
                ...shapeBg,
              }}
              className={`absolute transition-shadow ${
                interactive ? 'cursor-move touch-none hover:ring-1 hover:ring-cyan-400' : 'pointer-events-none'
              } ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}
              title={interactive ? 'Click to edit shape · Drag to move' : undefined}
            />
          );
        })}

        {/* Company Logo (Freely Draggable in Studio) */}
        {side.logoDataUrl && (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => startDrag(e, { kind: 'logo' }, side.logoX, side.logoY)}
            style={{
              left: `${side.logoX}%`,
              top: `${side.logoY}%`,
              width: `${Math.max(10, Math.min(40, (side.logoWidthMm || 14) * 1.15))}%`,
            }}
            className={`absolute p-0.5 rounded transition-shadow ${
              interactive ? 'cursor-move touch-none hover:ring-1 hover:ring-cyan-400' : 'cursor-default pointer-events-none'
            } ${isTargetSelected({ kind: 'logo' }) ? 'ring-2 ring-cyan-400' : ''}`}
            title={interactive ? 'Drag to move Logo' : undefined}
          >
            <img
              src={side.logoDataUrl}
              alt="Company logo"
              draggable={false}
              className="w-full h-auto max-h-20 object-contain pointer-events-none"
            />
          </button>
        )}

        {/* Profile Photo / Avatar (Freely Draggable in Studio, supports Circle / Rounded / Square) */}
        {side.showAvatar && (() => {
          const resolvedPhoto = side.avatarDataUrl || personalInfo.photoDataUrl;
          const shapeClass =
            side.avatarShape === 'rounded'
              ? 'rounded-2xl'
              : side.avatarShape === 'square'
              ? 'rounded-md'
              : 'rounded-full';
          return (
            <button
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => startDrag(e, { kind: 'avatar' }, side.avatarX, side.avatarY)}
              style={{
                left: `${side.avatarX}%`,
                top: `${side.avatarY}%`,
                width: `${Math.max(10, Math.min(34, (side.avatarSizeMm || 13) * 1.15))}%`,
                aspectRatio: '1 / 1',
              }}
              className={`absolute ${shapeClass} overflow-hidden border-2 border-white/80 shadow-xs flex items-center justify-center bg-slate-200 ${
                interactive ? 'cursor-move touch-none hover:ring-2 hover:ring-cyan-400' : 'cursor-default pointer-events-none'
              } ${isTargetSelected({ kind: 'avatar' }) ? 'ring-2 ring-cyan-400' : ''}`}
              title={interactive ? 'Drag to move Photo · Click to upload/crop/resize' : undefined}
            >
              {resolvedPhoto ? (
                <img
                  src={resolvedPhoto}
                  alt="Profile avatar"
                  draggable={false}
                  className="w-full h-full object-cover pointer-events-none"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 text-slate-500 flex flex-col items-center justify-center gap-0.5 pointer-events-none">
                  <User className="w-1/2 h-1/2 opacity-70" />
                  <span
                    className="font-semibold uppercase tracking-wider leading-none opacity-80"
                    style={{ fontSize: `${(7.5 / studioBasePx) * 100}cqw` }}
                  >
                    Photo
                  </span>
                </div>
              )}
            </button>
          );
        })()}

        {/* NFC Contactless Symbol (Freely Draggable & Resizable in Studio) */}
        {side.showNfcIcon && (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) =>
              startDrag(e, { kind: 'nfc' }, side.nfcX ?? 88, side.nfcY ?? 10)
            }
            style={{
              left: `${side.nfcX ?? 88}%`,
              top: `${side.nfcY ?? 10}%`,
              color: side.nfcIconColor || '#38BDF8',
            }}
            className={`absolute p-1 rounded rotate-90 transition-shadow ${
              interactive
                ? 'cursor-move touch-none hover:ring-1 hover:ring-cyan-400'
                : 'pointer-events-none'
            } ${isTargetSelected({ kind: 'nfc' }) ? 'ring-2 ring-cyan-400 bg-slate-900/20' : ''}`}
            aria-label="NFC enabled card"
            title={interactive ? 'Drag to move NFC icon' : undefined}
          >
            <Wifi
              className="pointer-events-none"
              style={{
                width: `${(((side.nfcSizeMm || 6) * 3.2) / studioBasePx) * 100}cqw`,
                height: `${(((side.nfcSizeMm || 6) * 3.2) / studioBasePx) * 100}cqw`,
              }}
            />
          </button>
        )}

        {/* Editable Text Elements (Freely Draggable + Double-Click Inline Edit + Bold/Italic/Underline) */}
        {side.elements.map((el) => {
          const isSelected = isTargetSelected({ kind: 'text', id: el.id });
          const isEditing = interactive && activeEditingId === el.id && Boolean(onUpdateTextValue);
          const studioFontPx = Math.max(9, Math.round(el.fontSizePt * 1.35));
          const fontCqw = ((studioFontPx / studioBasePx) * 100).toFixed(3);

          if (isEditing) {
            return (
              <input
                key={el.id}
                type="text"
                autoFocus
                value={inlineDraft}
                onChange={(e) => {
                  const val = e.target.value;
                  setInlineDraft(val);
                  if (val !== inlineInitialShownRef.current && val.trim().length > 0) {
                    onUpdateTextValue?.(el.id, val);
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onBlur={commitInlineEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitInlineEdit();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    if (inlineOrigRawRef.current) {
                      onUpdateTextValue?.(el.id, inlineOrigRawRef.current);
                    }
                    setActiveEditing(null);
                  }
                }}
                style={{
                  left: `${el.xPct}%`,
                  top: `${el.yPct}%`,
                  color: el.color,
                  fontFamily: el.fontFamily,
                  fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                  fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
                  textDecoration: el.textDecoration === 'underline' ? 'underline' : 'none',
                  fontSize: `${fontCqw}cqw`,
                  textAlign: el.align,
                }}
                className="absolute z-30 min-w-[35%] max-w-[84%] px-1.5 py-0.5 rounded border-2 border-cyan-400 bg-slate-950/75 outline-none shadow-md leading-tight"
              />
            );
          }

          const renderedText = resolveCardTokens(el.text, personalInfo);

          return (
            <button
              key={el.id}
              type="button"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => startDrag(e, { kind: 'text', id: el.id }, el.xPct, el.yPct)}
              onDoubleClick={(e) => {
                if (!interactive || !onUpdateTextValue) return;
                e.stopPropagation();
                setDragging(null);
                inlineOrigRawRef.current = el.text;
                const shown = editResolvedText ? renderedText : el.text;
                inlineInitialShownRef.current = shown;
                setInlineDraft(shown);
                setActiveEditing(el.id);
              }}
              style={{
                left: `${el.xPct}%`,
                top: `${el.yPct}%`,
                maxWidth: `${Math.max(15, Math.min(95, el.maxWidthPct || 82))}%`,
                color: el.color,
                fontFamily: el.fontFamily,
                fontWeight: el.fontWeight === 'bold' ? 700 : 400,
                fontStyle: el.fontStyle === 'italic' ? 'italic' : 'normal',
                textDecoration: el.textDecoration === 'underline' ? 'underline' : 'none',
                fontSize: `${fontCqw}cqw`,
                textAlign: el.align,
              }}
              className={`absolute truncate leading-tight transition-shadow ${
                interactive || onSelectElement || onSelectTarget
                  ? 'cursor-move touch-none hover:ring-1 hover:ring-cyan-400 rounded px-0.5'
                  : 'cursor-default'
              } ${isSelected ? 'ring-2 ring-cyan-400 bg-slate-900/15 rounded px-0.5' : ''}`}
              title={interactive ? 'Click to select · Drag to move · Double-click to edit text' : undefined}
            >
              {renderedText || (interactive ? <span className="opacity-50 italic">Empty text</span> : '')}
            </button>
          );
        })}

        {/* QR Code Area: Non-Scannable Placeholder Pre-Purchase, Freely Movable in Studio */}
        {side.showQrSlot && (
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => startDrag(e, { kind: 'qr' }, side.qrSlotX, side.qrSlotY)}
            style={{
              left: `${side.qrSlotX}%`,
              top: `${side.qrSlotY}%`,
              width: `${Math.max(16, Math.min(38, side.qrSizeMm * 1.15))}%`,
              aspectRatio: '1 / 1',
            }}
            className={`absolute bg-white rounded-md p-1.5 flex items-center justify-center shadow-xs border border-slate-200 ${
              interactive ? 'cursor-move touch-none hover:ring-2 hover:ring-cyan-400' : 'cursor-default'
            } ${isTargetSelected({ kind: 'qr' }) ? 'ring-2 ring-cyan-400' : ''}`}
            title={interactive ? 'Drag to adjust QR Code position' : undefined}
          >
            {actualQrPng ? (
              <img
                src={actualQrPng}
                alt="Verified QR code"
                draggable={false}
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="w-full h-full border-2 border-dashed border-[#0B1D3A]/40 rounded flex flex-col items-center justify-center bg-slate-50 text-[#0B1D3A] p-1 pointer-events-none">
                <div
                  className="grid grid-cols-3 gap-0.5 opacity-40 mb-0.5"
                  style={{
                    width: `${(20 / studioBasePx) * 100}cqw`,
                    height: `${(20 / studioBasePx) * 100}cqw`,
                  }}
                >
                  <span className="bg-[#0B1D3A] rounded-[1px]" />
                  <span className="bg-transparent border border-[#0B1D3A]" />
                  <span className="bg-[#0B1D3A] rounded-[1px]" />
                  <span className="bg-transparent border border-[#0B1D3A]" />
                  <span className="bg-[#0B1D3A] rounded-[1px]" />
                  <span className="bg-transparent border border-[#0B1D3A]" />
                  <span className="bg-[#0B1D3A] rounded-[1px]" />
                  <span className="bg-[#0B1D3A] rounded-[1px]" />
                  <span className="bg-transparent border border-[#0B1D3A]" />
                </div>
                <span
                  className="font-mono font-bold tracking-wider uppercase leading-none"
                  style={{ fontSize: `${(8 / studioBasePx) * 100}cqw` }}
                >
                  QR CODE
                </span>
              </div>
            )}
          </button>
        )}
      </div>

      {showPrintGuides && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono text-slate-500">
          <span>Trim: {isVertical ? '54.0 × 85.6 mm' : '85.6 × 54.0 mm'}</span>
          <span>·</span>
          <span className="text-cyan-700">Bleed: 3.0 mm</span>
          <span>·</span>
          <span className="text-emerald-700">Safe: 4.0 mm</span>
        </div>
      )}
    </div>
  );
};
