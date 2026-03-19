import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getApiAvailability, getNaverConfig } from "./lib/env.js";
import { collectResearchData } from "./lib/naver-api.js";
import {
  buildResearchAnalysisPrompt,
  buildStep1Prompt,
  buildStep2Prompt,
  buildStep3Prompt
} from "./lib/prompt-templates.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, "public");
const config = getNaverConfig();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end(payload);
}

function serveStaticFile(requestPath, response, method = "GET") {
  const sanitizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.join(PUBLIC_DIR, sanitizedPath);
  const normalizedPath = path.normalize(filePath);

  if (!normalizedPath.startsWith(PUBLIC_DIR)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  if (!fs.existsSync(normalizedPath) || fs.statSync(normalizedPath).isDirectory()) {
    const fallbackPath = path.join(PUBLIC_DIR, "index.html");
    const html = fs.readFileSync(fallbackPath, "utf8");
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[".html"]
    });
    response.end(method === "HEAD" ? "" : html);
    return;
  }

  const extension = path.extname(normalizedPath);
  const contentType = MIME_TYPES[extension] || "application/octet-stream";
  const file = fs.readFileSync(normalizedPath);
  response.writeHead(200, {
    "Content-Type": contentType
  });
  response.end(method === "HEAD" ? "" : file);
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 2_000_000) {
        reject(new Error("요청 본문이 너무 큽니다."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("JSON 본문을 해석하지 못했습니다."));
      }
    });

    request.on("error", reject);
  });
}

function requireField(value, fieldName) {
  if (!value || !String(value).trim()) {
    throw new Error(`${fieldName} 값을 입력해 주세요.`);
  }
}

function requireNonEmptyPayload(value, fieldName) {
  if (!value) {
    throw new Error(`${fieldName} 값을 입력해 주세요.`);
  }

  if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) {
    throw new Error(`${fieldName} 값을 입력해 주세요.`);
  }
}

async function handleApi(request, response, pathname) {
  if (pathname === "/api/health" && request.method === "GET") {
    sendJson(response, 200, {
      ok: true,
      apiAvailability: getApiAvailability()
    });
    return;
  }

  if (pathname === "/api/research" && request.method === "POST") {
    const body = await parseBody(request);
    requireField(body.topic, "주제");

    const researchData = await collectResearchData(body.topic.trim());
    sendJson(response, 200, {
      ok: true,
      researchData
    });
    return;
  }

  if (pathname === "/api/prompts/step1" && request.method === "POST") {
    const body = await parseBody(request);
    requireField(body.topic, "주제");
    requireField(body.intent, "검색의도");
    requireNonEmptyPayload(body.researchData, "수집 데이터");
    requireNonEmptyPayload(body.researchAnalysisResult, "수집 데이터 분석 결과");

    const prompt = buildStep1Prompt({
      topic: body.topic.trim(),
      intent: body.intent.trim(),
      tone: String(body.tone || "").trim(),
      researchData: body.researchData || {},
      researchAnalysisResult: body.researchAnalysisResult || {},
      brandContext: body.brandContext,
      writingGoal: body.writingGoal,
      brandName: body.brandName,
      brandProducts: body.brandProducts,
      brandDescription: body.brandDescription
    });

    sendJson(response, 200, {
      ok: true,
      prompt
    });
    return;
  }

  if (pathname === "/api/prompts/research-analysis" && request.method === "POST") {
    const body = await parseBody(request);
    requireField(body.topic, "주제");
    requireField(body.intent, "검색의도");

    const prompt = buildResearchAnalysisPrompt({
      topic: body.topic.trim(),
      intent: body.intent.trim(),
      researchData: body.researchData || {},
      brandName: body.brandName,
      brandProducts: body.brandProducts,
      brandDescription: body.brandDescription
    });

    sendJson(response, 200, {
      ok: true,
      prompt
    });
    return;
  }

  if (pathname === "/api/prompts/step2" && request.method === "POST") {
    const body = await parseBody(request);
    requireField(body.step1ResultJson, "STEP 1 결과");
    requireField(body.selectedTitle, "선택 제목");

    const prompt = buildStep2Prompt({
      step1ResultJson: body.step1ResultJson,
      topic: body.topic,
      intent: body.intent,
      selectedTitle: body.selectedTitle,
      selectedPackage: body.selectedPackage,
      brandContext: body.brandContext,
      writingGoal: body.writingGoal,
      direction: body.direction,
      targetIntent: body.targetIntent,
      brandName: body.brandName,
      brandProducts: body.brandProducts,
      brandDescription: body.brandDescription
    });

    sendJson(response, 200, {
      ok: true,
      prompt
    });
    return;
  }

  if (pathname === "/api/prompts/step3" && request.method === "POST") {
    const body = await parseBody(request);
    requireField(body.step1ResultJson, "STEP 1 결과");
    requireField(body.step2ResultJson, "STEP 2 결과");

    const prompt = buildStep3Prompt({
      step1ResultJson: body.step1ResultJson,
      step2ResultJson: body.step2ResultJson,
      topic: body.topic,
      intent: body.intent,
      brandName: body.brandName,
      brandProducts: body.brandProducts,
      brandDescription: body.brandDescription,
      ctaMode: body.ctaMode,
      preferredTone: body.preferredTone,
      naverEditorLabel: body.naverEditorLabel
    });

    sendJson(response, 200, {
      ok: true,
      prompt
    });
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "존재하지 않는 API 경로입니다."
  });
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);

    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url.pathname);
      return;
    }

    if (!["GET", "HEAD"].includes(request.method)) {
      sendJson(response, 405, {
        ok: false,
        error: "허용되지 않은 메서드입니다."
      });
      return;
    }

    serveStaticFile(url.pathname, response, request.method);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error.message || "서버 오류가 발생했습니다."
    });
  }
});

server.listen(config.port, config.host, () => {
  console.log(`Naver blog generator is running at http://${config.host}:${config.port}`);
});
