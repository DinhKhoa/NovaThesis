"use client";

import React from "react";
import { Eye, MagnifyingGlass, Notebook, Warning } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import {
	Badge,
	Button,
	Card,
	EmptyState,
	Input,
	Modal,
	Table,
	Select,
} from "@/components/ui";
import { useAsync, useDebounced } from "@/lib/use-async";
import { adminApi, type LogLevel, type SystemLogEntry } from "@/lib/services";
import { formatDateTime } from "@/lib/format";

const PER_PAGE = 20;

const levelBadges: Record<
	LogLevel,
	{ label: string; variant: "info" | "warning" | "danger" }
> = {
	INFO: { label: "Info", variant: "info" },
	WARN: { label: "Warning", variant: "warning" },
	ERROR: { label: "Error", variant: "danger" },
};

/*
 * `<input type="date">` cho ra chuỗi trần "YYYY-MM-DD", và server đọc chuỗi đó
 * như mốc UTC. Nhưng bảng hiển thị theo giờ Việt Nam (`format.ts` ghim
 * Asia/Ho_Chi_Minh), nên nếu gửi nguyên chuỗi trần thì khoảng lọc lệch 7 tiếng:
 * chọn đúng ngày hôm nay vẫn mất các dòng trước 07:00 và lại kéo về dòng của
 * ngày hôm sau. Gắn offset +07:00 để mốc lọc trùng khít với ngày người dùng
 * đang nhìn thấy trong cột "Thời gian".
 */
const VN_OFFSET = "+07:00";
const startOfDayVN = (date: string) => `${date}T00:00:00.000${VN_OFFSET}`;
const endOfDayVN = (date: string) => `${date}T23:59:59.999${VN_OFFSET}`;

