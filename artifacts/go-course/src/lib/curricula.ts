/**
 * Curriculum labels offered in teacher requests. Titles are kept in their
 * source-language spelling so teachers can identify the exact course series.
 */
export const CURRICULA_BY_LANGUAGE: Record<string, string[]> = {
  English: [
    'Headway','English File','American English File','Speakout','Outcomes','Empower','Interchange','Four Corners','Life',
    'Cutting Edge','Roadmap','Grammar in Use','Oxford Word Skills','English for Everyone','Face2Face','Navigate','Evolve',
    'Open World','Wider World','Solutions','Gold Experience','Complete IELTS','Mindset for IELTS',
    'The Official Cambridge Guide to IELTS','Official TOEFL iBT Tests','Cambridge English Complete','Objective First',
    'Objective Advanced','PTE Academic Expert','Ready for IELTS','Focus','Speak Now','Touchstone',
    'American English File Starter','English Unlimited',
  ],
  French: [
    'Alter Ego+','Cosmopolite','Édito','Défi','Tendances','Inspire',"L'atelier",'Le Nouveau Taxi!','Saison','Amical',
    'Version Originale','Latitudes','Grammaire progressive du français','Vocabulaire progressif du français',
    'Communication progressive du français','Défi Actif','Entre Nous','Alors ?','Rond-Point','Nickel !','Ici',
    'Le DELF 100% réussite','ABC DELF','ABC DALF','Réussir le DELF','Réussir le DALF',
    'Préparation à l’examen du DELF','Le TCF en 350 activités','TCF 250 activités','Objectif Diplomatie','Edito Pro',
    'Grammaire essentielle du français','Phonétique progressive du français','Littérature progressive du français',
    'Compréhension orale progressive du français',
  ],
  Russian: [
    'Поехали!','Дорога в Россию','Жили-были','Русский язык. Первые шаги','Время говорить по-русски!','Точка.ру','Ключи',
    'Русский сувенир','Лестница','Матрёшка','Русский класс','Живая речь','Русский язык для начинающих',
    'The New Penguin Russian Course','FSI Russian Language Course','Давайте!','Русский без границ','Окно в Россию',
    'Пять элементов','Русский язык. 5 элементов','Практическая грамматика русского языка',
    'Русская грамматика в упражнениях','Тесты по русскому языку как иностранному','Подготовка к ТРКИ',
    'Лексический минимум по русскому языку как иностранному','TORFL Preparation','Russian Through Propaganda',
    'Russian for Everybody','Living Language Russian','Colloquial Russian','Complete Russian','Teach Yourself Russian',
    'Russian in Exercises','Русский язык в упражнениях','ТРКИ: Типовые тесты',
  ],
  Turkish: [
    'İstanbul Yabancılar İçin Türkçe','Yedi İklim Türkçe','Yeni Hitit','Gazi TÖMER Türkçe',
    'Yunus Emre Enstitüsü Türkçe Öğretim Seti','Türkçeye Yolculuk','Türkçe Öğreniyoruz',
    'Yeni İstanbul Uluslararası Öğrenciler İçin Türkçe','Kolay Gelsin','Türkçe Okuyorum','Türkçe Dilbilgisi',
    'Türkçe Alıştırmalar','Turkish Grammar in Practice','Teach Yourself Complete Turkish','FSI Turkish Basic Course',
    'İzmir Yabancılar İçin Türkçe','Hitit Yabancılar İçin Türkçe','Türkçe Öğrenelim','Türkçe Konuşalım',
    'Türkçe Öğreniyorum','Türkçe Dil Bilgisi','Yabancılar İçin Türkçe Dilbilgisi','Turkish in Three Months',
    'Colloquial Turkish','Complete Turkish','Teach Yourself Turkish','Turkish for Beginners','TYS Sınav Hazırlık',
    'Türkçe Yeterlik Sınavı Hazırlık','TÖMER Sınav Hazırlık Kitapları','Yedi İklim Türkçe Sınav Hazırlık',
    'İstanbul Türkçe Çalışma Kitabı','Türkçe Öğreniyorum A1','Türkçe Öğreniyorum A2','Türkçe Öğreniyorum B1',
  ],
  German: [
    'Menschen','Schritte international Neu','Netzwerk neu','Pluspunkt Deutsch','Studio 21','Sicher!','Aspekte neu',
    'Begegnungen','Erkundungen','Motive','Linie 1','Grammatik aktiv','Deutsch üben','Themen aktuell','Spektrum Deutsch',
    'Momente','Weitblick','Mittelpunkt','Berliner Platz','Passwort Deutsch','Ja genau!','Schritte plus Neu','Netzwerk',
    'Fit fürs Goethe-Zertifikat','Mit Erfolg zum Goethe-Zertifikat','Prüfungstraining Goethe-Zertifikat',
    'telc Deutsch Prüfungstraining','TestDaF Training','Fit fürs DSH','Mit Erfolg zum TestDaF','Prüfung Express',
    'Grammatik ganz klar!','Übungsgrammatik für die Grundstufe','Mit Erfolg zu telc Deutsch B2','Prüfungstraining DaF',
  ],
  Portuguese: [
    'Português XXI','Passaporte para Português','Português em Foco','Aprender Português','Novo Avenida Brasil',
    'Falar... Ler... Escrever... Português','Bem-Vindo! A Língua Portuguesa no Mundo da Comunicação','Muito Prazer',
    'Ponto de Encontro','Gramática Ativa','Português Atual','Lusofonia',
  ],
};

const LANGUAGE_ALIASES: Record<string, keyof typeof CURRICULA_BY_LANGUAGE> = {
  en: 'English', english: 'English', 'الإنجليزية': 'English', 'الانجليزية': 'English', 'إنجليزية': 'English', 'انجليزية': 'English',
  fr: 'French', french: 'French', 'الفرنسية': 'French', 'فرنسية': 'French',
  ru: 'Russian', russian: 'Russian', 'الروسية': 'Russian', 'روسية': 'Russian',
  tr: 'Turkish', turkish: 'Turkish', 'التركية': 'Turkish', 'تركية': 'Turkish',
  de: 'German', german: 'German', 'الألمانية': 'German', 'الالمانية': 'German', 'ألمانية': 'German', 'المانية': 'German',
  pt: 'Portuguese', portuguese: 'Portuguese', 'البرتغالية': 'Portuguese', 'برتغالية': 'Portuguese',
};

export function curriculumLanguage(title?: string, code?: string): keyof typeof CURRICULA_BY_LANGUAGE | undefined {
  const normalize=(value?:string)=>String(value??'').trim().toLowerCase().normalize('NFC');
  return LANGUAGE_ALIASES[normalize(code)] ?? LANGUAGE_ALIASES[normalize(title)];
}
