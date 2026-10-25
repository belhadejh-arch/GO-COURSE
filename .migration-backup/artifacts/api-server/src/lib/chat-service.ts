import {
  chatAttachments, chatConversationMembers, chatConversations, chatMessages,
  chatReadStates, chatReports, db, schoolFiles, schoolRecords, schoolUsers,
  type SchoolRow, type SchoolUser,
} from "@workspace/db";
import {
  and, desc, eq, gt, ilike, inArray, isNull, lt, ne, sql,
} from "drizzle-orm";
import type { Access } from "./school-access";
import { fail, idList, numberId } from "./school-access";

const CHAT_PAGE_SIZE = 50;
const profileRoles = ["students", "teachers"] as const;
type ProfileRole = (typeof profileRoles)[number];
type SectionSpec = {
  scopeKey: string;
  course: SchoolRow;
  group: SchoolRow | null;
  enrollments: SchoolRow[];
  teacherProfileIds: number[];
  title: string;
};
type DesiredMember = { user: SchoolUser; profileId: number; role: "teacher" | "student"; canSend: boolean };
type ChatItem = typeof chatMessages.$inferSelect;

function isUnavailable(row: SchoolRow | undefined) {
  return !row || ["archived", "disabled", "inactive"].includes(row.status);
}

function resolveProfileAccount(profile: SchoolRow, usersById: Map<string, SchoolUser>, usersByEmail: Map<string, SchoolUser>) {
  const accountId = String(profile.data.accountId || "");
  if (accountId && usersById.has(accountId)) return usersById.get(accountId);
  const email = String(profile.data.email || "").trim().toLowerCase();
  return email ? usersByEmail.get(email) : undefined;
}

function sectionSpecs(rows: SchoolRow[]): SectionSpec[] {
  const courses = rows.filter((row) => row.entity === "courses");
  const groups = rows.filter((row) => row.entity === "groups");
  const enrollments = rows.filter((row) => row.entity === "enrollments" && row.status !== "archived");
  const specs: SectionSpec[] = [];
  for (const course of courses) {
    const courseEnrollments = enrollments.filter((enrollment) => numberId(enrollment.data.courseId) === course.id);
    const courseGroups = groups.filter((group) => numberId(group.data.courseId) === course.id);
    const groupIds = new Set(courseGroups.map((group) => group.id));
    for (const group of courseGroups) {
      const assignedTeacher = numberId(group.data.teacherId);
      const teacherProfileIds = assignedTeacher
        ? [assignedTeacher]
        : [...new Set([
          ...idList(course.data.teacherIds),
          ...courseEnrollments.map((enrollment) => numberId(enrollment.data.teacherId)).filter(Boolean),
        ])];
      specs.push({
        scopeKey: `group:${course.id}:${group.id}`,
        course,
        group,
        enrollments: courseEnrollments.filter((enrollment) => numberId(enrollment.data.groupId) === group.id),
        teacherProfileIds,
        title: group.title || course.title,
      });
    }
    const ungrouped = courseEnrollments.filter((enrollment) => !groupIds.has(numberId(enrollment.data.groupId)));
    if (courseGroups.length === 0 || ungrouped.length > 0) {
      const teacherProfileIds = [...new Set([
        ...idList(course.data.teacherIds),
        ...ungrouped.map((enrollment) => numberId(enrollment.data.teacherId)).filter(Boolean),
      ])];
      specs.push({
        scopeKey: `group:${course.id}:general`,
        course,
        group: null,
        enrollments: ungrouped,
        teacherProfileIds,
        title: courseGroups.length === 0 ? course.title : `${course.title} — عام`,
      });
    }
  }
  return specs;
}

async function upsertConversation(
  scopeKey: string, courseId: number, groupId: number | null, kind: "group" | "direct", title: string,
) {
  await db.insert(chatConversations).values({ scopeKey, courseId, groupId, kind, title })
    .onConflictDoUpdate({
      target: chatConversations.scopeKey,
      set: { courseId, groupId, kind, title },
    });
  const [conversation] = await db.select().from(chatConversations).where(eq(chatConversations.scopeKey, scopeKey)).limit(1);
  if (!conversation) throw new Error("Unable to create chat conversation.");
  return conversation;
}

