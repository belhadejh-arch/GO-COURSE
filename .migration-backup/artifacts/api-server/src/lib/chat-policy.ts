const DIGIT_MAP: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
};

export function containsContactInfo(value: string): boolean {
  const normalized = value.replace(/[٠-٩۰-۹]/g, (digit) => DIGIT_MAP[digit] ?? digit);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(normalized)) return true;

  const candidates: string[] = [];
  for (const match of normalized.matchAll(/(?:\+|00)?\d(?:[\d\s().-]*\d){5,14}/g)) {
    candidates.push(match[0]);
  }
  return candidates.some((candidate) => {
    const compact = candidate.replace(/\D/g, "");
    if (compact.length < 7 || compact.length > 15) return false;
    // Common date forms are not telephone numbers.
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(candidate.trim())) return false;
    if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{4}$/.test(candidate.trim())) return false;
    if (/^\d{4}\s*[-–]\s*\d{4}$/.test(candidate.trim())) return false;
    return true;
  });
}

export function contactInfoError(value: string): string | null {
  return containsContactInfo(value)
    ? "لا يمكن إرسال أرقام الهواتف أو عناوين البريد الإلكتروني داخل المحادثات."
    : null;
}

export function normalizeAttachmentName(name: string): string {
  return name.replace(/[\u0000-\u001F\u007F/\\]/g, "_").trim().slice(0, 180);
}

export const CHAT_FILE_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp",
  "video/mp4", "video/webm",
  "audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export const CHAT_MAX_FILE_SIZE = 25 * 1024 * 1024;
export const CHAT_MAX_ATTACHMENTS = 8;

export function validChatFilePrefix(contentType: string, prefix: Buffer): boolean {
  switch (contentType) {
    case "image/jpeg": return prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
    case "image/png": return prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    case "image/webp": return prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WEBP";
    case "video/mp4":
    case "audio/mp4": return prefix.toString("ascii", 4, 8) === "ftyp";
    case "video/webm":
    case "audio/webm": return prefix.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    case "audio/mpeg": return prefix.toString("ascii", 0, 3) === "ID3" || (prefix[0] === 0xff && (prefix[1] & 0xe0) === 0xe0);
    case "audio/ogg": return prefix.toString("ascii", 0, 4) === "OggS";
    case "audio/wav": return prefix.toString("ascii", 0, 4) === "RIFF" && prefix.toString("ascii", 8, 12) === "WAVE";
    case "application/pdf": return prefix.toString("ascii", 0, 5) === "%PDF-";
    case "application/msword": return prefix.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return prefix[0] === 0x50 && prefix[1] === 0x4b && prefix[2] === 0x03 && prefix[3] === 0x04;
    case "text/plain": return !prefix.includes(0);
    default: return false;
  }
}
