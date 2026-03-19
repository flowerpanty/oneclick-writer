import crypto from "node:crypto";

import { getApiAvailability, getNaverConfig } from "./env.js";

function decodeHtmlEntities(value = "") {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&nbsp;", " ");
}

function stripHtmlTags(value = "") {
  return decodeHtmlEntities(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function formatPostDate(rawDate = "") {
  if (!/^\d{8}$/.test(rawDate)) {
    return rawDate;
  }

  return `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
}

function cleanSearchItem(item) {
  return {
    title: stripHtmlTags(item.title),
    description: stripHtmlTags(item.description),
    link: item.link,
    bloggerName: item.bloggername || "",
    cafeName: item.cafename || "",
    postDate: formatPostDate(item.postdate || "")
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`HTTP ${response.status}: ${body.slice(0, 400)}`);
  }

  return response.json();
}

function buildSearchUrl(endpoint, parameters) {
  const config = getNaverConfig();
  const baseUrl = `${config.searchBaseUrl.replace(/\/$/, "")}/`;
  const url = new URL(endpoint, baseUrl);

  for (const [key, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

async function fetchSearchEndpoint(endpoint, parameters) {
  const config = getNaverConfig();
  const url = buildSearchUrl(endpoint, parameters);

  return fetchJson(url, {
    headers: {
      "X-Naver-Client-Id": config.searchClientId,
      "X-Naver-Client-Secret": config.searchClientSecret
    }
  });
}

function extractMetaValue(html = "", property) {
  const expression = new RegExp(
    `<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const match = html.match(expression);
  return match ? decodeHtmlEntities(match[1]).trim() : "";
}

function extractMeaningfulParagraphs(html = "") {
  const snippets = [];
  const paragraphPatterns = [
    /<p[^>]*class="[^"]*se-text-paragraph[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    /<p[^>]*>([\s\S]*?)<\/p>/gi,
    /<div[^>]*class="[^"]*se-module-text[^"]*"[^>]*>([\s\S]*?)<\/div>/gi
  ];

  for (const pattern of paragraphPatterns) {
    let match = pattern.exec(html);

    while (match) {
      const text = stripHtmlTags(match[1]);

      if (text.length >= 30 && !snippets.includes(text)) {
        snippets.push(text);
      }

      if (snippets.length >= 8) {
        return snippets;
      }

      match = pattern.exec(html);
    }
  }

  if (snippets.length > 0) {
    return snippets;
  }

  const plainText = stripHtmlTags(html);
  return plainText ? plainText.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0, 6) : [];
}

async function fetchBlogBody(item) {
  const response = await fetch(item.link, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`블로그 본문 조회 실패: ${response.status}`);
  }

  const html = await response.text();
  const paragraphs = extractMeaningfulParagraphs(html);
  const metaTitle = extractMetaValue(html, "og:title");
  const metaDescription = extractMetaValue(html, "og:description");

  return {
    title: metaTitle || item.title,
    link: item.link,
    summary: metaDescription || item.description,
    body_preview:
      paragraphs.join("\n\n").slice(0, 1600) || metaDescription || item.description || "",
    extracted_paragraphs: paragraphs.slice(0, 5)
  };
}

function buildSearchAdHeaders(method, uri) {
  const config = getNaverConfig();
  const timestamp = Date.now().toString();
  const signature = crypto
    .createHmac("sha256", config.searchAdSecretKey)
    .update(`${timestamp}.${method}.${uri}`)
    .digest("base64");

  return {
    "X-Timestamp": timestamp,
    "X-API-KEY": config.searchAdAccessLicense,
    "X-Customer": config.searchAdCustomerId,
    "X-Signature": signature
  };
}

function getRecentMonthDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 6);

  const format = (value) => value.toISOString().slice(0, 10);

  return {
    startDate: format(startDate),
    endDate: format(endDate)
  };
}

function buildSearchAdHintCandidates(topic) {
  const normalized = String(topic || "").replace(/\s+/g, " ").trim();
  const compact = normalized.replace(/\s+/g, "");
  const words = normalized.split(" ").filter(Boolean);
  const candidates = new Set();

  if (normalized) {
    candidates.add(normalized);
  }

  if (compact && compact !== normalized) {
    candidates.add(compact);
  }

  if (words.length >= 2) {
    candidates.add(words.slice(0, 2).join(""));
    candidates.add(words.slice(-2).join(""));
  }

  words.forEach((word) => {
    if (word.length >= 2) {
      candidates.add(word);
    }
  });

  if (words.length >= 2) {
    for (let index = 0; index < words.length - 1; index += 1) {
      candidates.add(`${words[index]}${words[index + 1]}`);
    }
  }

  return [...candidates].slice(0, 5);
}

function formatTrendData(results = []) {
  return results.flatMap((group) =>
    (group.data || []).map((entry) => ({
      period: entry.period,
      ratio: entry.ratio
    }))
  );
}