async function syncMembers(conversationId: number, desired: DesiredMember[]) {
  const desiredByUser = new Map(desired.map((member) => [member.user.id, member]));
  const existing = await db.select().from(chatConversationMembers)
    .where(eq(chatConversationMembers.conversationId, conversationId));
  for (const member of existing) {
    if (desiredByUser.has(member.userId) || !["student", "teacher"].includes(member.role)) continue;
    await db.update(chatConversationMembers).set({
      canSend: false,
      leftAt: member.leftAt ?? new Date(),
    }).where(eq(chatConversationMembers.id, member.id));
  }
  for (const member of desired) {
    await db.insert(chatConversationMembers).values({
      conversationId,
      userId: member.user.id,
      profileRecordId: member.profileId,
      role: member.role,
      canSend: member.canSend,
      leftAt: member.canSend ? null : new Date(),
    }).onConflictDoUpdate({
      target: [chatConversationMembers.conversationId, chatConversationMembers.userId],
      set: {
        profileRecordId: member.profileId,
        role: member.role,
        canSend: member.canSend,
        leftAt: member.canSend ? null : sql`coalesce(${chatConversationMembers.leftAt}, now())`,
      },
    });
  }
}

export async function syncChatMemberships(a: Access) {
  if (!a.user || !["admin", "teacher", "student"].includes(a.user.role)) return;
  const users = await db.select().from(schoolUsers);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const profiles = a.rows.filter((row) => profileRoles.includes(row.entity as ProfileRole));
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const specs = sectionSpecs(a.rows);
  const managedConversationIds = new Set<number>();

  for (const spec of specs) {
    const sectionWritable = !isUnavailable(spec.course) && !isUnavailable(spec.group ?? undefined);
    const group = await upsertConversation(spec.scopeKey, spec.course.id, spec.group?.id ?? null, "group", spec.title);
    managedConversationIds.add(group.id);
    const desiredGroupMembers: DesiredMember[] = [];
    for (const profileId of spec.teacherProfileIds) {
      const profile = profilesById.get(profileId);
      if (!profile || profile.entity !== "teachers") continue;
      const account = resolveProfileAccount(profile, usersById, usersByEmail);
      if (!account || !account.enabled || account.role !== "teacher") continue;
      desiredGroupMembers.push({
        user: account, profileId, role: "teacher",
        canSend: sectionWritable && !isUnavailable(profile),
      });
    }
    for (const enrollment of spec.enrollments) {
      const profile = profilesById.get(numberId(enrollment.data.studentId));
      if (!profile || profile.entity !== "students") continue;
      const account = resolveProfileAccount(profile, usersById, usersByEmail);
      if (!account || !account.enabled || account.role !== "student") continue;
      desiredGroupMembers.push({
        user: account, profileId: profile.id, role: "student",
        canSend: sectionWritable && enrollment.status === "active" && !isUnavailable(profile),
      });
    }
    await syncMembers(group.id, desiredGroupMembers);

    for (const enrollment of spec.enrollments) {
      const studentProfile = profilesById.get(numberId(enrollment.data.studentId));
      if (!studentProfile || studentProfile.entity !== "students") continue;
      const student = resolveProfileAccount(studentProfile, usersById, usersByEmail);
      if (!student || !student.enabled || student.role !== "student") continue;
      const requestedTeacher = numberId(enrollment.data.teacherId);
      const teacherIds = requestedTeacher ? [requestedTeacher] : spec.teacherProfileIds;
      for (const teacherId of teacherIds) {
        const teacherProfile = profilesById.get(teacherId);
        if (!teacherProfile || teacherProfile.entity !== "teachers") continue;
        const teacher = resolveProfileAccount(teacherProfile, usersById, usersByEmail);
        if (!teacher || !teacher.enabled || teacher.role !== "teacher") continue;
        const scopeKey = `direct:${spec.course.id}:${spec.group?.id ?? 0}:${teacher.id}:${student.id}`;
        const direct = await upsertConversation(
          scopeKey,
          spec.course.id,
          spec.group?.id ?? null,
          "direct",
          `${teacher.name} — ${student.name}`,
        );
        managedConversationIds.add(direct.id);
        const activeRegistration = sectionWritable && enrollment.status === "active" &&
          !isUnavailable(studentProfile) && !isUnavailable(teacherProfile);
        await syncMembers(direct.id, [
          { user: teacher, profileId: teacherProfile.id, role: "teacher", canSend: activeRegistration },
          { user: student, profileId: studentProfile.id, role: "student", canSend: activeRegistration },
        ]);
      }
    }
  }

  // If a section disappeared from the source records, keep its messages but make
  // old participants read-only instead of deleting either the room or history.
  const allConversations = await db.select({ id: chatConversations.id }).from(chatConversations);
  const allMembers = await db.select().from(chatConversationMembers);
  for (const conversation of allConversations) {
    if (managedConversationIds.has(conversation.id)) continue;
    for (const member of allMembers.filter((entry) => entry.conversationId === conversation.id && entry.canSend)) {
      await db.update(chatConversationMembers).set({ canSend: false, leftAt: member.leftAt ?? new Date() })
        .where(eq(chatConversationMembers.id, member.id));
    }
  }
}