export default function AdminLogsPage() {
	const [search, setSearch] = React.useState("");
	const [levelFilter, setLevelFilter] = React.useState("ALL");
	const [actionFilter, setActionFilter] = React.useState("ALL");
	const [from, setFrom] = React.useState("");
	const [to, setTo] = React.useState("");
	const [page, setPage] = React.useState(1);
	const [selectedLog, setSelectedLog] = React.useState<SystemLogEntry | null>(
		null,
	);

	// Bảng nhật ký là bảng lớn nhất hệ thống; gọi API sau mỗi phím gõ là tự tạo
	// tải quét toàn bảng cho chính máy chủ của mình.
	const debouncedSearch = useDebounced(search, 300);

	/* Đổi bộ lọc phải kéo về trang 1, nếu không người dùng đang ở trang 7 sẽ lọc
     ra một danh sách rỗng và tưởng là không có dữ liệu. Chỉnh state ngay trong
     lúc render (cách React khuyến nghị để phản ứng với một giá trị đổi) thay vì
     dùng effect: effect chạy sau khi đã commit, nên nó bắn một request thừa với
     số trang cũ rồi mới bắn request thật. */
	const filterKey = JSON.stringify([
		debouncedSearch,
		levelFilter,
		actionFilter,
		from,
		to,
	]);
	const [prevFilterKey, setPrevFilterKey] = React.useState(filterKey);
	if (prevFilterKey !== filterKey) {
		setPrevFilterKey(filterKey);
		setPage(1);
	}

	/* Danh sách hành động lấy từ chính dữ liệu đang có (`SELECT DISTINCT action`)
     chứ không phải một hằng số ở frontend: liệt kê mã chưa từng xuất hiện chỉ
     dẫn người dùng tới một danh sách rỗng. */
	const { data: actions } = useAsync(() => adminApi.logActions(), []);

	const { data, loading, error, refetch } = useAsync(
		() =>
			adminApi.logs({
				page,
				per_page: PER_PAGE,
				...(debouncedSearch ? { search: debouncedSearch } : {}),
				...(levelFilter !== "ALL" ? { level: levelFilter } : {}),
				...(actionFilter !== "ALL" ? { action: actionFilter } : {}),
				...(from ? { from: startOfDayVN(from) } : {}),
				...(to ? { to: endOfDayVN(to) } : {}),
			}),
		[page, debouncedSearch, levelFilter, actionFilter, from, to],
	);

	const logs = data?.data ?? [];
	const hasFilter =
		Boolean(debouncedSearch) ||
		levelFilter !== "ALL" ||
		actionFilter !== "ALL" ||
		Boolean(from) ||
		Boolean(to);

	return (
		<div>
			<PageHeader
				title="Nhật ký hệ thống"
				description="Lịch sử đăng nhập và thao tác trên dữ liệu."
			/>

			<Card className="p-4 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between">
				<div className="w-full md:w-80">
					<Input
						placeholder="Tìm theo email, hành động, IP..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						icon={<MagnifyingGlass size={15} />}
						aria-label="Tìm trong nhật ký"
					/>
				</div>

				<div className="w-full md:w-auto flex flex-col sm:flex-row items-center gap-2">
					<Select
						className="w-full md:w-40"
						value={levelFilter}
						onChange={(e) => setLevelFilter(e.target.value)}
						options={[
							{ value: "ALL", label: "Tất cả cấp độ" },
							{ value: "INFO", label: "INFO" },
							{ value: "WARN", label: "WARN" },
							{ value: "ERROR", label: "ERROR" },
						]}
					/>

					<Select
						className="w-full md:w-52"
						value={actionFilter}
						onChange={(e) => setActionFilter(e.target.value)}
						options={[
							{ value: "ALL", label: "Tất cả hành động" },
							...(actions ?? []).map((a) => ({ value: a, label: a })),
						]}
					/>

					{/* `max`/`min` bắt chéo nhau để bộ chọn ngày không đưa ra được khoảng
              ngược; server vẫn là chốt chặn cuối vì ô ngày cho phép gõ tay. */}
					<input
						type="date"
						className="input-base text-[13px] py-2 w-full md:w-40"
						value={from}
						max={to || undefined}
						onChange={(e) => setFrom(e.target.value)}
						aria-label="Từ ngày"
						title="Từ ngày"
					/>
					<input
						type="date"
						className="input-base text-[13px] py-2 w-full md:w-40"
						value={to}
						min={from || undefined}
						onChange={(e) => setTo(e.target.value)}
						aria-label="Đến ngày"
						title="Đến ngày"
					/>
				</div>
			</Card>

			<Card className="overflow-hidden">
				{error ? (
					<EmptyState
						icon={<Warning size={16} />}
						title="Không tải được nhật ký"
						description={error}
						action={
							<Button
								variant="secondary"
								size="sm"
								onClick={() => void refetch()}>
								Thử lại
							</Button>
						}
					/>
				) : (
					<Table
						data={logs}
						loading={loading}
						keyExtractor={(l) => String(l.id)}
						pageSize={PER_PAGE}
						onRowClick={(l) => setSelectedLog(l)}
						emptyState={
							<EmptyState
								compact
								icon={<Notebook size={18} />}
								title="Không có dòng nhật ký nào"
								description={
									hasFilter
										? "Thử bỏ bớt điều kiện lọc hoặc nới rộng khoảng thời gian."
										: "Nhật ký sẽ xuất hiện ngay khi có người đăng nhập hoặc thay đổi dữ liệu."
								}
							/>
						}
						columns={[
							{
								key: "created_at",
								header: "Thời gian",
								width: "1%",
								/* Server đã sắp mới-nhất-trước cho toàn bộ kết quả; các nút sắp
                   xếp ở đây chỉ gom nhóm lại trang đang xem. */
								sortValue: (l) => l.created_at,
								render: (l) => (
									<span className="font-mono text-[12px] text-tertiary whitespace-nowrap">
										{formatDateTime(l.created_at)}
									</span>
								),
							},
							{
								key: "level",
								header: "Cấp độ",
								width: "1%",
								sortValue: (l) => l.level,
								render: (l) => (
									<Badge variant={levelBadges[l.level].variant}>
										{l.level}
									</Badge>
								),
							},
							{
								key: "action",
								header: "Hành động",
								sortValue: (l) => l.action,
								render: (l) => (
									<span className="font-mono text-[13px] font-medium text-accent">
										{l.action}
									</span>
								),
							},
							{
								key: "user_email",
								header: "Người thực hiện",
								sortValue: (l) => l.user_email,
								render: (l) => (
									<span className="text-[13px] text-secondary">
										{l.user_email}
									</span>
								),
							},
							{
								key: "ip_address",
								header: "IP Address",
								width: "1%",
								hideOnMobile: true,
								render: (l) => (
									<span className="font-mono text-[12px] text-tertiary whitespace-nowrap">
										{l.ip_address ?? "—"}
									</span>
								),
							},
							{
								key: "details",
								header: "Chi tiết",
								width: "1%",
								align: "right",
								render: (l) => (
									<button
										className="btn-ghost p-1.5 rounded-lg text-tertiary hover:text-primary"
										onClick={() => setSelectedLog(l)}
										aria-label={`Xem chi tiết hành động ${l.action}`}>
										<Eye size={18} />
									</button>
								),
							},
						]}
					/>
				)}
			</Card>

			{/* Phân trang phía server: bảng chỉ phân trang trên mảng đã tải, mà nhật ký
          thì luôn nhiều hơn một trang. */}
			{data && data.totalPages > 1 && (
				<div className="flex items-center justify-between mt-3 text-[12.5px]">
					<span className="text-tertiary tnum">
						Trang {data.page}/{data.totalPages} · {data.total} dòng nhật ký
					</span>
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							disabled={page <= 1 || loading}
							onClick={() => setPage((p) => Math.max(1, p - 1))}>
							Trước
						</Button>
						<Button
							variant="secondary"
							size="sm"
							disabled={page >= data.totalPages || loading}
							onClick={() => setPage((p) => p + 1)}>
							Sau
						</Button>
					</div>
				</div>
			)}

			{/* Log Details Modal */}
			<Modal
				open={!!selectedLog}
				onClose={() => setSelectedLog(null)}
				title="Chi tiết Nhật ký"
				footer={
					<Button variant="ghost" onClick={() => setSelectedLog(null)}>
						Đóng
					</Button>
				}>
				{selectedLog && (
					<div className="flex flex-col gap-3 text-[13px]">
						<div>
							<span className="text-tertiary block mb-1">Thời điểm:</span>
							<span className="font-mono tnum text-primary">
								{formatDateTime(selectedLog.created_at)}
							</span>
						</div>
						<div>
							<span className="text-tertiary block mb-1">Cấp độ:</span>
							<Badge variant={levelBadges[selectedLog.level].variant}>
								{selectedLog.level}
							</Badge>
						</div>
						<div>
							<span className="text-tertiary block mb-1">Hành động:</span>
							<span className="font-mono text-accent font-medium">
								{selectedLog.action}
							</span>
						</div>
						<div>
							<span className="text-tertiary block mb-1">Người thực hiện:</span>
							<span className="text-secondary">{selectedLog.user_email}</span>
						</div>
						<div>
							<span className="text-tertiary block mb-1">Địa chỉ IP:</span>
							<span className="font-mono text-secondary">
								{selectedLog.ip_address ?? "—"}
							</span>
						</div>
						<div>
							<span className="text-tertiary block mb-1">
								Thiết bị (User agent):
							</span>
							{/* `break-all` vì chuỗi user agent không có khoảng trắng để ngắt
                  dòng và sẽ nong modal ra theo chiều ngang. */}
							<span className="text-[12px] text-secondary break-all">
								{selectedLog.user_agent ?? "—"}
							</span>
						</div>
						<div>
							<span className="text-tertiary block mb-1">
								Payload / Chi tiết log:
							</span>
							{/* Cột `details` là JSONB nên API trả về object sẵn — `JSON.parse`
                  ở đây sẽ ném lỗi và làm trắng cả modal. Và nó có thể là NULL:
                  không phải hành động nào cũng kèm dữ liệu. */}
							{selectedLog.details ? (
								<pre className="p-3 rounded-lg bg-[var(--bg-secondary)] font-mono text-[12px] overflow-x-auto text-primary">
									{JSON.stringify(selectedLog.details, null, 2)}
								</pre>
							) : (
								<span className="text-muted italic">
									Hành động này không kèm dữ liệu chi tiết.
								</span>
							)}
						</div>
					</div>
				)}
			</Modal>
		</div>
	);
}
