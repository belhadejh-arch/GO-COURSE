import { Readable } from "node:stream";
import { db,schoolFileContents,schoolFiles } from "@workspace/db";
import { eq,sql } from "drizzle-orm";
import { ObjectStorageService } from "./objectStorage";
import { fail } from "./school-access";

export function validFilePrefix(type:string,prefix:Buffer):boolean {
  switch(type){
    case "image/png":return prefix.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    case "image/jpeg":return prefix[0]===255 && prefix[1]===216;
    case "image/webp":return prefix.toString("ascii",0,4)==="RIFF"&&prefix.toString("ascii",8,12)==="WEBP";
    case "application/pdf":return prefix.toString("ascii",0,5)==="%PDF-";
    default:return true;
  }
}
class DatabaseFile {
  constructor(private path:string){}
  async getMetadata():Promise<[{size:number}]>{
    const [r]=await db.select({size:sql<number>`octet_length(${schoolFileContents.bytes})`}).from(schoolFileContents).where(eq(schoolFileContents.objectPath,this.path));
    if(!r)fail(404,"الملف لم يُرفع بعد.");
    return [{size:Number(r.size)}];
  }
  async download(options?:{start?:number;end?:number}):Promise<[Buffer]> {
    const start=options?.start||0;
    const selection=options?.end!==undefined?sql<Buffer>`substring(${schoolFileContents.bytes} from ${start+1} for ${options.end-start+1})`:schoolFileContents.bytes;
    const [r]=await db.select({bytes:selection}).from(schoolFileContents).where(eq(schoolFileContents.objectPath,this.path));
    if(!r)fail(404,"الملف غير موجود.");
    return [r.bytes];
  }
  createReadStream():Readable {
    const source=this;
    return Readable.from((async function*(){yield (await source.download())[0];})());
  }
}
export class SchoolFileStorage extends ObjectStorageService {
  // This facade keeps old Replit files readable without silently relocating them.
  async open(path:string) {
    const [file]=await db.select().from(schoolFiles).where(eq(schoolFiles.objectPath,path));
    if(!file)fail(404,"الملف غير موجود.");
    if(file.storageProvider==="database")return new DatabaseFile(path);
    if(process.env.RENDER)fail(503,"هذا الملف القديم محفوظ في تخزين Replit ويحتاج نقلًا إلى Neon.");
    return super.getObjectEntityFile(path);
  }
}