export async function requireConversation(a: Access, conversationId: number, send = false) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  const [conversation] = await db.select().from(chatConversations)
    .where(eq(chatConversations.id, conversationId)).limit(1);
  if (!conversation) fail(404, "المحادثة غير موجودة.");
  if (a.user.role === "admin") {
    enforceChatAccess(a.user.role, null, send);
    return { conversation, member: null };
  }
  const [member] = await db.select().from(chatConversationMembers).where(and(
    eq(chatConversationMembers.conversationId, conversationId),
    eq(chatConversationMembers.userId, a.user.id),
  )).limit(1);
  enforceChatAccess(a.user.role, member ?? null, send);
  return { conversation, member };
}

export function enforceChatAccess(role: string, member: { canSend: boolean } | null, send = false) {
  if (role === "admin") {
    if (send) fail(403, "حساب الإدارة يطّلع على المحادثات ولا يرسل أو يعدّل الرسائل.");
    return;
  }
  if (!["teacher", "student"].includes(role)) fail(403, "المحادثات متاحة للأساتذة والطلبة فقط.");
  if (!member) fail(404, "المحادثة غير موجودة أو ليست ضمن صلاحيات حسابك.");
  if (send && !member.canSend) fail(403, "انتهى التسجيل أو تغيّر القسم؛ يمكنك الاطلاع على السجل دون إرسال رسائل جديدة.");
}

function avatarUrl(userId: string) {
  return `/api/school/chats/participants/${encodeURIComponent(userId)}/avatar`;
}

async function attachmentList(messageIds: number[]) {
  if (!messageIds.length) return new Map<number, Array<{ id: number; name: string; contentType: string; size: number; downloadUrl: string }>>();
  const rows = await db.select().from(chatAttachments).where(and(
    inArray(chatAttachments.messageId, messageIds),
    eq(chatAttachments.status, "attached"),
  ));
  const result = new Map<number, Array<{ id: number; name: string; contentType: string; size: number; downloadUrl: string }>>();
  for (const row of rows) {
    if (!row.messageId) continue;
    const list = result.get(row.messageId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      contentType: row.contentType,
      size: row.size,
      downloadUrl: `/api/school/chats/attachments/${row.id}/file`,
    });
    result.set(row.messageId, list);
  }
  return result;
}

async function messageItems(rows: ChatItem[]) {
  if (!rows.length) return [];
  const senderIds = [...new Set(rows.map((row) => row.senderId))];
  const senders = await db.select().from(schoolUsers).where(inArray(schoolUsers.id, senderIds));
  const users = new Map(senders.map((user) => [user.id, user]));
  const memberships = await db.select().from(chatConversationMembers).where(and(
    inArray(chatConversationMembers.conversationId, [...new Set(rows.map((row) => row.conversationId))]),
    inArray(chatConversationMembers.userId, senderIds),
  ));
  const profileIds = [...new Set(memberships.map((member) => member.profileRecordId).filter((id): id is number => id !== null))];
  const profiles = profileIds.length
    ? await db.select().from(schoolRecords).where(inArray(schoolRecords.id, profileIds))
    : [];
  const profileMap = new Map(profiles.map((profile) => [profile.id, profile]));
  const names = new Map(memberships.map((member) => [
    `${member.conversationId}:${member.userId}`,
    profileMap.get(member.profileRecordId ?? -1)?.title || users.get(member.userId)?.name || "مستخدم",
  ]));
  const attachments = await attachmentList(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    senderId: row.senderId,
    senderName: names.get(`${row.conversationId}:${row.senderId}`) ?? users.get(row.senderId)?.name ?? "مستخدم",
    senderAvatarUrl: avatarUrl(row.senderId),
    body: row.body,
    attachments: attachments.get(row.id) ?? [],
    createdAt: row.createdAt.toISOString(),
  }));
}

