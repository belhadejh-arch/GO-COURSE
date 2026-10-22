import { createHmac, timingSafeEqual } from "node:crypto";
import { getPublicApiOrigin } from "./deployment-config";
type FileGrant={path:string;action:"upload"|"download";expires:number};
function secret():string {
  const value=process.env.UPLOAD_SIGNING_SECRET||process.env.SESSION_SECRET||process.env.CLERK_SECRET_KEY;
  if(!value)throw new Error("File signing secret is not configured.");
  return value;
}
function signature(payload:string):string {
  return createHmac("sha256",secret()).update(`go-course-private-files:v1:${payload}`).digest("base64url");
}
export function signFileToken(path:string,action:FileGrant["action"],now=Date.now()):string {
  const payload=Buffer.from(JSON.stringify({path,action,expires:Math.floor(now/1000)+600})).toString("base64url");
  return `${payload}.${signature(payload)}`;
}
export function verifyFileToken(token:unknown,path:string,action:FileGrant["action"],now=Date.now()):boolean {
  if(typeof token!=="string" || token.length>1500)return false;
  const [payload,sig,extra]=token.split(".");
  if(!payload||!sig||extra)return false;
  const expected=Buffer.from(signature(payload)),provided=Buffer.from(sig);
  if(provided.length!==expected.length||!timingSafeEqual(expected,provided))return false;
  try{
    const grant=JSON.parse(Buffer.from(payload,"base64url").toString()) as FileGrant;
    return grant.path===path && grant.action===action && Number.isInteger(grant.expires) && grant.expires>=Math.floor(now/1000) && grant.expires<=Math.floor(now/1000)+600;
  }catch{return false;}
}
export function fileTransferUrl(path:string,action:FileGrant["action"]):string {
  const id=path.split("/").at(-1);
  const origin=getPublicApiOrigin();
  return `${origin}/api/school/storage/transfer/${id}?action=${action}&token=${signFileToken(path,action)}`;
}
