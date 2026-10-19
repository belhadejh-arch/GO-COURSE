export function getAllowedOrigins():string[] {
  return (process.env.FRONTEND_URL || "").split(",").map(v=>v.trim()).filter(Boolean).map(v=>{
    const u=new URL(v);
    if(!["https:","http:"].includes(u.protocol)||u.origin!==v)throw new Error("FRONTEND_URL must contain comma-separated origins without paths or trailing slashes.");
    return u.origin;
  });
}

export function checkDeploymentConfig():void {
  if(!process.env.RENDER)return;
  for(const name of ["DATABASE_URL","CLERK_PUBLISHABLE_KEY","CLERK_SECRET_KEY","FRONTEND_URL","PUBLIC_API_URL","OWNER_EMAIL"]) {
    if(!process.env[name])throw new Error(`Missing Render setting: ${name}`);
  }
  if(process.env.AUTH_MODE!=="external")throw new Error("Render requires AUTH_MODE=external and your external Clerk application keys.");
  if(process.env.FILE_STORAGE_PROVIDER!=="database")throw new Error("Render requires FILE_STORAGE_PROVIDER=database; Replit App Storage credentials do not work on Render.");
  if(new URL(process.env.PUBLIC_API_URL!).protocol!=="https:")throw new Error("PUBLIC_API_URL must be the HTTPS Render backend origin.");
  getAllowedOrigins();
}
