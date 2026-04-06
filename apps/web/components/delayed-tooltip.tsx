"use client";

import {
  cloneElement,
  type FocusEvent as ReactFocusEvent,
  type HTMLAttributes,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

import { motionTokens } from "@synq/ui";

type TooltipChildProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>;
};

type TooltipPosition = {
  left: number;
  top: number;
};

type DelayedTooltipProps = {
  children: ReactElement<TooltipChildProps>;
  content: ReactNode;
  hoverDelay?: number;
  focusDelay?: number;
  touchDelay?: number;
  touchVisibleDuration?: number;
  offset?: number;
};

function clearScheduledTimer(timerRef: MutableRefObject<number | null>) {
  if (timerRef.current !== null) {
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T) {
  if (!ref) return;
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  (ref as MutableRefObject<T>).current = value;
}

export function DelayedTooltip({
  children,
  content,
  hoverDelay = 2200,
  focusDelay = 150,
  touchDelay = 2200,
  touchVisibleDuration = 1800,
  offset = 12,
}: DelayedTooltipProps) {
  const tooltipId = useId();
  const prefersReducedMotion = useReducedMotion();
  const anchorRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const focusTimerRef = useRef<number | null>(null);
  const touchTimerRef = useRef<number | null>(null);
  const touchHideTimerRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const [placement, setPlacement] = useState<"top" | "bottom">("top");

  const child = children as ReactElement<TooltipChildProps> & {
    ref?: Ref<HTMLElement>;
  };

  function clearAllTimers() {
    clearScheduledTimer(hoverTimerRef);
    clearScheduledTimer(focusTimerRef);
    clearScheduledTimer(touchTimerRef);
    clearScheduledTimer(touchHideTimerRef);
  }

  function updatePosition() {
    const anchor = anchorRef.current;
    const tooltip = tooltipRef.current;

    if (!anchor || !tooltip) return;

    const anchorRect = anchor.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const horizontalPadding = 12;
    const verticalPadding = 12;
    const nextPlacement =
      anchorRect.top >= tooltipRect.height + offset + verticalPadding ? "top" : "bottom";
    const unclampedLeft = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
    const maxLeft = Math.max(horizontalPadding, window.innerWidth - tooltipRect.width - horizontalPadding);
    const left = Math.min(Math.max(unclampedLeft, horizontalPadding), maxLeft);
    const top =
      nextPlacement === "top"
        ? Math.max(verticalPadding, anchorRect.top - tooltipRect.height - offset)
        : Math.min(
            window.innerHeight - tooltipRect.height - verticalPadding,
            anchorRect.bottom + offset,
          );

    setPlacement(nextPlacement);
    setPosition({ left, top });
  }

  function hideTooltip() {
    clearAllTimers();
    setIsOpen(false);
  }

  function showTooltip(source: "hover" | "focus" | "touch") {
    clearScheduledTimer(hoverTimerRef);
    clearScheduledTimer(focusTimerRef);
    clearScheduledTimer(touchTimerRef);
    setPosition(null);
    setIsOpen(true);

    if (source === "touch") {
      clearScheduledTimer(touchHideTimerRef);
      touchHideTimerRef.current = window.setTimeout(() => {
        setIsOpen(false);
        touchHideTimerRef.current = null;
      }, touchVisibleDuration);
    }
  }

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      updatePosition();
    });

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        hideTooltip();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (anchorRef.current?.contains(event.target as Node)) return;
      hideTooltip();
    };

    const handleWindowChange = () => {
      updatePosition();
    };

    window.addEventListener("keydown", handleEscape);
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("resize", handleWindowChange);
    window.addEventListener("scroll", handleWindowChange, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", handleEscape);
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("resize", handleWindowChange);
      window.removeEventListener("scroll", handleWindowChange, true);
    };
  }, [isOpen, offset, touchVisibleDuration]);

  useEffect(() => () => clearAllTimers(), []);

  const mergedChild = cloneElement(child, {
    ref: (node: HTMLElement) => {
      anchorRef.current = node;
      assignRef(child.ref, node);
    },
    "aria-describedby": isOpen ? tooltipId : undefined,
    onMouseEnter: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onMouseEnter?.(event);
      clearScheduledTimer(hoverTimerRef);
      hoverTimerRef.current = window.setTimeout(() => {
        showTooltip("hover");
        hoverTimerRef.current = null;
      }, hoverDelay);
    },
    onMouseLeave: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onMouseLeave?.(event);
      clearScheduledTimer(hoverTimerRef);
      if (document.activeElement !== anchorRef.current) {
        hideTooltip();
      }
    },
    onFocus: (event: ReactFocusEvent<HTMLElement>) => {
      child.props.onFocus?.(event);
      clearScheduledTimer(focusTimerRef);
      focusTimerRef.current = window.setTimeout(() => {
        showTooltip("focus");
        focusTimerRef.current = null;
      }, focusDelay);
    },
    onBlur: (event: ReactFocusEvent<HTMLElement>) => {
      child.props.onBlur?.(event);
      hideTooltip();
    },
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      child.props.onPointerDown?.(event);
      if (event.pointerType !== "touch") return;
      clearScheduledTimer(touchHideTimerRef);
      clearScheduledTimer(touchTimerRef);
      touchTimerRef.current = window.setTimeout(() => {
        suppressNextClickRef.current = true;
        showTooltip("touch");
        touchTimerRef.current = null;
      }, touchDelay);
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      child.props.onPointerUp?.(event);
      clearScheduledTimer(touchTimerRef);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      child.props.onPointerCancel?.(event);
      clearScheduledTimer(touchTimerRef);
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLElement>) => {
      child.props.onPointerLeave?.(event);
      clearScheduledTimer(touchTimerRef);
    },
    onContextMenu: (event: ReactMouseEvent<HTMLElement>) => {
      child.props.onContextMenu?.(event);
      if (suppressNextClickRef.current) {
        event.preventDefault();
      }
    },
    onClickCapture: (event: ReactMouseEvent<HTMLElement>) => {
      if (suppressNextClickRef.current) {
        suppressNextClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      child.props.onClickCapture?.(event);
    },
  });

  return (
    <>
      {mergedChild}
      {isOpen && typeof document !== "undefined"
        ? createPortal(
            <motion.div
              ref={tooltipRef}
              id={tooltipId}
              role="tooltip"
              aria-hidden={!position}
              initial={
                prefersReducedMotion
                  ? false
                  : {
                      opacity: 0,
                      scale: 0.98,
                      y: placement === "top" ? 4 : -4,
                    }
              }
              animate={{
                opacity: 1,
                scale: 1,
                y: 0,
              }}
              transition={prefersReducedMotion ? { duration: 0 } : motionTokens.spring}
              className="pointer-events-none fixed z-[140] max-w-[min(18rem,calc(100vw-24px))] rounded-[16px] border border-white/12 bg-[rgba(10,16,24,0.94)] px-3 py-2 text-left text-xs leading-5 text-white/88 shadow-[0_18px_44px_rgba(4,10,18,0.42)] backdrop-blur-xl"
              style={{
                left: position?.left ?? -9999,
                top: position?.top ?? -9999,
                visibility: position ? "visible" : "hidden",
              }}
            >
              {content}
            </motion.div>,
            document.body,
          )
        : null}
    </>
  );
}
