import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNativeAuth } from '@/lib/native-auth';

export function SchoolRealtime() {
  const { session, refresh } = useNativeAuth();
  const qc=useQueryClient();
  const [connected,setConnected]=useState(false);
  useEffect(()=>{
    if(!session.signedIn||session.mustChangePassword)return;
    const source=new EventSource(`${import.meta.env.BASE_URL}api/school/events`,{withCredentials:true});
    let timer:ReturnType<typeof setTimeout>|undefined;
    source.onopen=()=>setConnected(true);
    source.addEventListener('change',()=>{
      // Coalesce a transaction's related writes into one cache refresh.
      if(timer)clearTimeout(timer);
      timer=setTimeout(()=>void qc.invalidateQueries(),150);
    });
    source.onerror=()=>{setConnected(false);void refresh();};
    return()=>{source.close();if(timer)clearTimeout(timer);setConnected(false);};
  },[session.signedIn,session.mustChangePassword,qc]);
  if(!session.signedIn)return null;
  return <span className="fixed bottom-3 start-3 z-40 rounded-full border bg-background/95 px-3 py-1 text-[10px] text-muted-foreground shadow-sm" data-testid="sync-status">
    {connected?'مزامنة مباشرة':'مزامنة تلقائية كل 5 ثوانٍ'}
  </span>;
}
