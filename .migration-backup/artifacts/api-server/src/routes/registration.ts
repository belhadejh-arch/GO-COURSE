import { createHash, randomUUID } from "node:crypto";
import { Router, type Request } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  registrationReceiptUploads,
  registrationPricingAudit,
  registrationPricingRules,
  registrationRequestAudit,
  registrationRequests,
  schoolLoginLimits,
  schoolFileContents,
  schoolFiles,
  schoolRecords,
  schoolUsers,
  type SchoolRow,
} from "@workspace/db";
import { access, fail, idList, numberId } from "../lib/school-access";
import { NativeRequest } from "../lib/native-auth";
import { dedupeKey, saveLinks } from "../lib/school-service";
import { validateData } from "../lib/school-validation";
import { validFilePrefix } from "../lib/database-files";
import { fileTransferUrl } from "../lib/file-tokens";
import {
  calculateRegistrationQuote,
  getRegistrationOptions,
  PRICING_SOURCE_VERSION,
  toPublicPricingOption,
} from "../lib/registration-pricing";
import {
  registrationConversionSchema,
  registrationPricingRuleUpdateSchema,
  registrationQuoteInputSchema,
  registrationReceiptUploadInputSchema,
  registrationRequestInputSchema,
  registrationRequestUpdateSchema,
} from "../lib/registration-validation";

const router = Router();
const publicReceiptStatus = "pending_review";

function validationError(issues: { path: PropertyKey[]; message: string }[]) {
  return issues.map(issue => `${issue.path.join(".") || "البيانات"}: ${issue.message}`).join("، ");
}

function requireAdmin(req: Request) {
  const user = (req as NativeRequest).schoolUser ?? null;
  if (!user) fail(401, "سجّل الدخول أولًا.");
  if (!user.enabled) fail(403, "هذا الحساب معطّل.");
  if (user.role !== "admin") fail(403, "هذه العملية متاحة للمدير الرئيسي فقط.");
  return user;
}

async function rateLimit(req: Request, scope: string, maxAttempts: number, windowMs: number) {
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const key = `${scope}:${createHash("sha256").update(ip).digest("hex")}`;
  const now = new Date();
  const reset = new Date(now.getTime() + windowMs);
  const [counter] = await db.insert(schoolLoginLimits).values({
    key,
    attempts: 1,
    resetsAt: reset,
  }).onConflictDoUpdate({
    target: schoolLoginLimits.key,
    set: {
      attempts: sql`case when ${schoolLoginLimits.resetsAt} <= ${now} then 1 else ${schoolLoginLimits.attempts} + 1 end`,
      resetsAt: sql`case when ${schoolLoginLimits.resetsAt} <= ${now} then ${reset} else ${schoolLoginLimits.resetsAt} end`,
    },
  }).returning({ attempts: schoolLoginLimits.attempts });
  if ((counter?.attempts ?? 0) > maxAttempts) fail(429, "أُرسلت طلبات كثيرة من هذا الاتصال. انتظر قليلًا ثم حاول مجددًا.");
}

function quoteFromSnapshot(value: Record<string, unknown>) {
  return {
    languageId: Number(value.languageId),
    languageTitle: String(value.languageTitle || ""),
    country: String(value.country) as "algeria" | "outside_algeria",
    courseType: String(value.courseType) as "level" | "conversation" | "exam",
    studyMode: (value.studyMode ?? null) as "group" | "individual" | null,
    studySystem: (value.studySystem ?? null) as "regular" | "intensive" | null,
    weeklySessions: value.weeklySessions == null ? null : Number(value.weeklySessions),
    totalSessions: value.totalSessions == null ? null : Number(value.totalSessions),
    duration: (value.duration ?? null) as string | null,
    amount: value.amount == null ? null : Number(value.amount),
    currency: String(value.currency || ""),
    unit: String(value.unit || "unknown") as "monthly" | "level" | "package" | "unknown",
    status: String(value.status) as "approved" | "needs_review" | "admin_approved",
    sourceVersion: String(value.sourceVersion || PRICING_SOURCE_VERSION),
    message: String(value.message || ""),
  };
}

