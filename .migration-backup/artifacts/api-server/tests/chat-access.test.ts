import test from "node:test";
import assert from "node:assert/strict";
import { enforceChatAccess } from "../src/lib/chat-service";

function statusOf(fn: () => void) {
  try { fn(); } catch (error) { return (error as { status?: number }).status; }
  return undefined;
}

test("teachers and students can read only conversations in which they are members", () => {
  assert.equal(statusOf(() => enforceChatAccess("teacher", null)), 404);
  assert.equal(statusOf(() => enforceChatAccess("student", { canSend: true })), undefined);
  assert.equal(statusOf(() => enforceChatAccess("teacher", { canSend: true })), undefined);
  assert.equal(statusOf(() => enforceChatAccess("staff", { canSend: true })), 403);
});

test("former section members retain read-only history", () => {
  assert.equal(statusOf(() => enforceChatAccess("student", { canSend: false })), undefined);
  assert.equal(statusOf(() => enforceChatAccess("student", { canSend: false }, true)), 403);
});

test("admin can send from a conversation without becoming a course member", () => {
  assert.equal(statusOf(() => enforceChatAccess("admin", null)), undefined);
  assert.equal(statusOf(() => enforceChatAccess("admin", null, true)), undefined);
});
