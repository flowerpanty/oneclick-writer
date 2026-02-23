/**
 * ChatGPT Browser Automation — Remote Debug + Separate Profile
 *
 * Strategy:
 * 1. Copy cookies from user's real Chrome profile to a dedicated profile
 * 2. Launch Chrome directly (not via Puppeteer) with --remote-debugging-port
 * 3. Connect Puppeteer via WebSocket — Cloudflare sees a normal Chrome
 *
 * This bypasses bot detection because Chrome is launched as a normal process.
 */

import puppeteer from "puppeteer-core";
import { EventEmitter } from "events";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEBUGGING_PORT = 9222;
const PROFILE_DIR = path.join(__dirname, "browser-profile");

function findChromePath() {
    const candidates = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

function getRealChromeProfileDir() {
    const home = process.env.HOME || "";
    const candidates = [
        path.join(home, "Library", "Application Support", "Google", "Chrome"),
        path.join(home, "Library", "Application Support", "Google", "Chrome Canary"),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return null;
}

/**
 * Copy Cookies file from real Chrome profile to our dedicated profile
 * so Cloudflare cf_clearance tokens carry over.
 */
function copyCookies(realProfileDir, targetProfileDir) {
    const realDefault = path.join(realProfileDir, "Default");
    const targetDefault = path.join(targetProfileDir, "Default");

    if (!fs.existsSync(targetDefault)) {
        fs.mkdirSync(targetDefault, { recursive: true });
    }

    // Copy Cookies file (SQLite database)
    for (const file of ["Cookies", "Cookies-journal"]) {
        const src = path.join(realDefault, file);
        const dst = path.join(targetDefault, file);
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dst);
            } catch { /* ignore if locked */ }
        }
    }

    // Also copy Login Data so ChatGPT session persists
    for (const file of ["Login Data", "Login Data-journal"]) {
        const src = path.join(realDefault, file);
        const dst = path.join(targetDefault, file);
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dst);
            } catch { /* ignore */ }
        }
    }

    // Copy Preferences and Local State for consistency
    for (const file of ["Preferences", "Secure Preferences"]) {
        const src = path.join(realDefault, file);
        const dst = path.join(targetDefault, file);
        if (fs.existsSync(src)) {
            try {
                fs.copyFileSync(src, dst);
            } catch { /* ignore */ }
        }
    }
    const localState = path.join(realProfileDir, "Local State");
    const targetLocalState = path.join(targetProfileDir, "Local State");
    if (fs.existsSync(localState)) {
        try {
            fs.copyFileSync(localState, targetLocalState);
        } catch { /* ignore */ }
    }
}

function killChrome() {
    try {
        execSync('pkill -9 -f "Google Chrome" 2>/dev/null', { encoding: "utf8", timeout: 3000 });
    } catch { /* ignore */ }
}

