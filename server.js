import express from "express";
import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

// Dynamic import of ChatGPT automation (requires Puppeteer — only works locally)
let ChatGPTAutomation = null;
try {
  const mod = await import("./chatgpt-automation.js");
  ChatGPTAutomation = mod.ChatGPTAutomation;
} catch {
  console.log("⚠️  ChatGPT 자동화 모듈 로드 실패 (Puppeteer 없음) — 수동 모드로 실행합니다.");
}

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));

const PORT = process.env.PORT || 8787;

const InstagramVersionSchema = z.object({
  caption: z.string(),
  hashtags: z.string(),
  alt_text: z.string()
});

const NaverVersionSchema = z.object({
  title: z.string(),
  body: z.string(),
  hashtags: z.string()
});

const WordPressVersionSchema = z.object({
  seo: z.object({
    seo_title: z.string(),
    slug: z.string(),
    meta_description: z.string(),
    focus_keyphrase: z.string(),
    lsi_keywords: z.array(z.string())
  }),
  body: z.string()
});

const ThreadsVersionSchema = z.object({
  text: z.string(),
  hashtags: z.string(),
  alt_text: z.string().optional().default("")
});

function buildOutputSchema(variantCount) {
  return z.object({
    instagram: z.object({
      versions: z.array(InstagramVersionSchema).length(variantCount)
    }),
    naver: z.object({
      versions: z.array(NaverVersionSchema).length(variantCount)
    }),
    wordpress: z.object({
      versions: z.array(WordPressVersionSchema).length(variantCount)
    }),
    threads: z.object({
      versions: z.array(ThreadsVersionSchema).length(variantCount)
    })
  });
}

function parseVariantCount(raw) {
  const parsed = parseInt((raw ?? 1).toString(), 10);
  return parsed === 2 ? 2 : 1;
}

function parseSeoLevel(raw) {
  return raw === "strong" ? "strong" : "balanced";
}

function parseKeywordIntent(raw) {
  const allowed = ["정보형", "구매형", "브랜드형"];
  return allowed.includes(raw) ? raw : "정보형";
}

function parseKeywordMentions(raw) {
  const allowed = ["2-3", "3-5", "5-7"];
  return allowed.includes(raw) ? raw : "3-5";
}

function parsePreferredFormat(raw) {
  return (raw || "").toString().trim();
}

function toPayload(body) {
  return {
    topic: (body.topic || "").toString().trim(),
    story: (body.story || "").toString().trim(),
    preferredFormat: parsePreferredFormat(body.format),
    variantCount: parseVariantCount(body.variants),
    brandName: (body.brandName || "").toString().trim(),
    productName: (body.productName || "").toString().trim(),
    category: (body.category || "").toString().trim(),
    focusKeyword: (body.focusKeyword || "").toString().trim(),
    lsiKeywords: Array.isArray(body.lsiKeywords)
      ? body.lsiKeywords
      : (body.lsiKeywords || "")
        .toString()
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    mustInclude: (body.mustInclude || "").toString().trim(),
    cta: (body.cta || "").toString().trim(),
    seoLevel: parseSeoLevel((body.seoLevel || "").toString().trim()),
    keywordIntent: parseKeywordIntent((body.keywordIntent || "").toString().trim()),
    keywordMentions: parseKeywordMentions((body.keywordMentions || "").toString().trim()),
    targetAudience: (body.targetAudience || "").toString().trim(),
    includeFaq: Boolean(body.includeFaq)
  };
}

