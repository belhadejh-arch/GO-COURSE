import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowLeft, AudioLines, CircleHelp,
  FileText, Headphones, Image as ImageIcon, LoaderCircle, MessageCircle, Mic, Paperclip, Search, Send,
  ShieldCheck, Video, X,
} from 'lucide-react';
import {
  getListSchoolChatsQueryKey, getListChatMessagesQueryKey, getListChatReportsQueryKey,
  getSearchSchoolChatDirectoryQueryKey, getListOlderChatMessagesQueryKey,
  getDownloadChatAttachmentQueryKey, useListSchoolChats, useListChatMessages,
  useSearchSchoolChatDirectory, useSearchChatMessages, useCreateChatMessage,
  useMarkChatRead, useCreateChatUpload, useCompleteChatUpload, useCreateChatReport,
  useListChatReports, useReviewChatReport, useListOlderChatMessages,
  useDownloadChatAttachment,
  getGetChatParticipantAvatarQueryKey, useGetChatParticipantAvatar,
  type ChatAttachment, type ChatConversation, type ChatMessage,
} from '@workspace/api-client-react';
import { useMe } from '@/hooks/use-school';

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('');
}

function Avatar({ name, src, userId, size = 'md' }: { name: string; src?: string | null; userId?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [bad, setBad] = useState(false);
  const avatarQuery = useGetChatParticipantAvatar(userId ?? '', {
    query: { enabled: !src && !!userId, queryKey: getGetChatParticipantAvatarQueryKey(userId ?? '') },
  });
  const [apiAvatar, setApiAvatar] = useState('');
  useEffect(() => {
    if (avatarQuery.data instanceof Blob) {
      const url = URL.createObjectURL(avatarQuery.data);
      setApiAvatar(url);
      return () => URL.revokeObjectURL(url);
    }
    setApiAvatar('');
    return undefined;
  }, [avatarQuery.data]);
  const sizeClass = size === 'lg' ? 'h-12 w-12 text-base' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-10 w-10 text-sm';
  const imageSrc = src || apiAvatar;
  return imageSrc && !bad
    ? <img src={imageSrc} alt="" onError={() => setBad(true)} className={`${sizeClass} rounded-full object-cover ring-2 ring-card`} />
    : <span className={`${sizeClass} grid shrink-0 place-items-center rounded-full bg-[hsl(var(--primary)/.12)] font-bold text-primary ring-2 ring-card`}>{initials(name) || '؟'}</span>;
}

function stamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit' }).format(date);
}

function dayStamp(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('ar', { day: 'numeric', month: 'short' }).format(date);
}

function safeText(body: string, hideContact: boolean) {
  let text = body;
  if (hideContact) {
    text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[بيانات تواصل مخفية]')
      .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, '[بيانات تواصل مخفية]');
  }
  const parts = text.split(/(https?:\/\/[^\s<>]+)/gi);
  return parts.map((part, index) => {
    if (!/^https?:\/\//i.test(part)) return <span key={index}>{part}</span>;
    try {
      const url = new URL(part);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return <span key={index}>{part}</span>;
      return <a key={index} href={url.href} target="_blank" rel="noopener noreferrer" className="break-all font-semibold text-primary underline underline-offset-2">{part}</a>;
    } catch {
      return <span key={index}>{part}</span>;
    }
  });
}

