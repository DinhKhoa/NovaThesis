"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FloppyDisk, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Button, Card, Input, Select, Textarea } from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { RequireRole } from "@/lib/guards";
import { toast } from "@/lib/toast";
import { isApiError } from "@/lib/api";
import { thesesApi } from "@/lib/services";

const FIELDS = [
	"Công nghệ phần mềm",
	"Trí tuệ nhân tạo & Dữ liệu",
	"Hệ thống nhúng & IoT",
	"An toàn thông tin",
	"Mạng máy tính & Cloud",
	"Hệ thống thông tin quản lý",
	"Thị giác máy tính",
	"Robot & Tự động hóa",
];

/**
 * Chỉ sinh viên và giảng viên đề xuất được đề tài (`theses.routes.ts` POST `/`).
 * Quản trị viên gõ thẳng đường dẫn này sẽ bị đưa về trang tổng quan thay vì
 * điền xong cả biểu mẫu rồi mới nhận lỗi từ server.
 */
export default function NewThesisPage() {
	return (
		<RequireRole roles={["STUDENT", "LECTURER"]}>
			<NewThesisForm />
		</RequireRole>
	);
}

function NewThesisForm() {
	const router = useRouter();
	const { user } = useAuthStore();
	const lecturerMode = isLecturer(user);

	const [title, setTitle] = React.useState("");
	const [field, setField] = React.useState(FIELDS[0] ?? "");
	const [description, setDescription] = React.useState("");
	const [lecturerEmail, setLecturerEmail] = React.useState("");
	/* Kỳ nghiên cứu — tuỳ chọn, dạng "YYYY-MM-DD" như `<input type="date">` gửi ra. */
	const [startDate, setStartDate] = React.useState("");
	const [endDate, setEndDate] = React.useState("");
	const [submitting, setSubmitting] = React.useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (title.trim().length < 10) {
			toast.error("Tên đề tài cần ít nhất 10 ký tự để mô tả được nội dung.");
			return;
		}
		if (description.trim().length < 30) {
			toast.error(
				"Mô tả cần ít nhất 30 ký tự — nêu mục tiêu và phạm vi nghiên cứu.",
			);
			return;
		}
		if (!lecturerMode && !lecturerEmail.trim()) {
			toast.error("Vui lòng nhập email giảng viên hướng dẫn.");
			return;
		}
		// Chặn tại chỗ thay vì để server trả 422: người dùng đang nhìn đúng hai ô đó.
		if (startDate && endDate && endDate <= startDate) {
			toast.error("Ngày kết thúc kỳ nghiên cứu phải sau ngày bắt đầu.");
			return;
		}

		setSubmitting(true);
		try {
			const created = await thesesApi.create({
				title: title.trim(),
				description: description.trim(),
				field,
				...(lecturerMode ? {} : { lecturer_email: lecturerEmail.trim() }),
				...(startDate ? { start_date: startDate } : {}),
				...(endDate ? { end_date: endDate } : {}),
			});

			toast.success(
				lecturerMode
					? "Đã tạo đề tài. Sinh viên có thể đăng ký từ danh sách."
					: "Đã lưu bản nháp. Bấm “Gửi duyệt” ở trang chi tiết khi bạn sẵn sàng.",
			);
			router.push(`/theses/${created.id}`);
		} catch (err) {
			toast.error(isApiError(err) ? err.message : "Không tạo được đề tài.");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="max-w-3xl mx-auto">
			<div className="mb-4">
				<button
					onClick={() => router.push("/theses")}
					className="btn-ghost text-tertiary hover:text-primary text-[13px] inline-flex items-center gap-1.5 p-0">
					<ArrowLeft size={16} />
					Quay lại danh sách
				</button>
			</div>

			<PageHeader
				title={lecturerMode ? "Tạo đề tài mới" : "Đề xuất đề tài"}
				description={
					lecturerMode
						? "Tạo đề tài nghiên cứu để sinh viên đăng ký thực hiện."
						: "Đề tài được lưu ở trạng thái Nháp."
				}
			/>

			<Card className="p-6">
				<form onSubmit={handleSubmit} className="flex flex-col gap-4">
					<Input
						label="Tên đề tài *"
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						autoFocus
						helperText={`${title.trim().length}/255 ký tự`}
					/>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Select
							label="Lĩnh vực chuyên môn *"
							value={field}
							onChange={(e) => setField(e.target.value)}>
							{FIELDS.map((f) => (
								<option key={f} value={f}>
									{f}
								</option>
							))}
						</Select>

						{!lecturerMode && (
							<Input
								label="Email giảng viên hướng dẫn *"
								type="email"
								placeholder="example@gmail.com"
								value={lecturerEmail}
								onChange={(e) => setLecturerEmail(e.target.value)}
							/>
						)}
					</div>

					{/* KỲ NGHIÊN CỨU — khoảng thời gian do chính người tạo đề tài đặt.
              NovaThesis là nền tảng công khai dùng cho nhiều cơ sở và nhiều nhóm
              nghiên cứu độc lập, nên không có một lịch chung nào áp được cho mọi
              người dùng.

              Tuỳ chọn, và bỏ trống được: một bản nháp chưa cần biết mình chạy
              trong khoảng nào. Đặt rồi thì mọi hạn chót của mốc tiến độ phải nằm
              trong khoảng đó (`assertDeadlineWithinThesis`). */}
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<Input
							label="Kỳ nghiên cứu — từ ngày"
							type="date"
							value={startDate}
							onChange={(e) => setStartDate(e.target.value)}
							helperText="Bỏ trống nếu chưa xác định"
						/>
						<Input
							label="đến ngày"
							type="date"
							value={endDate}
							min={startDate || undefined}
							onChange={(e) => setEndDate(e.target.value)}
						/>
					</div>

					<Textarea
						label="Mô tả *"
						rows={7}
						placeholder="Nêu rõ mục tiêu nghiên cứu, phạm vi công việc, phương pháp và công nghệ dự kiến sử dụng…"
						value={description}
						onChange={(e) => setDescription(e.target.value)}
						helperText={`${description.trim().length} ký tự`}
					/>

					<div className="flex justify-end gap-3 mt-2 pt-4 border-t border-[var(--border-primary)]">
						<Button
							variant="ghost"
							type="button"
							onClick={() => router.push("/theses")}>
							Hủy
						</Button>
						<Button
							variant="primary"
							type="submit"
							loading={submitting}
							icon={<FloppyDisk size={15} />}>
							{lecturerMode ? "Tạo đề tài" : "Lưu bản nháp"}
						</Button>
					</div>
				</form>
			</Card>
		</div>
	);
}
