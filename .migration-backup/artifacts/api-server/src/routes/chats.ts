import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  and, eq,
} from "drizzle-orm";
import {
  chatAttachments, db, schoolFiles,
} from "@workspace/db";
import {
  CompleteChatUploadResponse,
  CreateChatMessageBody, CreateChatMessageResponse,
  CreateChatReportBody, CreateChatReportResponse,
  CreateChatUploadBody, CreateChatUploadResponse,
  ListChatMessagesResponse, ListChatReportsResponse,
  ListOlderChatMessagesResponse,
  ListSchoolChatsQueryParams, ListSchoolChatsResponse,
  MarkChatReadResponse,
  ReviewChatReportBody, ReviewChatReportResponse,
  SearchChatMessagesBody, SearchChatMessagesResponse,
  SearchSchoolChatDirectoryQueryParams, SearchSchoolChatDirectoryResponse,
} from "@workspace/api-zod";
import { access, fail, numberId } from "../lib/school-access";
import { fileTransferUrl } from "../lib/file-tokens";
import { SchoolFileStorage } from "../lib/database-files";
import {
  CHAT_FILE_TYPES, CHAT_MAX_ATTACHMENTS, CHAT_MAX_FILE_SIZE, contactInfoError,
  normalizeAttachmentName, validChatFilePrefix,
} from "../lib/chat-policy";
import {
  adminDirectory, attachmentById, avatarFileForSharedChat,
  createChatMessageRecord, createChatReportRecord, getMessagePage,
  listConversations, messageById, readThroughLatest, reportItems,
  requireConversation, reviewChatReportRecord, searchMessageRows,
  syncChatMemberships,
} from "../lib/chat-service";

const router = Router();
const storage = new SchoolFileStorage();

function pathId(value: unknown) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(400, "معرّف غير صالح.");
  return id;
}

function safeMessageBody(value: string) {
  const error = contactInfoError(value);
  if (error) fail(400, error);
  return value;
}

router.get("/school/chats", async (req, res) => {
  const parsed = ListSchoolChatsQueryParams.safeParse(req.query);
  if (!parsed.success) fail(400, "نص البحث غير صالح.");
  const a = await access(req);
  res.json(ListSchoolChatsResponse.parse(await listConversations(a, parsed.data.search)));
});

router.get("/school/chats/admin/search", async (req, res) => {
  const parsed = SearchSchoolChatDirectoryQueryParams.safeParse(req.query);
  if (!parsed.success) fail(400, "اكتب كلمة للبحث.");
  const a = await access(req);
  res.json(SearchSchoolChatDirectoryResponse.parse(await adminDirectory(a, parsed.data.q)));
});

router.get("/school/chats/:id/messages", async (req, res) => {
  const id = pathId(req.params.id);
  const a = await access(req);
  await syncChatMemberships(a);
  res.json(ListChatMessagesResponse.parse(await getMessagePage(a, id)));
});

router.get("/school/chats/:id/messages/before/:before", async (req, res) => {
  const id = pathId(req.params.id);
  const before = pathId(req.params.before);
  const a = await access(req);
  await syncChatMemberships(a);
  res.json(ListOlderChatMessagesResponse.parse(await getMessagePage(a, id, before)));
});

router.post("/school/chats/:id/messages/search", async (req, res) => {
  const parsed = SearchChatMessagesBody.safeParse(req.body);
  if (!parsed.success) fail(400, "نص البحث غير صالح.");
  const id = pathId(req.params.id);
  const a = await access(req);
  await syncChatMemberships(a);
  await requireConversation(a, id);
  const rows = await searchMessageRows(id, parsed.data.query);
  const result = {
    messages: await Promise.all(rows.map((row) => messageById(row.id))),
    hasMore: false,
    nextBefore: null,
  };
  res.json(SearchChatMessagesResponse.parse(result));
});

