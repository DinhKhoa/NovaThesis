"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "@/components/ThemeProvider";
import {
	Bell,
	BookOpen,
	CaretRight,
	ChartBar,
	ChatCircleDots,
	ChatCircleText,
	Checks,
	Clock,
	Files,
	Gear,
	GraduationCap,
	House,
	Kanban,
	List,
	MagnifyingGlass,
	Moon,
	Notebook,
	Robot,
	SignOut,
	Sun,
	UserCircle,
	Users,
	X,
} from "@phosphor-icons/react";
import { useAuthStore, type UserRole } from "@/lib/auth";
import { notificationsApi, type NotificationItem } from "@/lib/services";
import { formatRelative } from "@/lib/format";
import {
	Avatar,
	Dropdown,
	DropdownItem,
	DropdownLabel,
	DropdownSeparator,
	IconButton,
	Skeleton,
	useMounted,
} from "@/components/ui";

/* ==========================================================================
   NAVIGATION MODEL
   Grouped by what the user is trying to do, not by which module built it.
   Twelve flat links is a list; four labelled groups is a map.
   ========================================================================== */

interface NavItem {
	label: string;
	href: string;
	icon: React.ReactNode;
	roles?: UserRole[];
	/** Hiện nhãn "Chỉ đọc" — dùng cho nhóm Giám sát của quản trị viên. */
	readOnly?: boolean;
}

interface NavSection {
	label?: string;
	items: NavItem[];
	roles?: UserRole[];
	/** Một dòng giải thích dưới tiêu đề nhóm. */
	hint?: string;
}

const navSections: NavSection[] = [
	{
		items: [
			{ label: "Tổng quan", href: "/dashboard", icon: <House size={16} /> },
		],
	},
	{
		label: "Nghiên cứu",
		roles: ["STUDENT", "LECTURER"],
		items: [
			{
				label: "Đề tài",
				href: "/theses",
				icon: <GraduationCap size={16} />,
				roles: ["STUDENT", "LECTURER"],
			},
			{
				label: "Tiến độ",
				href: "/milestones",
				icon: <Kanban size={16} />,
				roles: ["STUDENT", "LECTURER"],
			},
			{
				label: "Tài liệu",
				href: "/documents",
				icon: <Files size={16} />,
				roles: ["STUDENT", "LECTURER"],
			},
			{
				label: "Trợ lý AI",
				href: "/ai-chat",
				icon: <Robot size={16} />,
				roles: ["STUDENT", "LECTURER"],
			},
		],
	},
	{
		label: "Trao đổi",
		items: [
			{
				label: "Phản hồi",
				href: "/feedbacks",
				icon: <ChatCircleDots size={16} />,
				roles: ["STUDENT", "LECTURER"],
			},
			{ label: "Thông báo", href: "/notifications", icon: <Bell size={16} /> },
			{ label: "Báo cáo", href: "/reports", icon: <BookOpen size={16} /> },
		],
	},
	{
		label: "Quản trị",
		roles: ["ADMIN"],
		items: [
			{
				label: "Người dùng",
				href: "/admin/users",
				icon: <Users size={16} />,
				roles: ["ADMIN"],
			},
			{
				label: "Nhật ký",
				href: "/admin/logs",
				icon: <Notebook size={16} />,
				roles: ["ADMIN"],
			},
			{
				label: "Giám sát AI",
				href: "/admin/statistics",
				icon: <ChartBar size={16} />,
				roles: ["ADMIN"],
			},
			{
				label: "Cấu hình",
				href: "/admin/settings",
				icon: <Gear size={16} />,
				roles: ["ADMIN"],
			},
		],
	},
];

/* Route → breadcrumb label. Detail routes fall back to the parent segment. */
const ROUTE_TITLES: Record<string, string> = {
	"/dashboard": "Tổng quan",
	"/theses": "Đề tài",
	"/theses/new": "Tạo đề tài",
	"/milestones": "Tiến độ",
	"/documents": "Tài liệu",
	"/ai-chat": "Trợ lý AI",
	"/feedbacks": "Phản hồi",
	"/notifications": "Thông báo",
	"/reports": "Báo cáo",
	"/profile": "Hồ sơ",
	"/admin/users": "Người dùng",
	"/admin/logs": "Nhật ký hệ thống",
	"/admin/statistics": "Vận hành hệ thống AI",
	"/admin/settings": "Cấu hình",
};