function buildSystemPrompt() {
  return `너는 1인 자영업자 브랜드의 콘텐츠 에디터다.
이 브랜드는 "디자이너가 직접 만들고, 직접 판매하는" 정체성을 가진다.
주요 라인은 (1) 베이커리(빵/디저트) (2) 디자이너 브랜드 가방(자체 제작/핸드메이드)이다.

사용자가 준 ‘내 이야기(원문)’를 바탕으로, 같은 사실을 유지하면서 채널별(Instagram/Naver Blog/WordPress)로 문체와 구조를 달리한 글을 생성한다.
요청된 경우 각 채널마다 A/B 2가지 버전(versions 배열)을 만든다.

[공통 규칙]
- 절대 사실을 지어내지 마라. 사용자가 제공하지 않은 정보(가격/할인/마감/배송/원산지/재료/알레르기/성분/효능/수치/기간/인증/지점/연락처/소재/가죽 종류/부자재 스펙 등)는 추측하지 말고 [빈칸]으로 둬라.
- 과장/허위/단정 표현(“최고/유일/100%/완벽/무조건”)은 피하라.
- 광고 문장처럼 딱딱하게 쓰지 말고, ‘사장 일기’처럼 자연스럽게.
- 톤은 B: 친근하지만 과하지 않게, 살짝 위트(1~2번 정도) + 솔직함.
- “살짝 허당”은 OK. 단, 자기연민/징징/남탓/비꼼은 금지.
- 글에는 “디자이너가 직접 만든다”는 감각(손길/디테일/고민/시행착오)이 느껴지게 하되, 원문에 없는 디테일을 만들어내지 마라.
- instagram/naver/wordpress 각각에 versions 배열을 채운다. versions 개수는 사용자 지정과 정확히 일치해야 한다.
- 응답은 반드시 JSON 객체 1개만 출력한다.
- 코드펜스(\`\`\`)와 설명문을 붙이지 않는다.
- JSON 값에 템플릿용 값("string", "<...>", "example")을 넣지 않는다.
- instagram/naver/wordpress/threads 각각에 versions 배열을 채운다. versions 개수는 사용자 지정과 정확히 일치해야 한다.

[라인 선택 규칙(베이커리/가방)]
- 원문/제품명/카테고리를 보고 어떤 라인인지 판단해 그 라인에 맞게 쓴다.
- 베이커리: 작업 흐름(반죽/굽기/진열/손님 반응/마감 루틴)과 감각(향/식감)은 ‘원문에 있는 만큼만’ 사용.
- 가방: 디자인/패턴/재단/봉제/착용감/수납 등 디테일은 ‘원문에 있는 만큼만’ 사용.
- 두 라인이 모두 언급되면 “하루 루틴”으로 자연스럽게 연결하되, 억지 연결 금지.

[해시태그 공통 규칙: “강력한 3개만”]
- 각 채널의 hashtags는 반드시 해시태그 3개만 제공한다(정확히 3개).
- 공백으로 구분하며, 모두 #로 시작.
- 한글/영문 혼합: 3개 중 최소 1개는 영문(예: #bakery, #designerbag, #handmade).
- 원문과 무관한 과장 키워드/허위 키워드 금지.

[Instagram 규칙]
- 목표: 스크롤 멈추는 캡션. 친구에게 얘기하듯, 솔직+살짝 허당+위트.
- 형식: 첫 줄 훅 1줄 → 짧은 문장+줄바꿈 → 마지막 질문 CTA 1개.
- 이모지: 0~3개.
- hashtags: 위 공통 규칙대로 3개만. 브랜드/제품/상황 중심.
- alt_text: 과장 없는 사진 설명 1줄.

[Naver Blog 규칙]
- 반드시 아래 블로그 지침서 톤을 우선 적용한다.
- 길이: “중간” 템포(대략 9~14문단, 문단당 1~2문장 느낌).
- 흐름: 오늘 겪은 일 → 시행착오/작은 깨달음 → 독자에게 질문 CTA → 다음 이야기 예고(여운).
- 내 이야기를 리얼하게, 살짝 허당스럽게 쓴다(실수/아쉬움 가능).
- 단, 자기연민 금지. "나도 이런 실수함" 느낌으로 처리한다.
- 고객 대상 문구보다 친구에게 말하듯 대화체로 쓴다.
- 짧은 문장 + 잦은 줄바꿈 + 이모지/해시태그를 적절히 섞는다.
- 인간미+위트+MZ감성+솔직함을 살린다.
- 본문 마지막은 질문형 CTA로 끝내고, "다음 이야기도 기대해요" 느낌을 넣는다.
- 시리즈로 이어질 수 있는 여운(다음 화 예고 톤)을 남긴다.
- title/body/hashtags를 분리 제공한다.

[WordPress 규칙]
- 에피소드형 글 흐름: 인트로(오늘 하루 시작) → 본론(자연스러운 제품/브랜드 연결) → 정보(필요한 만큼만) → 마무리(소통/공감).
- 문체: 친구한테 말하듯, 살짝 허당+솔직함, 인간미+위트. 너무 상업적으로 쓰지 않는다.
- 책처럼 매끄럽게 읽히되, 중간중간 사장 일기 톤으로 가볍게 끊어준다(예: "솔직히 말하면…", "저도 그게 궁금했거든요", "ㅋㅋ").
- 문단은 3~4줄 내외 분량으로 쓰고, 문단 내 줄바꿈은 금지한다. 문단 간에는 빈 줄 1개를 둔다.
- H1은 사용하지 않는다(워드프레스 제목이 자동 H1). H2는 주요 정보 구간(핵심 키워드 포함), H3~H4는 연관 키워드/상세 정보용으로 사용한다.
- 동일한 문구의 H태그를 반복하지 않는다.
- 글 끝에는 따뜻한 인사 + 브랜드 철학 한 줄 + 다음 이야기 예고를 자연스럽게 넣고, 마지막 문단은 반드시 질문으로 끝낸다.
- 마지막 줄은 해시태그 한 줄로 마무리한다.

[WordPress SEO 패키지]
- seo_title, slug, meta_description(120~155자), focus_keyphrase, lsi_keywords(6~10개)를 반드시 제공한다.
- Yoast/Rank Math 기준으로 제목/메타/슬러그를 최적화한다.
- 본문 및 소제목에 핵심 키워드+연관 키워드(LSI)를 자연스럽게 배치하고 도배는 금지한다.

[Threads 규칙]
- 목표: 각잡고 쓴 티가 나지 않는, 지금 막 생각난 듯한 가벼운 텍스트.
- 길이: 1~3문장 내외로 매우 짧게 쓴다. 문단 나누기(줄바꿈)를 적극 활용한다.
- 문체: 친한 지인에게 말하듯 편안하고 무심한 '반말(~했어, ~함, ~할까?)'을 사용한다.
- 태도(가장 중요): 절대 자랑하거나 과시하는 톤(예: "나 천재인가봐", "너무 완벽해")은 금지한다. 담백하고 겸손하게, 때론 혼자 일하는 1인 자영업자의 고충이나 '살짝 허당'스러운 면모를 솔직하게 드러낸다.
- 내용: 원문 전체를 요약하려 하지 말고, 딱 하나의 포인트(예: 일정 지연 핑계, 샘플 완성, 혼자 일하는 막막함 등)만 골라 툭 던진다.
- 해시태그: (공통 규칙 예외) 쓰레드는 반드시 딱 2개만 쓴다. (예: #작업일기 #신제품준비)
- 버전 차별화:
  - versions[0] (A버전 - 일상/고민형): 텍스트 위주. 혼자 일하며 느끼는 푸념, 고민, 솔직한 감정을 툭 던지는 톤.
  - versions[1] (B버전 - 스포일러형): 작업물 사진이나 스케치 사진 1장과 함께 올리는 상황. 시각적 스포일러와 함께 약간의 기대감을 남기는 톤. (alt_text 포함)

[업그레이드 규칙 v2.1 - 아래 규칙이 위 규칙보다 우선한다]
- (브랜드 콘텍스트) 이 브랜드는 "디자이너가 직접 만들고 판매하는" 정체성이 있다.
  - 라인 A: 베이커리(빵/디저트)
  - 라인 B: 디자이너 브랜드 가방(자체 제작/핸드메이드)
  - 원문/제품명/카테고리를 보고 어떤 라인인지 판단해 그 라인에 맞는 어휘를 사용한다.
  - 원문에 없는 디테일(재료/공정/소재 스펙/가격/마감/배송/효능 등)은 절대 추가하지 말고 [빈칸] 처리한다.
- (출력 안정성) JSON은 반드시 "완전한 유효 JSON"이어야 한다.
  - 최상단 키는 정확히 instagram, naver, wordpress, threads 4개만 사용한다(다른 키 금지).
  - 문자열/키는 큰따옴표만 사용한다. trailing comma 금지.
- (줄바꿈 규칙 - 매우 중요) JSON 문자열 값 안에는 "실제 개행(엔터)"을 넣지 마라.
  - 줄바꿈이 필요하면 반드시 "\\n" 또는 "\\n\\n" 으로 표현한다.
  - 예: 문단 사이 빈 줄 = "\\n\\n"
- (해시태그 규칙 업그레이드) 해시태그는 instagram/naver/wordpress는 "강력한 3개만", threads는 "딱 2개만" 제공한다. (기존 8~15개 규칙보다 우선)
  - instagram/naver/wordpress: 정확히 3개, 공백으로만 구분, 줄바꿈 금지.
  - threads: 정확히 2개, 공백으로만 구분, 줄바꿈 금지.
  - 3개 중 최소 1개는 한글, 최소 1개는 영문(쓰레드는 2개 중에서).
  - 가능하면 1개는 브랜드명(입력된 경우)을 태그로 반영하되, 개수 규칙은 절대 넘기지 마라.
- (WordPress 헤딩 표기 업그레이드) WordPress 본문 소제목(H2/H3/H4)은 Markdown(##/###)이 아니라 HTML 태그로 작성한다.
  - <h2>...</h2>, <h3>...</h3>, <h4>...</h4>
  - 최소 2개 이상의 <h2> 사용을 권장한다.
- (WordPress slug 규칙 업그레이드) slug는 영문 소문자 + 숫자 + 하이픈(-)만 허용한다.
  - 공백/특수문자/한글 금지, 60자 내 권장.
- (네이버 길이 가이드) 네이버 body는 "중간 길이" 템포로 쓴다(대략 9~14문단, 문단당 1~2문장 느낌).
- (A/B 버전 차별화 강화) B버전은 A와 "도입 훅 + 전개 순서 + 마무리 질문"이 확실히 달라야 한다.
  - 예: A=작업 비하인드(제작 과정) / B=고객 반응(판매/문의/실수담)
  - 예: A=문제→해결 / B=해결→깨달음

`;
}

