export function normalizeOrigin(value:string,setting:string):string {
  const input=value.trim();
  const invalid=()=>new Error(`${setting} must be a domain or an HTTP(S) origin without credentials, paths, query parameters, or fragments.`);
  if(!input||/[\s\\]/.test(input))throw invalid();
  let url:URL;
  try {
    url=new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(input)?input:`https://${input}`);
  } catch {
    throw invalid();
  }
  if(!["https:","http:"].includes(url.protocol)||!url.hostname||url.username||url.password||url.search||url.hash||!/^\/*$/.test(url.pathname))throw invalid();
  return url.origin;
}

export function getAllowedOrigins():string[] {
  return [...new Set((process.env.FRONTEND_URL || "").split(",").map(v=>v.trim()).filter(Boolean).map(v=>normalizeOrigin(v,"FRONTEND_URL")))];
}

export function getPublicApiOrigin():string {
  if(!process.env.PUBLIC_API_URL?.trim())return "";
  const origin=normalizeOrigin(process.env.PUBLIC_API_URL,"PUBLIC_API_URL");
  if(!origin.startsWith("https://"))throw new Error("PUBLIC_API_URL must be the HTTPS Render backend origin.");
  return origin;
}

export function checkDeploymentConfig():void {
  if(!process.env.RENDER)return;
  if(!process.env.DATABASE_URL?.trim()&&!process.env.DATABASE_MIGRATION_URL?.trim()) {
    throw new Error("Missing Render setting: DATABASE_URL (or DATABASE_MIGRATION_URL as a fallback)");
  }
  for(const name of ["FRONTEND_URL","PUBLIC_API_URL"]) {
    if(!process.env[name]?.trim())throw new Error(`Missing Render setting: ${name}`);
  }
  if(process.env.FILE_STORAGE_PROVIDER!=="database")throw new Error("Render requires FILE_STORAGE_PROVIDER=database; Replit App Storage credentials do not work on Render.");
  getPublicApiOrigin();
  if(!getAllowedOrigins().length)throw new Error("FRONTEND_URL must contain at least one frontend domain.");
}