export async function getMessagePage(a: Access, conversationId: number, before?: number, search?: string) {
  await requireConversation(a, conversationId);
  const filters = [eq(chatMessages.conversationId, conversationId)];
  if (before) filters.push(lt(chatMessages.id, before));
  if (search) filters.push(ilike(chatMessages.body, `%${search}%`));
  const rows = await db.select().from(chatMessages).where(and(...filters))
    .orderBy(desc(chatMessages.id)).limit(CHAT_PAGE_SIZE + 1);
  const hasMore = rows.length > CHAT_PAGE_SIZE;
  const page = rows.slice(0, CHAT_PAGE_SIZE).reverse();
  return {
    messages: await messageItems(page),
    hasMore,
    nextBefore: hasMore && page.length ? page[0].id : null,
  };
}

export async function listConversations(a: Access, search?: string) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  if (!["admin", "teacher", "student"].includes(a.user.role)) fail(403, "المحادثات متاحة للأساتذة والطلبة والإدارة فقط.");
  await syncChatMemberships(a);
  const conversations = a.user.role === "admin"
    ? await db.select().from(chatConversations).orderBy(desc(chatConversations.updatedAt))
    : await db.select({
      id: chatConversations.id,
      kind: chatConversations.kind,
      scopeKey: chatConversations.scopeKey,
      courseId: chatConversations.courseId,
      groupId: chatConversations.groupId,
      title: chatConversations.title,
      createdAt: chatConversations.createdAt,
      updatedAt: chatConversations.updatedAt,
    }).from(chatConversations).innerJoin(chatConversationMembers, eq(chatConversationMembers.conversationId, chatConversations.id))
      .where(eq(chatConversationMembers.userId, a.user.id)).orderBy(desc(chatConversations.updatedAt));
  const ids = [...new Set(conversations.map((conversation) => conversation.id))];
  if (!ids.length) return [];

  const memberRows = await db.select().from(chatConversationMembers)
    .where(inArray(chatConversationMembers.conversationId, ids));
  const userIds = [...new Set(memberRows.map((member) => member.userId))];
  const users = userIds.length ? await db.select().from(schoolUsers).where(inArray(schoolUsers.id, userIds)) : [];
  const userMap = new Map(users.map((user) => [user.id, user]));
  const profiles = [...new Set(memberRows.map((member) => member.profileRecordId).filter((id): id is number => id !== null))];
  const profileRows = profiles.length ? await db.select().from(schoolRecords).where(inArray(schoolRecords.id, profiles)) : [];
  const profileMap = new Map(profileRows.map((row) => [row.id, row]));
  const memberMap = new Map<number, Array<{ id: string; name: string; role: "admin" | "staff" | "teacher" | "student"; profileId: number | null; avatarUrl: string; canSend: boolean }>>();
  for (const member of memberRows) {
    const user = userMap.get(member.userId);
    if (!user) continue;
    const profile = member.profileRecordId ? profileMap.get(member.profileRecordId) : undefined;
    const list = memberMap.get(member.conversationId) ?? [];
    list.push({
      id: user.id,
      name: profile?.title || user.name,
      role: member.role as "admin" | "staff" | "teacher" | "student",
      profileId: member.profileRecordId,
      avatarUrl: avatarUrl(user.id),
      canSend: member.canSend,
    });
    memberMap.set(member.conversationId, list);
  }
  const latestRows = await db.select({
    conversationId: chatMessages.conversationId,
    latestId: sql<number>`max(${chatMessages.id})`,
  }).from(chatMessages).where(inArray(chatMessages.conversationId, ids)).groupBy(chatMessages.conversationId);
  const latestIds = latestRows.map((row) => Number(row.latestId));
  const latest = latestIds.length ? await db.select().from(chatMessages).where(inArray(chatMessages.id, latestIds)) : [];
  const latestMap = new Map(latest.map((row) => [row.conversationId, row]));
  const latestAttachments = await attachmentList(latest.map((row) => row.id));
  const courseIds = [...new Set(conversations.map((conversation) => conversation.courseId))];
  const sectionRows = courseIds.length ? await db.select().from(schoolRecords)
    .where(inArray(schoolRecords.id, [...courseIds, ...conversations.map((conversation) => conversation.groupId).filter((id): id is number => id !== null)])) : [];
  const sectionMap = new Map(sectionRows.map((row) => [row.id, row]));
  const unreadRows = await db.select({
    conversationId: chatMessages.conversationId,
    count: sql<number>`count(*)`,
  }).from(chatMessages).leftJoin(chatReadStates, and(
    eq(chatReadStates.conversationId, chatMessages.conversationId),
    eq(chatReadStates.userId, a.user.id),
  )).where(and(
    inArray(chatMessages.conversationId, ids),
    ne(chatMessages.senderId, a.user.id),
    sql`${chatMessages.id} > coalesce(${chatReadStates.lastReadMessageId}, 0)`,
  )).groupBy(chatMessages.conversationId);
  const unreadMap = new Map(unreadRows.map((row) => [row.conversationId, Number(row.count)]));

  const summaries = conversations.map((conversation) => {
    const last = latestMap.get(conversation.id);
    const group = conversation.groupId ? sectionMap.get(conversation.groupId) : undefined;
    const course = sectionMap.get(conversation.courseId);
    const members = memberMap.get(conversation.id) ?? [];
    const myMembership = memberRows.find((member) => member.conversationId === conversation.id && member.userId === a.user!.id);
    return {
      id: conversation.id,
      kind: conversation.kind as "group" | "direct",
      title: conversation.title,
      sectionTitle: group?.title || course?.title || conversation.title,
      courseId: conversation.courseId,
      groupId: conversation.groupId,
      members,
      lastMessage: last ? {
        id: last.id,
        senderId: last.senderId,
        senderName: members.find((member) => member.id === last.senderId)?.name ?? userMap.get(last.senderId)?.name ?? "مستخدم",
        body: last.body,
        createdAt: last.createdAt.toISOString(),
        attachments: latestAttachments.get(last.id) ?? [],
      } : null,
      unreadCount: unreadMap.get(conversation.id) ?? 0,
      canSend: a.user?.role !== "admin" && Boolean(myMembership?.canSend),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  });
  const needle = search?.trim().toLocaleLowerCase();
  return needle ? summaries.filter((conversation) => [
    conversation.title, conversation.sectionTitle, conversation.lastMessage?.body ?? "",
    ...conversation.members.map((member) => member.name),
  ].some((value) => value.toLocaleLowerCase().includes(needle))) : summaries;
}

