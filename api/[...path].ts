// Vercel's same-origin /api bridge keeps Clerk cookies first-party. Secrets for
// Neon and Clerk never belong in Vercel: only BACKEND_URL is needed here.
export const config={runtime:"edge"};

export async function handler(request:Request):Promise<Response>{
  const configured=process.env.BACKEND_URL;
  if(!configured)return Response.json({error:"BACKEND_URL is not configured in Vercel."},{status:503});
  let backend:URL;
  try{
    backend=new URL(configured);
    if(backend.protocol!=="https:"||backend.pathname!=="/"||backend.username||backend.password||backend.search||backend.hash)throw new Error();
  }catch{return Response.json({error:"BACKEND_URL must be an HTTPS backend origin without a path."},{status:503});}
  const incoming=new URL(request.url);
  const target=new URL(incoming.pathname+incoming.search,backend);
  const headers=new Headers(request.headers);
  for(const h of ["host","connection","content-length","transfer-encoding","x-forwarded-for","x-forwarded-proto","x-forwarded-host"])headers.delete(h);
  headers.set("x-forwarded-host",incoming.host);
  headers.set("x-forwarded-proto","https");
  try{
    const response=await fetch(target,{
      method:request.method,headers,redirect:"manual",
      body:["GET","HEAD"].includes(request.method)?undefined:await request.arrayBuffer(),
    });
    const out=new Headers(response.headers);
    out.set("Cache-Control","private, no-store");
    return new Response(response.body,{status:response.status,headers:out});
  }catch{
    return Response.json({error:"تعذر الوصول إلى الخادم. تحقق من خدمة Render."},{status:502,headers:{"Cache-Control":"no-store"}});
  }
}
export default handler;
