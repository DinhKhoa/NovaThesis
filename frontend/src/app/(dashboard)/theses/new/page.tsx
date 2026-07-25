"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, FloppyDisk } from "@phosphor-icons/react";
import { PageHeader } from "@/components/layout";
import { Card, Button, Input, Textarea } from "@/components/ui";
import { useAuthStore, isLecturer } from "@/lib/auth";
import { toast } from "@/lib/toast";

const lecturersList = [
  { id: 2, name: "TS. Nguyễn Văn A", department: "Khoa CNTT" },
  { id: 3, name: "PGS.TS. Trần Thị B", department: "Khoa CNTT" },
];

export default function NewThesisPage() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [title, setTitle] = React.useState("");
  const [field, setField] = React.useState("Công nghệ phần mềm");
  const [description, setDescription] = React.useState("");
  const [lecturerId, setLecturerId] = React.useState<number>(2);
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Vui lòng nhập tên tiêu đề đề tài");
      return;
    }
    if (!description.trim()) {
      toast.error("Vui lòng nhập mô tả / đề cương tóm tắt");
      return;
    }

    setSubmitting(true);
    try {
      // API call: api.post("/theses", { title, field, description, lecturer_id: lecturerId })
      toast.success(
        isLecturer(user)
          ? "Đề xuất đề tài thành công!"
          : "Gửi đề xuất đề tài cho Giảng viên phê duyệt thành công!"
      );
      router.push("/theses");
    } catch {
      toast.error("Không thể tạo đề tài");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-4">
        <button
          onClick={() => router.back()}
          className="btn-ghost text-tertiary hover:text-primary text-[13px] inline-flex items-center gap-1.5 p-0"
        >
          <ArrowLeft size={16} />
          Quay lại danh sách
        </button>
      </div>

      <PageHeader
        title={isLecturer(user) ? "Tạo Đề tài mới (Giảng viên)" : "Đề xuất Đề tài mới (Sinh viên)"}
        description={
          isLecturer(user)
            ? "Tạo đề tài nghiên cứu để sinh viên đăng ký."
            : "Đề xuất tên đề tài và nội dung cho Giảng viên hướng dẫn duyệt."
        }
      />

      <Card className="p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Tên tiêu đề đề tài / Luận văn *"
            placeholder="Ví dụ: Xây dựng hệ thống RAG Reranking hỗ trợ tìm kiếm tài liệu..."
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-[13px] font-medium text-secondary block mb-1.5">
                Lĩnh vực chuyên môn *
              </label>
              <select
                className="input-base text-[14px]"
                value={field}
                onChange={(e) => setField(e.target.value)}
              >
                <option value="Công nghệ phần mềm">Công nghệ phần mềm</option>
                <option value="Trí tuệ nhân tạo & Data">Trí tuệ nhân tạo & Data</option>
                <option value="Hệ thống nhúng & IoT">Hệ thống nhúng & IoT</option>
                <option value="An toàn thông tin">An toàn thông tin</option>
                <option value="Mạng máy tính & Cloud">Mạng máy tính & Cloud</option>
              </select>
            </div>

            {!isLecturer(user) && (
              <div>
                <label className="text-[13px] font-medium text-secondary block mb-1.5">
                  Giảng viên hướng dẫn mong muốn *
                </label>
                <select
                  className="input-base text-[14px]"
                  value={lecturerId}
                  onChange={(e) => setLecturerId(Number(e.target.value))}
                >
                  {lecturersList.map((gv) => (
                    <option key={gv.id} value={gv.id}>
                      {gv.name} ({gv.department})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <Textarea
            label="Mô tả chi tiết / Đề cương tóm tắt *"
            rows={6}
            placeholder="Nêu rõ mục tiêu nghiên cứu, phạm vi công việc, công nghệ ứng dụng..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-[var(--border-primary)]">
            <Button variant="ghost" type="button" onClick={() => router.back()}>
              Hủy
            </Button>
            <Button
              variant="primary"
              type="submit"
              loading={submitting}
              icon={<FloppyDisk size={15} />}
            >
              {isLecturer(user) ? "Khởi tạo Đề tài" : "Gửi Đề xuất"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