function buildSeoInstruction(payload) {
  const mentionsText = payload.keywordMentions || "3-5";
  const h2Need = payload.seoLevel === "strong" ? "H2에서 2회 이상" : "H2에서 1회 이상";
  const metaNeed =
    payload.seoLevel === "strong"
      ? "meta_description 앞부분(가능하면 80자 이내)에 핵심 키워드를 넣는다"
      : "meta_description에 핵심 키워드를 최소 1회 넣는다";

  return `[SEO 강화 지시]
- SEO 강도: ${payload.seoLevel === "strong" ? "강화형" : "균형형"}
- 키워드 의도: ${payload.keywordIntent}
- 본문 키워드 반복 목표: ${mentionsText}회
- 타겟 독자: ${payload.targetAudience || "[빈칸]"}

- 핵심 키워드: ${payload.focusKeyword || "[미입력]"}
- 핵심 키워드가 주어지면 wordpress.seo.focus_keyphrase에 동일 문구를 그대로 넣는다.
- seo_title에 핵심 키워드를 포함하고 가능하면 앞쪽에 배치한다.
- ${metaNeed}
- 본문 첫 문단에 핵심 키워드를 1회 포함한다.
- 본문 전체에서 핵심 키워드를 자연스럽게 ${mentionsText}회 사용한다.
- ${h2Need} 핵심 키워드(또는 자연스러운 변형)를 포함한다.
- LSI 키워드는 가능한 범위에서 본문 헤딩/본문/SEO 필드에 분산 반영한다.
- 키워드 과다 반복(스팸성)은 피한다.
- 키워드 미입력 시, 주제에서 가장 자연스러운 키워드 1개를 정하되 확신이 없으면 [검토 필요]를 붙인다.
${payload.includeFaq ? "- WordPress 본문에 `### 자주 묻는 질문` 섹션을 추가하고 Q/A 2개를 넣는다." : ""}`;
}

