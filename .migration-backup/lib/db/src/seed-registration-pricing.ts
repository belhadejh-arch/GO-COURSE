import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { registrationPricingRules, schoolRecords } from "./schema";

const SOURCE_VERSION = "pricing-pdf-2026-10-28";
type Country = "algeria" | "outside_algeria";
type CourseType = "level" | "conversation" | "exam";
type SeedRule = {
  country: Country;
  languageCode: string | null;
  courseType: CourseType;
  studyMode: "group" | "individual" | null;
  studySystem: "regular" | "intensive" | null;
  weeklySessions: number | null;
  totalSessions: number | null;
  amount: number | null;
  currency: "DZD" | "USD";
  unit: "monthly" | "level" | "package";
  duration: string | null;
  lessonHours: number | null;
  needsReview?: boolean;
  reviewNote?: string;
  sourcePage: number;
};

const rules: SeedRule[] = [];
const add = (
  rule: Omit<SeedRule, "languageCode"> & { languageCode?: string | null },
  languages: string[] = [rule.languageCode ?? ""],
) => {
  for (const languageCode of languages) rules.push({ ...rule, languageCode: languageCode || null });
};

const coreLanguages = ["en", "fr", "tr", "es"];
const europeanLanguages = ["ru", "it", "pt"];
const eastAsianLanguages = ["ko", "zh", "ja"];
const northernLanguages = ["nl", "pl", "sv"];

for (const [languageCode, monthly, levelPrice, outsideMonthly, outsideLevel] of [
  ["en", 3000, 8000, 40, 80],
  ["fr", 3000, 8000, 40, 80],
  ["tr", 3000, 8000, 40, 80],
  ["es", 3000, 8000, 40, 80],
  ["de", 4000, 12000, 50, 100],
] as const) {
  add({
    country: "algeria", languageCode, courseType: "level", studyMode: "group",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: monthly,
    currency: "DZD", unit: "monthly", duration: "شهران", lessonHours: 2, sourcePage: 12,
  });
  add({
    country: "algeria", languageCode, courseType: "level", studyMode: "individual",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: levelPrice,
    currency: "DZD", unit: "level", duration: "شهران", lessonHours: 2, sourcePage: 13,
  });
  add({
    country: "outside_algeria", languageCode, courseType: "level", studyMode: "group",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: outsideMonthly,
    currency: "USD", unit: "monthly", duration: "شهران", lessonHours: 2, sourcePage: 35,
  });
  add({
    country: "outside_algeria", languageCode, courseType: "level", studyMode: "individual",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: outsideLevel,
    currency: "USD", unit: "level", duration: "شهران", lessonHours: 2, sourcePage: languageCode === "de" ? 38 : 36,
  });
}

for (const [languageCodes, localPrice, outsidePrice, sourcePage] of [
  [europeanLanguages, 10000, 90, 18],
  [eastAsianLanguages, 15000, 190, 24],
  [northernLanguages, 28000, 250, 27],
] as const) {
  add({
    country: "algeria", languageCode: null, courseType: "level", studyMode: "individual",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: localPrice,
    currency: "DZD", unit: "level", duration: "شهران", lessonHours: 2, sourcePage,
  }, [...languageCodes]);
  add({
    country: "outside_algeria", languageCode: null, courseType: "level", studyMode: "individual",
    studySystem: "regular", weeklySessions: 2, totalSessions: 16, amount: outsidePrice,
    currency: "USD", unit: "level", duration: "شهران", lessonHours: 2, sourcePage: sourcePage + 17,
  }, [...languageCodes]);
}

const intensiveRates: {
  languages: string[];
  rates: Record<number, number | null>;
  sourcePage: number;
  durationByWeek?: Record<number, string>;
  additionalSession?: number;
}[] = [
  {
    languages: coreLanguages, rates: { 3: 10000, 4: 12000, 5: 14000, 6: null, 7: 18000 },
    sourcePage: 15, additionalSession: 2000,
  },
  {
    languages: ["de"], rates: { 3: 15000, 4: 18000, 5: 21000, 6: 24000, 7: 27000 },
    sourcePage: 19, additionalSession: 3000,
    durationByWeek: { 3: "شهر ونصف", 4: "شهر وأسبوع", 5: "شهر", 6: "ثلاثة أسابيع", 7: "أسبوعان" },
  },
  {
    languages: europeanLanguages, rates: { 3: 12500, 4: 15000, 5: 17500, 6: 19500, 7: 22000 },
    sourcePage: 22, additionalSession: 2500,
  },
  {
    languages: eastAsianLanguages, rates: { 3: 18000, 4: 21000, 5: 24000, 6: 27000, 7: 30000 },
    sourcePage: 24, additionalSession: 3000,
  },
  {
    languages: northernLanguages, rates: { 3: 33000, 4: 38000, 5: 43000, 6: 48000, 7: 53000 },
    sourcePage: 27, additionalSession: 5000,
  },
];