function quoteWithInternalValues(quote: Awaited<ReturnType<typeof calculateRegistrationQuote>>) {
  const { ruleId, needsReview: _needsReview, ...publicQuote } = quote;
  return { ruleId, publicQuote };
}

function serializeRule(rule: typeof registrationPricingRules.$inferSelect) {
  return {
    ...toPublicPricingOption(rule),
    reviewNote: rule.reviewNote,
    sourceVersion: rule.sourceVersion,
    sourcePage: rule.sourcePage,
    updatedAt: rule.updatedAt.toISOString(),
  };
}

function serializeRequest(
  row: typeof registrationRequests.$inferSelect,
  paymentReceipt: { id: number; objectPath: string; name: string; contentType: string; size: number; createdAt: Date } | null = null,
) {
  const details = row.details || {};
  const quote = quoteFromSnapshot(row.quoteSnapshot);
  return {
    id: row.id,
    requestNo: row.requestNo,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    country: row.country as "algeria" | "outside_algeria",
    goals: String(details.goals || ""),
    languageId: row.languageId,
    languageTitle: quote.languageTitle,
    courseType: row.courseType as "level" | "conversation" | "exam",
    levelAssessment: (details.levelAssessment ?? null) as "beginner" | "placement_test" | "known" | null,
    currentLevel: (details.currentLevel ?? null) as string | null,
    targetLevel: (details.targetLevel ?? null) as string | null,
    studyMode: (details.studyMode ?? quote.studyMode) as "group" | "individual" | null,
    studySystem: (details.studySystem ?? quote.studySystem) as "regular" | "intensive" | null,
    weeklySessions: details.weeklySessions == null ? quote.weeklySessions : Number(details.weeklySessions),
    totalSessions: details.totalSessions == null ? quote.totalSessions : Number(details.totalSessions),
    duration: quote.duration,
    examName: (details.examName || null) as string | null,
    targetScore: (details.targetScore || null) as string | null,
    examDate: (details.examDate || null) as string | null,
    schedulePreferences: (details.schedulePreferences || null) as string | null,
    paymentMethod: row.paymentMethod as "ccp" | "baridi_mob" | "edahabia_cib" | "international_manual" | "other",
    paymentMethodOther: row.paymentMethodOther,
    paymentStatus: row.paymentStatus as "awaiting_payment" | "awaiting_verification" | "verified" | "rejected",
    paymentReceipt: paymentReceipt ? { ...paymentReceipt, createdAt: paymentReceipt.createdAt.toISOString() } : null,
    status: row.status as "pending_review" | "accepted" | "rejected" | "needs_info",
    quote,
    adminNote: row.adminNote,
    studentProfileId: row.studentProfileId,
    enrollmentId: row.enrollmentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

router.get("/registration/options", async (_req, res) => {
  const options = await getRegistrationOptions(db);
  const languages = await db.select({ id: schoolRecords.id }).from(schoolRecords).where(and(
    eq(schoolRecords.entity, "languages"),
    eq(schoolRecords.status, "active"),
  ));
  const activeLanguageIds = new Set(languages.map(language => language.id));
  res.json({
    pricingOptions: options.pricingOptions.filter(option => option.languageId === null || activeLanguageIds.has(option.languageId)),
    paymentMethods: options.paymentMethods,
  });
});

router.post("/registration/quote", async (req, res) => {
  await rateLimit(req, "registration-quote", 60, 15 * 60 * 1000);
  const parsed = registrationQuoteInputSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const quote = await calculateRegistrationQuote(db, parsed.data);
  res.json(quoteFromSnapshot(quote));
});

router.post("/registration/receipt-uploads", async (req, res) => {
  await rateLimit(req, "registration-receipt-upload", 12, 60 * 60 * 1000);
  const parsed = registrationReceiptUploadInputSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const input = parsed.data;
  const name = input.name.replace(/[\/\\\u0000-\u001f]/g, "_").slice(0, 160);
  const tokenHash = createHash("sha256").update(input.uploadToken).digest("hex");
  const [existing] = await db.select().from(registrationReceiptUploads)
    .where(eq(registrationReceiptUploads.uploadTokenHash, tokenHash)).limit(1);

  if (existing) {
    const [file] = await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath, existing.objectPath)).limit(1);
    if (!file || file.name !== name || file.contentType !== input.contentType || file.size !== input.size) {
      fail(409, "بيانات الوصل لا تطابق الحجز السابق. اختر الملف نفسه أو ابدأ رفعًا جديدًا.");
    }
    if (!existing.requestId && existing.expiresAt.getTime() <= Date.now()) {
      fail(410, "انتهت صلاحية رفع الوصل. اختر الملف مرة أخرى.");
    }
    const [content] = await db.select({ bytes: schoolFileContents.bytes }).from(schoolFileContents)
      .where(eq(schoolFileContents.objectPath, existing.objectPath)).limit(1);
    const uploaded = !!content;
    if (content && (content.bytes.length !== input.size || !validFilePrefix(input.contentType, content.bytes.subarray(0, 16)))) {
      fail(400, "محتوى الملف لا يطابق نوع وصل الدفع المعلن.");
    }
    res.json({
      uploadURL: uploaded || existing.requestId ? null : fileTransferUrl(existing.objectPath, "upload"),
      alreadyUploaded: uploaded,
      alreadyAttached: !!existing.requestId,
    });
    return;
  }

  const objectPath = `/objects/database/${randomUUID()}`;
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.transaction(async tx => {
    await tx.insert(schoolFiles).values({
      objectPath,
      ownerId: null,
      name,
      contentType: input.contentType,
      size: input.size,
      storageProvider: "database",
    });
    await tx.insert(registrationReceiptUploads).values({
      objectPath,
      uploadTokenHash: tokenHash,
      status: "pending",
      expiresAt,
    });
  });
  res.json({ uploadURL: fileTransferUrl(objectPath, "upload"), alreadyUploaded: false, alreadyAttached: false });
});