function buildUserPrompt(payload) {
  const lsiLine = payload.lsiKeywords?.length ? payload.lsiKeywords.join(", ") : "[빈칸]";

  return `아래 입력을 참고해 4채널(Instagram, Naver Blog, WordPress, Threads) 글을 만들어줘.

[입력]
- 주제: ${payload.topic || "[빈칸]"}
- 내 이야기(원문):\n"""\n${payload.story || ""}\n"""
- 형식(선호 채널/포맷): ${payload.preferredFormat || "[빈칸]"}
- 버전 개수: ${payload.variantCount}
- 브랜드명: ${payload.brandName || "[빈칸]"}
- 제품명/카테고리: ${payload.productName || "[빈칸]"}
- 제품 분류: ${payload.category || "[빈칸]"}
- 핵심 키워드: ${payload.focusKeyword || "[빈칸]"}
- 연관 키워드: ${lsiLine}
- 꼭 포함할 정보: ${payload.mustInclude || "[빈칸]"}
- CTA 선호: ${payload.cta || "[빈칸]"}

${buildSeoInstruction(payload)}

[블로그 지침서 고정 반영]
- 네이버 블로그는 아래 감성을 반드시 반영:
  1) 리얼한 내 이야기 + 살짝 허당
  2) 공감 질문으로 마무리
  3) 짧은 문장/대화체/해시태그/이모지
  4) 사람/성장/시행착오가 보이게
  5) 마지막 여운은 "다음 이야기도 기대해요"
  6) CTA는 부담 없는 질문형으로 자연스럽게
- 예: "여러분은요?", "저만 이런가요?", "다음엔 OO 이야기 들고 올게요."

[워드프레스 지침서 고정 반영]
- 워드프레스 본문은 반드시 "사장이 하루 있었던 일 → 자연스러운 제품 등장" 흐름을 유지한다.
- 딱딱한 상품 설명문(광고문 톤)은 피하고, 실제 경험/대화/반응 중심으로 쓴다.
- 본문 마지막 문단은 반드시 질문형 문장으로 끝내고, 그 다음 줄에 해시태그 한 줄을 넣는다.
- 소제목(H2/H3/H4)에는 핵심/연관 키워드를 자연스럽게 포함한다.

[쓰레드 지침서 고정 반영]
- 쓰레드는 "지금 막 생각나서 툭 던진" 느낌이 핵심이다.
- 원문 전체를 요약하지 말고 딱 하나의 포인트만 골라서 1~3문장으로 쓴다.
- 반말 사용(~했어, ~함, ~할까?).
- 절대 과시/자랑 금지. 담백하고 겸손하게.
- A버전: 텍스트만. 혼자 일하는 푸념/고민/감정. B버전: 작업물 사진 1장과 함께 올리는 상황(alt_text 포함).
- 해시태그는 정확히 2개만.

[형식 우선 반영]
- 형식 값이 입력되면 해당 톤(블로그/인스타/카드뉴스/릴스)을 더 강하게 반영하되, 4채널 결과는 모두 생성한다.

[버전 차별화]
- versions[0]은 A 버전(기본 톤), versions[1]은 B 버전(다른 훅/전개)으로 작성한다.
- 두 버전은 사실은 같되 표현/구조/도입이 충분히 달라야 한다.`;
}

