"use client";

import React from "react";
import { createPortal } from "react-dom";
import { readCookie, writeCookie } from "@/lib/client-cookies";
import {
  CaretDown,
  CaretUp,
  CaretLeft,
  CaretRight,
  Check,
  CheckCircle,
  Info,
  Warning,
  WarningOctagon,
  X,
} from "@phosphor-icons/react";

/* ==========================================================================
   HOOKS
   ========================================================================== */

const noopSubscribe = () => () => {};

/**
 * True only after hydration. Uses `useSyncExternalStore` rather than a
 * `useEffect(() => setMounted(true))` so there is no second render pass and no
 * cascading-render lint violation.
 */
export function useMounted(): boolean {
  return React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}

/**
 * Tuỳ chọn dạng bật/tắt, lưu bằng COOKIE và an toàn với SSR.
 *
 * Trước đây dùng `localStorage`. Hệ thống không dùng `localStorage` ở bất kỳ đâu
 * nữa — xem `lib/client-cookies.ts` để biết lý do cho từng loại dữ liệu.
 */
export function useStoredFlag(key: string, fallback = false) {
  const mounted = useMounted();
  const [override, setOverride] = React.useState<boolean | null>(null);

  const stored =
    mounted && override === null ? readCookie(key) === "1" : (override ?? fallback);

  const set = React.useCallback(
    (next: boolean) => {
      setOverride(next);
      writeCookie(key, next ? "1" : "0");
    },
    [key]
  );

  return [mounted ? stored : fallback, set] as const;
}

/* ==========================================================================
   BUTTON
   ========================================================================== */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "xs" | "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
}

const sizeClass: Record<ButtonSize, string> = {
  xs: "btn-xs",
  sm: "btn-sm",
  md: "",
  lg: "btn-lg",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  icon,
  iconRight,
  children,
  disabled,
  className = "",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`btn btn-${variant} ${sizeClass[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight && <span className="btn-trail">{iconRight}</span>}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      className="animate-spin flex-shrink-0 inline-flex items-center justify-center"
      style={{
        width: size,
        height: size,
      }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="w-full h-full"
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          stroke="currentColor"
          strokeWidth="3"
          strokeOpacity="0.25"
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/* Icon-only button. Always needs a label — it has no visible text. */
export function IconButton({
  label,
  size = "md",
  className = "",
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <button
      type="button"
      className={`btn-icon ${size === "sm" ? "btn-icon-sm" : ""} ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
}

/* ==========================================================================
   FORM FIELD WRAPPER
   Shared by Input / Textarea / Select so label, hint and error always sit in
   the same place and the error is wired to the control for screen readers.
   ========================================================================== */

interface FieldProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