export async function searchMessageRows(conversationId: number, query: string) {
  return db.select().from(chatMessages).where(and(
    eq(chatMessages.conversationId, conversationId),
    ilike(chatMessages.body, `%${query}%`),
  )).orderBy(desc(chatMessages.id)).limit(CHAT_PAGE_SIZE);
}

export async function readThroughLatest(a: Access, conversationId: number) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  await requireConversation(a, conversationId);
  const [latest] = await db.select({ id: sql<number>`max(${chatMessages.id})` })
    .from(chatMessages).where(eq(chatMessages.conversationId, conversationId));
  const lastReadMessageId = latest?.id ? Number(latest.id) : null;
  await db.insert(chatReadStates).values({
    conversationId,
    userId: a.user.id,
    lastReadMessageId,
    readAt: new Date(),
  }).onConflictDoUpdate({
    target: [chatReadStates.conversationId, chatReadStates.userId],
    set: { lastReadMessageId, readAt: new Date() },
  });
  return { conversationId, lastReadMessageId, unreadCount: 0 };
}

export async function messageById(id: number) {
  const [message] = await db.select().from(chatMessages).where(eq(chatMessages.id, id)).limit(1);
  if (!message) fail(404, "الرسالة غير موجودة.");
  const [item] = await messageItems([message]);
  return item;
}