function buildJsonFormatGuide(variantCount) {
  const versionGuide = variantCount === 2 ? "2개(A/B)" : "1개";

  return `[출력 형식]
- JSON 객체 하나만 출력.
- 각 채널 versions 길이: ${versionGuide}
- 아래 구조와 동일한 키를 사용.

{
  "instagram": {
    "versions": [
      {
        "caption": "실제 인스타 캡션 내용",
        "hashtags": "실제 해시태그 줄",
        "alt_text": "실제 ALT 텍스트"
      }
    ]
  },
  "naver": {
    "versions": [
      {
        "title": "실제 네이버 제목",
        "body": "실제 네이버 본문",
        "hashtags": "실제 해시태그 줄"
      }
    ]
  },
  "wordpress": {
    "versions": [
      {
        "seo": {
          "seo_title": "실제 SEO 제목",
          "slug": "actual-slug",
          "meta_description": "실제 메타 설명",
          "focus_keyphrase": "실제 핵심 키워드",
          "lsi_keywords": ["실제 LSI 1", "실제 LSI 2"]
        },
        "body": "실제 워드프레스 본문"
      }
    ]
  },
  "threads": {
    "versions": [
      {
        "text": "실제 쓰레드 텍스트 (1~3문장, 반말, 가벼운 톤)",
        "hashtags": "#해시태그1 #해시태그2",
        "alt_text": "B버전(스포일러형)일 경우 사진 설명, A버전은 빈 문자열"
      }
    ]
  }
}`;
}

function normalizeHashtagLine(line) {
  if (!line) return "";
  return line.replace(/\s*\n\s*/g, " ").trim();
}

function extractJsonObject(raw) {
  const text = (raw || "").toString().trim();
  if (!text) {
    throw new Error("붙여넣은 결과가 비어 있어요.");
  }

  const tryParse = (value) => {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  };

  const direct = tryParse(text);
  if (direct) return direct;

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = tryParse(fenced[1].trim());
    if (parsed) return parsed;
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const sliced = text.slice(firstBrace, lastBrace + 1);
    const parsed = tryParse(sliced);
    if (parsed) return parsed;
  }

  throw new Error("JSON 파싱에 실패했어요. ChatGPT 출력 전체를 그대로 붙여넣어 주세요.");
}

