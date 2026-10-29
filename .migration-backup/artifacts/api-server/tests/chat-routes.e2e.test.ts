import assert from "node:assert/strict";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import {
  db,
  pool,
  schoolCredentials,
  schoolRecords,
  schoolSessions,
  schoolUsers,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { SESSION_COOKIE } from "../src/lib/native-auth";

const enabled = process.env.CHAT_E2E === "1";

test("chat routes enforce scope, preserve history, and transfer private audio", {
  skip: !enabled,
  timeout: 60_000,
}, async () => {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, "DATABASE_URL is required for the isolated chat e2e test");

  const schema = `chat_e2e_${randomUUID().replaceAll("-", "")}`;
  const migrationDir = new URL("../../../lib/db/migrations/", import.meta.url);
  const migrationFiles = (await readdir(migrationDir))
    .filter((file) => /^\d+_.*\.sql$/.test(file))
    .sort();
  let schemaCreated = false;
  let server: ReturnType<typeof spawn> | undefined;
  let serverLog = "";
  const port = 20_000 + randomInt(20_000);
  const origin = `http://127.0.0.1:${port}`;

  const withSchema = async <T>(work: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${schema}"`));
      return work(tx);
    });

  const issueSession = async (
    tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
    userId: string,
  ) => {
    const token = randomBytes(32).toString("hex");
    await tx.insert(schoolSessions).values({
      tokenHash: createHash("sha256").update(token).digest("hex"),
      userId,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    return token;
  };

  const call = async (
    route: string,
    token: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
  ) => {
    const response = await fetch(`${origin}/api${route}`, {
      method: options.method ?? "GET",
      headers: {
        cookie: `${SESSION_COOKIE}=${token}`,
        ...(options.body === undefined ? {} : { "content-type": "application/json" }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
    return { response, data: await response.json().catch(() => null) as any };
  };

  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(`CREATE SCHEMA "${schema}"`));
      await tx.execute(sql.raw(`SET LOCAL search_path TO "${schema}"`));
      for (const file of migrationFiles) {
        const migration = await readFile(new URL(file, migrationDir), "utf8");
        for (const statement of migration
          .replaceAll('"public".', `"${schema}".`)
          .split("--> statement-breakpoint")) {
          if (statement.trim()) await tx.execute(sql.raw(statement));
        }
      }
    });
    schemaCreated = true;

    const ids = {
      teacher: `chat-teacher-${randomUUID()}`,
      student: `chat-student-${randomUUID()}`,
      unrelatedTeacher: `chat-other-teacher-${randomUUID()}`,
    };
    const tokens: Record<string, string> = {};
    let courseId = 0;
    let enrollmentId = 0;
    let groupId = 0;

    await withSchema(async (tx) => {
      for (const [key, id, role, name] of [
        ["teacher", ids.teacher, "teacher", "E2E Teacher"],
        ["student", ids.student, "student", "E2E Student"],
        ["unrelatedTeacher", ids.unrelatedTeacher, "teacher", "Unrelated Teacher"],
      ]) {
        const email = `${id}@example.invalid`;
        await tx.insert(schoolUsers).values({ id, email, name, role });
        await tx.insert(schoolCredentials).values({
          userId: id,
          passwordHash: "e2e-only-not-a-real-password-hash",
          mustChangePassword: false,
        });
        tokens[key] = await issueSession(tx, id);
      }

      const [teacherProfile] = await tx.insert(schoolRecords).values({
        entity: "teachers",
        title: "E2E Teacher",
        status: "active",
        ownerId: ids.teacher,
        data: { email: `${ids.teacher}@example.invalid`, accountId: ids.teacher },
      }).returning();
      const [studentProfile] = await tx.insert(schoolRecords).values({
        entity: "students",
        title: "E2E Student",
        status: "active",
        ownerId: ids.student,
        data: { email: `${ids.student}@example.invalid`, accountId: ids.student },
      }).returning();
      await tx.insert(schoolRecords).values({
        entity: "teachers",
        title: "Unrelated Teacher",
        status: "active",
        ownerId: ids.unrelatedTeacher,
        data: { email: `${ids.unrelatedTeacher}@example.invalid`, accountId: ids.unrelatedTeacher },
      });
      const [course] = await tx.insert(schoolRecords).values({
        entity: "courses",
        title: "E2E Course",
        status: "published",
        data: { teacherIds: [teacherProfile.id] },
      }).returning();
      const [group] = await tx.insert(schoolRecords).values({
        entity: "groups",
        title: "E2E Section A",
        status: "active",
        data: { courseId: course.id, teacherId: teacherProfile.id },
      }).returning();
      const [enrollment] = await tx.insert(schoolRecords).values({
        entity: "enrollments",
        title: "E2E Enrollment",
        status: "active",
        data: {
          courseId: course.id,
          groupId: group.id,
          studentId: studentProfile.id,
          teacherId: teacherProfile.id,
        },
      }).returning();
      courseId = course.id;
      groupId = group.id;
      enrollmentId = enrollment.id;
    });

    const testDatabaseUrl = new URL(databaseUrl);
    const oldOptions = testDatabaseUrl.searchParams.get("options");
    testDatabaseUrl.searchParams.set(
      "options",
      [oldOptions, `-csearch_path=${schema}`].filter(Boolean).join(" "),
    );
    const env = {
      ...process.env,
      DATABASE_URL: testDatabaseUrl.toString(),
      PORT: String(port),
      NODE_ENV: "test",
      PUBLIC_API_URL: "",
      FRONTEND_URL: "",
    };
    delete env.RENDER;
    const apiRoot = path.resolve(import.meta.dirname, "..");
    server = spawn(process.execPath, [path.join(apiRoot, "dist/index.mjs")], {
      cwd: apiRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-5000); });
    server.stderr?.on("data", (chunk: Buffer) => { serverLog = (serverLog + chunk.toString()).slice(-5000); });

    const deadline = Date.now() + 15_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) throw new Error(`Chat API exited before ready:\n${serverLog}`);
      try {
        const health = await fetch(`${origin}/api/healthz`);
        if (health.ok) {
          ready = true;
          break;
        }
      } catch { /* Wait for the child API to bind its local test port. */ }
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    assert.equal(ready, true, `Chat API did not become ready:\n${serverLog}`);

    const admin = await withSchema(async (tx) => {
      const [user] = await tx.select().from(schoolUsers).where(eq(schoolUsers.role, "admin")).limit(1);
      assert.ok(user, "API startup must bootstrap an admin in the isolated schema");
      await tx.insert(schoolCredentials).values({
        userId: user.id,
        passwordHash: "e2e-only-not-a-real-password-hash",
        mustChangePassword: false,
      }).onConflictDoNothing();
      return { id: user.id, token: await issueSession(tx, user.id) };
    });

    const teacherCurriculumRequests = await call("/school/records/curriculumRequests", tokens.teacher);
    assert.equal(teacherCurriculumRequests.response.status, 200);
    const adminCurriculumRequests = await call("/school/records/curriculumRequests", admin.token);
    assert.equal(adminCurriculumRequests.response.status, 200);

    const studentChats = await call("/school/chats", tokens.student);
    assert.equal(studentChats.response.status, 200);
    assert.equal(studentChats.data.filter((chat: any) => chat.kind === "group").length, 1);
    assert.equal(studentChats.data.filter((chat: any) => chat.kind === "direct").length, 1);
    const groupChat = studentChats.data.find((chat: any) => chat.kind === "group");
    const directChat = studentChats.data.find((chat: any) => chat.kind === "direct");
    assert.ok(groupChat && directChat);

    const teacherChats = await call("/school/chats", tokens.teacher);
    assert.equal(teacherChats.response.status, 200);
    assert.equal(teacherChats.data.length, 2);
    const unrelatedChats = await call("/school/chats", tokens.unrelatedTeacher);
    assert.equal(unrelatedChats.response.status, 200);
    assert.equal(unrelatedChats.data.length, 0);
    const deniedRead = await call(`/school/chats/${groupChat.id}/messages`, tokens.unrelatedTeacher);
    assert.equal(deniedRead.response.status, 404);

    const rejectedPhone = await call(`/school/chats/${groupChat.id}/messages`, tokens.student, {
      method: "POST",
      body: { body: "اتصل بي +213 555 123 456" },
    });
    assert.equal(rejectedPhone.response.status, 400);
    const rejectedEmail = await call(`/school/chats/${groupChat.id}/messages`, tokens.student, {
      method: "POST",
      body: { body: "البريد test@example.com" },
    });
    assert.equal(rejectedEmail.response.status, 400);

    const firstMessage = await call(`/school/chats/${groupChat.id}/messages`, tokens.student, {
      method: "POST",
      body: { body: "رسالة اختبار من الطالب" },
    });
    assert.equal(firstMessage.response.status, 201);
    const teacherRead = await call(`/school/chats/${groupChat.id}/messages`, tokens.teacher);
    assert.equal(teacherRead.response.status, 200);
    assert.ok(teacherRead.data.messages.some((message: any) => message.id === firstMessage.data.id));

    const eventStream = await fetch(`${origin}/api/school/events`, {
      headers: { cookie: `${SESSION_COOKIE}=${tokens.student}` },
    });
    assert.equal(eventStream.status, 200);
    assert.ok(eventStream.body);
    const reader = eventStream.body.getReader();
    const decoder = new TextDecoder();
    const nextRevision = async (differentFrom?: string) => {
      const eventDeadline = Date.now() + 8_000;
      let buffer = "";
      while (Date.now() < eventDeadline) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const timeout = new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("SSE event timed out")), 8_000);
        });
        let chunk: ReadableStreamReadResult<Uint8Array>;
        try {
          chunk = await Promise.race([reader.read(), timeout]);
        } finally {
          if (timer) clearTimeout(timer);
        }
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const revisions = [...buffer.matchAll(/^data: (.+)$/gm)].map((match) => match[1]);
        const revision = revisions.find((value) => value !== differentFrom);
        if (revision) return revision;
      }
      throw new Error("SSE did not deliver a new chat revision");
    };
    try {
      const initialRevision = await nextRevision();
      assert.ok(initialRevision);
      const teacherReply = await call(`/school/chats/${groupChat.id}/messages`, tokens.teacher, {
        method: "POST",
        body: { body: "رد الأستاذ للاختبار" },
      });
      assert.equal(teacherReply.response.status, 201);
      const changedRevision = await nextRevision(initialRevision);
      assert.notEqual(changedRevision, initialRevision);
    } finally {
      await reader.cancel();
    }
    const unread = await call("/school/chats", tokens.student);
    assert.equal(unread.data.find((chat: any) => chat.id === groupChat.id)?.unreadCount, 1);
    const markedRead = await call(`/school/chats/${groupChat.id}/read`, tokens.student, { method: "POST" });
    assert.equal(markedRead.response.status, 200);

    const upload = await call(`/school/chats/${directChat.id}/uploads`, tokens.student, {
      method: "POST",
      body: { name: "voice.webm", size: 4, contentType: "audio/webm;codecs=opus" },
    });
    assert.equal(upload.response.status, 201);
    const signedTransfer = new URL(upload.data.uploadURL, origin);
    const audioBytes = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
    const transfer = await fetch(`${origin}${signedTransfer.pathname}${signedTransfer.search}`, {
      method: "PUT",
      headers: { "content-type": "audio/webm;codecs=opus" },
      body: audioBytes,
    });
    assert.equal(transfer.status, 201);
    const complete = await call(`/school/chats/uploads/${upload.data.id}/complete`, tokens.student, { method: "POST" });
    assert.equal(complete.response.status, 200);
    const voiceMessage = await call(`/school/chats/${directChat.id}/messages`, tokens.student, {
      method: "POST",
      body: { body: "", attachmentIds: [upload.data.id] },
    });
    assert.equal(voiceMessage.response.status, 201);
    const protectedFile = await fetch(`${origin}${complete.data.downloadUrl}`, {
      headers: { cookie: `${SESSION_COOKIE}=${tokens.teacher}`, range: "bytes=0-3" },
    });
    assert.equal(protectedFile.status, 206);
    assert.deepEqual(Buffer.from(await protectedFile.arrayBuffer()), audioBytes);
    const deniedFile = await fetch(`${origin}${complete.data.downloadUrl}`, {
      headers: { cookie: `${SESSION_COOKIE}=${tokens.unrelatedTeacher}` },
    });
    assert.equal(deniedFile.status, 404);

    const deleteAttempt = await call(
      `/school/chats/${groupChat.id}/messages/${firstMessage.data.id}`,
      tokens.student,
      { method: "DELETE" },
    );
    assert.equal(deleteAttempt.response.status, 404);
    const adminSearch = await call("/school/chats/admin/search?q=E2E", admin.token);
    assert.equal(adminSearch.response.status, 200);
    const adminChats = await call("/school/chats", admin.token);
    assert.equal(adminChats.response.status, 200);
    assert.ok(adminChats.data.some((chat: any) => chat.id === groupChat.id));
    const adminRead = await call(`/school/chats/${groupChat.id}/messages`, admin.token);
    assert.equal(adminRead.response.status, 200);
    assert.ok(adminRead.data.messages.some((message: any) => message.id === firstMessage.data.id));
    const adminWrite = await call(`/school/chats/${groupChat.id}/messages`, admin.token, {
      method: "POST",
      body: { body: "رسالة من الإدارة" },
    });
    assert.equal(adminWrite.response.status, 201);
    assert.equal(adminWrite.data.body, "رسالة من الإدارة");

    await withSchema(async (tx) => {
      await tx.update(schoolRecords).set({ status: "completed" }).where(eq(schoolRecords.id, enrollmentId));
    });
    const retainedHistory = await call(`/school/chats/${groupChat.id}/messages`, tokens.student);
    assert.equal(retainedHistory.response.status, 200);
    const deniedAfterCompletion = await call(`/school/chats/${groupChat.id}/messages`, tokens.student, {
      method: "POST",
      body: { body: "رسالة بعد انتهاء التسجيل" },
    });
    assert.equal(deniedAfterCompletion.response.status, 403);

    await withSchema(async (tx) => {
      const [teacherProfile] = await tx.select().from(schoolRecords)
        .where(eq(schoolRecords.entity, "teachers")).limit(1);
      const [newGroup] = await tx.insert(schoolRecords).values({
        entity: "groups",
        title: "E2E Section B",
        status: "active",
        data: { courseId, teacherId: teacherProfile.id },
      }).returning();
      const [enrollment] = await tx.select().from(schoolRecords).where(eq(schoolRecords.id, enrollmentId)).limit(1);
      await tx.update(schoolRecords).set({
        status: "active",
        data: { ...enrollment.data, groupId: newGroup.id },
      }).where(eq(schoolRecords.id, enrollmentId));
    });
    const changedSectionChats = await call("/school/chats", tokens.student);
    assert.equal(changedSectionChats.response.status, 200);
    assert.ok(changedSectionChats.data.some((chat: any) => chat.id === groupChat.id));
    assert.ok(changedSectionChats.data.some((chat: any) => chat.groupId !== groupId && chat.kind === "group"));
    assert.ok(changedSectionChats.data.filter((chat: any) => chat.kind === "direct").length >= 2);
  } finally {
    if (server && server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise<void>((resolve) => server?.once("exit", () => resolve()));
    }
    if (schemaCreated) await pool.query(`DROP SCHEMA "${schema}" CASCADE`);
  }
});
