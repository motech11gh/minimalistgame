import React, { useRef, useState } from 'react';
import { VirtualTouchInputState, WallType, WALL_BLUEPRINTS } from '../game/types';

interface TouchControlsOverlayProps {
  touchInputRef: React.MutableRefObject<VirtualTouchInputState>;
  selectedWallType: WallType;
  onSelectWallType: (type: WallType) => void;
}

export const TouchControlsOverlay: React.FC<TouchControlsOverlayProps> = ({
  touchInputRef,
  selectedWallType,
  onSelectWallType,
}) => {
  const stickZoneRef = useRef<HTMLDivElement | null>(null);
  const [stickOffset, setStickOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [adsActive, setAdsActive] = useState(false);
  const [firingVisual, setFiringVisual] = useState(false);

  const activeStickPointerId = useRef<number | null>(null);
  const activeLookPointerId = useRef<number | null>(null);
  const lastLookPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const MAX_STICK_RADIUS = 44;

  const updateStickFromPointer = (clientX: number, clientY: number) => {
    const el = stickZoneRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const centerX = rect.left + rect.width * 0.5;
    const centerY = rect.top + rect.height * 0.5;
    let dx = clientX - centerX;
    let dy = clientY - centerY;
    const dist = Math.hypot(dx, dy);
    if (dist > MAX_STICK_RADIUS) {
      dx = (dx / dist) * MAX_STICK_RADIUS;
      dy = (dy / dist) * MAX_STICK_RADIUS;
    }
    setStickOffset({ x: dx, y: dy });

    const normX = dx / MAX_STICK_RADIUS;
    const normY = -dy / MAX_STICK_RADIUS; // Up is positive forward
    touchInputRef.current.moveX = normX;
    touchInputRef.current.moveY = normY;
    touchInputRef.current.sprintHeld = Math.hypot(normX, normY) > 0.82;
  };

  const resetStick = () => {
    activeStickPointerId.current = null;
    setStickOffset({ x: 0, y: 0 });
    touchInputRef.current.moveX = 0;
    touchInputRef.current.moveY = 0;
    touchInputRef.current.sprintHeld = false;
  };

  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden"
      data-testid="touch-controls-overlay"
    >
      {/* RIGHT HALF TOUCH AIM / LOOK DRAG SURFACE */}
      <div
        data-testid="touch-look-pad"
        className="fixed top-16 right-0 w-1/2 bottom-44 pointer-events-auto touch-none"
        onPointerDown={(e) => {
          if (activeLookPointerId.current === null) {
            activeLookPointerId.current = e.pointerId;
            lastLookPos.current = { x: e.clientX, y: e.clientY };
            e.currentTarget.setPointerCapture(e.pointerId);
          }
        }}
        onPointerMove={(e) => {
          if (activeLookPointerId.current === e.pointerId) {
            const dx = e.clientX - lastLookPos.current.x;
            const dy = e.clientY - lastLookPos.current.y;
            lastLookPos.current = { x: e.clientX, y: e.clientY };
            touchInputRef.current.lookDeltaX += dx;
            touchInputRef.current.lookDeltaY += dy;
          }
        }}
        onPointerUp={(e) => {
          if (activeLookPointerId.current === e.pointerId) {
            activeLookPointerId.current = null;
          }
        }}
        onPointerCancel={(e) => {
          if (activeLookPointerId.current === e.pointerId) {
            activeLookPointerId.current = null;
          }
        }}
      />

      {/* LEFT THUMB ZONE: VIRTUAL ANALOG MOVEMENT STICK + SLIDE / HARVEST */}
      <div className="fixed bottom-36 left-5 pointer-events-auto flex items-end gap-3">
        <div
          ref={stickZoneRef}
          data-testid="touch-move-joystick"
          role="slider"
          aria-label="Touch Movement Stick"
          aria-valuenow={Math.round(touchInputRef.current.moveY * 100)}
          tabIndex={-1}
          onPointerDown={(e) => {
            activeStickPointerId.current = e.pointerId;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateStickFromPointer(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (activeStickPointerId.current === e.pointerId) {
              updateStickFromPointer(e.clientX, e.clientY);
            }
          }}
          onPointerUp={(e) => {
            if (activeStickPointerId.current === e.pointerId) {
              resetStick();
            }
          }}
          onPointerCancel={(e) => {
            if (activeStickPointerId.current === e.pointerId) {
              resetStick();
            }
          }}
          className="w-28 h-28 rounded-full border-2 border-white/25 flex items-center justify-center relative touch-none cursor-pointer"
          style={{ backgroundColor: 'rgba(9, 13, 22, 0.72)' }}
        >
          {/* Outer Sprint Ring Indicator */}
          <div className="absolute inset-0 m-auto w-20 h-20 rounded-full border border-dashed border-sky-400/35 pointer-events-none" />
          <span className="absolute top-1.5 text-[9px] font-mono text-slate-400 pointer-events-none">
            SPRINT
          </span>
          {/* Thumb Puck */}
          <div
            className="w-11 h-11 rounded-full bg-amber-400/90 border-2 border-white shadow-md pointer-events-none flex items-center justify-center"
            style={{
              transform: `translate3d(${Math.round(stickOffset.x)}px, ${Math.round(
                stickOffset.y
              )}px, 0)`,
            }}
          >
            <div className="w-3 h-3 rounded-full bg-slate-950" />
          </div>
        </div>

        {/* Left Thumb Secondary Movement Buttons (Slide & Harvest) */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            aria-label="Touch Slide"
            onPointerDown={(e) => {
              e.preventDefault();
              touchInputRef.current.slideJustPressed = true;
              // Ensure forward impulse if tapped while stationary
              if (
                Math.abs(touchInputRef.current.moveX) < 0.1 &&
                Math.abs(touchInputRef.current.moveY) < 0.1
              ) {
                touchInputRef.current.moveY = 1;
                window.setTimeout(() => {
                  if (activeStickPointerId.current === null) {
                    touchInputRef.current.moveY = 0;
                  }
                }, 180);
              }
            }}
            className="min-w-[52px] min-h-[48px] px-3 rounded-xl border border-white/25 text-xs font-mono font-bold text-amber-300 active:scale-95 transition-transform cursor-pointer"
            style={{ backgroundColor: 'rgba(9, 13, 22, 0.85)' }}
          >
            SLIDE
          </button>

          <button
            type="button"
            aria-label="Touch Harvest Salvage"
            onPointerDown={(e) => {
              e.preventDefault();
              touchInputRef.current.harvestJustPressed = true;
            }}
            className="min-w-[52px] min-h-[48px] px-3 rounded-xl border border-amber-400/40 text-xs font-mono font-bold text-white active:scale-95 transition-transform cursor-pointer"
            style={{ backgroundColor: 'rgba(9, 13, 22, 0.85)' }}
          >
            LOOT
          </button>
        </div>
      </div>

      {/* RIGHT THUMB ZONE: ERGONOMIC ACTION PAD (FIRE, ADS, JUMP/VAULT, BUILD, ABILITY, STIM, RELOAD) */}
      <div className="fixed bottom-36 right-5 pointer-events-auto flex flex-col items-end gap-2.5">
        {/* Top Row: Wall Blueprint Quick Selector + Emote + Bio-Stim */}
        <div className="flex items-center gap-2">
          {(Object.keys(WALL_BLUEPRINTS) as WallType[]).map((wt) => {
            const bp = WALL_BLUEPRINTS[wt];
            const active = selectedWallType === wt;
            return (
              <button
                key={wt}
                type="button"
                aria-label={`Select ${bp.name}`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  onSelectWallType(wt);
                }}
                className={`min-w-[44px] min-h-[44px] px-2.5 rounded-xl border text-[10px] font-mono font-bold transition-transform active:scale-95 cursor-pointer ${
                  active
                    ? 'bg-sky-500 text-slate-950 border-sky-300'
                    : 'text-slate-300 border-white/20'
                }`}
                style={active ? undefined : { backgroundColor: 'rgba(9, 13, 22, 0.85)' }}
              >
                W{bp.keyHint}
              </button>
            );
          })}

          <button
            type="button"
            aria-label="Touch Bio-Stim"
            onPointerDown={(e) => {
              e.preventDefault();
              touchInputRef.current.stimJustPressed = true;
            }}
            className="min-w-[48px] min-h-[44px] px-2.5 rounded-xl border border-emerald-400/50 text-[11px] font-mono font-bold text-emerald-300 active:scale-95 transition-transform cursor-pointer"
            style={{ backgroundColor: 'rgba(9, 13, 22, 0.85)' }}
          >
            STIM
          </button>

          <button
            type="button"
            aria-label="Touch Emote"
            onPointerDown={(e) => {
              e.preventDefault();
              touchInputRef.current.emoteJustPressed = true;
            }}
            className="min-w-[48px] min-h-[44px] px-2.5 rounded-xl border border-white/20 text-[11px] font-mono font-bold text-slate-200 active:scale-95 transition-transform cursor-pointer"
            style={{ backgroundColor: 'rgba(9, 13, 22, 0.85)' }}
          >
            EMOTE
          </button>
        </div>

        {/* Main Combat Cluster: Reload, Ability, Build Wall, ADS Zoom, Jump/Vault, Primary Fire */}
        <div className="flex items-center gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-label="Touch Reload"
              onPointerDown={(e) => {
                e.preventDefault();
                touchInputRef.current.reloadJustPressed = true;
              }}
              className="min-w-[54px] min-h-[48px] px-3 rounded-xl border border-white/25 text-xs font-mono font-bold text-slate-200 active:scale-95 transition-transform cursor-pointer"
              style={{ backgroundColor: 'rgba(9, 13, 22, 0.86)' }}
            >
              RELOAD
            </button>

            <button
              type="button"
              aria-label="Touch Weapon Ability"
              onPointerDown={(e) => {
                e.preventDefault();
                touchInputRef.current.abilityJustPressed = true;
              }}
              className="min-w-[54px] min-h-[48px] px-3 rounded-xl border border-sky-400/50 text-xs font-mono font-bold text-sky-300 active:scale-95 transition-transform cursor-pointer"
              style={{ backgroundColor: 'rgba(9, 13, 22, 0.86)' }}
            >
              ABILITY
            </button>

            <button
              type="button"
              aria-label="Touch Build Wall"
              onPointerDown={(e) => {
                e.preventDefault();
                touchInputRef.current.buildJustPressed = true;
              }}
              className="min-w-[54px] min-h-[48px] px-3 rounded-xl border border-amber-400/60 text-xs font-mono font-bold text-amber-300 active:scale-95 transition-transform cursor-pointer"
              style={{ backgroundColor: 'rgba(9, 13, 22, 0.86)' }}
            >
              BUILD
            </button>

            <button
              type="button"
              aria-label="Touch ADS Zoom"
              onPointerDown={(e) => {
                e.preventDefault();
                const next = !adsActive;
                setAdsActive(next);
                touchInputRef.current.adsHeld = next;
              }}
              className={`min-w-[54px] min-h-[48px] px-3 rounded-xl border text-xs font-mono font-bold active:scale-95 transition-transform cursor-pointer ${
                adsActive
                  ? 'bg-amber-500 text-slate-950 border-amber-300'
                  : 'text-white border-white/25'
              }`}
              style={adsActive ? undefined : { backgroundColor: 'rgba(9, 13, 22, 0.86)' }}
            >
              AIM
            </button>
          </div>

          {/* Jump / Vault / Climb Button */}
          <button
            type="button"
            aria-label="Touch Jump Vault Climb"
            onPointerDown={(e) => {
              e.preventDefault();
              touchInputRef.current.jumpJustPressed = true;
              touchInputRef.current.jumpHeld = true;
            }}
            onPointerUp={() => {
              touchInputRef.current.jumpHeld = false;
            }}
            onPointerCancel={() => {
              touchInputRef.current.jumpHeld = false;
            }}
            className="w-16 h-16 rounded-2xl border-2 border-sky-400/70 text-xs font-display font-bold text-white active:scale-95 transition-transform flex flex-col items-center justify-center cursor-pointer"
            style={{ backgroundColor: 'rgba(14, 116, 144, 0.82)' }}
          >
            <span>JUMP</span>
            <span className="text-[9px] font-mono text-sky-200">VAULT</span>
          </button>

          {/* Primary 68x68px Touch Fire Trigger */}
          <button
            type="button"
            aria-label="Touch Fire Weapon"
            onPointerDown={(e) => {
              e.preventDefault();
              e.currentTarget.setPointerCapture(e.pointerId);
              setFiringVisual(true);
              touchInputRef.current.fireHeld = true;
            }}
            onPointerUp={() => {
              setFiringVisual(false);
              touchInputRef.current.fireHeld = false;
            }}
            onPointerCancel={() => {
              setFiringVisual(false);
              touchInputRef.current.fireHeld = false;
            }}
            className={`w-[68px] h-[68px] rounded-full border-2 font-display font-bold text-sm tracking-wide transition-transform active:scale-95 flex items-center justify-center cursor-pointer shadow-lg ${
              firingVisual
                ? 'bg-rose-500 border-white text-white scale-95'
                : 'bg-amber-500 border-amber-200 text-slate-950'
            }`}
          >
            FIRE
          </button>
        </div>
      </div>
    </div>
  );
};