function assertNoTemplateValues(parsed) {
  const badPaths = [];
  const exactBad = new Set(["string", "<string>", "example", "sample"]);

  const walk = (value, path = []) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      const normalized = trimmed.toLowerCase();
      if (exactBad.has(normalized) || /^<[^>]+>$/.test(trimmed)) {
        badPaths.push(path.join("."));
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((v, i) => walk(v, [...path, `[${i}]`]));
      return;
    }

    if (value && typeof value === "object") {
      Object.entries(value).forEach(([k, v]) => walk(v, [...path, k]));
    }
  };

  walk(parsed);

  if (badPaths.length > 0) {
    throw new Error(
      "샘플 템플릿 값(string/<...>)이 포함돼 있어요. ChatGPT에서 실제 문장으로 다시 생성해 주세요."
    );
  }
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    mode: "chatgpt-subscription",
    seo: "enhanced",
    automationAvailable: ChatGPTAutomation !== null
  });
});

app.post("/api/prompt", (req, res) => {
  try {
    const payload = toPayload(req.body || {});

    if (!payload.story) {
      return res.status(400).json({ error: "‘내 이야기’가 비어 있어요. 한 줄 이상 적어주세요." });
    }

    const prompt = [
      buildSystemPrompt(),
      buildUserPrompt(payload),
      buildJsonFormatGuide(payload.variantCount)
    ].join("\n\n");

    res.json({
      prompt,
      variantCount: payload.variantCount
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "프롬프트 생성 중 오류가 발생했어요." });
  }
});

app.post("/api/parse", (req, res) => {
  try {
    const body = req.body || {};
    const variantCount = parseVariantCount(body.variants);
    const raw = (body.raw || "").toString();

    const parsedObject = extractJsonObject(raw);
    const schema = buildOutputSchema(variantCount);
    const parsed = schema.parse(parsedObject);

    assertNoTemplateValues(parsed);

    for (const v of parsed.instagram.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }
    for (const v of parsed.naver.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }
    for (const v of parsed.threads.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }

    res.json(parsed);
  } catch (err) {
    const message = err?.issues?.[0]?.message || err?.message || "결과 검증 중 오류가 발생했어요.";
    res.status(400).json({ error: message });
  }
});

// ===== Auto-Generate via Puppeteer (SSE streaming) =====
app.post("/api/auto-generate", async (req, res) => {
  // Check if automation is available (Puppeteer required)
  if (!ChatGPTAutomation) {
    return res.status(503).json({
      error: "자동 생성은 로컬 환경에서만 사용 가능합니다. 수동 모드(프롬프트 복사 → ChatGPT 붙여넣기)를 이용해주세요."
    });
  }

  // Set up SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const send = (obj) => {
    res.write(`data: ${JSON.stringify(obj)}\n\n`);
  };

  try {
    const { prompt, variants } = req.body || {};

    if (!prompt) {
      send({ type: "error", message: "프롬프트가 비어 있어요." });
      res.end();
      return;
    }

    const automation = new ChatGPTAutomation();

    automation.on("log", (msg) => {
      send({ type: "log", message: msg });
    });

    automation.on("progress", (percent) => {
      send({ type: "progress", percent });
    });

    send({ type: "log", message: "ChatGPT 자동화 시작…" });

    const responseText = await automation.run(prompt);

    send({ type: "log", message: "응답 텍스트 파싱 중…" });
    send({ type: "progress", percent: 95 });

    // Parse the response JSON
    const parsedObject = extractJsonObject(responseText);
    const variantCount = parseVariantCount(variants);
    const schema = buildOutputSchema(variantCount);
    const parsed = schema.parse(parsedObject);

    assertNoTemplateValues(parsed);

    for (const v of parsed.instagram.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }
    for (const v of parsed.naver.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }
    for (const v of parsed.threads.versions) {
      v.hashtags = normalizeHashtagLine(v.hashtags);
    }

    send({ type: "result", data: parsed });
    send({ type: "progress", percent: 100 });
  } catch (err) {
    const message =
      err?.issues?.[0]?.message ||
      err?.message ||
      "자동 생성 중 오류가 발생했어요.";
    send({ type: "error", message });
  } finally {
    res.end();
  }
});

const HOST = process.env.HOST || "0.0.0.0";

app.listen(PORT, HOST, () => {
  console.log(`\n✅ OneClick Writer (subscription mode) running on http://${HOST}:${PORT}`);
});
