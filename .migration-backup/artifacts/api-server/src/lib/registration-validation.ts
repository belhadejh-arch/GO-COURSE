import { z } from "zod";

const level = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);
const country = z.enum(["algeria", "outside_algeria"]);
const courseType = z.enum(["level", "conversation", "exam"]);
const studyMode = z.enum(["group", "individual"]);
const studySystem = z.enum(["regular", "intensive"]);
const paymentMethod = z.enum(["ccp", "baridi_mob", "edahabia_cib", "international_manual", "other"]);

export const registrationQuoteInputSchema = z.object({
  country,
  languageId: z.coerce.number().int().positive(),
  courseType,
  studyMode: studyMode.optional(),
  studySystem: studySystem.optional(),
  weeklySessions: z.coerce.number().int().min(1).max(7).optional(),
  totalSessions: z.coerce.number().int().min(1).max(100).optional(),
}).strict();

export const registrationReceiptUploadInputSchema = z.object({
  uploadToken: z.string().uuid(),
  name: z.string().trim().min(1).max(160),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
}).strict();

const fullName = z.string().trim().min(2, "أدخل الاسم الكامل.").max(160);
const phone = z.string().trim().transform(value => value.replace(/[^\d+]/g, ""))
  .refine(value => /^\+[1-9]\d{6,14}$/.test(value), "أدخل رقم الهاتف مع رمز الدولة، مثل +213...");
const email = z.string().trim().email("أدخل بريدًا إلكترونيًا صالحًا.").max(254).transform(value => value.toLowerCase());
const cleanOptional = (max: number) => z.string().trim().max(max).optional().default("");

export const registrationRequestInputSchema = z.object({
  idempotencyKey: z.string().uuid(),
  receiptUploadToken: z.string().uuid().optional(),
  fullName,
  phone,
  email,
  country,
  goals: cleanOptional(3000),
  languageId: z.coerce.number().int().positive(),
  courseType,
  levelAssessment: z.enum(["beginner", "placement_test", "known"]).optional(),
  currentLevel: level.optional(),
  targetLevel: level.optional(),
  studyMode: studyMode.optional(),
  studySystem: studySystem.optional(),
  weeklySessions: z.coerce.number().int().min(1).max(7).optional(),
  totalSessions: z.coerce.number().int().min(1).max(100).optional(),
  examName: cleanOptional(100),
  targetScore: cleanOptional(80),
  examDate: z.string().date().optional(),
  schedulePreferences: cleanOptional(500),
  paymentMethod,
  paymentMethodOther: cleanOptional(120),
}).strict().superRefine((data, ctx) => {
  if (data.courseType === "level") {
    if (!data.levelAssessment) ctx.addIssue({ code: "custom", path: ["levelAssessment"], message: "حدّد مستواك الحالي أو اختر اختبار تحديد المستوى." });
    if (data.levelAssessment === "known" && !data.currentLevel) ctx.addIssue({ code: "custom", path: ["currentLevel"], message: "اختر مستواك الحالي." });
    if (data.studySystem && !data.weeklySessions) {
      ctx.addIssue({ code: "custom", path: ["weeklySessions"], message: "اختر عدد الحصص الأسبوعية." });
    }
    if (data.studySystem === "regular" && data.weeklySessions !== 2) {
      ctx.addIssue({ code: "custom", path: ["weeklySessions"], message: "النظام العادي يعتمد حصتين أسبوعيًا." });
    }
    if (data.studySystem === "intensive" && (data.studyMode !== "individual" || ![3, 4, 5, 6, 7].includes(data.weeklySessions ?? 0))) {
      ctx.addIssue({ code: "custom", path: ["weeklySessions"], message: "اختر باقة مكثفة فردية متاحة من 3 إلى 7 حصص أسبوعيًا." });
    }
    if (data.totalSessions !== undefined && data.totalSessions !== 16) {
      ctx.addIssue({ code: "custom", path: ["totalSessions"], message: "عدد حصص المستوى ثابت وفق البرنامج المعتمد." });
    }
  }
  if (data.courseType === "conversation") {
    if (!data.goals) ctx.addIssue({ code: "custom", path: ["goals"], message: "اكتب هدفك من تحسين المحادثة." });
    if (data.studyMode && data.studyMode !== "individual") {
      ctx.addIssue({ code: "custom", path: ["studyMode"], message: "المحادثة متاحة فرديًا فقط وفق البرنامج الحالي." });
    }
    if (data.weeklySessions !== undefined && data.weeklySessions !== 3) {
      ctx.addIssue({ code: "custom", path: ["weeklySessions"], message: "برنامج المحادثة الوارد في الملف يعتمد 3 حصص أسبوعيًا." });
    }
    if (data.totalSessions !== undefined && data.totalSessions !== 16) {
      ctx.addIssue({ code: "custom", path: ["totalSessions"], message: "عدد حصص المحادثة ثابت وفق البرنامج." });
    }
  }
  if (data.courseType === "exam") {
    if (!data.examName) ctx.addIssue({ code: "custom", path: ["examName"], message: "اكتب اسم الامتحان المستهدف." });
    if (data.totalSessions !== undefined && ![5, 10, 16, 20, 25, 30, 40, 50].includes(data.totalSessions)) {
      ctx.addIssue({ code: "custom", path: ["totalSessions"], message: "اختر باقة تحضير مدعومة من ملف التسعيرات." });
    }
    if (data.studyMode && data.studyMode !== "individual") {
      ctx.addIssue({ code: "custom", path: ["studyMode"], message: "باقات الامتحانات المتاحة فردية." });
    }
  }
  if (data.paymentMethod === "other" && !data.paymentMethodOther) {
    ctx.addIssue({ code: "custom", path: ["paymentMethodOther"], message: "اكتب وسيلة الدفع المقترحة." });
  }
  if (data.country === "outside_algeria" && ["ccp", "baridi_mob", "edahabia_cib"].includes(data.paymentMethod)) {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "اختر وسيلة الدفع المتاحة خارج الجزائر." });
  }
  if (data.country === "algeria" && data.paymentMethod === "international_manual") {
    ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "اختر وسيلة الدفع داخل الجزائر." });
  }
});

export const registrationRequestUpdateSchema = z.object({
  status: z.enum(["pending_review", "accepted", "rejected", "needs_info"]).optional(),
  paymentStatus: z.enum(["awaiting_payment", "awaiting_verification", "verified", "rejected"]).optional(),
  finalAmount: z.number().finite().min(0).nullable().optional(),
  finalCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
  finalUnit: z.enum(["monthly", "level", "package"]).optional(),
  adminNote: z.string().trim().max(2000).optional(),
  reason: z.string().trim().min(3).max(1000).optional(),
}).strict().refine(data => Object.keys(data).length > 0, "أدخل تعديلًا واحدًا على الأقل.");

export const registrationPricingRuleUpdateSchema = z.object({
  amount: z.number().finite().min(0).nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  unit: z.enum(["monthly", "level", "package"]),
  duration: z.string().trim().max(100).nullable(),
  lessonHours: z.number().finite().min(0.5).max(8).nullable(),
  needsReview: z.boolean(),
  reviewNote: z.string().trim().max(1000),
  active: z.boolean(),
  reason: z.string().trim().min(3).max(1000),
}).strict();

export const registrationConversionSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  groupId: z.coerce.number().int().positive().optional(),
  startDate: z.string().date(),
}).strict();

export type RegistrationQuoteInput = z.infer<typeof registrationQuoteInputSchema>;
export type RegistrationRequestInput = z.infer<typeof registrationRequestInputSchema>;