router.post("/school/chats/:id/messages", async (req, res) => {
  const parsed = CreateChatMessageBody.safeParse(req.body);
  if (!parsed.success) fail(400, "بيانات الرسالة غير صالحة.");
  const id = pathId(req.params.id);
  const body = safeMessageBody(parsed.data.body ?? "");
  const attachmentIds = [...new Set(parsed.data.attachmentIds ?? [])];
  if (attachmentIds.length > CHAT_MAX_ATTACHMENTS) fail(400, "الحد الأقصى للمرفقات في الرسالة هو 8.");
  const a = await access(req);
  await syncChatMemberships(a);
  const created = await createChatMessageRecord(a, id, body, attachmentIds);
  res.status(201).json(CreateChatMessageResponse.parse(created));
});

router.post("/school/chats/:id/read", async (req, res) => {
  const id = pathId(req.params.id);
  const a = await access(req);
  await syncChatMemberships(a);
  res.json(MarkChatReadResponse.parse(await readThroughLatest(a, id)));
});

router.post("/school/chats/:id/uploads", async (req, res) => {
  const parsed = CreateChatUploadBody.safeParse(req.body);
  if (!parsed.success) fail(400, "بيانات الملف غير صالحة.");
  const id = pathId(req.params.id);
  const a = await access(req);
  if (!a.user) fail(401, "سجّل الدخول لرفع الملفات.");
  await syncChatMemberships(a);
  const { conversation } = await requireConversation(a, id, true);
  const name = normalizeAttachmentName(parsed.data.name);
  const contentType = parsed.data.contentType.split(";")[0].trim().toLowerCase();
  if (!name || name === "." || name === "..") fail(400, "اسم الملف غير صالح.");
  if (!CHAT_FILE_TYPES.has(contentType)) fail(400, "نوع الملف غير مسموح به في المحادثات.");
  if (parsed.data.size < 1 || parsed.data.size > CHAT_MAX_FILE_SIZE) fail(400, "الحد الأقصى لحجم الملف 25 ميغابايت.");
  const objectPath = `/objects/database/${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.insert(schoolFiles).values({
    objectPath,
    ownerId: a.user.id,
    courseId: conversation.courseId,
    name,
    contentType,
    size: parsed.data.size,
    storageProvider: "database",
  });
  const [attachment] = await db.insert(chatAttachments).values({
    conversationId: id,
    uploaderId: a.user.id,
    objectPath,
    name,
    contentType,
    size: parsed.data.size,
    expiresAt,
  }).returning();
  res.status(201).json(CreateChatUploadResponse.parse({
    id: attachment.id,
    uploadURL: fileTransferUrl(objectPath, "upload"),
    expiresAt: expiresAt.toISOString(),
  }));
});

router.post("/school/chats/uploads/:id/complete", async (req, res) => {
  const attachmentId = pathId(req.params.id);
  const a = await access(req);
  if (!a.user) fail(401, "سجّل الدخول لرفع الملفات.");
  const [attachment] = await db.select().from(chatAttachments)
    .where(eq(chatAttachments.id, attachmentId)).limit(1);
  if (!attachment) fail(404, "المرفق غير موجود.");
  await syncChatMemberships(a);
  await requireConversation(a, attachment.conversationId, true);
  if (attachment.status === "uploaded" || attachment.status === "attached") {
    res.json(CompleteChatUploadResponse.parse({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      downloadUrl: `/api/school/chats/attachments/${attachment.id}/file`,
    }));
    return;
  }
  if (attachment.status !== "pending" || attachment.expiresAt.getTime() <= Date.now()) {
    fail(410, "انتهت صلاحية رفع الملف؛ ابدأ رفعًا جديدًا.");
  }
  const [file] = await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath, attachment.objectPath));
  if (!file || file.ownerId !== a.user.id || file.storageProvider !== "database") fail(404, "الملف غير موجود.");
  const object = await storage.open(file.objectPath);
  const [metadata] = await object.getMetadata();
  if (Number(metadata.size) !== attachment.size) fail(400, "حجم الملف المرفوع لا يطابق البيانات المسجلة.");
  const [prefix] = await object.download({ start: 0, end: 4095 });
  if (!validChatFilePrefix(attachment.contentType, prefix)) fail(400, "محتوى الملف لا يطابق نوعه المسموح.");
  const [updated] = await db.update(chatAttachments).set({
    status: "uploaded", uploadedAt: new Date(),
  }).where(and(eq(chatAttachments.id, attachment.id), eq(chatAttachments.status, "pending"))).returning();
  const ready = updated ?? attachment;
  res.json(CompleteChatUploadResponse.parse({
    id: ready.id,
    name: ready.name,
    contentType: ready.contentType,
    size: ready.size,
    downloadUrl: `/api/school/chats/attachments/${ready.id}/file`,
  }));
});

router.get("/school/chats/attachments/:id/file", async (req, res) => {
  const attachmentId = pathId(req.params.id);
  const a = await access(req);
  const attachment = await attachmentById(attachmentId);
  await requireConversation(a, attachment.conversationId);
  const [file] = await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath, attachment.objectPath));
  if (!file || file.size !== attachment.size || file.contentType !== attachment.contentType) fail(404, "المرفق غير موجود.");
  const object = await storage.open(file.objectPath);
  const [metadata] = await object.getMetadata();
  const total = Number(metadata.size);
  if (!Number.isSafeInteger(total) || total !== file.size) fail(400, "حجم الملف غير صالح.");
  let start = 0;
  let end = total - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader("Content-Range", `bytes */${total}`);
      res.sendStatus(416);
      return;
    }
    if (!match[1]) start = Math.max(0, total - Number(match[2]));
    else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(end, Number(match[2]));
    }
    if (start > end || start >= total) {
      res.setHeader("Content-Range", `bytes */${total}`);
      res.sendStatus(416);
      return;
    }
    res.status(206).setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
  }
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", end - start + 1);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const inline = /^(image\/(jpeg|png|webp)|audio\/|video\/|application\/pdf)/.test(file.contentType);
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(file.name)}`);
  const [bytes] = await object.download({ start, end });
  res.end(bytes);
});

