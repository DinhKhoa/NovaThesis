"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { VantaBackground } from "@/components/VantaBackground";
import { 
  ArrowRight, 
  TerminalWindow, 
  Database, 
  ShareNetwork, 
  ShieldCheck,
  MagnifyingGlass,
  X,
  SignIn
} from "@phosphor-icons/react";

export default function TechLanding() {
  const [mounted, setMounted] = useState(false);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--fg-primary)] overflow-x-hidden selection:bg-[var(--accent)] selection:text-white">
      {mounted && <VantaBackground />}
      
      {/* Navigation / Header */}
      <header className="relative z-10 w-full border-b border-[var(--border-color)] bg-[var(--bg-primary)]/80 backdrop-blur-md">
        <div className="w-full max-w-[1600px] mx-auto px-6 h-14 flex items-center justify-between text-[13px] font-mono tracking-tight">
          <div className="flex items-center gap-6">
            <div className="font-bold text-[14px] flex items-center gap-2 text-[var(--fg-primary)]">
              <div className="w-2 h-2 bg-[var(--accent-secondary)] rounded-sm animate-pulse" />
              NOVATHESIS
            </div>
            <nav className="hidden md:flex gap-6 text-[var(--fg-muted)]">
              <Link href="/documents" className="hover:text-[var(--fg-primary)] transition-colors">API_DOCS</Link>
              <Link href="/architecture" className="hover:text-[var(--fg-primary)] transition-colors">SYS_ARCH</Link>
              <Link href="/status" className="hover:text-[var(--fg-primary)] transition-colors">NETWORK_STATUS</Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:block text-[var(--fg-muted)]">v2.0.5 [BUILD 5012]</span>
            <ThemeToggle />
            <div className="h-4 w-[1px] bg-[var(--border-color)] mx-2" />
            <button 
              onClick={() => setIsLoginOpen(true)}
              className="hover:text-[var(--accent)] font-semibold transition-colors flex items-center gap-1"
            >
              AUTH_INIT <ArrowRight size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 w-full max-w-[1600px] mx-auto px-6 pt-24 pb-32">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-16">
          
          {/* Left Column: Dense Typography & Call to Actions */}
          <div className="lg:col-span-5 flex flex-col justify-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[11px] font-mono mb-8 uppercase tracking-wider text-[var(--fg-secondary)] w-max">
              <ShieldCheck size={14} className="text-[var(--accent-tertiary)]" />
              End-to-End Encrypted RAG Pipeline
            </div>
            
            <h1 className="text-5xl md:text-7xl font-semibold tracking-[-0.03em] leading-[1.05] mb-8 text-[var(--fg-primary)]">
              Luận văn.<br />
              <span className="text-[var(--fg-muted)]">Được biên dịch.</span>
            </h1>
            
            <p className="text-[15px] leading-relaxed text-[var(--fg-secondary)] max-w-md mb-10 border-l-2 border-[var(--accent)] pl-4">
              Hệ thống quản trị tài liệu học thuật theo kiến trúc State Machine. 
              Tuyệt đối chặt chẽ. Khả năng tra cứu vector tốc độ cao. Được thiết kế 
              riêng cho quy trình đào tạo khắt khe.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 font-mono text-[13px]">
              <button onClick={() => setIsLoginOpen(true)} className="flex items-center justify-center gap-2 bg-[var(--accent)] text-white px-6 py-3 font-bold hover:bg-[var(--accent-secondary)] transition-colors">
                <TerminalWindow size={16} /> BẮT ĐẦU PHIÊN
              </button>
              <Link href="/documents" className="flex items-center justify-center gap-2 bg-[var(--bg-surface)] border border-[var(--border-color)] text-[var(--fg-primary)] px-6 py-3 font-semibold hover:border-[var(--accent)] transition-colors">
                TÀI LIỆU KỸ THUẬT
              </Link>
            </div>
          </div>

          {/* Right Column: Data-dense Technical Panel */}
          <div className="lg:col-span-7 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-color)] p-1 overflow-hidden shadow-2xl">
            <div className="w-full bg-[var(--bg-primary)] border-b border-[var(--border-color)] px-4 py-2 flex items-center justify-between text-[11px] font-mono text-[var(--fg-muted)]">
              <div className="flex gap-2 items-center">
                <div className="w-2 h-2 rounded-full bg-[var(--accent-secondary)]" />
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <div className="w-2 h-2 rounded-full bg-[var(--accent-tertiary)]" />
                <span className="ml-2 text-[var(--fg-primary)]">sys_monitor_v2</span>
              </div>
              <span className="text-[var(--accent-tertiary)]">ACTIVE_NODES: 34</span>
            </div>
            
            <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 font-mono">
              {/* Feature 1 */}
              <div>
                <div className="flex items-center gap-2 text-[var(--fg-primary)] font-bold text-[13px] mb-3 border-b border-[var(--border-color)] pb-2">
                  <ShareNetwork size={16} className="text-[var(--accent)]" />
                  FINITE STATE MACHINE
                </div>
                <div className="text-[12px] text-[var(--fg-secondary)] leading-relaxed">
                  Ngăn chặn triệt để lỗ hổng quy trình nộp bài. Đồ án chỉ được phép chuyển trạng thái theo đúng luồng định trước (Draft → Submitted → Reviewed).
                </div>
                <div className="mt-4 text-[10px] text-[var(--fg-muted)] bg-[var(--bg-primary)] p-2 border border-[var(--border-color)]">
                  <span className="text-[var(--accent-tertiary)]">{"[OK]"}</span> STRICT_MODE_ENABLED<br/>
                  <span className="text-[var(--accent-tertiary)]">{"[OK]"}</span> STATE_TRANSITIONS_LOCKED
                </div>
              </div>

              {/* Feature 2 */}
              <div>
                <div className="flex items-center gap-2 text-[var(--fg-primary)] font-bold text-[13px] mb-3 border-b border-[var(--border-color)] pb-2">
                  <Database size={16} className="text-[var(--accent-secondary)]" />
                  RAG VECTOR ENGINE
                </div>
                <div className="text-[12px] text-[var(--fg-secondary)] leading-relaxed">
                  Toàn bộ cơ sở dữ liệu đồ án được vectorize qua mô hình embedding 1536 chiều, kết hợp tìm kiếm ngữ nghĩa với HNSW Index siêu tốc.
                </div>
                <div className="mt-4 flex flex-col gap-1 text-[10px] text-[var(--fg-muted)]">
                  <div className="flex justify-between border-b border-[var(--border-color)] border-dashed pb-1">
                    <span>QPS</span> <span className="text-[var(--fg-primary)]">~4.2k</span>
                  </div>
                  <div className="flex justify-between border-b border-[var(--border-color)] border-dashed py-1">
                    <span>LATENCY</span> <span className="text-[var(--fg-primary)]">32ms</span>
                  </div>
                </div>
              </div>

              {/* Code Panel */}
              <div className="md:col-span-2 mt-4 bg-[var(--bg-primary)] border border-[var(--border-color)] p-4 relative">
                <div className="absolute top-0 right-0 bg-[var(--accent)] text-white px-2 py-0.5 text-[10px] font-bold">
                  SEARCH_QUERY
                </div>
                <div className="flex items-center gap-3 text-[13px] text-[var(--fg-primary)] mb-4 mt-2">
                  <MagnifyingGlass size={16} className="text-[var(--fg-muted)]" />
                  <span className="animate-pulse w-[1px] h-4 bg-[var(--accent-secondary)] inline-block"></span>
                  <span className="text-[var(--fg-secondary)] opacity-80">"Giải thuật học sâu trong thị giác máy tính 2024"</span>
                </div>
                
                <div className="space-y-2">
                  <div className="text-[11px] border border-[var(--border-color)] p-2 hover:bg-[var(--bg-surface)] cursor-pointer transition-colors flex gap-3">
                    <span className="text-[var(--accent-tertiary)] font-semibold shrink-0">98.4%</span> 
                    <span className="text-[var(--fg-primary)]">Đồ án: Nhận diện khuôn mặt với YOLOv8 (SV: Nguyễn Văn A)</span>
                  </div>
                  <div className="text-[11px] border border-[var(--border-color)] p-2 hover:bg-[var(--bg-surface)] cursor-pointer transition-colors flex gap-3">
                    <span className="text-[var(--accent-tertiary)] font-semibold shrink-0">92.1%</span> 
                    <span className="text-[var(--fg-primary)]">Đồ án: Ứng dụng CNN trong phân loại ảnh y tế (SV: Trần Thị B)</span>
                  </div>
                </div>
              </div>

            </div>
          </div>
          
        </div>
      </main>

      {/* Login Sidebar Overlay */}
      {isLoginOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => setIsLoginOpen(false)}
          />
          
          {/* Sidebar */}
          <div className="relative w-full max-w-md bg-[var(--bg-surface)] h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-6 border-b border-[var(--border-color)]">
              <div className="font-bold text-lg flex items-center gap-2">
                <SignIn size={24} className="text-[var(--accent)]" /> 
                Truy cập hệ thống
              </div>
              <button 
                onClick={() => setIsLoginOpen(false)}
                className="p-2 hover:bg-[var(--bg-muted)] rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 flex-1 overflow-y-auto">
              <p className="text-[var(--fg-secondary)] text-[14px] mb-8">
                Đăng nhập bằng tài khoản nội bộ để quản lý đồ án và tài liệu nghiên cứu.
              </p>
              
              <form className="space-y-6">
                <div>
                  <label className="block text-[13px] font-semibold text-[var(--fg-primary)] mb-2">Mã sinh viên / Email</label>
                  <input 
                    type="text" 
                    placeholder="VD: 12345678"
                    className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[14px] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  />
                </div>
                
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-[13px] font-semibold text-[var(--fg-primary)]">Mật khẩu</label>
                    <Link href="/forgot-password" className="text-[12px] text-[var(--accent)] hover:underline">Quên mật khẩu?</Link>
                  </div>
                  <input 
                    type="password" 
                    placeholder="••••••••"
                    className="w-full px-4 py-3 bg-[var(--bg-primary)] border border-[var(--border-color)] rounded-lg text-[14px] focus:outline-none focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] transition-all"
                  />
                </div>
                
                <button type="button" className="w-full py-3 bg-[var(--accent)] text-white rounded-lg font-semibold hover:bg-[#003d75] transition-colors mt-4">
                  Đăng nhập
                </button>
              </form>
              
              <div className="mt-8 pt-8 border-t border-[var(--border-color)] text-center text-[13px] text-[var(--fg-secondary)]">
                Bạn chưa có tài khoản? <Link href="/register" className="text-[var(--accent)] font-semibold hover:underline">Đăng ký hồ sơ mới</Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
