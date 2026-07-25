"use client";

/**
 * Drag-and-drop for a column board.
 *
 * Built on Pointer Events rather than HTML5 drag-and-drop or a library:
 *
 * - HTML5 DnD never fires on touch, and its drag image is browser-controlled,
 *   so the card cannot be styled while in flight.
 * - A library would work, but this is one board with one interaction; pointer
 *   events cover mouse, touch and pen through a single code path and add
 *   nothing to the bundle.
 *
 * Keyboard is a first-class path, not an afterthought. The status being moved
 * is real workflow state, not cosmetic ordering, so a board that only responds
 * to dragging would put that workflow out of reach without a mouse.
 */

import React from "react";

/** Pixels the pointer must travel before a press becomes a drag. Below this
 *  the gesture stays a click, so controls inside a card still work. */
const DRAG_THRESHOLD = 5;

export interface DropCheck {
  allowed: boolean;
  reason?: string;
}

interface Options<C extends string> {
  columns: readonly C[];
  /** Validates a candidate move. Consulted on hover and again on release. */
  canDrop: (itemId: string, from: C, to: C) => DropCheck;
  /** Commits an allowed move. */
  onDrop: (itemId: string, from: C, to: C) => void;
  /** Called when the user releases over a target that refused the drop. */
  onReject?: (reason: string) => void;
}

interface PointerDrag<C extends string> {
  itemId: string;
  from: C;
  over: C | null;
  /** Viewport position of the pointer. */
  x: number;
  y: number;
  /** Pointer offset within the card, so the ghost keeps its grab point. */
  dx: number;
  dy: number;
  w: number;
  h: number;
}

interface KeyboardDrag<C extends string> {
  itemId: string;
  from: C;
  target: C;
}

export function useBoardDrag<C extends string>({
  columns,
  canDrop,
  onDrop,
  onReject,
}: Options<C>) {
  const [drag, setDrag] = React.useState<PointerDrag<C> | null>(null);
  const [kb, setKb] = React.useState<KeyboardDrag<C> | null>(null);
  /** True from pointerdown until release, including before the threshold. */
  const [pressing, setPressing] = React.useState(false);

  const columnEls = React.useRef(new Map<C, HTMLElement>());
  const press = React.useRef<{
    itemId: string;
    from: C;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    w: number;
    h: number;
    active: boolean;
  } | null>(null);

  /* Callbacks live in a ref so the window listeners attach once per gesture
     instead of being re-bound every render by inline arrow props. Synced in an
     effect rather than during render — the handlers only fire from pointer and
     key events, which is always after commit. */
  const cb = React.useRef({ canDrop, onDrop, onReject });
  React.useEffect(() => {
    cb.current = { canDrop, onDrop, onReject };
  });

  const registerColumn = React.useCallback(
    (col: C) => (el: HTMLElement | null) => {
      if (el) columnEls.current.set(col, el);
      else columnEls.current.delete(col);
    },
    []
  );

  const columnAt = React.useCallback((x: number, y: number): C | null => {
    for (const [col, el] of columnEls.current) {
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return col;
    }
    return null;
  }, []);

  /* ---------------------------------------------------------------- pointer */

  React.useEffect(() => {
    if (!pressing) return;

    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;

      if (!p.active) {
        if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) < DRAG_THRESHOLD) {
          return;
        }
        p.active = true;
        // Stops a press-and-move from selecting text across the whole board.
        document.body.style.userSelect = "none";
      }

      e.preventDefault();
      setDrag({
        itemId: p.itemId,
        from: p.from,
        over: columnAt(e.clientX, e.clientY),
        x: e.clientX,
        y: e.clientY,
        dx: p.dx,
        dy: p.dy,
        w: p.w,
        h: p.h,
      });
    };

    const release = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      document.body.style.userSelect = "";
      setPressing(false);
      setDrag(null);

      if (!p?.active) return;

      const to = columnAt(e.clientX, e.clientY);
      if (!to || to === p.from) return;

      const verdict = cb.current.canDrop(p.itemId, p.from, to);
      if (verdict.allowed) cb.current.onDrop(p.itemId, p.from, to);
      else if (verdict.reason) cb.current.onReject?.(verdict.reason);
    };

    const abort = () => {
      press.current = null;
      document.body.style.userSelect = "";
      setPressing(false);
      setDrag(null);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") abort();
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", abort);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", abort);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = "";
    };
  }, [pressing, columnAt]);

  const startPointerDrag = React.useCallback(
    (e: React.PointerEvent, itemId: string, from: C) => {
      /* Clicks on real controls inside the card pass through untouched.
         Compared against currentTarget so a role on the card itself cannot
         match and swallow every press. */
      const control = (e.target as HTMLElement).closest(
        'button, a, input, select, textarea, [role="button"], [role="menu"]'
      );
      if (control && control !== e.currentTarget) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      press.current = {
        itemId,
        from,
        startX: e.clientX,
        startY: e.clientY,
        dx: e.clientX - rect.left,
        dy: e.clientY - rect.top,
        w: rect.width,
        h: rect.height,
        active: false,
      };
      setPressing(true);
    },
    []
  );

  /* --------------------------------------------------------------- keyboard */

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent, itemId: string, from: C) => {
      const isCommit = e.key === " " || e.key === "Enter";

      if (!kb) {
        if (isCommit) {
          e.preventDefault();
          setKb({ itemId, from, target: from });
        }
        return;
      }

      if (kb.itemId !== itemId) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setKb(null);
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const i = columns.indexOf(kb.target);
        const next = columns[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (next) setKb({ ...kb, target: next });
        return;
      }

      if (isCommit) {
        e.preventDefault();
        if (kb.target !== kb.from) {
          const verdict = cb.current.canDrop(kb.itemId, kb.from, kb.target);
          if (verdict.allowed) cb.current.onDrop(kb.itemId, kb.from, kb.target);
          else if (verdict.reason) cb.current.onReject?.(verdict.reason);
        }
        setKb(null);
      }
    },
    [kb, columns]
  );

  /* ----------------------------------------------------------------- derived */

  const activeItemId = drag?.itemId ?? kb?.itemId ?? null;
  const activeFrom = drag?.from ?? kb?.from ?? null;
  const activeTarget = drag?.over ?? kb?.target ?? null;

  /** Verdict for a column while a move is in progress, for styling drop zones. */
  const columnState = React.useCallback(
    (col: C): "idle" | "source" | "valid" | "invalid" => {
      if (!activeItemId || !activeFrom) return "idle";
      if (col === activeFrom) return "source";
      return canDrop(activeItemId, activeFrom, col).allowed ? "valid" : "invalid";
    },
    [activeItemId, activeFrom, canDrop]
  );

  /** Why the currently hovered target would refuse, if it would. */
  const rejection = React.useMemo(() => {
    if (!activeItemId || !activeFrom || !activeTarget) return null;
    if (activeTarget === activeFrom) return null;
    const verdict = canDrop(activeItemId, activeFrom, activeTarget);
    return verdict.allowed ? null : (verdict.reason ?? null);
  }, [activeItemId, activeFrom, activeTarget, canDrop]);

  return {
    /** Non-null while a pointer drag is airborne; drives the floating ghost. */
    drag,
    /** Non-null while a keyboard move is in progress. */
    keyboardDrag: kb,
    activeItemId,
    activeFrom,
    activeTarget,
    rejection,
    registerColumn,
    columnState,
    startPointerDrag,
    handleKeyDown,
  };
}
