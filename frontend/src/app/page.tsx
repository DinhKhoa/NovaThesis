"use client";

import React from "react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import {
	ArrowRight,
	ChatCircleDots,
	Files,
	GraduationCap,
	Kanban,
	Moon,
	Quotes,
	ShieldCheck,
	Sun,
} from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMounted } from "@/components/ui";
import { AuthSheet, type AuthMode } from "@/components/auth-sheet";
import { LecturerApplySheet } from "@/components/lecturer-apply-sheet";

/* ==========================================================================
   PUBLIC ENTRY PAGE
   The audience is students and lecturers at one university who were sent a
   link — not visitors being sold a product. So: say what it is, say who it's
   for, and get out of the way of the login button.
   ========================================================================== */

const CAPABILITIES = [
	{
		icon: <Kanban size={17} weight="duotone" />,
		title: "Tiến độ theo mốc",
		body: "Mỗi đề tài có các mốc công việc với hạn nộp và trạng thái phê duyệt rõ ràng. Không còn phải hỏi “đến đâu rồi?” qua tin nhắn.",
	},
	{
		icon: <Files size={17} weight="duotone" />,
		title: "Tài liệu có phiên bản",
		body: "Bản thảo v1, v2 và bản cuối được lưu song song thay vì ghi đè. Giảng viên luôn xem đúng bản mình đã nhận xét.",
	},
	{
		icon: <ChatCircleDots size={17} weight="duotone" />,
		title: "Nhận xét đúng chỗ",
		body: "Phản hồi của giảng viên gắn trực tiếp vào mốc tiến độ hoặc tài liệu liên quan, và có trạng thái đã xử lý.",
	},
	{
		icon: <Quotes size={17} weight="duotone" />,
		title: "Trợ lý AI có dẫn nguồn",
		body: "Hỏi đáp dựa trên chính tài liệu trong đề tài của bạn. Mỗi câu trả lời kèm tên tệp và số trang để đối chiếu.",
	},
];

function ThemeButton() {
	const { resolvedTheme, setTheme } = useTheme();
	const mounted = useMounted();
	if (!mounted) return <span className="w-8 h-8" aria-hidden="true" />;

	const dark = resolvedTheme === "dark";
	return (
		<button
			onClick={() => setTheme(dark ? "light" : "dark")}
			className="btn-icon"
			aria-label={
				dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối"
			}>
			{dark ? <Sun size={16} /> : <Moon size={16} />}
		</button>
	);
}

