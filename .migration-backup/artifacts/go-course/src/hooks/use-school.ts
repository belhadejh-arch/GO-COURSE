import { useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { getListSchoolRecordsQueryOptions, useGetSchoolMe } from '@workspace/api-client-react';
import type { SchoolRecord } from '@workspace/api-client-react';
import type { EntityConfig, Lookup, Role } from '@/lib/school';

const PERM_ENTITIES = ['students', 'teachers', 'courses', 'enrollments', 'payments', 'subscriptions', 'invoices', 'reports'];


export function useMe() {
  const q = useGetSchoolMe();
  const role = (q.data?.role ?? 'guest') as Role;
  return { me: q.data, role, isLoading: q.isLoading, isError: q.isError, refetch: q.refetch };
}

export function useAccess() {
  const { me, role } = useMe();
  const perms = me?.permissions ?? [];
  const gated = (_e: string) => role === 'staff';
  const canRead = (e: string) => !gated(e) || perms.includes(`${e}:read`) || perms.includes(`${e}:write`);
  const canWrite = (cfg: EntityConfig) => cfg.write.includes(role) && (!gated(cfg.key) || perms.includes(`${cfg.key}:write`));
  const canArchive = (cfg: EntityConfig) => role === 'admin' || (role === 'staff'
    ? perms.includes(`${cfg.key}:write`)
    : cfg.write.includes(role));
  return { role, canRead, canWrite, canArchive };
}

export function useLookups(entities: string[]) {
  const key = entities.join(',');
  const list = useMemo(() => Array.from(new Set(entities)), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const results = useQueries({
    queries: list.map((e) => getListSchoolRecordsQueryOptions(e)),
  });
  const stamp = results.map((r) => r.dataUpdatedAt).join('|');
  const lookup = useMemo(() => {
    const out: Lookup = {};
    list.forEach((e, i) => {
      const data = results[i]?.data as SchoolRecord[] | undefined;
      out[e] = new Map((data ?? []).map((r) => [r.id, r]));
    });
    return out;
  }, [stamp, list]); // eslint-disable-line react-hooks/exhaustive-deps
  return { lookup, isLoading: results.some((r) => r.isLoading) };
}

export function useInvalidateSchool() {
  const qc = useQueryClient();
  // Cross-domain side effects (course -> sessions/lessons, payment -> invoices/subscriptions) require refreshing everything.
  return (_entity?: string, _id?: number) => {
    void _entity; void _id;
    return qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] ?? '').startsWith('/api/school/') });
  };
}
