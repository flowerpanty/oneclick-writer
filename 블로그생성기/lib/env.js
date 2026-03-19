import fs from "node:fs";
import path from "node:path";

function parseEnvValue(value) {
  const trimmed = value.trim();

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseEnv(content) {
  return content.split(/\r?\n/).reduce((accumulator, rawLine) => {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);

    if (key) {
      accumulator[key] = parseEnvValue(value);
    }

    return accumulator;
  }, {});
}

export function loadEnvFile(filePath = path.resolve(process.cwd(), ".env")) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const content = fs.readFileSync(filePath, "utf8");
  return parseEnv(content);
}

const fileEnv = loadEnvFile();

for (const [key, value] of Object.entries(fileEnv)) {
  if (!(key in process.env)) {
    process.env[key] = value;
  }
}

export function getEnv(name, fallback = "") {
  return process.env[name] ?? fallback;
}

export function getNaverConfig() {
  return {
    port: Number.parseInt(getEnv("PORT", "3217"), 10),
    host: getEnv("HOST", "127.0.0.1"),
    searchClientId: getEnv("NAVER_CLIENT_ID"),
    searchClientSecret: getEnv("NAVER_CLIENT_SECRET"),
    dataLabClientId: getEnv("NAVER_DATALAB_CLIENT_ID") || getEnv("NAVER_CLIENT_ID"),
    dataLabClientSecret:
      getEnv("NAVER_DATALAB_CLIENT_SECRET") || getEnv("NAVER_CLIENT_SECRET"),
    searchAdCustomerId: getEnv("NAVER_SEARCHAD_CUSTOMER_ID"),
    searchAdAccessLicense: getEnv("NAVER_SEARCHAD_ACCESS_LICENSE"),
    searchAdSecretKey: getEnv("NAVER_SEARCHAD_SECRET_KEY"),
    searchBaseUrl:
      getEnv("NAVER_SEARCH_BASE_URL") || "https://openapi.naver.com/v1/search",
    searchAdBaseUrl:
      getEnv("NAVER_SEARCHAD_BASE_URL") || "https://api.searchad.naver.com"
  };
}

export function getApiAvailability() {
  const config = getNaverConfig();

  return {
    searchApi: Boolean(config.searchClientId && config.searchClientSecret),
    dataLabApi: Boolean(config.dataLabClientId && config.dataLabClientSecret),
    searchAdApi: Boolean(
      config.searchAdCustomerId &&
        config.searchAdAccessLicense &&
        config.searchAdSecretKey
    )
  };
}