function Field({
  label,
  error,
  helperText,
  required,
  htmlFor,
  children,
  className = "",
}: FieldProps) {
  return (
    <div className={`flex flex-col ${className}`}>
      {label && (
        <label className="field-label" htmlFor={htmlFor}>
          {label}
          {required && (
            <span className="text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[11.5px] text-danger mt-1" id={`${htmlFor}-error`}>
          {error}
        </p>
      ) : helperText ? (
        <p className="text-[11.5px] text-tertiary mt-1">{helperText}</p>
      ) : null}
    </div>
  );
}

function useFieldId(explicit?: string) {
  const generated = React.useId();
  return explicit || generated;
}

/* ==========================================================================
   INPUT
   ========================================================================== */

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  /** Trailing adornment: unit, shortcut hint, clear button. */
  suffix?: React.ReactNode;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      suffix,
      className = "",
      wrapperClassName = "",
      id,
      required,
      ...props
    },
    ref
  ) => {
    const inputId = useFieldId(id);

    return (
      <Field
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        htmlFor={inputId}
        className={wrapperClassName}
      >
        <div className="relative flex items-center">
          {icon && (
            <span
              className="absolute left-2.5 flex text-muted pointer-events-none"
              aria-hidden="true"
            >
              {icon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${inputId}-error` : undefined}
            className={`input-base ${icon ? "pl-8" : ""} ${
              suffix ? "pr-8" : ""
            } ${className}`}
            {...props}
          />
          {suffix && (
            <span className="absolute right-2.5 flex text-muted">{suffix}</span>
          )}
        </div>
      </Field>
    );
  }
);
Input.displayName = "Input";

/* ==========================================================================
   TEXTAREA
   ========================================================================== */

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, helperText, className = "", id, required, ...props }, ref) => {
    const inputId = useFieldId(id);

    return (
      <Field
        label={label}
        error={error}
        helperText={helperText}
        required={required}
        htmlFor={inputId}
      >
        <textarea
          ref={ref}
          id={inputId}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${inputId}-error` : undefined}
          className={`input-base ${className}`}
          {...props}
        />
      </Field>
    );
  }
);
Textarea.displayName = "Textarea";

/* ==========================================================================
   SELECT

   Ô chọn TỰ VẼ, không dùng `<select>` native.

   Bản trước là `<select>` của trình duyệt bọc class `input-base`. Nút bấm thì
   khớp giao diện, nhưng danh sách bung ra lại do HỆ ĐIỀU HÀNH vẽ — nó không
   nhận `--bg-surface`, `--shadow-md`, `border-radius`, không theo chế độ tối,
   không có mũi chevron riêng, không hiện được mô tả phụ hay icon, và không dùng
   được animation `pop-in`. Không CSS nào sửa được vì phần đó không nằm trong
   trang. Đó chính là nguyên nhân "hộp dropdown sơ sài, chưa ăn khớp".

   Ba quyết định đáng nêu:

   • GIỮ NGUYÊN API cũ (`value` / `onChange(e)` với `e.target.value`, `options`,
     hoặc `<option>` con). Nhờ vậy 8 trang đang dùng không phải sửa một dòng.
     `onChange` nhận một object tối thiểu có hình dạng `{ target: { value } }` —
     đủ cho mọi chỗ gọi hiện tại.

   • Popup dùng `position: fixed` + toạ độ từ `getBoundingClientRect()`, KHÔNG
     phải `absolute`. `Dropdown` bên dưới dùng `absolute` và vì thế bị cắt khi
     nằm trong khối có `overflow: hidden` — mà `Table` và `Card` đều có.

   • Vẫn giữ một `<select>` ẩn đồng bộ giá trị: form submit thuần HTML và các
     trình đọc màn hình cũ vẫn hoạt động, và `name` vẫn có tác dụng.
   ========================================================================== */

export interface SelectOption {
  value: string;
  label: string;
  /** Dòng phụ nhỏ hơn dưới nhãn — thứ `<option>` native không làm được. */
  description?: string;
  icon?: React.ReactNode;
  /** Nhãn nhóm; các lựa chọn cùng nhóm được gom lại kèm tiêu đề. */
  group?: string;
  disabled?: boolean;
}

interface SelectProps {
  label?: string;
  error?: string;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  name?: string;
  "aria-label"?: string;
  value?: string | number | null;
  onChange?: (event: { target: { value: string } }) => void;
  options?: SelectOption[];
  /** Vẫn nhận `<option>` / `<optgroup>` con như trước. */
  children?: React.ReactNode;
  /** Bật ô tìm kiếm. Mặc định tự bật khi có nhiều hơn 8 lựa chọn. */
  searchable?: boolean;
}

/** Bỏ dấu để "de tai" khớp "Đề tài" — không ai gõ dấu vào ô tìm kiếm. */
function foldDiacritics(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");
}

/**
 * Đọc `<option>` / `<optgroup>` con thành danh sách phẳng.
 *
 * Nhận cả hai cách khai báo là điều kiện để không phải sửa 8 trang đang dùng:
 * một số trang truyền `options`, số khác viết `<option>` trực tiếp.
 */
function optionsFromChildren(children: React.ReactNode): SelectOption[] {
  const out: SelectOption[] = [];

  const walk = (nodes: React.ReactNode, group?: string): void => {
    React.Children.forEach(nodes, (node) => {
      if (!React.isValidElement(node)) return;

      if (node.type === "optgroup") {
        const props = node.props as { label?: string; children?: React.ReactNode };
        walk(props.children, props.label);
        return;
      }

      if (node.type === "option") {
        const props = node.props as {
          value?: string | number;
          children?: React.ReactNode;
          disabled?: boolean;
        };
        const text = React.Children.toArray(props.children)
          .map((c) => (typeof c === "string" || typeof c === "number" ? String(c) : ""))
          .join("")
          .trim();
        out.push({
          value: String(props.value ?? ""),
          label: text,
          ...(group ? { group } : {}),
          ...(props.disabled ? { disabled: true } : {}),
        });
      }
    });
  };

  walk(children);
  return out;
}

export function Select({
  label,
  error,
  helperText,
  required,
  disabled = false,
  placeholder = "Chọn…",
  className = "",
  id,
  name,
  "aria-label": ariaLabel,
  value,
  onChange,
  options,
  children,
  searchable,
}: SelectProps) {
  const inputId = useFieldId(id);
  const listId = `${inputId}-listbox`;

  const items = React.useMemo(
    () => options ?? optionsFromChildren(children),
    [options, children]
  );

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [cursor, setCursor] = React.useState(0);
  const [rect, setRect] = React.useState<{ left: number; top: number; width: number } | null>(
    null
  );

  /* Trả con trỏ về nút sau khi chọn hoặc bấm Escape — điều kiện để dùng được
     bằng bàn phím.

     Tìm nút bằng `getElementById` thay vì qua `triggerRef`: một hàm xử lý sự
     kiện có đọc `.current` rồi được truyền xuống làm prop sẽ bị React cảnh báo
     "đọc ref trong lúc render", và cảnh báo đó đúng về nguyên tắc. Nút này luôn
     có mặt trong DOM với đúng `id` đã gán, nên tra theo id là tương đương mà
     không kéo ref vào chuỗi phụ thuộc của handler. */
  const refocusTrigger = () => {
    if (typeof document === "undefined") return;
    const el = document.getElementById(inputId);
    if (el instanceof HTMLElement) el.focus();
  };

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popupRef = React.useRef<HTMLDivElement>(null);

  const canSearch = searchable ?? items.length > 8;
  const current = items.find((o) => o.value === String(value ?? ""));

  const visible = React.useMemo(() => {
    if (!query.trim()) return items;
    const q = foldDiacritics(query.trim());
    return items.filter(
      (o) =>
        foldDiacritics(o.label).includes(q) ||
        (o.description ? foldDiacritics(o.description).includes(q) : false)
    );
  }, [items, query]);

  /* Đo vị trí trigger rồi định vị popup bằng `fixed`. Tính lúc mở và mỗi khi
     cuộn/đổi kích thước: một popup neo theo toạ độ tuyệt đối sẽ trôi khỏi ô của
     nó ngay lần cuộn đầu tiên. */
  const measure = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ left: r.left, top: r.bottom + 4, width: r.width });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    measure();

    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popupRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        refocusTrigger();
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  const openMenu = () => {
    if (disabled) return;
    setQuery("");
    setCursor(Math.max(0, items.findIndex((o) => o.value === String(value ?? ""))));
    setOpen(true);
  };

  const pick = (option: SelectOption) => {
    if (option.disabled) return;
    setOpen(false);
    refocusTrigger();
    // Hình dạng `{ target: { value } }` giữ đúng chữ ký `onChange` cũ.
    onChange?.({ target: { value: option.value } });
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(visible.length - 1, c + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(0, c - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setCursor(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setCursor(visible.length - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = visible[cursor];
      if (option) pick(option);
    }
  };

  /* Nhóm lựa chọn, giữ nguyên thứ tự xuất hiện. `Map` chứ không phải object:
     thứ tự khoá của object là chi tiết cài đặt, còn thứ tự nhóm là thứ người
     dùng nhìn thấy. */
  const grouped = React.useMemo(() => {
    const map = new Map<string, SelectOption[]>();
    for (const o of visible) {
      const key = o.group ?? "";
      const list = map.get(key);
      if (list) list.push(o);
      else map.set(key, [o]);
    }
    return [...map.entries()];
  }, [visible]);

  return (
    <Field
      label={label}
      error={error}
      helperText={helperText}
      required={required}
      htmlFor={inputId}
    >
      {/* Bản native ẩn: form submit thuần HTML và trình đọc màn hình cũ vẫn
          thấy một ô chọn thật, và `name` vẫn có tác dụng. */}
      <select
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={String(value ?? "")}
        onChange={(e) => onChange?.({ target: { value: e.target.value } })}
        className="sr-only"
      >
        <option value="" />
        {items.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>

      <button
        ref={triggerRef}
        type="button"
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-invalid={error ? true : undefined}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onTriggerKeyDown}
        className={`input-base flex items-center gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        {current?.icon && <span className="flex-shrink-0 flex">{current.icon}</span>}
        <span
          className={`flex-1 min-w-0 truncate ${current ? "" : "text-[var(--fg-muted)]"}`}
        >
          {current?.label ?? placeholder}
        </span>
        <CaretDown
          size={13}
          className={`flex-shrink-0 text-tertiary transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && rect && createPortal(
        <div
          ref={popupRef}
          role="listbox"
          id={listId}
          className="card p-1 pop-in overflow-hidden"
          style={{
            position: "fixed",
            left: rect.left,
            top: rect.top,
            minWidth: rect.width,
            maxWidth: "min(28rem, calc(100vw - 1rem))",
            zIndex: 90,
            boxShadow: "var(--shadow-md)",
          }}
        >
          {canSearch && (
            <div className="px-1 pb-1">
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                onKeyDown={onTriggerKeyDown}
                placeholder="Tìm…"
                aria-label="Tìm trong danh sách"
                className="w-full bg-transparent border-0 outline-none text-[12.5px] px-1.5 py-1 placeholder:text-[var(--fg-muted)]"
                style={{ borderBottom: "1px solid var(--border-secondary)" }}
              />
            </div>
          )}

          <div className="max-h-64 overflow-y-auto">
            {visible.length === 0 ? (
              <p className="text-[12px] text-tertiary text-center py-4">
                Không có lựa chọn phù hợp.
              </p>
            ) : (
              grouped.map(([group, list]) => (
                <div key={group || "_"}>
                  {group && <div className="eyebrow px-2 pt-1.5 pb-1">{group}</div>}
                  {list.map((o) => {
                    const currentIndex = visible.indexOf(o);
                    const active = currentIndex === cursor;
                    const selected = o.value === String(value ?? "");
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        disabled={o.disabled}
                        onMouseEnter={() => setCursor(currentIndex)}
                        onClick={() => pick(o)}
                        className="menu-item w-full flex items-start gap-2 py-1.5 rounded-md text-left text-[12.5px] disabled:opacity-40 disabled:cursor-not-allowed"
                        style={{
                          background: active ? "var(--bg-hover)" : "transparent",
                          color: selected ? "var(--fg-primary)" : "var(--fg-secondary)",
                          fontWeight: selected ? 500 : 400,
                        }}
                      >
                        {o.icon && <span className="flex-shrink-0 flex mt-0.5">{o.icon}</span>}
                        <span className="min-w-0 flex-1">
                          <span className="block truncate">{o.label}</span>
                          {o.description && (
                            <span className="block text-[11px] text-muted truncate">
                              {o.description}
                            </span>
                          )}
                        </span>
                        {selected && (
                          <Check
                            size={13}
                            className="flex-shrink-0 mt-0.5"
                            style={{ color: "var(--accent)" }}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}
    </Field>
  );
}

/**
 * Ô chọn native, giữ lại làm đường lùi.
 *
 * Nếu `Select` mới có vấn đề trên một trình duyệt cụ thể, đổi import ở trang đó
 * là quay lại được ngay, không phải revert cả component.
 */
export const NativeSelect = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement> & {
    label?: string;
    error?: string;
    helperText?: string;
  }
>(({ label, error, helperText, children, className = "", id, ...props }, ref) => {
  const inputId = useFieldId(id);
  return (
    <Field label={label} error={error} helperText={helperText} htmlFor={inputId}>
      <select
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        className={`input-base ${className}`}
        {...props}
      >
        {children}
      </select>
    </Field>
  );
});
NativeSelect.displayName = "NativeSelect";

/* ==========================================================================
   CHECKBOX
   ========================================================================== */

export function Checkbox({
  label,
  className = "",
  id,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: React.ReactNode }) {
  const inputId = useFieldId(id);
  return (
    <label
      htmlFor={inputId}
      className={`inline-flex items-center gap-2 cursor-pointer select-none ${className}`}
    >
      <input
        id={inputId}
        type="checkbox"
        className="w-3.5 h-3.5 rounded-[4px] accent-[var(--accent)] cursor-pointer"
        {...props}
      />
      {label && <span className="text-[13px] text-secondary">{label}</span>}
    </label>
  );
}

/* ==========================================================================
   CARD
   ========================================================================== */

/* Extends the div attributes so callers can attach pointer/keyboard handlers
   and ARIA without reaching around the component — the Kanban board needs
   both, and a card that swallows DOM props would force it to re-implement the
   surface just to add a drag listener. */
interface CardProps
  extends Omit<React.HTMLAttributes<HTMLElement>, "onClick"> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  /** Adds hover feedback. Implied when `onClick` is set. */
  hoverable?: boolean;
  as?: "div" | "section" | "article";
}

export function Card({
  children,
  className = "",
  onClick,
  hoverable,
  as: Tag = "div",
  onKeyDown,
  ...rest
}: CardProps) {
  const interactive = Boolean(onClick);
  const showHover = hoverable ?? interactive;

  return (
    <Tag
      className={`card ${showHover ? "card-interactive" : ""} ${
        interactive ? "cursor-pointer" : ""
      } ${className}`}
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(e);
        if (interactive && !e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/** Card with a titled header bar and a body slot. */
export function Panel({
  title,
  icon,
  actions,
  children,
  className = "",
  bodyClassName = "p-4",
}: {
  title: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`card flex flex-col min-w-0 ${className}`}>
      <header className="card-header">
        <h2 className="card-title flex items-center gap-2 min-w-0">
          {icon && <span className="text-tertiary flex-shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </h2>
        {actions && (
          <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
        )}
      </header>
      <div className={`min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/* ==========================================================================
   BADGE
   ========================================================================== */

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "accent";

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  dot?: boolean;
  className?: string;
}

export function Badge({
  children,
  variant = "neutral",
  dot = false,
  className = "",
}: BadgeProps) {
  return (
    <span className={`badge badge-${variant} ${className}`}>
      {dot && <span className="badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}

/* ==========================================================================
   AVATAR
   ========================================================================== */

const avatarSizes = {
  xs: "w-5 h-5 text-[9px]",
  sm: "w-7 h-7 text-[11px]",
  md: "w-9 h-9 text-[12px]",
  lg: "w-14 h-14 text-[16px]",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  // Vietnamese names put the given name last, and that's what people are
  // called by — take the last two words, not the first two.
  const picked = parts.length === 1 ? parts.slice(0, 1) : parts.slice(-2);
  return picked
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

/* Deterministic hue per person so the same user keeps the same chip colour
   across the app. Muted range only — avatars shouldn't shout. */
const AVATAR_HUES = [210, 265, 340, 24, 158, 190];

export function Avatar({
  src,
  alt,
  name = "",
  size = "md",
  className = "",
}: {
  src?: string | null;
  alt?: string;
  name?: string;
  size?: keyof typeof avatarSizes;
  className?: string;
}) {
  const label = name || alt || "";
  const initials = getInitials(label);

  const hue = React.useMemo(() => {
    let h = 0;
    for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) | 0;
    return AVATAR_HUES[Math.abs(h) % AVATAR_HUES.length];
  }, [label]);

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt || name}
        className={`${avatarSizes[size]} rounded-full object-cover flex-shrink-0 ${className}`}
        style={{ border: "1px solid var(--border-primary)" }}
      />
    );
  }

  return (
    <span
      className={`${avatarSizes[size]} rounded-full inline-flex items-center justify-center font-semibold flex-shrink-0 select-none ${className}`}
      style={{
        background: `hsl(${hue} 62% 50% / 0.16)`,
        color: `hsl(${hue} 58% 38%)`,
      }}
      aria-hidden={alt ? undefined : true}
      title={label || undefined}
    >
      {initials}
    </span>
  );
}

/* ==========================================================================
   DIALOG CHROME
   Scroll lock, focus trap, Escape and focus restoration — identical for every
   overlay, so Modal and Sheet share one implementation rather than drifting
   apart.
   ========================================================================== */

function useDialogChrome(
  open: boolean,
  onClose: () => void,
  ref: React.RefObject<HTMLElement | null>
) {
  const restoreFocusTo = React.useRef<HTMLElement | null>(null);
  const hasFocused = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      hasFocused.current = false;
      return;
    }

    if (!restoreFocusTo.current) {
      restoreFocusTo.current = document.activeElement as HTMLElement | null;
    }

    // Compensating for the scrollbar keeps the page from jumping sideways
    // when the body locks.
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    document.body.style.overflow = "hidden";
    if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;

    const focusables = () =>
      Array.from(
        ref.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
        ) ?? []
      ).filter((el) => el.offsetParent !== null);

    /* Prefer the first field over the first focusable. In DOM order the close
       button comes first, so focusing "the first focusable" drops a keyboard
       user on Dismiss — one stray Enter from throwing away the form they were
       sent here to fill in. */
    const items = focusables();
    const firstField = items.find((el) =>
      /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)
    );
    // Grab focus ONLY when the modal just opened, not on every re-render (which steals focus from inputs)
    if (!hasFocused.current) {
      (firstField ?? items[0] ?? ref.current)?.focus();
      hasFocused.current = true;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const items = focusables();
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];

      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
      restoreFocusTo.current?.focus?.();
    };
  }, [open, onClose, ref]);
}

/* ==========================================================================
   MODAL
   ========================================================================== */

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = "max-w-lg",
}: ModalProps) {
  const mounted = useMounted();
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useDialogChrome(open, onClose, dialogRef);

  if (!open || !mounted) return null;

  /* Rendered into <body> rather than in place. An overlay is `position:
     fixed`, and any ancestor with a transform/filter/animation becomes its
     containing block — which silently re-anchors `inset-0` to that ancestor
     instead of the viewport. Portalling makes the modal immune to whatever
     the page around it is doing. */
  return createPortal(
    /*
     * Scroll lives on the overlay, and the centring wrapper carries
     * `min-h-full`. That combination is what keeps a tall dialog usable on a
     * short viewport: while there is room it sits centred, and once it is
     * taller than the screen the wrapper grows and the overlay scrolls to it.
     * Centring the dialog directly (auto margins / `items-center`) overflows
     * equally in both directions instead, which puts the footer buttons
     * permanently out of reach.
     */
    <div className="fixed inset-0 z-50 overflow-y-auto overscroll-contain">
      <div
        className="fixed inset-0 fade-in"
        style={{ background: "rgb(8 12 18 / 0.55)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div className="relative min-h-full flex items-center justify-center p-3 sm:p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className={`w-full ${width} card pop-in flex flex-col outline-none`}
          style={{
            boxShadow: "var(--shadow-lg)",
            // Matches the wrapper's vertical padding, so the dialog never
            // demands more room than the wrapper can actually give it.
            maxHeight: "calc(100dvh - 1.5rem)",
          }}
        >
          {title && (
            <header className="card-header flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold truncate">{title}</h2>
                {description && (
                  <p className="text-[12px] text-tertiary mt-0.5 truncate">
                    {description}
                  </p>
                )}
              </div>
              <IconButton label="Đóng" size="sm" onClick={onClose}>
                <X size={15} />
              </IconButton>
            </header>
          )}

          <div className="p-4 overflow-y-auto overscroll-contain flex-1 min-h-0">
            {children}
          </div>

          {footer && (
            <footer
              className="flex items-center justify-end gap-2 px-4 py-3 flex-shrink-0"
              style={{ borderTop: "1px solid var(--border-secondary)" }}
            >
              {footer}
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Destructive-action confirmation. Keeps phrasing and button order uniform. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Xác nhận",
  danger = true,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13px] text-secondary leading-relaxed">{message}</p>
    </Modal>
  );
}

/* ==========================================================================
   SHEET
   A full-height panel anchored to a screen edge. Used where a task is
   substantial enough to want room but shouldn't cost the user their place —
   signing in shouldn't tear down the page they were reading.
   ========================================================================== */


type SheetPhase = "closed" | "open" | "closing";

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  side = "right",
  width = "sm:max-w-[26rem]",
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: "right" | "left";
  width?: string;
}) {
  const mounted = useMounted();
  const panelRef = React.useRef<HTMLDivElement>(null);

  /* The panel has to outlive `open` by one animation so it can slide out
     rather than vanish. Phase is adjusted during render (React's documented
     way to react to a prop change) and cleared on `animationend` — an event,
     not an effect, so nothing schedules a cascading re-render. */
  const [phase, setPhase] = React.useState<SheetPhase>(open ? "open" : "closed");
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    setPhase(open ? "open" : "closing");
  }

  useDialogChrome(open, onClose, panelRef);

  if (phase === "closed" || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        className="sheet-scrim absolute inset-0"
        data-state={phase}
        style={{ background: "rgb(8 12 18 / 0.5)" }}
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={`sheet-panel absolute inset-y-0 ${
          side === "right" ? "right-0" : "left-0"
        } w-full ${width} flex flex-col outline-none`}
        data-state={phase}
        data-side={side}
        // Unmounting is driven by the exit animation finishing, so the panel
        // is never yanked out mid-slide.
        onAnimationEnd={() => {
          if (phase === "closing") setPhase("closed");
        }}
        style={{
          background: "var(--bg-surface)",
          [side === "right" ? "borderLeft" : "borderRight"]:
            "1px solid var(--border-primary)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        {title && (
          <header
            className="flex items-start justify-between gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border-secondary)" }}
          >
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
              {description && (
                <p className="text-[12.5px] text-tertiary mt-0.5">{description}</p>
              )}
            </div>
            <IconButton label="Đóng" size="sm" onClick={onClose}>
              <X size={15} />
            </IconButton>
          </header>
        )}

        {/* `my-auto` on the inner block centres a short form in a tall panel,
            yet yields to the top as soon as the content is tall enough to
            scroll — so a login form sits at optical centre while a long one
            still starts where you'd read it. */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain flex flex-col px-5 py-5">
          <div className="my-auto w-full">{children}</div>
        </div>

        {footer && (
          <footer
            className="px-5 py-4 flex-shrink-0"
            style={{ borderTop: "1px solid var(--border-secondary)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body
  );
}

/* ==========================================================================
   TOAST
   ========================================================================== */

type ToastType = "success" | "error" | "warning" | "info";

interface ToastData {
  id: string;
  type: ToastType;
  message: string;
}

const toastMeta: Record<
  ToastType,
  { icon: React.ReactNode; className: string }
> = {
  success: { icon: <CheckCircle size={16} weight="fill" />, className: "text-success" },
  error: { icon: <WarningOctagon size={16} weight="fill" />, className: "text-danger" },
  warning: { icon: <Warning size={16} weight="fill" />, className: "text-warning" },
  info: { icon: <Info size={16} weight="fill" />, className: "text-info" },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: string) => void;
}) {
  const meta = toastMeta[toast.type];
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss, paused]);

  return (
    <div
      className="card flex items-start gap-2.5 px-3 py-2.5 pop-in"
      style={{ boxShadow: "var(--shadow-md)" }}
      role="status"
      // Hovering holds the toast open — error messages are often worth reading
      // twice, and 5s is not enough to read one and act on it.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <span className={`flex-shrink-0 mt-px ${meta.className}`}>{meta.icon}</span>
      <span className="text-[12.5px] leading-snug flex-1 text-secondary">
        {toast.message}
      </span>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-muted hover:text-primary transition-colors flex-shrink-0"
        aria-label="Đóng thông báo"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: string) => void;
}) {
  const mounted = useMounted();
  if (toasts.length === 0 || !mounted) return null;

  return createPortal(
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-[min(22rem,calc(100vw-2rem))]"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>,
    document.body
  );
}

/* ==========================================================================
   DROPDOWN
   ========================================================================== */

export function Dropdown({
  trigger,
  children,
  align = "right",
  position = "bottom",
  width = "min-w-[190px]",
}: {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "left" | "right";
  position?: "top" | "bottom" | "right";
  width?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-flex">
      <div
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {trigger}
      </div>
      {open && (
        <div
          role="menu"
          className={`absolute ${
            position === "top"
              ? `bottom-full mb-1 ${align === "right" ? "right-0" : "left-0"}`
              : position === "right"
              ? "left-full ml-2 bottom-0"
              : `top-full mt-1 ${align === "right" ? "right-0" : "left-0"}`
          } z-50 ${width} card p-1 pop-in`}
          style={{ boxShadow: "var(--shadow-md)" }}
          onClick={() => setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  children,
  onClick,
  danger = false,
  icon,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  danger?: boolean;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`menu-item w-full flex items-center gap-2 py-1.5 text-[12.5px] rounded-md text-left disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? "text-danger hover:bg-[var(--danger-bg)]"
          : "text-secondary hover:bg-[var(--bg-hover)] hover:text-primary"
      }`}
    >
      {icon && <span className="flex-shrink-0 flex">{icon}</span>}
      <span className="truncate">{children}</span>
    </button>
  );
}

export function DropdownSeparator() {
  return (
    <div
      className="my-1 h-px"
      style={{ background: "var(--border-secondary)" }}
      role="separator"
    />
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return <div className="eyebrow px-2 pt-1.5 pb-1">{children}</div>;
}

/* ==========================================================================
   TABS
   ========================================================================== */

export interface TabItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className = "",
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex items-center gap-4 overflow-x-auto ${className}`}
      style={{ borderBottom: "1px solid var(--border-primary)" }}
    >
      {items.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center gap-1.5 pb-2 pt-1 text-[13px] font-medium whitespace-nowrap transition-colors ${
              active ? "text-primary" : "text-tertiary hover:text-secondary"
            }`}
          >
            {t.icon}
            {t.label}
            {typeof t.count === "number" && (
              <span className="badge badge-neutral ml-0.5">{t.count}</span>
            )}
            {/* Underline sits on the container's border, not beside it, and
                wipes out from the centre when the tab becomes current. */}
            <span
              className="tab-underline absolute left-0 right-0 -bottom-px h-0.5 rounded-full"
              style={{
                background: "var(--accent)",
                opacity: active ? 1 : 0,
                transform: active ? "scaleX(1)" : "scaleX(0.4)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}

/** Compact toggle for 2–4 mutually exclusive view modes. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="inline-flex items-center p-0.5 rounded-[8px] gap-0.5"
      style={{
        background: "var(--bg-subtle)",
        border: "1px solid var(--border-primary)",
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            title={o.title}
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={`h-[24px] px-2 rounded-[6px] text-[12px] font-medium inline-flex items-center gap-1 transition-colors ${
              active ? "text-primary" : "text-tertiary hover:text-secondary"
            }`}
            style={{
              background: active ? "var(--bg-surface)" : "transparent",
              boxShadow: active ? "var(--shadow-sm)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ==========================================================================
   DATA TABLE
   Sorting and pagination live here rather than in every page, so list screens
   behave identically and stay dense.
   ========================================================================== */

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  /** Enables the sort control. Return a primitive to sort by. */
  sortValue?: (item: T) => string | number;
  render?: (item: T) => React.ReactNode;
  /** Hide below the `md` breakpoint to keep mobile rows scannable. */
  hideOnMobile?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  emptyState?: React.ReactNode;
  onRowClick?: (item: T) => void;
  /** Rows per page. `0` disables pagination. */
  pageSize?: number;
  loading?: boolean;
  /** Marks a row as needing attention (overdue, rejected, error). */
  rowAccent?: (item: T) => "danger" | "warning" | "success" | undefined;
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = "Không có dữ liệu",
  emptyState,
  onRowClick,
  pageSize = 0,
  loading = false,
  rowAccent,
}: TableProps<T>) {
  const [sort, setSort] = React.useState<{ key: string; dir: "asc" | "desc" } | null>(
    null
  );
  const [page, setPage] = React.useState(0);

  const sorted = React.useMemo(() => {
    const list = data ?? [];
    if (!sort) return list;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sortValue) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
      // Vietnamese collation — "Đ" must sort after "D", not by code point.
      return String(av).localeCompare(String(bv), "vi") * dir;
    });
  }, [data, sort, columns]);

  const pageCount = pageSize > 0 ? Math.ceil(sorted.length / pageSize) : 1;
  const safePage = Math.min(page, Math.max(0, pageCount - 1));

  const visible = React.useMemo(() => {
    if (pageSize <= 0) return sorted;
    return sorted.slice(safePage * pageSize, safePage * pageSize + pageSize);
  }, [sorted, safePage, pageSize]);

  /* `safePage` above already clamps on read, so a filter that shrinks the
     list can't strand the view on an empty page — no correcting effect
     needed. */

  const toggleSort = (key: string) => {
    setSort((prev) =>
      prev?.key === key
        ? prev.dir === "asc"
          ? { key, dir: "desc" }
          : null
        : { key, dir: "asc" }
    );
    setPage(0);
  };

  const alignClass = (a?: Column<T>["align"]) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";

  return (
    <div className="flex flex-col min-w-0">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={{ width: col.width }}
                  className={`${alignClass(col.align)} ${
                    col.hideOnMobile ? "hidden md:table-cell" : ""
                  }`}
                  aria-sort={
                    sort?.key === col.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  {col.sortValue ? (
                    <button
                      className="th-sort"
                      onClick={() => toggleSort(col.key)}
                      type="button"
                    >
                      {col.header}
                      {sort?.key === col.key ? (
                        sort.dir === "asc" ? (
                          <CaretUp size={10} weight="bold" />
                        ) : (
                          <CaretDown size={10} weight="bold" />
                        )
                      ) : (
                        <CaretDown size={10} className="opacity-25" />
                      )}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={col.hideOnMobile ? "hidden md:table-cell" : ""}
                    >
                      <div className="skeleton h-3.5" style={{ width: "70%" }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  {emptyState ?? (
                    <div className="text-center py-10 text-[13px] text-tertiary">
                      {emptyMessage}
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              visible.map((item) => {
                const accent = rowAccent?.(item);
                return (
                  <tr
                    key={keyExtractor(item)}
                    className={onRowClick ? "is-clickable" : ""}
                    onClick={() => onRowClick?.(item)}
                    style={
                      accent
                        ? {
                            boxShadow: `inset 2px 0 0 0 var(--${accent})`,
                          }
                        : undefined
                    }
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`${alignClass(col.align)} ${
                          col.hideOnMobile ? "hidden md:table-cell" : ""
                        }`}
                      >
                        {col.render
                          ? col.render(item)
                          : String(
                              (item as Record<string, unknown>)[col.key] ?? ""
                            )}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {pageSize > 0 && sorted.length > pageSize && (
        <div
          className="flex items-center justify-between gap-3 px-3 py-2 flex-shrink-0"
          style={{ borderTop: "1px solid var(--border-secondary)" }}
        >
          <span className="text-[12px] text-tertiary tnum">
            {safePage * pageSize + 1}–
            {Math.min((safePage + 1) * pageSize, sorted.length)} trên{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <IconButton
              label="Trang trước"
              size="sm"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <CaretLeft size={14} />
            </IconButton>
            <span className="text-[12px] text-secondary tnum px-1">
              {safePage + 1}/{pageCount}
            </span>
            <IconButton
              label="Trang sau"
              size="sm"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            >
              <CaretRight size={14} />
            </IconButton>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   STAT TILE
   ========================================================================== */

export function StatTile({
  label,
  value,
  sublabel,
  icon,
  tone = "neutral",
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  sublabel?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
}) {
  const solid = tone === "accent" ? "accent" : tone;
  const toneColor = tone === "neutral" ? "var(--fg-tertiary)" : `var(--${solid})`;
  const toneWash =
    tone === "neutral"
      ? "var(--bg-subtle)"
      : `var(--${solid === "accent" ? "accent-subtle" : `${solid}-bg`})`;

  return (
    <Card onClick={onClick} className="px-3.5 py-3 flex items-start gap-3">
      {icon && (
        <span
          className="w-7 h-7 rounded-md inline-flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            color: toneColor,
            background: toneWash,
          }}
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[11.5px] text-tertiary truncate">{label}</p>
        <p className="text-[19px] font-semibold leading-tight tnum mt-0.5">
          {value}
        </p>
        {sublabel && (
          <p className="text-[11.5px] text-muted mt-0.5 truncate">{sublabel}</p>
        )}
      </div>
    </Card>
  );
}

/* ==========================================================================
   PROGRESS
   ========================================================================== */

export function ProgressBar({
  value,
  max = 100,
  showLabel = true,
  tone,
  size = "md",
}: {
  value: number;
  max?: number;
  showLabel?: boolean;
  tone?: "accent" | "success" | "warning" | "danger";
  size?: "sm" | "md";
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const auto =
    pct >= 100 ? "success" : pct >= 50 ? "accent" : pct >= 25 ? "warning" : "danger";
  const color = `var(--${tone ?? auto})`;

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div
        className={`flex-1 rounded-full overflow-hidden ${
          size === "sm" ? "h-1" : "h-1.5"
        }`}
        style={{ background: "var(--bg-sunken)" }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      {showLabel && (
        <span className="text-[11.5px] tnum text-tertiary w-8 text-right flex-shrink-0">
          {pct}%
        </span>
      )}
    </div>
  );
}

/* ==========================================================================
   SKELETON / EMPTY STATE
   ========================================================================== */

export function Skeleton({
  className = "",
  width = "100%",
  height = "14px",
}: {
  className?: string;
  width?: string;
  height?: string;
}) {
  return <div className={`skeleton ${className}`} style={{ width, height }} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center px-4 ${
        compact ? "py-8" : "py-14"
      }`}
    >
      {icon && (
        <div
          className="mb-3 w-9 h-9 rounded-lg flex items-center justify-center text-tertiary"
          style={{
            background: "var(--bg-subtle)",
            border: "1px solid var(--border-primary)",
          }}
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <h3 className="text-[13.5px] font-semibold">{title}</h3>
      {description && (
        <p className="text-[12.5px] text-tertiary max-w-xs mt-1 leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ==========================================================================
   MISC
   ========================================================================== */

/** Key/value row for detail panes. Label column stays fixed so rows align. */
export function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-1.5 text-[13px]">
      <span className="text-tertiary w-32 flex-shrink-0">{label}</span>
      <span className="min-w-0 flex-1 text-secondary">{children}</span>
    </div>
  );
}

export function Divider({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-px w-full ${className}`}
      style={{ background: "var(--border-secondary)" }}
      role="separator"
    />
  );
}
