import { test } from "node:test";
import assert from "node:assert/strict";
import {
  registrationQuoteInputSchema,
  registrationReceiptUploadInputSchema,
  registrationRequestInputSchema,
} from "../src/lib/registration-validation";

const validLevelRequest = {
  idempotencyKey: "a062cc76-fb8a-4c3d-bdb0-e73682909931",
  receiptUploadToken: "c3f4175c-73a6-488d-aa92-e6769f236118",
  fullName: "سارة بن عيسى",
  phone: "+213555123456",
  email: "sara@example.com",
  country: "algeria",
  languageId: 1,
  courseType: "level",
  levelAssessment: "beginner",
  targetLevel: "A2",
  studyMode: "group",
  studySystem: "regular",
  weeklySessions: 2,
  paymentMethod: "ccp",
};

test("registration requests accept a valid regular group course", () => {
  assert.equal(registrationRequestInputSchema.safeParse(validLevelRequest).success, true);
});

test("registration requests can be submitted before an administrator confirms an unlisted price", () => {
  const { receiptUploadToken: _receiptUploadToken, ...withoutReceipt } = validLevelRequest;
  assert.equal(registrationRequestInputSchema.safeParse(withoutReceipt).success, true);
});

test("payment receipt uploads allow only small supported image or PDF files", () => {
  const validUpload = {
    uploadToken: "c3f4175c-73a6-488d-aa92-e6769f236118",
    name: "receipt.pdf",
    contentType: "application/pdf",
    size: 1024,
  };
  assert.equal(registrationReceiptUploadInputSchema.safeParse(validUpload).success, true);
  assert.equal(registrationReceiptUploadInputSchema.safeParse({ ...validUpload, contentType: "text/html" }).success, false);
  assert.equal(registrationReceiptUploadInputSchema.safeParse({ ...validUpload, size: 11 * 1024 * 1024 }).success, false);
});

test("clients cannot submit a price or currency", () => {
  assert.equal(
    registrationQuoteInputSchema.safeParse({
      country: "algeria",
      languageId: 1,
      courseType: "level",
      studyMode: "group",
      studySystem: "regular",
      weeklySessions: 2,
      amount: 1,
      currency: "DZD",
    }).success,
    false,
  );
  assert.equal(
    registrationRequestInputSchema.safeParse({
      ...validLevelRequest,
      amount: 1,
      currency: "DZD",
    }).success,
    false,
  );
});

test("intensive group requests are rejected rather than priced as VIP", () => {
  assert.equal(
    registrationRequestInputSchema.safeParse({
      ...validLevelRequest,
      studySystem: "intensive",
      weeklySessions: 3,
    }).success,
    false,
  );
});

test("exam requests only accept package sizes from the approved price sheet", () => {
  const common = {
    ...validLevelRequest,
    courseType: "exam",
    studyMode: "individual",
    studySystem: undefined,
    weeklySessions: undefined,
    examName: "IELTS",
  };
  assert.equal(
    registrationRequestInputSchema.safeParse({ ...common, totalSessions: 10 }).success,
    true,
  );
  assert.equal(
    registrationRequestInputSchema.safeParse({ ...common, totalSessions: 12 }).success,
    false,
  );
});

test("domestic manual payment methods are rejected for overseas applications", () => {
  assert.equal(
    registrationRequestInputSchema.safeParse({
      ...validLevelRequest,
      country: "outside_algeria",
      paymentMethod: "ccp",
    }).success,
    false,
  );
});