router.get("/school/chats/participants/:userId/avatar", async (req, res) => {
  const a = await access(req);
  const file = await avatarFileForSharedChat(a, req.params.userId);
  const object = await storage.open(file.objectPath);
  const [metadata] = await object.getMetadata();
  if (Number(metadata.size) !== file.size || file.size > 5 * 1024 * 1024) fail(404, "الصورة غير متاحة.");
  const [prefix] = await object.download({ start: 0, end: 15 });
  if (!validChatFilePrefix(file.contentType, prefix)) fail(404, "الصورة غير متاحة.");
  const [bytes] = await object.download();
  res.setHeader("Content-Type", file.contentType);
  res.setHeader("Content-Length", bytes.length);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(bytes);
});

router.post("/school/chats/:id/reports", async (req, res) => {
  const parsed = CreateChatReportBody.safeParse(req.body);
  if (!parsed.success) fail(400, "بيانات البلاغ غير صالحة.");
  const id = pathId(req.params.id);
  const a = await access(req);
  await syncChatMemberships(a);
  const report = await createChatReportRecord(
    a, id, parsed.data.messageId ?? null, parsed.data.reason, parsed.data.details ?? "",
  );
  const [item] = (await reportItems()).filter((entry) => entry.id === report.id);
  res.status(201).json(CreateChatReportResponse.parse(item));
});

router.get("/school/chats/reports", async (req, res) => {
  const a = await access(req);
  if (a.user?.role !== "admin") fail(403, "عرض البلاغات متاح للمدير الرئيسي فقط.");
  res.json(ListChatReportsResponse.parse(await reportItems()));
});

router.patch("/school/chats/reports/:id", async (req, res) => {
  const parsed = ReviewChatReportBody.safeParse(req.body);
  if (!parsed.success) fail(400, "حالة المراجعة غير صالحة.");
  const a = await access(req);
  const report = await reviewChatReportRecord(a, pathId(req.params.id), parsed.data.status);
  const [item] = (await reportItems()).filter((entry) => entry.id === report.id);
  res.json(ReviewChatReportResponse.parse(item));
});

export default router;