const ROLE_LABELS: Record<UserRole, string> = {
	ADMIN: "Quản trị viên",
	LECTURER: "Giảng viên",
	STUDENT: "Sinh viên",
};

/**
 * Mục điều hướng này có hiện với vai trò kia không.
 *
 * Khi CHƯA biết vai trò (`initialize()` chạy chưa xong) thì ẩn mọi mục có giới
 * hạn. Trước đây nhánh này trả `true`, nên trong khoảnh khắc đầu tiên sau khi
 * tải trang, toàn bộ menu Quản trị hiện ra cho mọi người dùng rồi mới biến mất.
 */
function visibleFor(role: UserRole | undefined, allowed?: UserRole[]) {
	if (!allowed) return true;
	if (!role) return false;
	return allowed.includes(role);
}

function useIsActive() {
	const pathname = usePathname();
	return React.useCallback(
		(href: string) => pathname === href || pathname.startsWith(href + "/"),
		[pathname],
	);
}

/* ==========================================================================
   BRAND
   ========================================================================== */

function BrandMark({ compact = false }: { compact?: boolean }) {
	return (
		<Link
			href="/dashboard"
			className="flex items-center min-w-0 group"
			aria-label="NovaThesis — về trang tổng quan">
			{!compact && (
				<img
					src="/LogoNovaThesis.png"
					alt="NovaThesis"
					className="h-10 w-auto object-contain"
				/>
			)}
		</Link>
	);
}

/* ==========================================================================
   SIDEBAR
   ========================================================================== */