function getDebuggerUrl() {
    return new Promise((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${DEBUGGING_PORT}/json/version`, (res) => {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => {
                try { resolve(JSON.parse(data).webSocketDebuggerUrl); }
                catch (e) { reject(e); }
            });
        });
        req.on("error", reject);
        req.setTimeout(3000, () => { req.destroy(); reject(new Error("timeout")); });
    });
}

export class ChatGPTAutomation extends EventEmitter {
    constructor() {
        super();
        this.browser = null;
        this.page = null;
    }

    log(msg) { this.emit("log", msg); }
    progress(pct) { this.emit("progress", pct); }

    async run(prompt) {
        try {
            this.log("준비 중…");
            this.progress(5);

            const chromePath = findChromePath();
            if (!chromePath) throw new Error("Chrome을 찾을 수 없습니다.");

            // Kill any running Chrome
            this.log("기존 Chrome 종료 중…");
            killChrome();
            await this.sleep(3000);

            // Only copy cookies on FIRST run (when our profile doesn't exist yet)
            // After that, keep the dedicated profile's own session (ChatGPT login persists)
            const profileDefaultDir = path.join(PROFILE_DIR, "Default");
            const isFirstRun = !fs.existsSync(profileDefaultDir);

            if (isFirstRun) {
                const realProfile = getRealChromeProfileDir();
                if (realProfile) {
                    this.log("최초 실행: 쿠키/세션 복사 중…");
                    fs.mkdirSync(PROFILE_DIR, { recursive: true });
                    copyCookies(realProfile, PROFILE_DIR);
                } else {
                    fs.mkdirSync(PROFILE_DIR, { recursive: true });
                }
            } else {
                this.log("기존 프로필 사용 (로그인 유지)");
            }

            this.progress(10);

            // Launch Chrome as a normal OS process using execSync + background
            this.log("Chrome 실행 중…");
            const cmd = `"${chromePath}" --remote-debugging-port=${DEBUGGING_PORT} --user-data-dir="${PROFILE_DIR}" --no-first-run --no-default-browser-check --window-size=1280,900 &>/dev/null &`;
            execSync(`bash -c '${cmd}'`, { encoding: "utf8", timeout: 5000 });

            // Wait for debugging port
            this.log("디버깅 포트 연결 대기 (최대 30초)…");
            let wsUrl = null;
            for (let i = 0; i < 30; i++) {
                await this.sleep(1000);
                try {
                    wsUrl = await getDebuggerUrl();
                    if (wsUrl) break;
                } catch { /* retry */ }
            }

            if (!wsUrl) {
                throw new Error(
                    "Chrome 디버깅 포트 연결 실패. Chrome을 수동으로 완전히 종료(활성상태보기→강제종료)한 후 다시 시도해주세요."
                );
            }

            this.log("Chrome 연결 성공 ✓");
            this.progress(20);

            this.browser = await puppeteer.connect({
                browserWSEndpoint: wsUrl,
                defaultViewport: null,
            });

            this.page = await this.browser.newPage();

            this.log("ChatGPT로 이동 중…");
            this.progress(25);

            await this.page.goto("https://chatgpt.com", {
                waitUntil: "networkidle2",
                timeout: 60000,
            });

            await this.sleep(3000);
            this.progress(30);

            // Check Cloudflare
            if (await this.checkCloudflare()) {
                this.log("⚠️ Cloudflare 확인 — 브라우저에서 체크박스를 클릭해주세요…");
                const passed = await this.waitForChallengeResolution(120000);
                if (!passed) throw new Error("Cloudflare 확인 시간 초과.");
                this.log("Cloudflare 통과 ✓");
                await this.sleep(3000);
            }

            this.progress(35);

            // Check login
            const loggedIn = await this.waitForLoginState();
            if (!loggedIn) {
                this.log("⚠️ ChatGPT 로그인 필요 — 브라우저에서 로그인해주세요…");
                const ok = await this.waitForLogin(300000);
                if (!ok) throw new Error("로그인 시간 초과.");
                this.log("로그인 확인 ✓");
            } else {
                this.log("로그인 상태 확인 ✓");
            }

            this.progress(40);
            this.log("프롬프트 입력 중…");
            await this.inputPrompt(prompt);

            this.progress(50);
            this.log("전송 중…");
            await this.submitPrompt();

            this.progress(55);
            this.log("ChatGPT 응답 대기 중… (최대 5분)");
            const responseText = await this.waitForResponse();

            this.progress(90);
            this.log("응답 수집 완료 ✓");

            try { await this.page.close(); } catch { /* ignore */ }
            if (this.browser) { this.browser.disconnect(); this.browser = null; }

            this.progress(95);
            return responseText;
        } catch (err) {
            await this.cleanup();
            throw err;
        }
    }

    async checkCloudflare() {
        try {
            return await this.page.evaluate(() => {
                const t = document.body?.innerText || "";
                return t.includes("Verify you are human") || t.includes("Just a moment") ||
                    t.includes("Checking your browser") || t.includes("사람인지 확인") ||
                    !!document.querySelector("#challenge-running") ||
                    !!document.querySelector(".cf-turnstile-wrapper");
            });
        } catch { return false; }
    }

    async waitForChallengeResolution(timeout) {
        const s = Date.now();
        while (Date.now() - s < timeout) {
            if (!(await this.checkCloudflare())) return true;
            await this.sleep(2000);
        }
        return false;
    }

    async waitForLoginState() {
        try {
            await this.page.waitForSelector(
                '#prompt-textarea, [id="prompt-textarea"], div[contenteditable="true"]',
                { timeout: 10000 }
            );
            return true;
        } catch { return false; }
    }

    async waitForLogin(timeout) {
        const s = Date.now();
        while (Date.now() - s < timeout) {
            if (await this.waitForLoginState()) return true;
            await this.sleep(3000);
        }
        return false;
    }

    async inputPrompt(prompt) {
        await this.page.waitForSelector(
            '#prompt-textarea, [id="prompt-textarea"], div[contenteditable="true"]',
            { timeout: 30000 }
        );

        await this.page.evaluate(async (text) => {
            const el = document.querySelector("#prompt-textarea") ||
                document.querySelector('[id="prompt-textarea"]') ||
                document.querySelector('div[contenteditable="true"]');
            if (!el) throw new Error("입력란 없음");
            el.focus();
            if (el.getAttribute("contenteditable") === "true") {
                const dt = new DataTransfer();
                dt.setData("text/plain", text);
                el.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: dt }));
                await new Promise(r => setTimeout(r, 500));
                if ((el.textContent || "").trim().length < 10) document.execCommand("insertText", false, text);
                el.dispatchEvent(new Event("input", { bubbles: true }));
            } else {
                const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
                if (setter) setter.call(el, text); else el.value = text;
                el.dispatchEvent(new Event("input", { bubbles: true }));
            }
        }, prompt);

        await this.sleep(1000);
        const ok = await this.page.evaluate(() => {
            const el = document.querySelector("#prompt-textarea") || document.querySelector('div[contenteditable="true"]');
            return (el?.textContent || el?.value || "").trim().length > 10;
        });
        if (!ok) {
            this.log("붙여넣기 실패 → 타이핑…");
            await this.page.click('#prompt-textarea, div[contenteditable="true"]');
            await this.page.keyboard.type(prompt, { delay: 2 });
        }
        this.log("프롬프트 입력 완료 ✓");
    }

    async submitPrompt() {
        await this.sleep(800);
        for (const sel of [
            'button[data-testid="send-button"]',
            'button[aria-label="Send prompt"]', 'button[aria-label="프롬프트 보내기"]',
            'button[aria-label="Send"]', 'button[aria-label="보내기"]',
        ]) {
            try {
                const btn = await this.page.$(sel);
                if (btn) { await btn.click(); this.log("전송 ✓"); await this.sleep(3000); return; }
            } catch { continue; }
        }
        await this.page.keyboard.press("Enter");
        await this.sleep(3000);
    }

    async waitForResponse() {
        const maxWait = 300000, start = Date.now();
        let lastText = "", stableCount = 0;
        await this.sleep(5000);
        while (Date.now() - start < maxWait) {
            const gen = await this.page.evaluate(() => !!(
                document.querySelector('button[aria-label="Stop generating"]') ||
                document.querySelector('button[aria-label="생성 중지"]') ||
                document.querySelector('button[data-testid="stop-button"]')
            ));
            const text = await this.page.evaluate(() => {
                const m = document.querySelectorAll('[data-message-author-role="assistant"]');
                if (m.length) return m[m.length - 1].textContent || "";
                const a = document.querySelectorAll(".agent-turn .markdown");
                if (a.length) return a[a.length - 1].textContent || "";
                return "";
            });
            if (!gen && text && text.length > 50) {
                if (text === lastText) { stableCount++; if (stableCount >= 5) return text; }
                else { stableCount = 0; lastText = text; }
            } else {
                stableCount = 0;
                if (text) lastText = text;
                if (gen) this.progress(Math.min(85, 50 + Math.floor((text?.length || 0) / 100)));
            }
            await this.sleep(2000);
        }
        if (lastText && lastText.length > 50) return lastText;
        throw new Error("ChatGPT 응답 시간 초과 (5분).");
    }

    sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
    async cleanup() {
        try { if (this.browser) { this.browser.disconnect(); this.browser = null; } }
        catch { /* ignore */ }
        this.page = null;
    }
}
