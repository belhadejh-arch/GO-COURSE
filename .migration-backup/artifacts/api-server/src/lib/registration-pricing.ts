import { eq } from "drizzle-orm";
import { db, registrationPricingRules, schoolRecords } from "@workspace/db";
import type { RegistrationQuoteInput } from "./registration-validation";

export const PRICING_SOURCE_VERSION = "pricing-pdf-2026-10-28";
export type PricingQuery = Pick<typeof db, "select">;

export const registrationPaymentMethods = [
  { code: "ccp", label: "CCP — تفضيل تحويل يدوي، بانتظار التحقق", countries: ["algeria"], manualOnly: true },
  { code: "baridi_mob", label: "Baridi Mob — تفضيل تحويل يدوي، بانتظار التحقق", countries: ["algeria"], manualOnly: true },
  { code: "edahabia_cib", label: "البطاقة الذهبية أو CIB — وسيلة يدوية، وليست بوابة دفع", countries: ["algeria"], manualOnly: true },
  { code: "international_manual", label: "وسيلة دولية يدوية يحددها المدير، بانتظار التحقق", countries: ["outside_algeria"], manualOnly: true },
  { code: "other", label: "وسيلة أخرى — تتطلب موافقة الإدارة", countries: ["algeria", "outside_algeria"], manualOnly: true },
] as const;

export function toPublicPricingOption(rule: typeof registrationPricingRules.$inferSelect) {
  return {
    id: rule.id,
    country: rule.country as "algeria" | "outside_algeria",
    languageId: rule.languageId,
    courseType: rule.courseType as "level" | "conversation" | "exam",
    studyMode: rule.studyMode as "group" | "individual" | null,
    studySystem: rule.studySystem as "regular" | "intensive" | null,
    weeklySessions: rule.weeklySessions,
    totalSessions: rule.totalSessions,
    amount: rule.amount === null ? null : Number(rule.amount),
    currency: rule.currency,
    unit: rule.unit as "monthly" | "level" | "package",
    duration: rule.duration,
    lessonHours: rule.lessonHours === null ? null : Number(rule.lessonHours),
    needsReview: rule.needsReview,
    active: rule.active,
  };
}

export async function getRegistrationOptions(query: PricingQuery) {
  const rules = await query.select().from(registrationPricingRules).where(eq(registrationPricingRules.active, true));
  return {
    pricingOptions: rules.map(toPublicPricingOption),
    paymentMethods: registrationPaymentMethods,
  };
}

export async function calculateRegistrationQuote(query: PricingQuery, input: RegistrationQuoteInput) {
  const [language] = await query.select().from(schoolRecords).where(eq(schoolRecords.id, input.languageId));
  if (!language || language.entity !== "languages" || language.status !== "active") {
    throw Object.assign(new Error("اللغة المختارة غير متاحة."), { status: 400 });
  }
  const rules = await query.select().from(registrationPricingRules).where(eq(registrationPricingRules.active, true));
  let studyMode = input.studyMode ?? null;
  let studySystem = input.studySystem ?? null;
  let weeklySessions = input.weeklySessions ?? null;
  let totalSessions = input.totalSessions ?? null;
  if (input.courseType === "conversation") {
    studyMode = input.studyMode ?? "individual";
    weeklySessions = input.weeklySessions ?? 3;
    totalSessions = input.totalSessions ?? 16;
  } else if (input.courseType === "exam") {
    studyMode = input.studyMode ?? "individual";
  } else if (input.courseType === "level" && input.studySystem === "regular") {
    weeklySessions = input.weeklySessions ?? 2;
    totalSessions = input.totalSessions ?? 16;
  } else if (input.courseType === "level" && input.studySystem === "intensive") {
    totalSessions = input.totalSessions ?? 16;
  }
  const rule = rules.find(candidate =>
    candidate.country === input.country &&
    candidate.courseType === input.courseType &&
    (candidate.languageId === input.languageId || (input.courseType === "exam" && candidate.languageId === null)) &&
    candidate.studyMode === studyMode &&
    candidate.studySystem === studySystem &&
    candidate.weeklySessions === weeklySessions &&
    candidate.totalSessions === totalSessions,
  );
  const priced = !!rule && !rule.needsReview && rule.amount !== null;
  return {
    languageId: language.id,
    languageTitle: language.title,
    country: input.country,
    courseType: input.courseType,
    studyMode,
    studySystem,
    weeklySessions,
    totalSessions,
    duration: rule?.duration ?? null,
    amount: priced ? Number(rule.amount) : null,
    currency: rule?.currency ?? "",
    unit: rule?.unit ?? "unknown",
    status: priced ? "approved" as const : "needs_review" as const,
    sourceVersion: rule?.sourceVersion ?? PRICING_SOURCE_VERSION,
    message: priced
      ? "السعر محسوب وفق تسعيرة الملف، ويظل الطلب بانتظار مراجعة الإدارة."
      : "السعر قيد تأكيد الإدارة",
    ruleId: rule?.id ?? null,
    needsReview: !priced,
  };
}