function LandingContent() {
	const router = useRouter();
	const params = useSearchParams();

	/* The URL stays the source of truth. /login and /register redirect here
     with ?auth=, so every existing link, bookmark and email pointing at the
     old routes still opens the right panel. */
	const authParam = params.get("auth");
	const mode: AuthMode = authParam === "register" ? "register" : "login";
	const open = authParam === "login" || authParam === "register";

	const openAuth = (m: AuthMode) => {
		router.push(`/?auth=${m}`, { scroll: false });
	};

	// `replace`, so dismissing the panel does not leave a history entry that
	// the back button would reopen it from.
	const closeAuth = () => router.replace("/", { scroll: false });

	/* Đơn đăng ký giảng viên giữ trạng thái trong React chứ không đi qua URL như
	   `?auth=`. Lý do của `?auth=` là những liên kết /login và /register cũ đang
	   nằm trong email và dấu trang của người dùng; lá đơn này không có liên kết
	   ngoài nào trỏ tới, nên một tham số truy vấn chỉ thêm việc mà không mua được
	   gì. */
	const [lecturerApplyOpen, setLecturerApplyOpen] = React.useState(false);

	const openLecturerApply = () => {
		// Hai bảng trượt cùng bật là hai hộp thoại chồng nhau, và cái bị che vẫn
		// giữ bẫy focus của nó. Đóng bảng đăng nhập trước.
		if (open) closeAuth();
		setLecturerApplyOpen(true);
	};

	return (
		<div className="min-h-dvh flex flex-col surface-canvas">
			{/* ---------- Header ---------- */}
			<header
				className="sticky top-0 z-20 surface-base"
				style={{ borderBottom: "1px solid var(--border-primary)" }}>
				<div className="mx-auto max-w-5xl px-5 py-2.5 flex items-center gap-3">
					<img
						src="/LogoNovaThesis.png"
						alt="NovaThesis Logo"
						className="h-6 w-auto object-contain"
					/>

					<div className="flex-1" />

					<ThemeButton />
					<button
						onClick={() => openAuth("login")}
						className="btn btn-primary btn-sm">
						Đăng nhập
					</button>
				</div>
			</header>

			<main className="flex-1">
				{/* ---------- Hero ---------- */}
				<section className="hero-dots min-h-[80dvh] flex items-center">
					<div className="mx-auto max-w-5xl px-5 py-16 w-full relative z-[1]">
						<p className="eyebrow mb-3">Tích hợp AI hỗ trợ học thuật</p>
						<h1 className="text-[32px] sm:text-[40px] font-semibold tracking-[-0.025em] leading-[1.15] max-w-2xl">
							HỆ THỐNG QUẢN LÝ LUẬN VĂN VÀ ĐỀ TÀI NGHIÊN CỨU
						</h1>

						<div className="flex flex-wrap items-center gap-2.5 mt-7">
							<button
								onClick={() => openAuth("login")}
								className="btn btn-primary btn-lg">
								Đăng nhập
								<span className="btn-trail">
									<ArrowRight size={15} />
								</span>
							</button>
							<button
								onClick={() => openAuth("register")}
								className="btn btn-secondary btn-lg">
								Đăng ký tài khoản
							</button>
						</div>

						{/* Giảng viên không tự mở được tài khoản như sinh viên — đơn của họ
					    phải qua tay quản trị viên. Đặt lối vào riêng ở đây, nhỏ hơn hai
					    nút chính, vì đó là con đường của thiểu số người dùng. */}
						<p className="text-[12.5px] text-tertiary mt-4">
							Nếu bạn là giảng viên hãy{" "}
							<button
								onClick={openLecturerApply}
								className="text-accent hover:underline font-medium cursor-pointer">
								Gửi yêu cầu đăng ký tại đây.
							</button>
						</p>
					</div>
				</section>

				{/* ---------- Capabilities ---------- */}
				<section
					className="surface-base"
					style={{
						borderTop: "1px solid var(--border-primary)",
						borderBottom: "1px solid var(--border-primary)",
					}}>
					<div className="mx-auto max-w-5xl px-5 py-12">
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-8">
							{CAPABILITIES.map((c) => (
								<div key={c.title} className="group flex gap-3">
									<div className="icon-card flex-shrink-0">
										<span
											className="icon-box w-8 h-8"
											style={{
												background: "var(--accent-subtle)",
												color: "var(--accent)",
											}}
											aria-hidden="true">
											{c.icon}
										</span>
									</div>
									<div className="min-w-0">
										<h2 className="text-[14px] font-semibold mb-1">
											{c.title}
										</h2>
										<p className="text-[13px] text-tertiary leading-relaxed">
											{c.body}
										</p>
									</div>
								</div>
							))}
						</div>
					</div>
				</section>

				{/* ---------- Data handling ----------
            Students upload unpublished research here. Saying plainly how it is
            stored belongs on the page they see before signing in. */}
				<section className="mx-auto max-w-5xl px-5 py-12">
					<div className="flex gap-3 max-w-2xl">
						<ShieldCheck
							size={18}
							weight="duotone"
							className="text-tertiary flex-shrink-0 mt-0.5"
						/>
						<div>
							<h2 className="text-[14px] font-semibold mb-1.5">
								Về dữ liệu của bạn
							</h2>
							<p className="text-[13px] text-tertiary leading-relaxed">
								Tài liệu luận văn được lưu ở vùng riêng tư và chỉ truy cập được
								bằng liên kết có chữ ký, có thời hạn. Trợ lý AI chỉ tìm trong
								phạm vi tài liệu mà tài khoản của bạn có quyền đọc.
							</p>
						</div>
					</div>
				</section>
			</main>

			<footer style={{ borderTop: "1px solid var(--border-primary)" }}>
				<div className="mx-auto max-w-5xl px-5 py-5 flex flex-wrap items-center gap-x-4 gap-y-1.5">
					<span className="text-[12px] text-muted">
						© {new Date().getFullYear()} Copyright by Dinh Khoa - Nova Thesis
					</span>
				</div>
			</footer>

			<AuthSheet
				open={open}
				mode={mode}
				onModeChange={openAuth}
				onClose={closeAuth}
			/>

			<LecturerApplySheet
				open={lecturerApplyOpen}
				onClose={() => setLecturerApplyOpen(false)}
			/>
		</div>
	);
}

export default function LandingPage() {
	/* useSearchParams needs a Suspense boundary, otherwise the whole route
     opts out of static rendering. */
	return (
		<React.Suspense fallback={null}>
			<LandingContent />
		</React.Suspense>
	);
}