router.post("/registration/requests", async (req, res) => {
  await rateLimit(req, "registration-submit", 8, 60 * 60 * 1000);
  const parsed = registrationRequestInputSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const input = parsed.data;
  if (input.country === "outside_algeria" && input.paymentMethod === "other" && !input.paymentMethodOther) {
    fail(400, "اكتب وسيلة الدفع الدولية المقترحة.");
  }
  const quoteInput = registrationQuoteInputSchema.parse({
    country: input.country,
    languageId: input.languageId,
    courseType: input.courseType,
    studyMode: input.studyMode,
    studySystem: input.studySystem,
    weeklySessions: input.weeklySessions,
    totalSessions: input.totalSessions,
  });

  const receipt = await db.transaction(async tx => {
    const [replayed] = await tx.select().from(registrationRequests).where(eq(registrationRequests.idempotencyKey, input.idempotencyKey));
    if (replayed) {
      return {
        requestNo: replayed.requestNo,
        status: replayed.status,
        paymentStatus: replayed.paymentStatus,
        quote: quoteFromSnapshot(replayed.quoteSnapshot),
        createdAt: replayed.createdAt.toISOString(),
      };
    }
    const quoteResult = await calculateRegistrationQuote(tx, quoteInput);
    const { ruleId, publicQuote } = quoteWithInternalValues(quoteResult);
    const receiptRequired = publicQuote.amount != null && ["approved", "admin_approved"].includes(publicQuote.status);
    if (!receiptRequired && input.receiptUploadToken) {
      fail(400, "السعر قيد تأكيد الإدارة. انتظر اعتماد المبلغ قبل دفع الرسوم أو رفع الوصل.");
    }
    if (receiptRequired && !input.receiptUploadToken) {
      fail(400, "أرفق وصل الدفع بعد دفع المبلغ المعتمد.");
    }
    let receiptUpload: typeof registrationReceiptUploads.$inferSelect | null = null;
    if (input.receiptUploadToken) {
      const tokenHash = createHash("sha256").update(input.receiptUploadToken).digest("hex");
      const [foundUpload] = await tx.select().from(registrationReceiptUploads)
        .where(eq(registrationReceiptUploads.uploadTokenHash, tokenHash)).limit(1);
      if (!foundUpload || foundUpload.status !== "pending" || foundUpload.requestId ||
        foundUpload.expiresAt.getTime() <= Date.now()) {
        fail(400, "ارفع وصل الدفع أولًا، ثم أعد إرسال طلب التسجيل.");
      }
      const [receiptFile] = await tx.select().from(schoolFiles)
        .where(eq(schoolFiles.objectPath, foundUpload.objectPath)).limit(1);
      const [receiptContent] = await tx.select({ bytes: schoolFileContents.bytes }).from(schoolFileContents)
        .where(eq(schoolFileContents.objectPath, foundUpload.objectPath)).limit(1);
      if (!receiptFile || receiptFile.storageProvider !== "database" || !receiptContent ||
        receiptContent.bytes.length !== receiptFile.size ||
        !validFilePrefix(receiptFile.contentType, receiptContent.bytes.subarray(0, 16))) {
        fail(400, "لم يكتمل رفع وصل الدفع أو أن الملف غير صالح.");
      }
      receiptUpload = foundUpload;
    }
    const sessionUser = (req as NativeRequest).schoolUser;
    const linkedUserId = sessionUser?.role === "student" &&
      sessionUser.email.trim().toLowerCase() === input.email
      ? sessionUser.id
      : null;
    const requestNo = `GC-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
    const {
      idempotencyKey: _idempotencyKey,
      receiptUploadToken: _receiptUploadToken,
      fullName: _fullName,
      phone: _phone,
      email: _email,
      country: _country,
      languageId: _languageId,
      courseType: _courseType,
      paymentMethod: _paymentMethod,
      paymentMethodOther: _paymentMethodOther,
      ...submittedDetails
    } = input;
    const details: Record<string, unknown> = {
      ...submittedDetails,
      studyMode: publicQuote.studyMode,
      studySystem: publicQuote.studySystem,
      weeklySessions: publicQuote.weeklySessions,
      totalSessions: publicQuote.totalSessions,
    };
    const [created] = await tx.insert(registrationRequests).values({
      requestNo,
      idempotencyKey: input.idempotencyKey,
      userId: linkedUserId,
      fullName: input.fullName,
      phone: input.phone,
      email: input.email,
      country: input.country,
      languageId: input.languageId,
      courseType: input.courseType,
      paymentMethod: input.paymentMethod,
      paymentMethodOther: input.paymentMethod === "other" ? input.paymentMethodOther : null,
      paymentStatus: receiptUpload ? "awaiting_verification" : "awaiting_payment",
      status: publicReceiptStatus,
      priceRuleId: ruleId,
      priceStatus: publicQuote.status,
      quoteSnapshot: publicQuote,
      details,
    }).onConflictDoNothing({ target: registrationRequests.idempotencyKey }).returning();
    const request = created ?? (await tx.select().from(registrationRequests).where(eq(registrationRequests.idempotencyKey, input.idempotencyKey)))[0];
    if (!request) fail(409, "تعذّر حفظ الطلب المكرر؛ أعد المحاولة.");
    if (created) {
      if (receiptUpload) {
        const [attachedReceipt] = await tx.update(registrationReceiptUploads).set({
          requestId: created.id,
          status: "attached",
          attachedAt: new Date(),
        }).where(and(
          eq(registrationReceiptUploads.id, receiptUpload.id),
          eq(registrationReceiptUploads.status, "pending"),
        )).returning({ id: registrationReceiptUploads.id });
        if (!attachedReceipt) fail(409, "تم ربط وصل الدفع بطلب آخر. أعد رفع الوصل ثم حاول مجددًا.");
      }
      await tx.insert(registrationRequestAudit).values({
        requestId: created.id,
        action: "created",
        previousStatus: null,
        nextStatus: created.status,
        previousQuote: null,
        nextQuote: publicQuote,
        reason: receiptUpload ? "أرفق الطالب وصل الدفع عند تقديم الطلب." : "تم تقديم الطلب قبل اعتماد السعر، دون دفع.",
      });
    }
    return {
      requestNo: request.requestNo,
      status: request.status,
      paymentStatus: request.paymentStatus,
      quote: quoteFromSnapshot(request.quoteSnapshot),
      createdAt: request.createdAt.toISOString(),
    };
  });
  res.status(201).json(receipt);
});

router.get("/admin/registration-requests", async (req, res) => {
  requireAdmin(req);
  const rows = await db.select().from(registrationRequests).orderBy(desc(registrationRequests.createdAt));
  const receiptRows = rows.length ? await db.select({
    requestId: registrationReceiptUploads.requestId,
    id: registrationReceiptUploads.id,
    objectPath: registrationReceiptUploads.objectPath,
    name: schoolFiles.name,
    contentType: schoolFiles.contentType,
    size: schoolFiles.size,
    createdAt: registrationReceiptUploads.attachedAt,
  }).from(registrationReceiptUploads)
    .innerJoin(schoolFiles, eq(schoolFiles.objectPath, registrationReceiptUploads.objectPath))
    .where(inArray(registrationReceiptUploads.requestId, rows.map(row => row.id))) : [];
  const receiptsByRequest = new Map(receiptRows.filter(row => row.requestId != null).map(row => [row.requestId!, {
    id: row.id,
    objectPath: row.objectPath,
    name: row.name,
    contentType: row.contentType,
    size: row.size,
    createdAt: row.createdAt ?? new Date(),
  }]));
  res.json(rows.map(row => serializeRequest(row, receiptsByRequest.get(row.id) ?? null)));
});

router.patch("/admin/registration-requests/:id", async (req, res) => {
  const actor = requireAdmin(req);
  const id = numberId(req.params.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "رقم الطلب غير صالح.");
  const parsed = registrationRequestUpdateSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const input = parsed.data;
  const priceFields = input.finalAmount !== undefined || input.finalCurrency !== undefined || input.finalUnit !== undefined;
  if (priceFields && (input.finalAmount === undefined || !input.reason)) {
    fail(400, "تعديل السعر يتطلب المبلغ وسببًا واضحًا.");
  }
  if (input.finalAmount !== undefined && input.finalAmount !== null && (!input.finalCurrency || !input.finalUnit)) {
    fail(400, "حدّد العملة ووحدة التسعير مع السعر النهائي.");
  }

  const updated = await db.transaction(async tx => {
    const [current] = await tx.select().from(registrationRequests).where(eq(registrationRequests.id, id)).for("update");
    if (!current) fail(404, "طلب التسجيل غير موجود.");
    const previousQuote = quoteFromSnapshot(current.quoteSnapshot);
    const nextQuote = priceFields
      ? {
          ...previousQuote,
          amount: input.finalAmount == null ? null : input.finalAmount,
          currency: input.finalAmount == null ? previousQuote.currency : input.finalCurrency!,
          unit: input.finalAmount == null ? previousQuote.unit : input.finalUnit!,
          status: input.finalAmount == null ? "needs_review" as const : "admin_approved" as const,
          message: input.finalAmount == null
            ? "السعر قيد تأكيد الإدارة"
            : "اعتمدت الإدارة هذا السعر يدويًا؛ راجع العرض النهائي قبل الدفع.",
        }
      : previousQuote;
    const nextStatus = input.status ?? current.status;
    const nextPaymentStatus = input.paymentStatus ?? current.paymentStatus;
    if (nextStatus === "accepted" && nextQuote.status === "needs_review") {
      fail(400, "لا يمكن قبول الطلب قبل اعتماد سعر نهائي.");
    }
    const [saved] = await tx.update(registrationRequests).set({
      status: nextStatus,
      paymentStatus: nextPaymentStatus,
      priceStatus: nextQuote.status,
      quoteSnapshot: nextQuote,
      adminNote: input.adminNote === undefined ? current.adminNote : input.adminNote,
      updatedAt: new Date(),
    }).where(eq(registrationRequests.id, id)).returning();
    if (!saved) fail(404, "طلب التسجيل غير موجود.");
    const changed = nextStatus !== current.status || nextPaymentStatus !== current.paymentStatus || priceFields ||
      (input.adminNote !== undefined && input.adminNote !== current.adminNote);
    if (changed) {
      await tx.insert(registrationRequestAudit).values({
        requestId: saved.id,
        actorUserId: actor.id,
        action: priceFields ? "price_or_request_update" : "request_update",
        previousStatus: current.status,
        nextStatus,
        previousQuote,
        nextQuote,
        reason: input.reason ?? input.adminNote ?? "",
      });
      if (saved.userId) {
        const message = priceFields
          ? "تم تحديث عرض السعر لطلب التسجيل. راجع إشعاراتك أو تواصل مع الإدارة."
          : nextStatus !== current.status
            ? `تم تحديث حالة طلب التسجيل إلى: ${nextStatus}.`
            : nextPaymentStatus !== current.paymentStatus
              ? `تم تحديث حالة التحقق من الدفع إلى: ${nextPaymentStatus}.`
              : "أضافت الإدارة ملاحظة إلى طلب التسجيل.";
        await tx.insert(schoolRecords).values({
          entity: "notifications",
          title: "تحديث طلب التسجيل",
          status: "active",
          ownerId: saved.userId,
          dedupeKey: `registration:${saved.id}:${saved.updatedAt.getTime()}`,
          data: { message, read: false, href: "/dashboard" },
        }).onConflictDoNothing();
      }
    }
    return saved;
  });
  res.json(serializeRequest(updated));
});

router.post("/admin/registration-requests/:id/convert", async (req, res) => {
  const actor = requireAdmin(req);
  const id = numberId(req.params.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "رقم الطلب غير صالح.");
  const parsed = registrationConversionSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const adminAccess = await access(req);
  const input = parsed.data;
  const converted = await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(740234)`);
    const [request] = await tx.select().from(registrationRequests).where(eq(registrationRequests.id, id)).for("update");
    if (!request) fail(404, "طلب التسجيل غير موجود.");
    if (request.enrollmentId && request.studentProfileId) {
      const [existingEnrollment] = await tx.select().from(schoolRecords).where(eq(schoolRecords.id, request.enrollmentId));
      const existingCourseId = numberId(existingEnrollment?.data.courseId);
      const [course] = existingCourseId
        ? await tx.select().from(schoolRecords).where(eq(schoolRecords.id, existingCourseId))
        : [];
      return {
        requestNo: request.requestNo,
        studentProfileId: request.studentProfileId,
        enrollmentId: request.enrollmentId,
        courseTitle: course?.title ?? "",
      };
    }
    if (request.status !== "accepted") fail(400, "اقبل الطلب قبل تحويله إلى تسجيل أكاديمي.");
    if (request.paymentStatus !== "verified") fail(400, "يجب أن تؤكد الإدارة استلام الدفع قبل تفعيل التسجيل الأكاديمي.");
    const quote = quoteFromSnapshot(request.quoteSnapshot);
    if (quote.amount === null || quote.status === "needs_review") fail(400, "اعتمد السعر النهائي قبل إنشاء التسجيل.");

    const rows = await tx.select().from(schoolRecords);
    const course = rows.find(row => row.id === input.courseId && row.entity === "courses");
    if (!course || course.status !== "published") fail(400, "اختر دورة منشورة.");
    const details = request.details || {};
    const desiredLevel = stringValue(details.targetLevel) || stringValue(details.currentLevel);
    if (
      numberId(course.data.languageId) !== request.languageId ||
      course.data.courseType !== request.courseType ||
      (desiredLevel && course.data.level !== desiredLevel) ||
      (quote.studyMode && course.data.studyMode !== quote.studyMode) ||
      (quote.studySystem && course.data.studySystem !== quote.studySystem) ||
      (quote.weeklySessions && Number(course.data.weeklySessions) !== quote.weeklySessions) ||
      (quote.totalSessions && Number(course.data.totalSessions) !== quote.totalSessions) ||
      (request.courseType === "exam" && course.data.examName && stringValue(course.data.examName) !== stringValue(details.examName))
    ) {
      fail(400, "الدورة المختارة لا تطابق لغة الطلب أو نوعه أو المستوى أو نظامه أو عدد حصصه.");
    }
    const teacherIds = idList(course.data.teacherIds);
    const teacherId = teacherIds[0];
    if (!teacherId) fail(400, "عيّن أستاذًا للدورة قبل تحويل الطلب.");
    const days = idList(course.data.days);
    const time = stringValue(course.data.time);
    if (days.length !== Number(course.data.weeklySessions) || !/^\d{2}:\d{2}$/.test(time)) {
      fail(400, "أكمل أيام ووقت جدول الدورة قبل تحويل الطلب.");
    }
    if (input.groupId) {
      const group = rows.find(row => row.id === input.groupId && row.entity === "groups");
      if (!group || ["archived", "disabled"].includes(group.status) || numberId(group.data.courseId) !== course.id) {
        fail(400, "المجموعة المختارة غير متاحة لهذه الدورة.");
      }
    }

    const email = request.email.toLowerCase();
    const [user] = await tx.select().from(schoolUsers).where(eq(schoolUsers.email, email));
    if (user && user.role !== "student") fail(409, "البريد مرتبط بحساب إداري أو أستاذ، ولا يمكن ربطه بملف طالب.");
    const sameEmailProfile = rows.find(row =>
      ["students", "teachers"].includes(row.entity) &&
      stringValue(row.data.email).toLowerCase() === email,
    );
    if (sameEmailProfile?.entity === "teachers") fail(409, "البريد مستخدم لملف أستاذ.");
    if (sameEmailProfile && sameEmailProfile.status !== "active" && sameEmailProfile.status !== "invited") {
      fail(409, "يوجد ملف طالب مؤرشف أو معطّل بهذا البريد؛ راجعه قبل المتابعة.");
    }
    const names = request.fullName.trim().split(/\s+/);
    const firstName = names[0] || request.fullName;
    const lastName = names.slice(1).join(" ") || firstName;
    let student: SchoolRow;
    if (sameEmailProfile) {
      student = sameEmailProfile;
      const studentData = {
        ...student.data,
        accountId: user?.id ?? student.data.accountId,
        languageIds: [...new Set([...idList(student.data.languageIds), request.languageId])],
      };
      const [updatedStudent] = await tx.update(schoolRecords).set({ data: studentData, updatedAt: new Date() })
        .where(eq(schoolRecords.id, student.id)).returning();
      student = updatedStudent;
    } else {
      const studentData = {
        firstName, lastName, email, phone: request.phone,
        languageIds: [request.languageId],
        country: request.country,
        registrationRequestNo: request.requestNo,
        ...(user ? { accountId: user.id } : {}),
      };
      const [createdStudent] = await tx.insert(schoolRecords).values({
        entity: "students",
        title: request.fullName,
        status: "active",
        data: studentData,
      }).returning();
      student = createdStudent;
      rows.push(student);
    }

    const courseType = request.courseType as "level" | "conversation" | "exam";
    const levelValue = stringValue(details.targetLevel) || stringValue(details.currentLevel) || stringValue(course.data.level);
    const enrollmentInput = {
      studentId: student.id,
      courseId: course.id,
      teacherId,
      groupId: input.groupId,
      languageId: request.languageId,
      level: levelValue,
      courseType,
      studyMode: quote.studyMode ?? course.data.studyMode ?? "group",
      studySystem: quote.studySystem ?? course.data.studySystem ?? "regular",
      weeklySessions: Number(course.data.weeklySessions),
      totalSessions: quote.totalSessions ?? Number(course.data.totalSessions),
      startDate: input.startDate,
      days,
      time,
      examName: details.examName,
      targetScore: details.targetScore,
      registrationRequestNo: request.requestNo,
      quoteSnapshot: request.quoteSnapshot,
    };
    const extendedAccess = { ...adminAccess, user: actor, rows };
    const validatedEnrollment = validateData(extendedAccess, "enrollments", enrollmentInput);
    const enrollmentKey = dedupeKey("enrollments", validatedEnrollment);
    const [enrollment] = await tx.insert(schoolRecords).values({
      entity: "enrollments",
      title: `${student.title} — ${course.title}`,
      status: "active",
      data: validatedEnrollment,
      ownerId: actor.id,
      dedupeKey: enrollmentKey,
    }).returning();
    await saveLinks(tx, enrollment);
    const courseData = { ...course.data, studentIds: [...new Set([...idList(course.data.studentIds), student.id])] };
    const [updatedCourse] = await tx.update(schoolRecords).set({ data: courseData, updatedAt: new Date() })
      .where(eq(schoolRecords.id, course.id)).returning();
    await saveLinks(tx, updatedCourse);
    await tx.insert(schoolRecords).values({
      entity: "audit",
      title: `تحويل طلب ${request.requestNo} إلى تسجيل أكاديمي`,
      status: "active",
      ownerId: actor.id,
      data: {
        action: "تحويل طلب تسجيل",
        actor: actor.name,
        actorId: actor.id,
        requestNo: request.requestNo,
        studentId: student.id,
        enrollmentId: enrollment.id,
      },
    });
    await tx.update(registrationRequests).set({
      userId: user?.role === "student" ? user.id : request.userId,
      studentProfileId: student.id,
      enrollmentId: enrollment.id,
      updatedAt: new Date(),
    }).where(eq(registrationRequests.id, request.id));
    await tx.insert(registrationRequestAudit).values({
      requestId: request.id,
      actorUserId: actor.id,
      action: "converted",
      previousStatus: request.status,
      nextStatus: request.status,
      previousQuote: quote,
      nextQuote: quote,
      reason: "إنشاء تسجيل أكاديمي وربطه بالدورة المحددة.",
    });
    const notificationUserId = user?.role === "student" ? user.id : request.userId;
    if (notificationUserId) {
      await tx.insert(schoolRecords).values({
        entity: "notifications",
        title: "اكتمل التسجيل الأكاديمي",
        status: "active",
        ownerId: notificationUserId,
        dedupeKey: `registration-converted:${request.id}`,
        data: { message: "أكملت الإدارة ربط طلبك بالدورة الدراسية.", read: false, href: "/dashboard" },
      }).onConflictDoNothing();
    }
    return {
      requestNo: request.requestNo,
      studentProfileId: student.id,
      enrollmentId: enrollment.id,
      courseTitle: course.title,
    };
  });
  res.status(201).json(converted);
});

