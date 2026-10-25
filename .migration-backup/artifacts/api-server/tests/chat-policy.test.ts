import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAT_FILE_TYPES, contactInfoError, containsContactInfo,
  normalizeAttachmentName, validChatFilePrefix,
} from "../src/lib/chat-policy";

test("contact filtering rejects phone numbers and email in text, including Arabic digits", () => {
  assert.equal(containsContactInfo("اتصل بي على +213 555 12 34 56"), true);
  assert.equal(containsContactInfo("رقمي ٠٥٥١٢٣٤٥٦٧"), true);
  assert.equal(containsContactInfo("راسلني على teacher@example.com"), true);
  assert.match(contactInfoError("teacher@example.com") ?? "", /لا يمكن إرسال/);
});

test("contact filtering does not reject ordinary lesson numbers or date ranges", () => {
  assert.equal(containsContactInfo("المستوى A1 والدرس 7 يبدأ في 12/05/2026"), false);
  assert.equal(containsContactInfo("الفترة من 2020-2024"), false);
  assert.equal(containsContactInfo("أرسل الحل في الدرس 12"), false);
});

test("attachment allowlist and file signatures reject spoofed binary types", () => {
  assert.equal(CHAT_FILE_TYPES.has("application/pdf"), true);
  assert.equal(CHAT_FILE_TYPES.has("application/x-msdownload"), false);
  assert.equal(validChatFilePrefix("application/pdf", Buffer.from("%PDF-1.7")), true);
  assert.equal(validChatFilePrefix("application/pdf", Buffer.from("<html>")), false);
  assert.equal(validChatFilePrefix("video/webm", Buffer.from([0x1a, 0x45, 0xdf, 0xa3])), true);
  assert.equal(validChatFilePrefix("image/png", Buffer.from("not a png")), false);
});

test("attachment names cannot inject path separators or control characters", () => {
  assert.equal(normalizeAttachmentName("../notes\r\n.pdf"), ".._notes__.pdf");
});
