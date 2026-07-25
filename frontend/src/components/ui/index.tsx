"use client";

import React from "react";
import { ArrowRight } from "@phosphor-icons/react";

/* ========================================
   HIGH-END ISLAND BUTTON COMPONENT
   ======================================== */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  children,
  disabled,
  className = "",
  ...props
}: ButtonProps) {
  const isPrimary = variant === "primary";

  return (
    <button
      className={`btn-island ${
        isPrimary
          ? "btn-island-primary"
          : "btn-island-secondary"
      } ${size === "sm" ? "px-3 py-1.5 text-xs" : size === "lg" ? "px-6 py-3.5 text-base" : "px-4 py-2 text-sm"} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg
          className="animate-spin w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
        >
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="60 30"
            strokeLinecap="round"
          />
        </svg>
      ) : icon ? (
        <span className="flex-shrink-0">{icon}</span>
      ) : null}

      <span>{children}</span>

      {iconRight ? (
        <div className="btn-nested-icon">{iconRight}</div>
      ) : isPrimary && !loading ? (
        <div className="btn-nested-icon">
          <ArrowRight size={13} weight="bold" />
        </div>
      ) : null}
    </button>
  );
}

/* ========================================
   HIGH-END INPUT COMPONENT
   ======================================== */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, icon, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-medium tracking-wide uppercase"
            style={{ color: "var(--fg-tertiary)" }}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <span
              className="absolute left-3.5 top-1/2 -translate-y-1/2 flex-shrink-0"
              style={{ color: "var(--fg-muted)" }}
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`w-full bg-[#0d0d11] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[var(--fg-primary)] placeholder-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all ${
              icon ? "pl-11" : ""
            } ${error ? "border-red-500/50" : ""} ${className}`}
            {...props}
          />
        </div>
        {error && (
          <p className="text-[12px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";

/* ========================================
   TEXTAREA COMPONENT
   ======================================== */

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", id, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-[12px] font-medium tracking-wide uppercase"
            style={{ color: "var(--fg-tertiary)" }}
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          className={`w-full bg-[#0d0d11] border border-white/10 rounded-xl p-4 text-sm text-[var(--fg-primary)] placeholder-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all resize-y min-h-[90px] ${
            error ? "border-red-500/50" : ""
          } ${className}`}
          {...props}
        />
        {error && (
          <p className="text-[12px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="text-[12px]" style={{ color: "var(--fg-muted)" }}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = "Textarea";

/* ========================================
   DOUBLE-BEZEL CARD COMPONENT (DOPPELRAND)
   ======================================== */

interface CardProps {
  children: React.ReactNode;
  elevated?: boolean;
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
}

export function Card({
  children,
  elevated = false,
  className = "",
  onClick,
  hoverable = true,
}: CardProps) {
  return (
    <div
      className={`double-bezel-shell ${hoverable ? "cursor-pointer" : ""} ${className}`}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onClick();
            }
          : undefined
      }
    >
      <div className="double-bezel-core">{children}</div>
    </div>
  );
}

/* ========================================
   BADGE COMPONENT WITH EYEBROW BADGE OPTION
   ======================================== */

type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
}

export function Badge({
  children,
  variant = "neutral",
  dot = false,
}: BadgeProps) {
  return (
    <span className={`badge badge-${variant} inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide`}>
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full animate-pulse"
          style={{ background: "currentColor" }}
        />
      )}
      {children}
    </span>
  );
}

/* ========================================
   AVATAR COMPONENT
   ======================================== */

interface AvatarProps {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const avatarSizes = {
  sm: "w-8 h-8 text-[11px]",
  md: "w-10 h-10 text-[13px]",
  lg: "w-14 h-14 text-base",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function Avatar({ src, alt, name = "", size = "md", className = "" }: AvatarProps) {
  const initials = getInitials(name || alt || "U");

  if (src) {
    return (
      <img
        src={src}
        alt={alt || name}
        className={`${avatarSizes[size]} rounded-full object-cover border border-white/20 shadow-md ${className}`}
      />
    );
  }

  return (
    <div
      className={`${avatarSizes[size]} rounded-full flex items-center justify-center font-bold tracking-wider border border-emerald-500/30 shadow-lg ${className}`}
      style={{
        background: "rgba(52, 211, 153, 0.12)",
        color: "var(--accent)",
      }}
      aria-label={alt || name}
    >
      {initials}
    </div>
  );
}

/* ========================================
   MODAL COMPONENT (ETHEREAL GLASS)
   ======================================== */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: ModalProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      const handler = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handler);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handler);
      };
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-2xl page-enter"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        className={`relative ${width} w-full double-bezel-shell page-enter`}
        style={{ maxHeight: "88vh", display: "flex", flexDirection: "column" }}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="double-bezel-core flex flex-col h-full overflow-hidden p-0">
          {title && (
            <div
              className="flex items-center justify-between px-6 py-4"
              style={{ borderBottom: "1px solid var(--hairline-light)" }}
            >
              <h2 className="text-base font-semibold tracking-tight">{title}</h2>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-all"
                aria-label="Đóng"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <div className="p-6 overflow-y-auto flex-1">{children}</div>

          {footer && (
            <div
              className="flex items-center justify-end gap-3 px-6 py-4"
              style={{ borderTop: "1px solid var(--hairline-light)" }}
            >
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ========================================
   TOAST COMPONENT
   ======================================== */

type ToastType = "success" | "error" | "warning" | "info";

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

const toastColors: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: {
    bg: "rgba(52, 211, 153, 0.12)",
    border: "rgba(52, 211, 153, 0.3)",
    color: "#34d399",
  },
  error: {
    bg: "rgba(248, 113, 113, 0.12)",
    border: "rgba(248, 113, 113, 0.3)",
    color: "#f87171",
  },
  warning: {
    bg: "rgba(251, 191, 36, 0.12)",
    border: "rgba(251, 191, 36, 0.3)",
    color: "#fbbf24",
  },
  info: {
    bg: "rgba(96, 165, 250, 0.12)",
    border: "rgba(96, 165, 250, 0.3)",
    color: "#60a5fa",
  },
};

interface ToastItemProps {
  toast: ToastData;
  onDismiss: (id: string) => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const colors = toastColors[toast.type];

  React.useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div
      className="flex items-center gap-3 px-4 py-3 rounded-2xl page-enter shadow-2xl"
      style={{
        background: colors.bg,
        border: `1px solid ${colors.border}`,
        backdropFilter: "blur(24px)",
      }}
    >
      <span className="text-sm flex-1 font-medium" style={{ color: colors.color }}>
        {toast.message}
      </span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-70 hover:opacity-100 transition-opacity p-1"
        style={{ color: colors.color }}
        aria-label="Đóng"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastContainer({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 max-w-sm w-full">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ========================================
   DROPDOWN MENU COMPONENT
   ======================================== */

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
}

export function Dropdown({ trigger, children, align = "right" }: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-flex">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <div
          className={`absolute top-full mt-2 ${align === "right" ? "right-0" : "left-0"} z-50 min-w-[200px] nav-floating-island p-1.5 page-enter`}
        >
          <div onClick={() => setOpen(false)}>{children}</div>
        </div>
      )}
    </div>
  );
}

interface DropdownItemProps {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
}

export function DropdownItem({
  children,
  onClick,
  danger = false,
  icon,
}: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-xl text-left transition-all"
      style={{
        color: danger ? "var(--danger)" : "var(--fg-secondary)",
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)";
        if (!danger) e.currentTarget.style.color = "var(--fg-primary)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = danger
          ? "var(--danger)"
          : "var(--fg-secondary)";
      }}
    >
      {icon && <span className="flex-shrink-0 w-4 h-4">{icon}</span>}
      {children}
    </button>
  );
}

export function DropdownSeparator() {
  return <div className="h-[1px] bg-white/10 my-1 mx-2" />;
}

/* ========================================
   TABLE COMPONENT
   ======================================== */

interface Column<T> {
  key: string;
  header: string;
  width?: string;
  render?: (item: T) => React.ReactNode;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "Không có dữ liệu",
  onRowClick,
}: TableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--hairline-light)" }}>
            {columns.map((col) => (
              <th
                key={col.key}
                className="text-left text-[11px] font-semibold py-3.5 px-4 tracking-wider uppercase"
                style={{
                  color: "var(--fg-tertiary)",
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="text-center py-12 text-[14px]"
                style={{ color: "var(--fg-muted)" }}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item) => (
              <tr
                key={keyExtractor(item)}
                className={`transition-colors ${onRowClick ? "cursor-pointer" : ""}`}
                style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.04)" }}
                onClick={() => onRowClick?.(item)}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.03)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="py-3.5 px-4 text-[14px]"
                    style={{ color: "var(--fg-primary)" }}
                  >
                    {col.render
                      ? col.render(item)
                      : String((item as Record<string, unknown>)[col.key] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/* ========================================
   SKELETON LOADER COMPONENT
   ======================================== */

export function Skeleton({
  className = "",
  width = "100%",
  height = "20px",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return <div className={`skeleton rounded-xl bg-white/5 animate-pulse ${className}`} style={{ width, height }} />;
}

/* ========================================
   EMPTY STATE COMPONENT
   ======================================== */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      {icon && (
        <div
          className="mb-4 w-14 h-14 rounded-2xl flex items-center justify-center border border-white/10 shadow-xl"
          style={{
            background: "rgba(255, 255, 255, 0.03)",
            color: "var(--accent)",
          }}
        >
          {icon}
        </div>
      )}
      <h3 className="text-base font-semibold mb-1 tracking-tight">{title}</h3>
      {description && (
        <p
          className="text-[13px] max-w-sm"
          style={{ color: "var(--fg-tertiary)" }}
        >
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
