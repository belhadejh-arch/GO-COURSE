import { and,eq,sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { schoolRecords,schoolLinks } from "./schema";

const languages=[
  ["en","الإنجليزية"],["fr","الفرنسية"],["tr","التركية"],["ru","الروسية"],
  ["it","الإيطالية"],["pt","البرتغالية"],["de","الألمانية"],["es","الإسبانية"],
  ["ko","الكورية"],["zh","الصينية"],["ja","اليابانية"],["nl","الهولندية"],
  ["pl","البولندية"],["sv","السويدية"],["ar","العربية"],
];
export async function seedCatalog(db:Pick<NodePgDatabase,"select"|"insert">){
  for(const [code,title] of languages){
    const [existing]=await db.select().from(schoolRecords).where(and(eq(schoolRecords.entity,"languages"),sql`${schoolRecords.data}->>'code'=${code}`));
    if(!existing)await db.insert(schoolRecords).values({entity:"languages",title,status:"active",data:{code},dedupeKey:`catalog:language:${code}`}).onConflictDoNothing();
    const [language]=existing?[existing]:await db.select().from(schoolRecords).where(eq(schoolRecords.dedupeKey,`catalog:language:${code}`));
    if(!language)throw new Error("Unable to initialize language catalog.");
    for(const level of ["A1","A2","B1","B2","C1","C2"]){
      const [oldLevel]=await db.select().from(schoolRecords).where(and(eq(schoolRecords.entity,"levels"),sql`${schoolRecords.data}->>'languageId'=${String(language.id)}`,sql`${schoolRecords.data}->>'code'=${level}`));
      if(!oldLevel)await db.insert(schoolRecords).values({entity:"levels",title:level,status:"active",data:{languageId:language.id,code:level},dedupeKey:`catalog:level:${code}:${level}`}).onConflictDoNothing();
      const [row]=oldLevel?[oldLevel]:await db.select().from(schoolRecords).where(eq(schoolRecords.dedupeKey,`catalog:level:${code}:${level}`));
      if(row)await db.insert(schoolLinks).values({fromId:row.id,toId:language.id,kind:"languageId"}).onConflictDoNothing();
    }
  }
}