export async function conversationSummaryForAdmin(a: Access, query: string) {
  if (a.user?.role !== "admin") fail(403, "البحث الشامل متاح للمدير الرئيسي فقط.");
  const matchingMessages = await db.select({ conversationId: chatMessages.conversationId })
    .from(chatMessages).where(ilike(chatMessages.body, `%${query}%`))
    .groupBy(chatMessages.conversationId).limit(200);
  const matchingConversationIds = new Set(matchingMessages.map((row) => row.conversationId));
  const all = await listConversations(a);
  const conversations = all.filter((conversation) =>
    matchingConversationIds.has(conversation.id) ||
    `${conversation.title} ${conversation.sectionTitle} ${conversation.lastMessage?.body ?? ""} ${conversation.members.map((member) => member.name).join(" ")}`
      .toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return { conversations: conversations.slice(0, 50), matchingConversationIds };
}

export async function createChatMessageRecord(
  a: Access, conversationId: number, body: string, attachmentIds: number[],
) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  await requireConversation(a, conversationId, true);
  const attachmentRows = attachmentIds.length ? await db.select().from(chatAttachments).where(and(
    inArray(chatAttachments.id, attachmentIds),
    eq(chatAttachments.conversationId, conversationId),
    eq(chatAttachments.uploaderId, a.user.id),
    eq(chatAttachments.status, "uploaded"),
    isNull(chatAttachments.messageId),
    gt(chatAttachments.expiresAt, new Date()),
  )) : [];
  if (attachmentRows.length !== new Set(attachmentIds).size) fail(400, "أحد المرفقات غير جاهز أو لا يخص هذه المحادثة.");
  if (!body.trim() && !attachmentRows.length) fail(400, "اكتب رسالة أو أرفق ملفًا.");
  if (body.length > 4000) fail(400, "الرسالة تتجاوز الحد المسموح به.");

  const message = await db.transaction(async (tx) => {
    const [inserted] = await tx.insert(chatMessages).values({
      conversationId,
      senderId: a.user!.id,
      body: body.trim(),
    }).returning();
    if (attachmentRows.length) {
      await tx.update(chatAttachments).set({ messageId: inserted.id, status: "attached" })
        .where(inArray(chatAttachments.id, attachmentRows.map((row) => row.id)));
    }
    await tx.update(chatConversations).set({ updatedAt: inserted.createdAt })
      .where(eq(chatConversations.id, conversationId));
    const recipients = await tx.select({ userId: chatConversationMembers.userId })
      .from(chatConversationMembers).where(and(
        eq(chatConversationMembers.conversationId, conversationId),
        eq(chatConversationMembers.canSend, true),
        ne(chatConversationMembers.userId, a.user!.id),
      ));
    if (recipients.length) {
      await tx.insert(schoolRecords).values(recipients.map((recipient) => ({
        entity: "notifications",
        title: `رسالة جديدة من ${a.user!.name}`,
        status: "active",
        ownerId: recipient.userId,
        data: { kind: "chat", conversationId, messageId: inserted.id, read: false },
      })));
    }
    return inserted;
  });
  return messageById(message.id);
}

export async function createChatReportRecord(a: Access, conversationId: number, messageId: number | null, reason: string, details: string) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  await requireConversation(a, conversationId);
  if (messageId) {
    const [message] = await db.select({ id: chatMessages.id }).from(chatMessages).where(and(
      eq(chatMessages.id, messageId),
      eq(chatMessages.conversationId, conversationId),
    )).limit(1);
    if (!message) fail(404, "الرسالة المحددة غير موجودة في هذه المحادثة.");
  }
  const [report] = await db.insert(chatReports).values({
    conversationId, messageId, reporterId: a.user.id, reason, details: details.trim(),
  }).returning();
  return report;
}