export function Sidebar({
	collapsed,
	onToggleCollapsed,
	mobileOpen,
	onCloseMobile,
}: {
	collapsed: boolean;
	onToggleCollapsed: () => void;
	mobileOpen: boolean;
	onCloseMobile: () => void;
}) {
	const { user, logout } = useAuthStore();
	const isActive = useIsActive();

	const sections = navSections
		.filter((s) => visibleFor(user?.role, s.roles))
		.map((s) => ({
			...s,
			items: s.items.filter((i) => visibleFor(user?.role, i.roles)),
		}))
		.filter((s) => s.items.length > 0);

	return (
		<>
			{/* Mobile scrim */}
			{mobileOpen && (
				<div
					className="fixed inset-0 z-40 lg:hidden fade-in"
					style={{ background: "rgb(8 12 18 / 0.5)" }}
					onClick={onCloseMobile}
					aria-hidden="true"
				/>
			)}

			<aside
				className={`fixed inset-y-0 left-0 z-50 flex flex-col transition-transform duration-200 lg:translate-x-0 ${
					mobileOpen ? "translate-x-0" : "-translate-x-full"
				}`}
				style={{
					width: collapsed
						? "var(--sidebar-width-collapsed)"
						: "var(--sidebar-width)",
					background: "var(--bg-surface)",
					borderRight: "1px solid var(--border-primary)",
					transitionProperty: "transform, width",
					/* Named so it becomes its own view-transition group and can opt out
             of the page animation — a sidebar that crossfades on every
             navigation destroys the one fixed reference point on screen. */
					viewTransitionName: "app-sidebar",
				}}>
				{/* Header */}
				<div
					className="h-[var(--topbar-height)] flex items-center justify-between px-3 flex-shrink-0"
					style={{ borderBottom: "1px solid var(--border-secondary)" }}>
					<BrandMark compact={collapsed} />
					<IconButton
						label="Đóng menu"
						size="sm"
						className="lg:hidden"
						onClick={onCloseMobile}>
						<X size={16} />
					</IconButton>
				</div>

				{/* Nav */}
				<nav className="flex-1 overflow-y-auto overflow-x-hidden py-2 px-2">
					{sections.map((section, si) => (
						<div key={section.label ?? si} className={si > 0 ? "mt-4" : ""}>
							{section.label && !collapsed && (
								<div className="eyebrow px-2 pb-1.5 flex items-center gap-1.5">
									<span>{section.label}</span>
									{section.hint && (
										<span
											className="normal-case tracking-normal font-normal px-1 py-px rounded text-[9.5px]"
											style={{
												background: "var(--bg-subtle)",
												color: "var(--fg-muted)",
											}}>
											{section.hint}
										</span>
									)}
								</div>
							)}
							{section.label && collapsed && si > 0 && (
								<div
									className="mx-2 mb-2 h-px"
									style={{ background: "var(--border-secondary)" }}
								/>
							)}
							<ul className="flex flex-col gap-px">
								{section.items.map((item) => {
									const active = isActive(item.href);
									return (
										<li key={item.href}>
											<Link
												href={item.href}
												aria-current={active ? "page" : undefined}
												title={
													collapsed
														? item.readOnly
															? `${item.label} — chỉ đọc`
															: item.label
														: undefined
												}
												onClick={onCloseMobile}
												className={`nav-item group relative flex items-center gap-2.5 h-8 rounded-[7px] text-[13px] ${
													active ? "is-active" : ""
												} ${collapsed ? "justify-center px-0" : "px-2"} ${
													active
														? "text-primary font-medium"
														: "text-secondary hover:text-primary"
												}`}
												style={{
													background: active
														? "var(--bg-active)"
														: "transparent",
												}}>
												{/* Active rail — reads at a glance even when collapsed. */}
												{active && (
													<span
														className="nav-rail absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-full"
														style={{ background: "var(--accent)" }}
														aria-hidden="true"
													/>
												)}
												<span className="icon-card icon-card-sm flex-shrink-0">
													<span
														className="icon-box flex items-center justify-center"
														style={{
															color: active
																? "var(--accent)"
																: "var(--fg-tertiary)",
														}}>
														{item.icon}
													</span>
												</span>
												{!collapsed && (
													<span className="truncate">{item.label}</span>
												)}

												{collapsed && (
													<span
														className="pointer-events-none absolute left-full ml-2 px-2 py-1 rounded-md text-[12px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity z-50 card"
														style={{ boxShadow: "var(--shadow-md)" }}>
														{item.label}
													</span>
												)}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>

				{/* Footer: identity + collapse */}
				<div
					className="flex-shrink-0 p-2"
					style={{ borderTop: "1px solid var(--border-secondary)" }}>
					{user ? (
						<Dropdown
							align="left"
							position="right"
							width="min-w-[200px]"
							trigger={
								<button
									className={`w-full flex items-center gap-2 h-10 rounded-[7px] transition-colors hover:bg-[var(--bg-hover)] ${
										collapsed ? "justify-center px-0" : "px-1.5"
									}`}
									aria-label="Tài khoản">
									<Avatar
										name={user.full_name}
										src={user.avatar_url}
										size="sm"
									/>
									{!collapsed && (
										<span className="flex flex-col items-start min-w-0 flex-1 text-left leading-tight">
											<span className="text-[12.5px] font-medium truncate w-full">
												{user.full_name}
											</span>
											<span className="text-[10.5px] text-tertiary truncate w-full">
												{ROLE_LABELS[user.role]}
											</span>
										</span>
									)}
								</button>
							}>
							<DropdownLabel>{user.email}</DropdownLabel>
							<DropdownItem
								icon={<UserCircle size={15} />}
								onClick={() => {
									window.location.href = "/profile";
								}}>
								Hồ sơ cá nhân
							</DropdownItem>
							<DropdownSeparator />
							<DropdownItem
								danger
								icon={<SignOut size={15} />}
								onClick={logout}>
								Đăng xuất
							</DropdownItem>
						</Dropdown>
					) : (
						<Link
							href="/login"
							className={`w-full flex items-center gap-2 h-10 rounded-[7px] text-[12.5px] text-secondary transition-colors hover:bg-[var(--bg-hover)] hover:text-primary ${
								collapsed ? "justify-center px-0" : "px-1.5"
							}`}
							title="Đăng nhập">
							<SignOut size={15} className="rotate-180 flex-shrink-0" />
							{!collapsed && <span>Đăng nhập</span>}
						</Link>
					)}

					<button
						onClick={onToggleCollapsed}
						className="hidden lg:flex w-full items-center justify-center gap-1.5 h-7 mt-1 rounded-[7px] text-[11.5px] text-tertiary hover:text-primary hover:bg-[var(--bg-hover)] transition-colors"
						aria-label={
							collapsed
								? "Mở rộng thanh điều hướng"
								: "Thu gọn thanh điều hướng"
						}>
						<CaretRight
							size={13}
							className={`transition-transform ${collapsed ? "" : "rotate-180"}`}
						/>
						{!collapsed && <span>Thu gọn</span>}
					</button>
				</div>
			</aside>
		</>
	);
}

/* ==========================================================================
   COMMAND PALETTE
   Twelve destinations behind ⌘K beats twelve links you have to aim at.
   ========================================================================== */

/* Mounted only while open (see the caller), so its state starts fresh every
   time instead of needing effects to reset the query and cursor. */
function CommandPalette({ onClose }: { onClose: () => void }) {
	const router = useRouter();
	const { user } = useAuthStore();
	const [query, setQuery] = React.useState("");
	const [cursor, setCursor] = React.useState(0);

	const entries = React.useMemo(
		() =>
			navSections
				.filter((s) => visibleFor(user?.role, s.roles))
				.flatMap((s) =>
					s.items
						.filter((i) => visibleFor(user?.role, i.roles))
						.map((i) => ({ ...i, section: s.label })),
				),
		[user?.role],
	);

	const results = React.useMemo(() => {
		const q = query
			.trim()
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		if (!q) return entries;
		// Match on the accent-stripped label so "de tai" finds "Đề tài" — nobody
		// types diacritics into a search box.
		return entries.filter((e) =>
			e.label
				.toLowerCase()
				.normalize("NFD")
				.replace(/[\u0300-\u036f]/g, "")
				.replace(/đ/g, "d")
				.includes(q.replace(/đ/g, "d")),
		);
	}, [entries, query]);

	const go = (href: string) => {
		router.push(href);
		onClose();
	};

	return (
		<div className="fixed inset-0 z-[80] flex items-start justify-center pt-[12vh] px-4">
			<div
				className="fixed inset-0 fade-in"
				style={{ background: "rgb(8 12 18 / 0.5)" }}
				onClick={onClose}
				aria-hidden="true"
			/>
			<div
				className="relative w-full max-w-md card overflow-hidden pop-in"
				style={{ boxShadow: "var(--shadow-lg)" }}
				role="dialog"
				aria-modal="true"
				aria-label="Tìm nhanh">
				<div
					className="flex items-center gap-2 px-3 h-11"
					style={{ borderBottom: "1px solid var(--border-secondary)" }}>
					<MagnifyingGlass size={15} className="text-muted flex-shrink-0" />
					<input
						autoFocus
						value={query}
						onChange={(e) => {
							setQuery(e.target.value);
							setCursor(0);
						}}
						onKeyDown={(e) => {
							if (e.key === "Escape") onClose();
							if (e.key === "ArrowDown") {
								e.preventDefault();
								setCursor((c) => Math.min(results.length - 1, c + 1));
							}
							if (e.key === "ArrowUp") {
								e.preventDefault();
								setCursor((c) => Math.max(0, c - 1));
							}
							if (e.key === "Enter" && results[cursor])
								go(results[cursor].href);
						}}
						placeholder="Đi tới trang…"
						className="flex-1 bg-transparent border-0 outline-none text-[13.5px] placeholder:text-[var(--fg-muted)]"
						aria-label="Tìm trang"
					/>
				</div>

				<div className="max-h-72 overflow-y-auto p-1.5">
					{results.length === 0 ? (
						<p className="text-[12.5px] text-tertiary text-center py-6">
							Không tìm thấy trang phù hợp.
						</p>
					) : (
						results.map((r, i) => (
							<button
								key={r.href}
								onMouseEnter={() => setCursor(i)}
								onClick={() => go(r.href)}
								className="row-hover w-full flex items-center gap-2.5 px-2 h-9 rounded-md text-[13px] text-left"
								style={{
									background: i === cursor ? "var(--bg-hover)" : "transparent",
									color:
										i === cursor ? "var(--fg-primary)" : "var(--fg-secondary)",
								}}>
								<span className="text-tertiary flex-shrink-0 flex">
									{r.icon}
								</span>
								<span className="flex-1 truncate">{r.label}</span>
								{r.section && (
									<span className="text-[11px] text-muted">{r.section}</span>
								)}
							</button>
						))
					)}
				</div>
			</div>
		</div>
	);
}

/* ==========================================================================
   THEME TOGGLE
   ========================================================================== */

function ThemeSwitch() {
	const { resolvedTheme, setTheme } = useTheme();
	const mounted = useMounted();

	// Renders a same-size placeholder pre-hydration; swapping icons on mount
	// would otherwise shift the toolbar.
	if (!mounted) return <span className="w-8 h-8" aria-hidden="true" />;

	const dark = resolvedTheme === "dark";
	return (
		<IconButton
			label={dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"}
			onClick={() => setTheme(dark ? "light" : "dark")}>
			{dark ? <Sun size={16} /> : <Moon size={16} />}
		</IconButton>
	);
}

/* ==========================================================================
   NOTIFICATION DROPDOWN
   ========================================================================== */

const typeIconMap: Record<string, React.ReactNode> = {
	MILESTONE: <Kanban size={14} className="text-warning" />,
	FEEDBACK: <ChatCircleText size={14} className="text-info" />,
	THESIS: <GraduationCap size={14} className="text-success" />,
	SYSTEM: <Bell size={14} className="text-accent" />,
};

/**
 * Chuông thông báo.
 *
 * Danh sách được nạp KHI MỞ chứ không nạp sẵn: mỗi lần tải trang mà gọi thêm
 * một request cho một danh sách phần lớn thời gian không ai nhìn là lãng phí,
 * trong khi con số trên chuông đã do `useUnreadCount()` lo.
 */
function NotificationDropdown({
	unreadCount,
	onChanged,
}: {
	unreadCount: number;
	/** Báo cho chuông biết phải đếm lại sau khi một thông báo được đọc. */
	onChanged: () => void;
}) {
	const [open, setOpen] = React.useState(false);
	const ref = React.useRef<HTMLDivElement>(null);
	const router = useRouter();

	/* `items === null` VỪA là "chưa tải lần nào" VỪA là tín hiệu đang tải lần
	   đầu, nên không cần thêm cờ `loading`. Từ lần mở thứ hai trở đi `items` đã
	   có dữ liệu và ta cố ý giữ nguyên nó trong lúc nạp lại — danh sách nháy
	   trắng rồi mới hiện lại đúng thứ người dùng vừa nhìn thấy là tệ hơn. */
	const [items, setItems] = React.useState<NotificationItem[] | null>(null);
	const [error, setError] = React.useState<string | null>(null);

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

	/* Nạp lại mỗi lần mở. Giữ lại kết quả cũ trong lúc chờ để danh sách không
	   nháy trắng rồi mới hiện — người dùng vừa nhìn thấy nó một giây trước. */
	React.useEffect(() => {
		if (!open) return;
		let cancelled = false;

		notificationsApi
			.list({ per_page: 5 })
			.then((res) => {
				if (cancelled) return;
				setItems(res.data);
				setError(null);
			})
			.catch(() => {
				if (!cancelled) setError("Không tải được thông báo.");
			});

		return () => {
			cancelled = true;
		};
	}, [open]);

	const openNotification = async (n: NotificationItem) => {
		setOpen(false);

		/* Đánh dấu đã đọc ngay trên giao diện rồi mới gọi API: người dùng đã bấm
		   vào nó, chờ một vòng mạng mới đổi màu là thừa. Lỗi thì lần mở sau tự
		   hiện lại đúng trạng thái từ server. */
		if (!n.is_read) {
			setItems((prev) =>
				(prev ?? []).map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
			);
			void notificationsApi
				.markRead(n.id)
				.then(onChanged)
				.catch(() => undefined);
		}

		// `link` do server đặt, trỏ đúng mốc/tài liệu liên quan. Không có thì về
		// trang danh sách — vẫn tốt hơn một cú bấm không làm gì cả.
		router.push(n.link ?? "/notifications");
	};

	return (
		<div ref={ref} className="relative inline-flex">
			<button
				onClick={() => setOpen((v) => !v)}
				className="btn-icon relative"
				aria-label={
					unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"
				}
				aria-haspopup="menu"
				aria-expanded={open}>
				<Bell size={16} />
				{unreadCount > 0 && (
					<span
						className="absolute top-0.5 right-0.5 min-w-[12px] h-[12px] px-0.5 rounded-full text-[8.5px] font-semibold flex items-center justify-center tnum"
						style={{ background: "var(--danger)", color: "#fff" }}>
						{unreadCount > 9 ? "9+" : unreadCount}
					</span>
				)}
			</button>

			{open && (
				<div
					role="menu"
					className="absolute top-full right-0 mt-1.5 z-50 w-[260px] card p-0 pop-in overflow-hidden"
					style={{ boxShadow: "var(--shadow-lg)" }}>
					{/* Header */}
					<div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--border-secondary)]">
						<span className="text-[13px] font-semibold text-primary">Thông báo</span>
						{unreadCount > 0 && (
							<span
								className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full"
								style={{
									background: "var(--accent-subtle)",
									color: "var(--accent)",
								}}>
								{unreadCount} chưa đọc
							</span>
						)}
					</div>

					{/* Notification list */}
					<div className="max-h-[320px] overflow-y-auto">
						{items === null && error === null ? (
							<div className="p-3 flex flex-col gap-2">
								{[0, 1, 2].map((i) => (
									<Skeleton key={i} className="h-12 rounded-lg" />
								))}
							</div>
						) : error ? (
							<div className="px-4 py-8 text-center text-[13px] text-tertiary">
								{error}
							</div>
						) : (items?.length ?? 0) === 0 ? (
							<div className="px-4 py-8 text-center text-[13px] text-tertiary">
								Bạn chưa có thông báo nào.
							</div>
						) : (
							items?.map((n) => (
								<button
									key={n.id}
									type="button"
									role="menuitem"
									onClick={() => void openNotification(n)}
									className={`w-full flex items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)] ${
										!n.is_read ? "bg-[var(--bg-secondary)]" : ""
									}`}>
									<div className="mt-0.5 flex-shrink-0 p-1.5 rounded-lg bg-[var(--bg-subtle)]">
										{typeIconMap[n.type]}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-1.5">
											<span
												className={`text-[12.5px] truncate ${
													!n.is_read
														? "font-semibold text-primary"
														: "font-medium text-secondary"
												}`}>
												{n.title}
											</span>
											{!n.is_read && (
												<span
													className="w-1.5 h-1.5 rounded-full flex-shrink-0"
													style={{ background: "var(--accent)" }}
												/>
											)}
										</div>
										<p className="text-[11.5px] text-tertiary leading-snug mt-0.5 line-clamp-2">
											{n.content}
										</p>
										<span className="text-[10.5px] text-muted mt-1 flex items-center gap-1">
											<Clock size={10} /> {formatRelative(n.created_at)}
										</span>
									</div>
								</button>
							))
						)}
					</div>

					{/* Footer */}
					<div className="border-t border-[var(--border-secondary)]">
						<button
							type="button"
							onClick={() => {
								setOpen(false);
								router.push("/notifications");
							}}
							className="w-full px-3.5 py-2.5 text-[12.5px] font-medium text-center transition-colors hover:bg-[var(--bg-hover)]"
							style={{ color: "var(--accent)" }}>
							Xem tất cả thông báo
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

/* ==========================================================================
   SỐ THÔNG BÁO CHƯA ĐỌC
   ========================================================================== */

/**
 * Chuông thông báo tự lấy số của nó.
 *
 * Hỏi lại mỗi 60 giây thay vì mở WebSocket: một con số trên chuông không đáng
 * để duy trì kết nối thường trực, và endpoint `/unread-count` là một câu COUNT
 * trên index bộ phận `WHERE is_read = false`.
 *
 * Chỉ hỏi lại khi tab đang hiển thị — polling nền trong ba mươi tab bỏ quên là
 * cách chắc chắn nhất để tự tạo tải cho chính máy chủ của mình.
 */
function useUnreadCount(enabled: boolean): { count: number; refresh: () => void } {
  const [count, setCount] = React.useState(0);
  /* Đếm lại theo yêu cầu: đọc một thông báo ngay trong panel phải làm con số
     trên chuông giảm ngay, chứ không đợi hết chu kỳ 60 giây. */
  const [nonce, setNonce] = React.useState(0);
  const pathname = usePathname();

  React.useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const load = () => {
      if (document.visibilityState !== "visible") return;
      notificationsApi
        .unreadCount()
        .then((r) => {
          if (!cancelled) setCount(r.count);
        })
        .catch(() => undefined);
    };

    load();
    const timer = setInterval(load, 60_000);
    document.addEventListener("visibilitychange", load);

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
    // Điều hướng cũng là một tín hiệu: vừa rời trang Thông báo thì con số phải
    // phản ánh những gì người dùng vừa đọc.
  }, [enabled, pathname, nonce]);

  const refresh = React.useCallback(() => setNonce((n) => n + 1), []);

  return { count, refresh };
}

/* ==========================================================================
   TOPBAR
   ========================================================================== */

export function Topbar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
	const pathname = usePathname();
	const { user } = useAuthStore();
	const [paletteOpen, setPaletteOpen] = React.useState(false);
	const { count: unreadCount, refresh: refreshUnread } = useUnreadCount(Boolean(user));

	/* Nhãn phím tắt phụ thuộc hệ điều hành — một thứ chỉ biết được ở client.
	   `useMounted()` dựa trên `useSyncExternalStore`, nên nó không gọi `setState`
	   trong effect và không tạo thêm một lượt render như cách cũ. */
	const mounted = useMounted();
	const shortcutKey =
		mounted && /Win|Linux/.test(navigator.platform || navigator.userAgent)
			? "Ctrl K"
			: "⌘K";

	React.useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
				e.preventDefault();
				setPaletteOpen((v) => !v);
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	const crumbs = React.useMemo(() => {
		const exact = ROUTE_TITLES[pathname];
		if (exact) return [exact];

		// Detail route (/theses/12): show parent then a generic leaf.
		const segments = pathname.split("/").filter(Boolean);
		const parent = "/" + segments.slice(0, 1).join("/");
		const parentTitle = ROUTE_TITLES[parent];
		if (parentTitle && segments.length > 1) return [parentTitle, "Chi tiết"];
		return [parentTitle ?? "NovaThesis"];
	}, [pathname]);

	return (
		<>
			<header
				className="sticky top-0 z-30 h-[var(--topbar-height)] flex items-center gap-2 px-3 sm:px-4 flex-shrink-0"
				style={{
					background: "var(--bg-surface)",
					borderBottom: "1px solid var(--border-primary)",
					viewTransitionName: "app-topbar",
				}}>
				<IconButton
					label="Mở menu"
					className="lg:hidden"
					onClick={onOpenMobileNav}>
					<List size={17} />
				</IconButton>

				<nav
					aria-label="Breadcrumb"
					className="flex items-center gap-1.5 min-w-0">
					{crumbs.map((c, i) => (
						<React.Fragment key={c}>
							{i > 0 && (
								<CaretRight size={11} className="text-muted flex-shrink-0" />
							)}
							<span
								className={`text-[13px] truncate ${
									i === crumbs.length - 1
										? "font-medium text-primary"
										: "text-tertiary"
								}`}>
								{c}
							</span>
						</React.Fragment>
					))}
				</nav>

				<div className="flex-1" />

				{/* Search affordance: full control on desktop, icon on mobile. */}
				<button
					onClick={() => setPaletteOpen(true)}
					className="hidden sm:flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-[8px] text-[12.5px] text-tertiary transition-colors hover:text-secondary hover:border-[var(--border-strong)] w-52"
					style={{
						background: "var(--bg-subtle)",
						border: "1px solid var(--border-primary)",
					}}>
					<MagnifyingGlass size={14} className="flex-shrink-0" />
					<span className="flex-1 text-left">Tìm nhanh…</span>
				</button>
				<IconButton
					label="Tìm nhanh"
					className="sm:hidden"
					onClick={() => setPaletteOpen(true)}>
					<MagnifyingGlass size={16} />
				</IconButton>

				<ThemeSwitch />

				<NotificationDropdown
					unreadCount={unreadCount}
					onChanged={refreshUnread}
				/>

				<Link
					href="/profile"
					className="flex items-center ml-0.5"
					aria-label="Hồ sơ cá nhân">
					<Avatar name={user?.full_name} src={user?.avatar_url} size="sm" />
				</Link>
			</header>

			{paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
		</>
	);
}

/* ==========================================================================
   PAGE HEADER
   Title, one line of purpose, and the actions. No badges announcing that the
   product is a platform.
   ========================================================================== */

export function PageHeader({
	title,
	description,
	actions,
	meta,
	className = "",
}: {
	title: string;
	description?: string;
	/** Inline status chips or counts that qualify the title. */
	meta?: React.ReactNode;
	actions?: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4 ${className}`}>
			<div className="min-w-0">
				<div className="flex items-center gap-2 flex-wrap">
					<h1 className="text-[17px] font-semibold tracking-tight">{title}</h1>
					{meta}
				</div>
				{description && (
					<p className="text-[12.5px] text-tertiary mt-0.5 max-w-2xl">
						{description}
					</p>
				)}
			</div>
			{actions && (
				<div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
			)}
		</div>
	);
}

/* Toolbar strip that sits above a table: search on the left, filters right. */
export function Toolbar({
	children,
	className = "",
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<div
			className={`flex flex-col sm:flex-row sm:items-center gap-2 px-3 py-2 ${className}`}
			style={{ borderBottom: "1px solid var(--border-secondary)" }}>
			{children}
		</div>
	);
}