for (const tier of intensiveRates) {
  for (const [sessionsText, amount] of Object.entries(tier.rates)) {
    const weeklySessions = Number(sessionsText);
    const isUnclear = amount === null;
    add({
      country: "algeria", languageCode: null, courseType: "level", studyMode: "individual",
      studySystem: "intensive", weeklySessions, totalSessions: 16, amount,
      currency: "DZD", unit: "level", duration: tier.durationByWeek?.[weeklySessions] ?? null,
      lessonHours: 2, needsReview: isUnclear,
      reviewNote: isUnclear
        ? "المصدر يطبع 1600 دج لهذه الباقة، وهو مبلغ متعارض مع جدول التسعير؛ لا يُعتمد قبل تأكيد الإدارة."
        : `سعر مباشر للباقة كما ورد في المصدر. السعر الإضافي للحصة فوق البرنامج: ${tier.additionalSession} دج، ولا يُطبّق تلقائيًا على طلبات التسجيل.`,
      sourcePage: tier.sourcePage,
    }, [...tier.languages]);
  }
}

const examPackages: [number, number, number][] = [
  [5, 12500, 30], [10, 25000, 30], [16, 40000, 30], [20, 50000, 31],
  [25, 62000, 31], [30, 74000, 31], [40, 97000, 31], [50, 120000, 31],
];
for (const [totalSessions, amount, sourcePage] of examPackages) {
  add({
    country: "algeria", languageCode: null, courseType: "exam", studyMode: "individual",
    studySystem: null, weeklySessions: null, totalSessions, amount, currency: "DZD",
    unit: "package", duration: null, lessonHours: 2, sourcePage,
    reviewNote: "باقة التحضير العامة الواردة في ملف التسعيرات.",
  }, ["" ]);
}

for (const languageCode of ["en", "fr", "tr", "es", "ru", "it", "pt", "de"]) {
  add({
    country: "algeria", languageCode, courseType: "conversation", studyMode: "individual",
    studySystem: null, weeklySessions: 3, totalSessions: 16, amount: null,
    currency: "DZD", unit: "level", duration: "شهر ونصف", lessonHours: 2,
    needsReview: true, sourcePage: languageCode === "de" ? 44 : 43,
    reviewNote: "يذكر المصدر سعر المحادثة بالدينار، لكنه لا يحدد بوضوح انطباقه حسب بلد الإقامة؛ أكّد الإدارة السعر قبل عرضه.",
  });
}

export async function seedRegistrationPricing(db: Pick<NodePgDatabase, "select" | "insert">) {
  for (const rule of rules) {
    let languageId: number | null = null;
    if (rule.languageCode) {
      const [language] = await db.select({ id: schoolRecords.id }).from(schoolRecords).where(and(
        eq(schoolRecords.entity, "languages"),
        sql`${schoolRecords.data}->>'code'=${rule.languageCode}`,
      ));
      if (!language) throw new Error(`Missing language catalog entry for ${rule.languageCode}.`);
      languageId = language.id;
    }
    const sourceKey = [
      SOURCE_VERSION, rule.country, rule.languageCode ?? "all", rule.courseType,
      rule.studyMode ?? "any", rule.studySystem ?? "any", rule.weeklySessions ?? "any",
      rule.totalSessions ?? "any",
    ].join(":");
    const { languageCode: _languageCode, ...values } = rule;
    await db.insert(registrationPricingRules).values({
      ...values,
      languageId,
      amount: rule.amount === null ? null : String(rule.amount),
      lessonHours: rule.lessonHours === null ? null : String(rule.lessonHours),
      sourceKey,
      sourceVersion: SOURCE_VERSION,
      reviewNote: rule.reviewNote ?? "",
      active: true,
    }).onConflictDoNothing({ target: registrationPricingRules.sourceKey });
  }
}
