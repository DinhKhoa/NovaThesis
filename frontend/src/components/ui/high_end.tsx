"use client";

import React from "react";
import { ArrowRight } from "@phosphor-icons/react";

/* ==========================================================================
   DOUBLE-BEZEL CARD (DOPPELRAND ARCHITECTURE)
   ========================================================================== */

interface DoubleBezelCardProps {
  children: React.ReactNode;
  className?: string;
  coreClassName?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function DoubleBezelCard({
  children,
  className = "",
  coreClassName = "",
  onClick,
  hoverable = true,
}: DoubleBezelCardProps) {
  return (
    <div
      className={`double-bezel-shell ${hoverable ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
    >
      <div className={`double-bezel-core ${coreClassName}`}>{children}</div>
    </div>
  );
}

/* ==========================================================================
   ISLAND BUTTON (NESTED CTA WITH TRAILING ICON)
   ========================================================================== */

interface IslandButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

export function IslandButton({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  trailingIcon,
  children,
  disabled,
  className = "",
  ...props
}: IslandButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <button
      className={`btn-island ${isPrimary ? "btn-island-primary" : "btn-island-secondary"} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="60 30" />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}

      <span>{children}</span>

      {trailingIcon ? (
        <div className="btn-nested-icon">{trailingIcon}</div>
      ) : isPrimary ? (
        <div className="btn-nested-icon">
          <ArrowRight size={14} weight="bold" />
        </div>
      ) : null}
    </button>
  );
}