export async function reportItems() {
  const rows = await db.select().from(chatReports).orderBy(desc(chatReports.createdAt));
  if (!rows.length) return [];
  const reporterIds = [...new Set(rows.map((row) => row.reporterId))];
  const users = await db.select().from(schoolUsers).where(inArray(schoolUsers.id, reporterIds));
  const userMap = new Map(users.map((user) => [user.id, user]));
  const messageIds = [...new Set(rows.map((row) => row.messageId).filter((id): id is number => id !== null))];
  const messages = messageIds.length ? await db.select().from(chatMessages).where(inArray(chatMessages.id, messageIds)) : [];
  const messageMap = new Map(messages.map((message) => [message.id, message]));
  return rows.map((row) => ({
    id: row.id,
    conversationId: row.conversationId,
    messageId: row.messageId,
    reason: row.reason,
    details: row.details,
    status: row.status as "open" | "resolved" | "dismissed",
    reporterName: userMap.get(row.reporterId)?.name ?? "مستخدم",
    messageExcerpt: (row.messageId ? messageMap.get(row.messageId)?.body : "")?.slice(0, 240) ?? "",
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
}

export async function reviewChatReportRecord(a: Access, reportId: number, status: "resolved" | "dismissed") {
  if (a.user?.role !== "admin") fail(403, "مراجعة البلاغات متاحة للمدير الرئيسي فقط.");
  const [updated] = await db.update(chatReports).set({
    status, reviewedBy: a.user.id, reviewedAt: new Date(),
  }).where(eq(chatReports.id, reportId)).returning();
  if (!updated) fail(404, "البلاغ غير موجود.");
  return updated;
}

export async function attachmentById(id: number) {
  const [attachment] = await db.select().from(chatAttachments).where(and(
    eq(chatAttachments.id, id),
    eq(chatAttachments.status, "attached"),
    sql`${chatAttachments.messageId} is not null`,
  )).limit(1);
  if (!attachment) fail(404, "المرفق غير موجود.");
  return attachment;
}

export async function avatarFileForSharedChat(a: Access, userId: string) {
  if (!a.user) fail(401, "سجّل الدخول أولًا.");
  if (a.user.role !== "admin") {
    const own = await db.select({ conversationId: chatConversationMembers.conversationId })
      .from(chatConversationMembers).where(eq(chatConversationMembers.userId, a.user.id));
    const conversationIds = own.map((row) => row.conversationId);
    if (!conversationIds.length) fail(404, "الصورة غير متاحة.");
    const [shared] = await db.select({ id: chatConversationMembers.id }).from(chatConversationMembers).where(and(
      eq(chatConversationMembers.userId, userId),
      inArray(chatConversationMembers.conversationId, conversationIds),
    )).limit(1);
    if (!shared) fail(404, "الصورة غير متاحة.");
  }
  const [user] = await db.select().from(schoolUsers).where(eq(schoolUsers.id, userId)).limit(1);
  if (!user) fail(404, "الصورة غير متاحة.");
  const profiles = await db.select().from(schoolRecords)
    .where(inArray(schoolRecords.entity, ["students", "teachers"]));
  const profile = profiles.find((row) =>
    String(row.data.accountId || "") === user.id ||
    String(row.data.email || "").toLowerCase() === user.email.toLowerCase(),
  );
  const objectPath = String(profile?.data.photoPath || "");
  if (!objectPath) fail(404, "لا توجد صورة شخصية.");
  const [file] = await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath, objectPath)).limit(1);
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.contentType) || file.size > 5 * 1024 * 1024) {
    fail(404, "الصورة غير متاحة.");
  }
  return file;
}

export async function adminDirectory(a: Access, query: string) {
  if (a.user?.role !== "admin") fail(403, "البحث الشامل متاح للمدير الرئيسي فقط.");
  const needle = query.trim().toLocaleLowerCase();
  await syncChatMemberships(a);
  const users = await db.select().from(schoolUsers);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const usersByEmail = new Map(users.map((user) => [user.email.toLowerCase(), user]));
  const profiles = a.rows.filter((row) => profileRoles.includes(row.entity as ProfileRole));
  const people = profiles.filter((profile) =>
    `${profile.title} ${profile.data.email ?? ""} ${profile.data.phone ?? ""}`.toLocaleLowerCase().includes(needle),
  ).map((profile) => {
    const user = resolveProfileAccount(profile, usersById, usersByEmail);
    return user ? {
      id: user.id,
      name: profile.title || user.name,
      role: user.role as "admin" | "staff" | "teacher" | "student",
      profileId: profile.id,
      avatarUrl: avatarUrl(user.id),
      canSend: false,
    } : null;
  }).filter((value): value is NonNullable<typeof value> => Boolean(value)).slice(0, 50);
  const sections = sectionSpecs(a.rows).filter((section) =>
    `${section.title} ${section.course.title}`.toLocaleLowerCase().includes(needle),
  ).slice(0, 50).map((section) => ({
    id: section.scopeKey,
    courseId: section.course.id,
    groupId: section.group?.id ?? null,
    title: section.title,
    courseTitle: section.course.title,
  }));
  const { conversations, matchingConversationIds } = await conversationSummaryForAdmin(a, query);
  const chatConversations = conversations.filter((conversation) =>
    matchingConversationIds.has(conversation.id) ||
    `${conversation.title} ${conversation.sectionTitle} ${conversation.lastMessage?.body ?? ""} ${conversation.members.map((member) => member.name).join(" ")}`
      .toLocaleLowerCase().includes(needle),
  );
  return { people, sections, conversations: chatConversations };
}
