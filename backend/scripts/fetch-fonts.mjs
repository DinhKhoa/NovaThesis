/**
 * Tải font hỗ trợ tiếng Việt cho xuất PDF.
 *
 * pdfkit chỉ đi kèm 14 font chuẩn của PostScript, và không font nào trong đó có
 * glyph cho "ệ", "ỗ", "ữ". Xuất báo cáo bằng font mặc định sẽ ra một trang đầy
 * ô vuông — UC 9.1 ghi rõ "không bị lỗi font tiếng Việt".
 *
 * Font không được commit vào git (xem .gitignore): tệp nhị phân 300 KB không
 * thuộc về lịch sử mã nguồn. Chạy `npm run setup` để tải về.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fontDir = path.resolve(here, "..", "assets", "fonts");

/**
 * Nhiều nguồn dự phòng: jsDelivr chặn ở một số mạng trường học, và một script
 * cài đặt hỏng vì DNS là kiểu thất bại khiến người ta bỏ cuộc.
 */
const FONTS = [
  {
    file: "NotoSans-Regular.ttf",
    urls: [
      "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
      "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",
    ],
  },
  {
    file: "NotoSans-Bold.ttf",
    urls: [
      "https://cdn.jsdelivr.net/gh/googlefonts/noto-fonts@main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
      "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",
    ],
  },
];

/** Font hệ thống dùng làm phương án cuối khi không có mạng. */
const SYSTEM_FALLBACKS = {
  darwin: ["/System/Library/Fonts/Supplemental/Arial Unicode.ttf"],
  linux: [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
  ],
  win32: ["C:\\Windows\\Fonts\\arial.ttf", "C:\\Windows\\Fonts\\segoeui.ttf"],
};

async function download(urls) {
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      // Kiểm tra sơ bộ: TTF bắt đầu bằng 0x00010000 hoặc "true"/"OTTO".
      if (buf.length > 50_000) return buf;
    } catch {
      // Thử nguồn tiếp theo.
    }
  }
  return null;
}

async function copySystemFont(target) {
  for (const candidate of SYSTEM_FALLBACKS[process.platform] ?? []) {
    if (fs.existsSync(candidate)) {
      await fsp.copyFile(candidate, target);
      return candidate;
    }
  }
  return null;
}

async function main() {
  await fsp.mkdir(fontDir, { recursive: true });

  let ok = 0;
  for (const font of FONTS) {
    const target = path.join(fontDir, font.file);

    if (fs.existsSync(target) && (await fsp.stat(target)).size > 50_000) {
      console.log(`  ✓ ${font.file} (đã có)`);
      ok++;
      continue;
    }

    const buf = await download(font.urls);
    if (buf) {
      await fsp.writeFile(target, buf);
      console.log(`  ✓ ${font.file} (${Math.round(buf.length / 1024)} KB)`);
      ok++;
      continue;
    }

    const system = await copySystemFont(target);
    if (system) {
      console.log(`  ✓ ${font.file} ← font hệ thống ${system}`);
      ok++;
      continue;
    }

    console.warn(`  ✗ ${font.file} — không tải được`);
  }

  if (ok === 0) {
    console.warn(
      "\n⚠  Không có font tiếng Việt nào. Báo cáo PDF sẽ bị lỗi dấu.\n" +
        `   Tải thủ công NotoSans-Regular.ttf rồi đặt vào: ${fontDir}\n`
    );
    // Không thoát với mã lỗi: cả hệ thống vẫn chạy được, chỉ riêng xuất PDF là
    // xấu. Chặn `npm install` vì lý do đó là phản ứng thái quá.
  } else {
    console.log(`\n✓ Font tiếng Việt đã sẵn sàng tại assets/fonts/`);
  }
}

main().catch((err) => {
  console.error("Tải font thất bại:", err.message);
});