router.get("/admin/registration-pricing", async (req, res) => {
  requireAdmin(req);
  const rules = await db.select().from(registrationPricingRules).orderBy(
    registrationPricingRules.country,
    registrationPricingRules.courseType,
    registrationPricingRules.languageId,
  );
  res.json(rules.map(serializeRule));
});

router.patch("/admin/registration-pricing/:id", async (req, res) => {
  const actor = requireAdmin(req);
  const id = numberId(req.params.id);
  if (!Number.isInteger(id) || id <= 0) fail(400, "معرّف التسعيرة غير صالح.");
  const parsed = registrationPricingRuleUpdateSchema.safeParse(req.body);
  if (!parsed.success) fail(400, validationError(parsed.error.issues));
  const input = parsed.data;
  if (input.needsReview && input.amount !== null && !input.reviewNote) {
    fail(400, "أضف سبب مراجعة السعر.");
  }
  if (!input.needsReview && input.amount === null) {
    fail(400, "لا يمكن اعتماد تسعيرة دون مبلغ محدد.");
  }
  const updated = await db.transaction(async tx => {
    const [current] = await tx.select().from(registrationPricingRules).where(eq(registrationPricingRules.id, id)).for("update");
    if (!current) fail(404, "قاعدة التسعير غير موجودة.");
    const nextValues = {
      amount: input.amount === null ? null : String(input.amount),
      currency: input.currency,
      unit: input.unit,
      duration: input.duration,
      lessonHours: input.lessonHours === null ? null : String(input.lessonHours),
      needsReview: input.needsReview,
      reviewNote: input.reviewNote,
      active: input.active,
    };
    const previousValues = {
      amount: current.amount,
      currency: current.currency,
      unit: current.unit,
      duration: current.duration,
      lessonHours: current.lessonHours,
      needsReview: current.needsReview,
      reviewNote: current.reviewNote,
      active: current.active,
    };
    const [saved] = await tx.update(registrationPricingRules).set({
      ...nextValues,
      updatedAt: new Date(),
    }).where(eq(registrationPricingRules.id, id)).returning();
    await tx.insert(registrationPricingAudit).values({
      pricingRuleId: id,
      actorUserId: actor.id,
      previousValues,
      nextValues,
      reason: input.reason,
    });
    return saved;
  });
  res.json(serializeRule(updated));
});

export default router;
