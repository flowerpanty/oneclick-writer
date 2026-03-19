import fs from "node:fs";
import path from "node:path";

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

function readTemplate(fileName) {
  const filePath = path.join(PROMPTS_DIR, fileName);
  return fs.readFileSync(filePath, "utf8");
}

function serializeValue(value) {
  if (typeof value === "string") {
    return value.trim();
  }

  if (value === null || value === undefined) {
    return "";
  }

  return JSON.stringify(value, null, 2);
}

function parseJsonString(value) {
  if (!value || typeof value !== "string") {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildGoogleResearchFallback(researchData) {
  const fallbackPayload =
    researchData?.google_research_result ||
    researchData?.google_search ||
    researchData?.google ||
    null;

  if (fallbackPayload) {
    return fallbackPayload;
  }

  return {
    note: "현재 프로그램은 구글 리서치를 별도로 수집하지 않습니다. 제공된 네이버 리서치 데이터를 중심으로 판단하세요."
  };
}

function fillTemplate(templateName, replacements) {
  let output = readTemplate(templateName);

  for (const [key, value] of Object.entries(replacements)) {
    output = output.replaceAll(`{{${key}}}`, serializeValue(value));
  }

  return output;
}

function buildContextBlock(label, value, note = "") {
  if (value === null || value === undefined || value === "") {
    return "";
  }

  const serialized = serializeValue(value);

  if (!serialized) {
    return "";
  }

  return [
    "---",
    "",
    `## 추가 참고 데이터`,
    "",
    `[${label}]`,
    serialized,
    "",
    note.trim()
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildResearchAnalysisPrompt({
  topic,
  intent,
  researchData,
  brandName,
  brandProducts,
  brandDescription
}) {
  return fillTemplate("research-analysis.txt", {
    topic,
    intent,
    naver_research_result: researchData || {},
    google_research_result: buildGoogleResearchFallback(researchData),
    brand_name: brandName || "[미입력]",
    brand_products: brandProducts || "[미입력]",
    brand_description: brandDescription || "[미입력]"
  });
}

export function buildStep1Prompt({
  topic,
  intent,
  tone,
  researchData,
  researchAnalysisResult,
  brandContext,
  writingGoal,
  brandName,
  brandProducts,
  brandDescription
}) {
  const basePrompt = fillTemplate("step1.txt", {
    topic,
    intent,
    naver_research_result: researchData || {},
    google_research_result: buildGoogleResearchFallback(researchData),
    tone,
    research_data: researchData,
    brand_context: brandContext || "[미입력]",
    writing_goal: writingGoal || "[미입력]",
    brand_name: brandName || "[미입력]",
    brand_products: brandProducts || "[미입력]",
    brand_description: brandDescription || "[미입력]"
  });

  const analysisBlock = buildContextBlock(
    "research_analysis_result",
    researchAnalysisResult,
    [
      "중요:",
      "- STEP 1 패키지를 만들 때는 위 분석 결과의 우선 생성 각도, 피해야 할 각도, 브랜드 연결 포인트를 먼저 반영하라.",
      "- 다만 topic과 intent가 최우선 기준이며, 분석 결과는 이를 돕는 참고 데이터로 사용하라."
    ].join("\n")
  );

  return analysisBlock ? `${basePrompt}\n\n${analysisBlock}` : basePrompt;
}

export function buildStep2Prompt({
  step1ResultJson,
  topic,
  intent,
  selectedTitle,
  selectedPackage,
  brandContext,
  writingGoal,
  direction,
  targetIntent,
  brandName,
  brandDescription,
  brandProducts
}) {
  const parsedStep1 = parseJsonString(step1ResultJson);
  const resolvedPackage =
    selectedPackage ||
    parsedStep1?.packages?.find((item) => item?.title === selectedTitle) ||
    parsedStep1?.titles?.find((item) => item?.title === selectedTitle) ||
    {
      title: selectedTitle || "[미선택]",
      note: "선택 패키지를 찾지 못했습니다. step1_result를 기준으로 재확인하세요."
    };

  return fillTemplate("step2.txt", {
    topic: parsedStep1?.topic || topic || "",
    intent: parsedStep1?.intent || intent || "",
    step1_result: step1ResultJson,
    step1_result_json: step1ResultJson,
    selected_package: resolvedPackage,
    selected_title: selectedTitle,
    brand_context: brandContext || "[미입력]",
    writing_goal: writingGoal || "[미입력]",
    focused_direction: direction || "자동",
    focused_target_intent: targetIntent || "자동",
    brand_name: brandName || "[미입력]",
    brand_products: brandProducts || "[미입력]",
    brand_description: brandDescription || "[미입력]"
  });
}

export function buildStep3Prompt({
  step1ResultJson,
  step2ResultJson,
  topic,
  intent,
  brandName,
  brandProducts,
  brandDescription,
  ctaMode,
  preferredTone,
  naverEditorLabel
}) {
  const parsedStep1 = parseJsonString(step1ResultJson);
  const parsedStep2 = parseJsonString(step2ResultJson);

  return fillTemplate("step3.txt", {
    topic: parsedStep1?.topic || topic || "",
    intent: parsedStep1?.intent || parsedStep2?.intent || intent || "",
    step1_result: step1ResultJson,
    step2_result: step2ResultJson,
    step1_result_json: step1ResultJson,
    step2_result_json: step2ResultJson,
    brand_name: brandName || "[미입력]",
    preferred_tone: preferredTone || "[미입력]",
    naver_editor_label: naverEditorLabel || "✍️ 에디터 노트",
    brand_products: brandProducts || "[미입력]",
    brand_description: brandDescription || "[미입력]",
    cta_mode: ctaMode || "없음"
  });
}