export async function searchBlog(topic) {
  const data = await fetchSearchEndpoint("blog.json", {
    query: topic,
    display: 30,
    start: 1,
    sort: "date"
  });

  return {
    total: data.total || 0,
    items: (data.items || []).map(cleanSearchItem)
  };
}

export async function searchCafe(topic) {
  const data = await fetchSearchEndpoint("cafearticle.json", {
    query: topic,
    display: 30,
    start: 1,
    sort: "date"
  });

  return {
    total: data.total || 0,
    items: (data.items || []).map(cleanSearchItem)
  };
}

export async function fetchBlogBodiesFromSearch(blogItems = []) {
  const settled = await Promise.allSettled(blogItems.slice(0, 3).map(fetchBlogBody));

  return settled
    .filter((result) => result.status === "fulfilled")
    .map((result) => result.value);
}

export async function fetchSearchAdKeywords(topic) {
  const config = getNaverConfig();
  const uri = "/keywordstool";
  const candidates = buildSearchAdHintCandidates(topic);
  let lastError = null;

  for (const candidate of candidates) {
    const url = new URL(`${config.searchAdBaseUrl.replace(/\/$/, "")}${uri}`);
    url.searchParams.set("hintKeywords", candidate);
    url.searchParams.set("showDetail", "1");

    try {
      const data = await fetchJson(url, {
        headers: buildSearchAdHeaders("GET", uri)
      });

      const keywordList = data.keywordList || [];

      if (keywordList.length > 0) {
        return keywordList.slice(0, 50).map((item) => ({
          keyword: item.relKeyword || item.keyword || "",
          monthly_pc_searches: item.monthlyPcQcCnt ?? "",
          monthly_mobile_searches: item.monthlyMobileQcCnt ?? "",
          competition_index: item.compIdx ?? "",
          monthly_pc_clicks: item.monthlyAvePcClkCnt ?? "",
          monthly_mobile_clicks: item.monthlyAveMobileClkCnt ?? "",
          source_hint: candidate
        }));
      }
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("검색광고 API 키워드 수집에 실패했습니다.");
}

export async function fetchDataLabTrend(topic) {
  const config = getNaverConfig();
  const { startDate, endDate } = getRecentMonthDateRange();
  const url = "https://openapi.naver.com/v1/datalab/search";

  const data = await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Naver-Client-Id": config.dataLabClientId,
      "X-Naver-Client-Secret": config.dataLabClientSecret
    },
    body: JSON.stringify({
      startDate,
      endDate,
      timeUnit: "month",
      keywordGroups: [
        {
          groupName: topic,
          keywords: [topic]
        }
      ]
    })
  });

  return {
    startDate,
    endDate,
    timeUnit: data.timeUnit || "month",
    series: formatTrendData(data.results || [])
  };
}

export async function collectResearchData(topic) {
  const availability = getApiAvailability();
  const warnings = [];
  const result = {
    generated_at: new Date().toISOString(),
    topic,
    period: "최근 6개월 우선",
    blog_search: {
      total: 0,
      items: []
    },
    blog_bodies: [],
    cafe_search: {
      total: 0,
      items: []
    },
    ad_keywords: [],
    datalab_trend: {
      startDate: "",
      endDate: "",
      timeUnit: "month",
      series: []
    },
    source_status: availability
  };

  if (availability.searchApi) {
    const [blogSearchResult, cafeSearchResult] = await Promise.allSettled([
      searchBlog(topic),
      searchCafe(topic)
    ]);

    if (blogSearchResult.status === "fulfilled") {
      result.blog_search = blogSearchResult.value;
      result.blog_bodies = await fetchBlogBodiesFromSearch(blogSearchResult.value.items);
    } else {
      warnings.push(`블로그 검색 실패: ${blogSearchResult.reason.message}`);
    }

    if (cafeSearchResult.status === "fulfilled") {
      result.cafe_search = cafeSearchResult.value;
    } else {
      warnings.push(`카페 검색 실패: ${cafeSearchResult.reason.message}`);
    }
  } else {
    warnings.push("네이버 검색 API 설정이 없어 블로그/카페 데이터를 수집하지 못했습니다.");
  }

  if (availability.searchAdApi) {
    try {
      result.ad_keywords = await fetchSearchAdKeywords(topic);
    } catch (error) {
      warnings.push(`검색광고 키워드 수집 실패: ${error.message}`);
    }
  } else {
    warnings.push("네이버 검색광고 API 설정이 없어 연관 키워드를 수집하지 못했습니다.");
  }

  if (availability.dataLabApi) {
    try {
      result.datalab_trend = await fetchDataLabTrend(topic);
    } catch (error) {
      warnings.push(`데이터랩 트렌드 수집 실패: ${error.message}`);
    }
  } else {
    warnings.push("네이버 데이터랩 API 설정이 없어 검색 트렌드를 수집하지 못했습니다.");
  }

  result.scope = {
    blog_titles_count: result.blog_search.items.length,
    blog_bodies_count: result.blog_bodies.length,
    cafe_count: result.cafe_search.items.length,
    ad_keywords_count: result.ad_keywords.length
  };
  result.warnings = warnings;

  return result;
}