function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  const download = useDownloadChatAttachment(attachment.id, {
    query: { enabled: false, queryKey: getDownloadChatAttachmentQueryKey(attachment.id) },
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  async function openFile() {
    setBusy(true);
    setProblem('');
    try {
      const result = await download.refetch();
      if (result.data instanceof Blob) {
        const objectUrl = URL.createObjectURL(result.data);
        const anchor = document.createElement('a');
        anchor.href = objectUrl;
        anchor.download = attachment.name;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      } else {
        window.open(attachment.downloadUrl, '_blank', 'noopener,noreferrer');
      }
    } catch {
      setProblem('تعذّر فتح الملف. حاول مرة أخرى.');
    } finally {
      setBusy(false);
    }
  }
  const mediaType = attachment.contentType;
  const image = mediaType.startsWith('image/');
  const video = mediaType.startsWith('video/');
  const audio = mediaType.startsWith('audio/');
  return (
    <div className="mt-2 max-w-[min(100%,360px)] overflow-hidden rounded-xl border border-border/70 bg-background/70">
      {image && <img src={attachment.downloadUrl} alt={attachment.name} loading="lazy" className="max-h-64 w-full object-contain" />}
      {video && <video src={attachment.downloadUrl} controls preload="metadata" className="max-h-64 w-full" />}
      {audio && <audio src={attachment.downloadUrl} controls preload="metadata" className="w-full p-2" />}
      {!image && !video && !audio && mediaType === 'application/pdf' && (
        <iframe src={attachment.downloadUrl} title={attachment.name} className="h-48 w-full bg-white" />
      )}
      {!image && !video && !audio && (mediaType === 'application/msword' || mediaType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') && (
        <iframe src={attachment.downloadUrl} title={`معاينة ${attachment.name}`} className="h-44 w-full bg-background" />
      )}
      <button type="button" onClick={() => void openFile()} disabled={busy} data-testid={`button-download-attachment-${attachment.id}`}
        className="flex w-full items-center gap-2 px-3 py-2 text-start text-xs font-semibold text-foreground hover:bg-secondary/70 disabled:opacity-60">
        {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : image ? <ImageIcon className="h-4 w-4 text-primary" /> : video ? <Video className="h-4 w-4 text-primary" /> : audio ? <AudioLines className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
        <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
        <span className="text-muted-foreground">{Math.max(1, Math.round(attachment.size / 1024))} ك.ب</span>
      </button>
      {problem && <p className="px-3 pb-2 text-xs text-destructive">{problem}</p>}
    </div>
  );
}

function MessageBubble({ message, mine, hideContact, onReport }: {
  message: ChatMessage; mine: boolean; hideContact: boolean; onReport: (message: ChatMessage) => void;
}) {
  return (
    <article className={`group flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''}`} data-testid={`message-${message.id}`}>
      {!mine && <Avatar name={message.senderName} src={message.senderAvatarUrl} userId={message.senderId} size="sm" />}
      <div className={`max-w-[85%] sm:max-w-[72%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
        {!mine && <span className="mb-1 px-1 text-[11px] font-bold text-muted-foreground">{message.senderName}</span>}
        <div className={`rounded-2xl px-4 py-3 shadow-sm ${mine ? 'rounded-bl-md bg-primary text-primary-foreground' : 'rounded-br-md border border-border/70 bg-card text-card-foreground'}`}>
          {message.body && <p dir="auto" className="whitespace-pre-wrap break-words text-sm leading-7">{safeText(message.body, hideContact)}</p>}
          {message.attachments?.map((file) => <AttachmentView key={file.id} attachment={file} />)}
        </div>
        <div className={`mt-1 flex items-center gap-2 px-1 text-[10px] text-muted-foreground ${mine ? 'flex-row-reverse' : ''}`}>
          <time dateTime={message.createdAt}>{stamp(message.createdAt)}</time>
          <button type="button" onClick={() => onReport(message)} className="opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus:opacity-100" aria-label="الإبلاغ عن الرسالة" data-testid={`button-report-message-${message.id}`}>إبلاغ</button>
        </div>
      </div>
    </article>
  );
}

export default function ChatsPage() {
  const queryClient = useQueryClient();
  const { role, me } = useMe();
  const isAdmin = role === 'admin';
  const [conversationSearch, setConversationSearch] = useState('');
  const [directorySearch, setDirectorySearch] = useState('');
  const [activeId, setActiveId] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState('');
  const [reportTarget, setReportTarget] = useState<ChatMessage | null>(null);
  const [reportReason, setReportReason] = useState('inappropriate');
  const [reportDetails, setReportDetails] = useState('');
  const [hideContact, setHideContact] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [olderCursor, setOlderCursor] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const mediaRecorder = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listQuery = useListSchoolChats(
    { search: conversationSearch.trim() || undefined },
    { query: { queryKey: getListSchoolChatsQueryKey({ search: conversationSearch.trim() || undefined }) } },
  );
  const conversations: ChatConversation[] = listQuery.data ?? [];
  const selected = conversations.find((item) => item.id === activeId) ?? null;
  const activeConversationId = selected?.id ?? 0;
  const messagesQuery = useListChatMessages(activeConversationId, {
    query: { enabled: !!selected, queryKey: getListChatMessagesQueryKey(activeConversationId) },
  });
  const messagePage = messagesQuery.data;
  const olderQuery = useListOlderChatMessages(activeConversationId, olderCursor ?? 0, {
    query: { enabled: !!selected && olderCursor !== null, queryKey: getListOlderChatMessagesQueryKey(activeConversationId, olderCursor ?? 0) },
  });
  const searchDirectory = useSearchSchoolChatDirectory(
    { q: directorySearch.trim() || ' ' },
    { query: { enabled: isAdmin && directorySearch.trim().length > 0, queryKey: getSearchSchoolChatDirectoryQueryKey({ q: directorySearch.trim() || ' ' }) } },
  );
  const messageSearch = useSearchChatMessages();
  const sendMessage = useCreateChatMessage();
  const markRead = useMarkChatRead();
  const createUpload = useCreateChatUpload();
  const completeUpload = useCompleteChatUpload();
  const createReport = useCreateChatReport();
  const reportsQuery = useListChatReports({
    query: { enabled: isAdmin, queryKey: getListChatReportsQueryKey() },
  });
  const reviewReport = useReviewChatReport();

  useEffect(() => {
    if (!activeId && conversations.length) setActiveId(conversations[0].id);
    if (activeId && !conversations.some((item) => item.id === activeId)) setActiveId(conversations[0]?.id ?? null);
  }, [conversations, activeId]);

  useEffect(() => {
    if (selected && messagePage?.messages.length) {
      markRead.mutate({ id: selected.id }, {
        onSuccess: () => {
          void queryClient.invalidateQueries({ queryKey: getListSchoolChatsQueryKey({ search: conversationSearch.trim() || undefined }) });
        },
      });
    }
  // Reading is intentionally triggered when the conversation and latest page change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, messagePage?.messages.at(-1)?.id]);

  useEffect(() => {
    if (scrollRef.current && !showSearchResults) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messagePage?.messages.length, activeId, showSearchResults]);

  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (mediaRecorder.current?.state === 'recording') mediaRecorder.current.stop();
    };
  }, [audioUrl]);

  const selectedMember = selected?.members.find((member) => member.id !== String(me?.id)) ?? selected?.members[0] ?? null;
  const displayMessages = showSearchResults
    ? messageSearch.data?.messages ?? []
    : [...(olderQuery.data?.messages ?? []), ...(messagePage?.messages ?? [])].filter((message, index, array) => array.findIndex((entry) => entry.id === message.id) === index);

  async function submitMessage() {
    if (!selected || !selected.canSend || sending) return;
    if (!draft.trim() && !fileQueue.length && !audioBlob) return;
    setSending(true);
    setNotice('');
    try {
      const attachmentIds: number[] = [];
      const items: File[] = [...fileQueue];
      if (audioBlob) items.push(new File([audioBlob], `تسجيل-${Date.now()}.webm`, { type: audioBlob.type || 'audio/webm' }));
      for (const file of items) {
        const upload = await createUpload.mutateAsync({
          id: selected.id,
          data: { name: file.name, size: file.size, contentType: file.type || 'application/octet-stream' },
        });
        const response = await fetch(upload.uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': file.type || 'application/octet-stream' },
          body: file,
        });
        if (!response.ok) throw new Error('تعذّر رفع أحد المرفقات.');
        const attachment = await completeUpload.mutateAsync({ id: upload.id });
        attachmentIds.push(attachment.id);
      }
      await sendMessage.mutateAsync({
        id: selected.id,
        data: { body: draft.trim() || undefined, attachmentIds: attachmentIds.length ? attachmentIds : undefined },
      });
      setDraft('');
      setFileQueue([]);
      setAudioBlob(null);
      setAudioUrl('');
      setNotice('تم إرسال الرسالة.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListChatMessagesQueryKey(selected.id) }),
        queryClient.invalidateQueries({ queryKey: getListSchoolChatsQueryKey({ search: conversationSearch.trim() || undefined }) }),
      ]);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'لم يتم إرسال الرسالة. حاول مرة أخرى.');
    } finally {
      setSending(false);
    }
  }

  async function beginRecording() {
    setNotice('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunks.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunks.current.push(event.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(audioChunks.current, { type: recorder.mimeType || 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
      };
      recorder.start();
      mediaRecorder.current = recorder;
      setRecording(true);
    } catch {
      setNotice('لا يمكن الوصول إلى الميكروفون. تحقق من إذن المتصفح.');
    }
  }

  function stopRecording(save: boolean) {
    const recorder = mediaRecorder.current;
    if (!recorder || recorder.state !== 'recording') return;
    if (!save) {
      recorder.onstop = () => recorder.stream.getTracks().forEach((track) => track.stop());
      setAudioBlob(null);
      setAudioUrl('');
    }
    recorder.stop();
    setRecording(false);
  }

  async function runMessageSearch(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || messageQuery.trim().length < 1) return;
    setShowSearchResults(true);
    await messageSearch.mutateAsync({ id: selected.id, data: { query: messageQuery.trim() } });
  }

  async function sendReport(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !reportTarget) return;
    try {
      await createReport.mutateAsync({
        id: selected.id,
        data: { messageId: reportTarget.id, reason: reportReason as 'harassment' | 'contact_info' | 'inappropriate' | 'other', details: reportDetails.trim() || undefined },
      });
      setReportTarget(null);
      setReportDetails('');
      setNotice('وصل البلاغ إلى إدارة المدرسة.');
      await queryClient.invalidateQueries({ queryKey: getListChatReportsQueryKey() });
    } catch {
      setNotice('تعذّر إرسال البلاغ. حاول مرة أخرى.');
    }
  }

  const openReports = (reportsQuery.data ?? []).filter((report) => report.status === 'open');
  const directory = searchDirectory.data;

  return (
    <section className="chat-page rise min-h-[calc(100dvh-8rem)]" dir="rtl">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-bold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> مساحة آمنة للتعلّم
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">المحادثات</h1>
          <p className="mt-1 text-sm text-muted-foreground">تواصل مرتبط بدوراتك ومجموعاتك المسجّلة في GO COURSE.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2 text-xs font-semibold text-muted-foreground">
          <input type="checkbox" checked={hideContact} onChange={(event) => setHideContact(event.target.checked)} className="accent-[hsl(var(--primary))]" data-testid="input-hide-contact-data" />
          إخفاء بيانات التواصل في النصوص
        </label>
      </div>

      {isAdmin && (
        <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div><h2 className="font-extrabold">دليل المدرسة</h2><p className="text-xs text-muted-foreground">ابحث عن الأشخاص والأقسام والمحادثات</p></div>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-bold">{directory?.people.length ?? 0} أشخاص</span>
            </div>
            <div className="relative">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={directorySearch} onChange={(event) => setDirectorySearch(event.target.value)} className="field-input pe-10" placeholder="اسم أو قسم أو محادثة…" data-testid="input-chat-directory-search" />
            </div>
            {directorySearch.trim() && (
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {searchDirectory.isLoading ? <div className="col-span-full h-16 animate-pulse rounded-xl bg-muted" /> : searchDirectory.isError
                  ? <p className="col-span-full rounded-lg bg-destructive/5 p-3 text-sm text-destructive">تعذّر تحميل نتائج الدليل.</p>
                  : !directory?.people.length && !directory?.sections.length && !directory?.conversations.length
                    ? <p className="col-span-full rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">لا توجد نتائج لهذا البحث.</p>
                    : <>
                      {!!directory?.people.length && <div className="rounded-xl bg-background p-2"><p className="mb-2 text-[11px] font-bold text-muted-foreground">الأشخاص</p>{directory.people.slice(0, 4).map((person) => <div key={person.id} className="flex items-center gap-2 py-1.5"><Avatar name={person.name} src={person.avatarUrl} userId={person.id} size="sm" /><span className="truncate text-xs font-semibold">{person.name}</span></div>)}</div>}
                      {!!directory?.sections.length && <div className="rounded-xl bg-background p-2"><p className="mb-2 text-[11px] font-bold text-muted-foreground">الأقسام</p>{directory.sections.slice(0, 4).map((section) => <p key={section.id} className="truncate py-1.5 text-xs font-semibold">{section.courseTitle} <span className="text-muted-foreground">/ {section.title}</span></p>)}</div>}
                      {!!directory?.conversations.length && <div className="rounded-xl bg-background p-2"><p className="mb-2 text-[11px] font-bold text-muted-foreground">المحادثات</p>{directory.conversations.slice(0, 4).map((conversation) => <button type="button" key={conversation.id} onClick={() => setActiveId(conversation.id)} className="block w-full truncate py-1.5 text-start text-xs font-semibold hover:text-primary">{conversation.title}</button>)}</div>}
                    </>}
              </div>
            )}
          </div>
          <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div><h2 className="font-extrabold">مراجعة البلاغات</h2><p className="text-xs text-muted-foreground">حالات تحتاج انتباه الإدارة</p></div>
              <span className="grid h-8 min-w-8 place-items-center rounded-full bg-[hsl(var(--destructive)/.1)] px-2 text-sm font-extrabold text-destructive">{openReports.length}</span>
            </div>
            {reportsQuery.isLoading ? <div className="h-20 animate-pulse rounded-xl bg-muted" /> : reportsQuery.isError ? <p className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">تعذّر تحميل البلاغات.</p> : !openReports.length ? <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground"><ShieldCheck className="h-5 w-5 text-primary" />لا توجد بلاغات مفتوحة.</div> : (
              <div className="max-h-44 space-y-2 overflow-y-auto">
                {openReports.map((report) => <div key={report.id} className="flex items-start gap-3 rounded-xl border border-border/60 bg-background p-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--accent-foreground))]" />
                  <div className="min-w-0 flex-1"><p className="text-xs font-bold">{report.reason} · {report.reporterName}</p><p className="mt-1 truncate text-xs text-muted-foreground">{report.messageExcerpt || report.details}</p>
                    <div className="mt-2 flex gap-2">
                      <button type="button" disabled={reviewReport.isPending} onClick={() => reviewReport.mutate({ id: report.id, data: { status: 'resolved' } }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListChatReportsQueryKey() }) })} className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-bold text-primary-foreground disabled:opacity-50" data-testid={`button-resolve-report-${report.id}`}>حلّ البلاغ</button>
                      <button type="button" disabled={reviewReport.isPending} onClick={() => reviewReport.mutate({ id: report.id, data: { status: 'dismissed' } }, { onSuccess: () => void queryClient.invalidateQueries({ queryKey: getListChatReportsQueryKey() }) })} className="rounded-lg border border-border px-2.5 py-1 text-[11px] font-bold hover:bg-secondary disabled:opacity-50" data-testid={`button-dismiss-report-${report.id}`}>إغلاق دون إجراء</button>
                    </div>
                  </div>
                </div>)}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="chat-frame grid min-h-[68vh] overflow-hidden rounded-[1.5rem] border border-border/70 bg-card shadow-lg lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className={`chat-list flex min-h-[300px] flex-col border-b border-border/70 bg-[hsl(var(--muted)/.45)] lg:border-b-0 lg:border-s ${selected ? 'hidden lg:flex' : 'flex'}`}>
          <div className="border-b border-border/70 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-xs font-bold text-muted-foreground">صندوق الوارد</p><h2 className="text-lg font-extrabold">رسائلك</h2></div>
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">{conversations.reduce((total, item) => total + item.unreadCount, 0)} غير مقروء</span>
            </div>
            <div className="relative">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={conversationSearch} onChange={(event) => setConversationSearch(event.target.value)} className="field-input pe-10" placeholder="ابحث في محادثاتك…" data-testid="input-chat-search" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {listQuery.isLoading ? <div className="space-y-2 p-1">{[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[76px] animate-pulse rounded-2xl bg-card/80" />)}</div>
              : listQuery.isError ? <div className="m-2 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm"><p className="font-bold text-destructive">تعذّر تحميل المحادثات</p><button type="button" onClick={() => void listQuery.refetch()} className="mt-2 font-bold text-primary">إعادة المحاولة</button></div>
                : conversations.length === 0 ? <div className="m-2 rounded-2xl border border-dashed border-border bg-card/70 px-4 py-10 text-center"><CircleHelp className="mx-auto h-7 w-7 text-muted-foreground/60" /><p className="mt-3 font-bold">لا توجد محادثات هنا بعد</p><p className="mt-1 text-xs leading-6 text-muted-foreground">تظهر محادثات الدورات والأقسام المسجّلة في حسابك.</p></div>
                  : conversations.map((conversation) => {
                    const other = conversation.members[0];
                    const on = selected?.id === conversation.id;
                    return <button key={conversation.id} type="button" onClick={() => { setActiveId(conversation.id); setShowSearchResults(false); setOlderCursor(null); }} data-testid={`button-conversation-${conversation.id}`}
                      className={`mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-start transition-colors ${on ? 'bg-card shadow-sm ring-1 ring-border/80' : 'hover:bg-card/70'}`}>
                      <div className="relative"><Avatar name={other?.name ?? conversation.title} src={other?.avatarUrl} userId={other?.id} /><span className="absolute -bottom-0.5 -start-0.5 h-3 w-3 rounded-full border-2 border-card bg-[hsl(var(--chart-2))]" /></div>
                      <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="truncate text-sm font-extrabold">{conversation.title}</span><time className="shrink-0 text-[10px] text-muted-foreground">{dayStamp(conversation.updatedAt)}</time></div>
                        <p className="truncate text-[11px] font-semibold text-primary/80">{conversation.sectionTitle}</p>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{conversation.lastMessage?.body || conversation.lastMessage?.attachments?.[0]?.name || 'ابدأ المحادثة'}</p></div>
                      {conversation.unreadCount > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{conversation.unreadCount}</span>}
                    </button>;
                  })}
          </div>
        </aside>

        <main className={`relative flex min-h-[68vh] flex-col ${!selected ? 'hidden lg:flex' : 'flex'}`}>
          {!selected ? <div className="hidden flex-1 flex-col items-center justify-center p-8 text-center lg:flex"><div className="grid h-20 w-20 place-items-center rounded-3xl bg-primary/10 text-primary"><Headphones className="h-9 w-9" /></div><h2 className="mt-5 text-xl font-extrabold">محادثة الدراسة تبدأ هنا</h2><p className="mt-2 max-w-sm text-sm leading-7 text-muted-foreground">اختر محادثة من القائمة لتتابع أسئلتك وملاحظات دورتك.</p></div>
            : <>
              <header className="flex items-center gap-3 border-b border-border/70 bg-card/90 px-3 py-3 sm:px-5">
                <button type="button" onClick={() => setActiveId(null)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-secondary lg:hidden" aria-label="العودة إلى المحادثات"><ArrowLeft className="h-4 w-4" /></button>
                <Avatar name={selectedMember?.name ?? selected.title} src={selectedMember?.avatarUrl} userId={selectedMember?.id} />
                <div className="min-w-0 flex-1"><h2 className="truncate font-extrabold">{selected.title}</h2><p className="truncate text-[11px] text-muted-foreground">{selected.sectionTitle}{selectedMember ? ` · ${selectedMember.role === 'teacher' ? 'أستاذ' : selectedMember.role === 'student' ? 'طالب' : 'إدارة'}` : ''}</p></div>
                <form onSubmit={runMessageSearch} className="hidden items-center gap-1 sm:flex">
                  <input value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} className="h-9 w-36 rounded-xl border border-input bg-background px-3 text-xs outline-none focus:border-primary md:w-48" placeholder="ابحث في الرسائل" aria-label="بحث في الرسائل" data-testid="input-message-search" />
                  <button type="submit" disabled={!messageQuery.trim() || messageSearch.isPending} className="grid h-9 w-9 place-items-center rounded-xl border border-border hover:bg-secondary disabled:opacity-50" aria-label="بحث"><Search className="h-4 w-4" /></button>
                </form>
                {showSearchResults && <button type="button" onClick={() => setShowSearchResults(false)} className="rounded-lg bg-secondary px-2.5 py-1.5 text-[11px] font-bold">كل الرسائل</button>}
                <span className="hidden rounded-full bg-primary/5 px-3 py-1 text-[10px] font-bold text-primary md:inline-flex"><ShieldCheck className="me-1 h-3.5 w-3.5" /> محادثة آمنة</span>
              </header>

              <div ref={scrollRef} className="chat-thread flex-1 space-y-4 overflow-y-auto bg-[hsl(var(--background)/.48)] px-3 py-5 sm:px-6">
                {olderQuery.data?.messages.length && !showSearchResults ? <div className="text-center"><button type="button" onClick={() => setOlderCursor(olderQuery.data?.nextBefore ?? messagePage?.nextBefore ?? null)} disabled={!olderQuery.data.hasMore || olderQuery.isFetching} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-primary disabled:opacity-50">{olderQuery.isFetching ? 'جارٍ التحميل…' : 'رسائل أقدم'}</button></div>
                  : messagePage?.hasMore && !showSearchResults && <div className="text-center"><button type="button" onClick={() => setOlderCursor(messagePage.nextBefore)} disabled={!messagePage.nextBefore || olderQuery.isFetching} className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-bold text-muted-foreground hover:text-primary disabled:opacity-50">تحميل الرسائل الأقدم</button></div>}
                {messagesQuery.isLoading ? <div className="space-y-4">{[0, 1, 2].map((item) => <div key={item} className={`h-16 w-2/3 animate-pulse rounded-2xl bg-muted ${item % 2 ? 'ms-auto' : ''}`} />)}</div>
                  : messagesQuery.isError ? <div className="rounded-xl bg-destructive/5 p-4 text-center text-sm text-destructive"><p className="font-bold">تعذّر تحميل الرسائل.</p><button type="button" onClick={() => void messagesQuery.refetch()} className="mt-2 font-bold underline">إعادة المحاولة</button></div>
                    : showSearchResults && messageSearch.isPending ? <div className="h-24 animate-pulse rounded-2xl bg-muted" />
                      : showSearchResults && messageSearch.isError ? <div className="rounded-xl bg-destructive/5 p-4 text-center text-sm text-destructive">تعذّر البحث في الرسائل. حاول مرة أخرى.</div>
                        : displayMessages.length ? displayMessages.map((message) => <MessageBubble key={message.id} message={message} mine={message.senderId === String(me?.id)} hideContact={hideContact} onReport={setReportTarget} />)
                        : <div className="mx-auto my-16 max-w-sm text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-secondary text-primary"><MessageCircle className="h-6 w-6" /></div><p className="mt-4 font-extrabold">{showSearchResults ? 'لا توجد رسائل مطابقة' : 'بداية حديث جديد'}</p><p className="mt-1 text-xs leading-6 text-muted-foreground">{showSearchResults ? 'جرّب كلمة بحث أخرى.' : 'اكتب رسالتك الأولى ضمن سياق هذه الدورة.'}</p></div>}
              </div>

              {notice && <div role="status" className={`mx-4 mb-2 rounded-lg px-3 py-2 text-xs font-semibold ${notice.startsWith('تعذّر') || notice.startsWith('لا يمكن') ? 'bg-destructive/5 text-destructive' : 'bg-primary/5 text-primary'}`}>{notice}</div>}
              {selected.canSend ? <div className="border-t border-border/70 bg-card p-3 sm:p-4">
                {fileQueue.length > 0 && <div className="mb-2 flex flex-wrap gap-2">{fileQueue.map((file, index) => <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-lg bg-secondary px-2.5 py-1.5 text-xs"><FileText className="h-3.5 w-3.5 shrink-0" /><span className="max-w-40 truncate">{file.name}</span><button type="button" onClick={() => setFileQueue((files) => files.filter((_, itemIndex) => index !== itemIndex))} aria-label={`إزالة ${file.name}`}><X className="h-3.5 w-3.5" /></button></span>)}</div>}
                {audioUrl && <div className="mb-2 flex items-center gap-2 rounded-xl bg-secondary p-2"><audio controls src={audioUrl} className="h-9 flex-1" /><button type="button" onClick={() => { setAudioBlob(null); setAudioUrl(''); }} className="rounded-lg p-2 hover:bg-background" aria-label="إلغاء التسجيل"><X className="h-4 w-4" /></button></div>}
                <div className="flex items-end gap-2">
                  <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-primary" aria-label="إرفاق ملف">
                    <Paperclip className="h-4 w-4" /><input type="file" multiple accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" data-testid="input-chat-attachments" onChange={(event) => {
                      const incoming = Array.from(event.target.files ?? []);
                      const allowed = incoming.filter((file) => file.size <= 25 * 1024 * 1024 && (file.type.startsWith('image/') || file.type.startsWith('video/') || file.type.startsWith('audio/') || ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.type)));
                      setFileQueue((files) => [...files, ...allowed].slice(0, 8));
                      if (allowed.length < incoming.length) setNotice('بعض الملفات غير مدعومة أو تتجاوز 25 ميغابايت.');
                      event.target.value = '';
                    }} />
                  </label>
                  {!audioBlob && <button type="button" onClick={recording ? () => stopRecording(true) : () => void beginRecording()} className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border transition-colors ${recording ? 'bg-destructive text-destructive-foreground' : 'text-muted-foreground hover:bg-secondary hover:text-primary'}`} aria-label={recording ? 'إيقاف التسجيل' : 'تسجيل صوتي'} data-testid="button-record-audio">{recording ? <AudioLines className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</button>}
                  {recording && <button type="button" onClick={() => stopRecording(false)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/5" aria-label="إلغاء التسجيل"><X className="h-4 w-4" /></button>}
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} rows={1} maxLength={4000} className="max-h-32 min-h-11 flex-1 resize-y rounded-xl border border-input bg-background px-4 py-3 text-sm leading-6 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10" placeholder="اكتب رسالتك هنا…" aria-label="نص الرسالة" data-testid="input-chat-message" />
                  <button type="button" onClick={() => void submitMessage()} disabled={sending || (!draft.trim() && fileQueue.length === 0 && !audioBlob)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50" aria-label="إرسال الرسالة" data-testid="button-send-chat-message">{sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button>
                </div>
                <p className="mt-2 text-[10px] text-muted-foreground">Enter للإرسال · Shift + Enter لسطر جديد · حتى 8 مرفقات، 25 ميغابايت للملف</p>
              </div> : <div className="flex items-center justify-center gap-2 border-t border-border/70 bg-muted/40 p-4 text-sm font-semibold text-muted-foreground"><ShieldCheck className="h-4 w-4" /> الإرسال غير متاح في هذه المحادثة</div>}
            </>}
        </main>
      </div>

      {reportTarget && <div className="fixed inset-0 z-[70] grid place-items-center bg-foreground/40 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setReportTarget(null); }}>
        <form onSubmit={(event) => void sendReport(event)} className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl">
          <div className="flex items-start justify-between gap-4"><div><div className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-destructive/10 text-destructive"><AlertTriangle className="h-5 w-5" /></div><h2 className="text-lg font-extrabold">الإبلاغ عن رسالة</h2><p className="mt-1 text-xs leading-6 text-muted-foreground">سيصل البلاغ إلى إدارة GO COURSE للمراجعة.</p></div><button type="button" onClick={() => setReportTarget(null)} className="grid h-9 w-9 place-items-center rounded-xl hover:bg-secondary" aria-label="إغلاق"><X className="h-4 w-4" /></button></div>
          <blockquote className="my-4 rounded-xl bg-muted/60 p-3 text-xs leading-6 text-muted-foreground">{reportTarget.body.slice(0, 180) || 'رسالة تحتوي على مرفق'}</blockquote>
          <label className="mb-2 block text-xs font-bold">سبب البلاغ</label>
          <select value={reportReason} onChange={(event) => setReportReason(event.target.value)} className="field-input mb-3" data-testid="select-report-reason">
            <option value="inappropriate">محتوى غير مناسب</option><option value="harassment">مضايقة أو إساءة</option><option value="contact_info">بيانات تواصل</option><option value="other">سبب آخر</option>
          </select>
          <label className="mb-2 block text-xs font-bold">تفاصيل إضافية <span className="font-normal text-muted-foreground">(اختياري)</span></label>
          <textarea value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} maxLength={1000} rows={3} className="field-input resize-y" placeholder="أضف سياقًا يساعد فريق المدرسة…" data-testid="input-report-details" />
          <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => setReportTarget(null)} className="rounded-xl border border-border px-4 py-2 text-sm font-bold hover:bg-secondary">إلغاء</button><button type="submit" disabled={createReport.isPending} className="inline-flex items-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-bold text-destructive-foreground disabled:opacity-50" data-testid="button-submit-report">{createReport.isPending && <LoaderCircle className="h-4 w-4 animate-spin" />}إرسال البلاغ</button></div>
        </form>
      </div>}
    </section>
  );
}

