// 開発時は true にするとコンソールに動作ログが出る
const DEBUG = false;
if (!DEBUG) {
    console.log = function () {};
    console.warn = function () {};
    console.error = function () {};
}

// ---------------------------------------------------------
// 接続先（ドメインやアフィリエイトIDを変えるときはここだけ直す）
// ---------------------------------------------------------

const MY_AFF_ID = "6dy-990";
const AFF_BASE = "https://al.fanza.co.jp/";
const DMM_ORIGIN = "https://video.dmm.co.jp";
const DMM_PICS_ORIGIN = "https://pics.dmm.co.jp";
const WIKI_HOST = "av-wiki.net";
const WIKI_ORIGIN = `https://${WIKI_HOST}`;

// ---------------------------------------------------------
// 素人作品（出演者名の下にサムネイルを並べる）
// ---------------------------------------------------------

// 女優は av-wiki の WordPress タグとして登録されている（https://av-wiki.net/av-actress/<タグslug>/）
const WIKI_POSTS_API = `${WIKI_ORIGIN}/wp-json/wp/v2/posts`;
const WIKI_TAGS_API = `${WIKI_ORIGIN}/wp-json/wp/v2/tags`;
const TAG_RE = /^[%0-9a-z_-]{1,200}$/i;
const AMATEUR_MARK = `${WIKI_HOST}/fanza-shirouto/`;

const WORKS_SHOW_MAX = 12;
const WORK_THUMB_SIZE = 90;

const WORKS_KEY = "censored-actress-works";
const WORKS_MAX = 200;
const WORKS_TTL = 3 * 24 * 60 * 60 * 1000;

// 女優名の区切り（半角・全角スペース、カンマ、読点）
const NAME_SEPARATOR_RE = /[\s,、　 ]+/;

// ---------------------------------------------------------
// 一覧ページ：ベスト盤を除外する絞り込み
// ---------------------------------------------------------

const BEST_FILTER_KEY = "censored-actress-hide-best";
const BEST_FILTER_PANEL_ID = "my-best-filter-panel";
const BEST_HIDDEN_CLASS = "my-best-hidden";
const BEST_TITLE_RE = /BEST|ＢＥＳＴ|ベスト/i;

// アフィリエイト化するとリンク先が al.fanza の lurl に包まれて `?id=` の形が消えるため、
// 変換前・変換後の両方の形を拾えるようにしておく
const CARD_LINK_SELECTOR = 'a[href*="/content/?id="], a[href*="content%2F%3Fid%3D"]';
const CARD_SELECTOR = '[data-e2eid="content-card"], li';
const CARD_WALK_LIMIT = 8;

// ---------------------------------------------------------
// 共通
// ---------------------------------------------------------

// 要素を作る。attrs は属性として設定し、children は要素か文字列（文字列はテキストとして入る）。
// innerHTML を使わないので、外部から来た文字列が HTML として解釈されることはない
function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    node.append(...children);
    return node;
}

function spinner() {
    return el("span", { class: "loading-spinner" });
}

// FANZA の URL をアフィリエイト経由のリンクに包む
function affiliateUrl(url) {
    return `${AFF_BASE}?lurl=${encodeURIComponent(url)}&af_id=${MY_AFF_ID}&ch=api`;
}

function isAffiliateUrl(url) {
    return url.startsWith(AFF_BASE);
}

// background.js 経由で av-wiki のページを取得する
function fetchWikiText(url) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: "fetchWiki", url }, (response) => {
            if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
            if (!response || response.error || !response.data) {
                return reject(new Error("av-wiki への問い合わせに失敗しました"));
            }
            resolve(response.data);
        });
    });
}

async function fetchWikiJson(url) {
    const text = await fetchWikiText(url);
    try {
        return JSON.parse(text);
    } catch (e) {
        throw new Error("av-wiki の応答を解釈できませんでした");
    }
}

function ensureStyle() {
    if (document.getElementById("my-actress-style")) return;
    const style = document.createElement("style");
    style.id = "my-actress-style";
    style.textContent = `
        .my-actress-link {
            color: #0073e6 !important;
            text-decoration: none !important;
            margin-right: 12px !important;
            display: inline-block;
        }
        .my-actress-link:hover {
            color: #ff0000 !important;
            text-decoration: underline !important;
        }
        .loading-spinner {
            width: 14px;
            height: 14px;
            border: 2px solid #ccc;
            border-top-color: #0073e6;
            border-radius: 50%;
            display: inline-block;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-left: 5px;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .my-cast-block + .my-cast-block {
            margin-top: 8px;
        }
        .my-works-grid {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
            margin-top: 4px;
        }
        .my-works-grid:empty {
            display: none;
        }
        .my-works-grid a {
            display: block;
            width: ${WORK_THUMB_SIZE}px;
            line-height: 0;
        }
        .my-works-grid img {
            width: ${WORK_THUMB_SIZE}px;
            height: ${WORK_THUMB_SIZE}px;
            aspect-ratio: 1 / 1;
            object-fit: cover;
            border: 1px solid #ddd;
            background: #f3f3f3;
        }
        .my-works-grid a:hover img {
            border-color: #ff0000;
        }
        .${BEST_HIDDEN_CLASS} {
            display: none !important;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-toggle {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            height: 22px;
            padding: 0 8px 0 6px;
            border: 1px solid #bbb;
            border-radius: 11px;
            background: #fff;
            color: #555;
            font-weight: bold;
            cursor: pointer;
            user-select: none;
            white-space: nowrap;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-switch {
            position: relative;
            width: 28px;
            height: 16px;
            border-radius: 8px;
            background: #ccc;
            transition: background 0.15s;
            flex-shrink: 0;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-switch::after {
            content: "";
            position: absolute;
            top: 2px;
            left: 2px;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
            transition: transform 0.15s;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-state {
            min-width: 2.2em;
            color: #888;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-toggle[aria-pressed="true"] {
            border-color: #c00;
            background: #fff0f0;
            color: #c00;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-toggle[aria-pressed="true"] .my-best-switch {
            background: #c00;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-toggle[aria-pressed="true"] .my-best-switch::after {
            transform: translateX(12px);
        }
        #${BEST_FILTER_PANEL_ID} .my-best-toggle[aria-pressed="true"] .my-best-state {
            color: #c00;
        }
        #${BEST_FILTER_PANEL_ID} .my-best-count {
            margin-left: 6px;
            color: #666;
        }
    `;
    document.head.appendChild(style);
}

// ---------------------------------------------------------
// 作品詳細ページ：出演者欄の補完
// ---------------------------------------------------------

async function waitForTable() {
    return new Promise((resolve) => {
        const table = document.querySelector('table');
        if (table) return resolve(table);
        const observer = new MutationObserver(() => {
            const table = document.querySelector('table');
            if (table) {
                observer.disconnect();
                resolve(table);
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// 女優リンク https://av-wiki.net/av-actress/<タグslug>/ からタグslugを取り出す。
// slug は URL エンコードされたまま扱う（REST API の tags?slug= にもその形で渡す）
function actressTagFromHref(href) {
    const m = /\/av-actress\/([^/?#]+)\/?/.exec(href || "");
    return m ? m[1].toLowerCase() : null;
}

// 「AV女優名」欄から [{ name, tag }] を作る。tag は直書きの名前や複数名入りのリンクでは null
function actressesFromCell(actressCell) {
    const anchorTags = Array.from(actressCell.querySelectorAll('a'));
    if (anchorTags.length === 0) {
        return actressCell.innerText.trim().split(NAME_SEPARATOR_RE)
            .filter(n => n.length > 0)
            .map(name => ({ name, tag: null }));
    }
    const out = [];
    anchorTags.forEach(a => {
        const names = a.innerText.trim().split(NAME_SEPARATOR_RE).filter(n => n.length > 0);
        const tag = names.length === 1 ? actressTagFromHref(a.getAttribute("href")) : null;
        names.forEach(name => out.push({ name, tag }));
    });
    return out;
}

async function fetchWikiInfo(productID, currentCid) {
    let html;
    try {
        html = await fetchWikiText(`${WIKI_ORIGIN}/${encodeURIComponent(productID)}/`);
    } catch (e) {
        console.error("❌ Wikiのデータ取得に失敗しました");
        return;
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const dts = Array.from(doc.querySelectorAll('dt'));
    const targetDt = dts.find(dt => dt.innerText.includes("AV女優名"));
    if (targetDt && targetDt.nextElementSibling) {
        const actressCell = targetDt.nextElementSibling;
        const raw = actressCell.innerText.trim();
        if (!raw || raw.includes("＊＊＊")) {
            fillActressToDMM([], currentCid);
            return;
        }
        const actresses = actressesFromCell(actressCell);
        console.log("🎯 女優名を発見:", actresses.map(a => a.name).join(" "));
        fillActressToDMM(actresses, currentCid);
    } else {
        console.warn(`⚠️ Wiki内に品番 ${productID} に一致する項目が見つかりませんでした。`);
        console.log("Wiki上の項目一覧:", dts.map(dt => dt.innerText));
    }
}

function actressSearchLink(name) {
    const searchUrl = affiliateUrl(`${DMM_ORIGIN}/list/?key=${encodeURIComponent(name)}`);
    return el("a", { href: searchUrl, class: "my-actress-link" }, name);
}

// 出演者ごとに「名前」、その下に「素人作品のサムネ枠」を並べる。
// 素人作品を引ける出演者が1人もいなければ、従来どおり名前を横に並べるだけにする
function castNodes(actresses, currentCid) {
    if (!actresses.some(a => a.tag)) {
        return actresses.map(a => actressSearchLink(a.name));
    }
    return actresses.map(a => {
        const block = el("div", { class: "my-cast-block" }, actressSearchLink(a.name));
        if (a.tag) {
            const grid = el("div", { class: "my-works-grid" }, spinner());
            block.append(grid);
            renderActressWorks(grid, a.tag, currentCid);
        }
        return block;
    });
}

// 既存の「出演者」行の値セルを返す（無ければ null）
function findCastCell() {
    const castLabel = Array.from(document.querySelectorAll('td, th'))
        .find(el => el.innerText.trim().replace("：", "") === "出演者");
    const row = castLabel ? castLabel.closest('tr') : null;
    return row ? row.querySelector('td:last-child') : null;
}

// 「出演者」行の値セルを返す。行が無ければ表の末尾に作る
function ensureCastCell() {
    const existing = findCastCell();
    if (existing) return existing;
    const tbody = document.querySelector("table tbody");
    if (!tbody) return null;
    console.log("➕ 出演者枠を新規作成します。");
    const valueCell = el("td", { style: "font-weight: bold; background-color: #fff9c4; padding: 2px 5px;" });
    tbody.appendChild(el("tr", {},
        el("td", { align: "right", valign: "top", class: "nw" }, "出演者："),
        valueCell));
    return valueCell;
}

function fillActressToDMM(actresses, currentCid) {
    if (!actresses || !actresses.length) {
        console.log("⚠️ 有効な女優名ではないため、上書きをスキップします。");
        const cell = findCastCell();
        if (cell && cell.textContent.includes("取得中")) {
            cell.replaceChildren();
        }
        return;
    }

    const targetCell = ensureCastCell();
    if (!targetCell) return;

    ensureStyle();
    targetCell.replaceChildren(...castNodes(actresses, currentCid));
}

function showLoading() {
    const existing = findCastCell();
    if (existing) {
        const currentText = existing.innerText.trim();
        if (currentText !== "" && currentText !== "----" && !currentText.includes("＊＊＊")) {
            console.log("✅ すでに名前が登録されているため、上書きしません。");
            return false;
        }
    }
    const targetCell = existing || ensureCastCell();
    if (!targetCell) return false;
    ensureStyle();
    targetCell.replaceChildren("取得中... ", spinner());
    return true;
}

// 情報テーブルから見出し名で値を取り出す
function tableValueByLabel(label) {
    const th = Array.from(document.querySelectorAll('th')).find(h => h.innerText.trim() === label);
    if (!th) return "";
    const row = th.closest('tr');
    const td = row ? row.querySelector('td') : null;
    return td ? td.innerText.trim() : "";
}

async function main() {
    console.log("🔍 商品情報の読み込みを待機中...");
    try {
        await waitForTable();
        console.log("✅ テーブルの描画を確認しました。");
        const productID = tableValueByLabel("メーカー品番：");
        if (!productID) {
            console.warn("⚠️ 'メーカー品番' の値が見つかりません。取得できた見出し:",
                Array.from(document.querySelectorAll('th')).map(h => h.innerText));
            return;
        }
        // 素人作品の一覧から、今見ている作品自身を除くために使う
        const currentCid = tableValueByLabel("配信品番：").toLowerCase();
        showLoading();
        console.log("🎯 品番の取得に成功:", productID);
        fetchWikiInfo(productID, currentCid);
    } catch (error) {
        console.error(error.message);
    }
}

// ---------------------------------------------------------
// 素人作品の取得と表示
// ---------------------------------------------------------

let worksCache = null;

function loadWorksCache() {
    if (worksCache) return worksCache;
    try {
        worksCache = JSON.parse(localStorage.getItem(WORKS_KEY)) || {};
    } catch (e) {
        worksCache = {};
    }
    return worksCache;
}

function worksCacheGet(tag) {
    const entry = loadWorksCache()[tag];
    if (!entry || !entry.t || Date.now() - entry.t > WORKS_TTL) return null;
    return entry.w || [];
}

function worksCacheSet(tag, works) {
    const wc = loadWorksCache();
    wc[tag] = { w: works, t: Date.now() };
    const keys = Object.keys(wc);
    if (keys.length > WORKS_MAX) {
        keys.sort((a, b) => wc[a].t - wc[b].t)
            .slice(0, keys.length - WORKS_MAX)
            .forEach(k => delete wc[k]);
    }
    try {
        localStorage.setItem(WORKS_KEY, JSON.stringify(wc));
    } catch (e) {
        console.warn("⚠️ 出演作キャッシュの保存に失敗しました");
    }
}

function stripTags(html) {
    return html
        .replace(/<[^>]*>/g, "")
        .replace(/&(amp|lt|gt|quot|#0?39|#8211|#8212|nbsp);/g, (m, e) =>
            ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#039": "'", "#8211": "–", "#8212": "—", nbsp: " " }[e]))
        .replace(/\s+/g, " ")
        .trim();
}

// 記事本文の <dt>見出し</dt><dd>値</dd> から値を取り出す
function dlValue(html, label) {
    const re = new RegExp(`<dt>\\s*${label}\\s*</dt>\\s*<dd>([\\s\\S]*?)</dd>`);
    const m = re.exec(html);
    return m ? stripTags(m[1]) : "";
}

// 素人作品の記事なら { cid, title } を返す（それ以外は null）
function workFromPost(post) {
    const html = post && post.content && post.content.rendered;
    if (typeof html !== "string" || !html.includes(AMATEUR_MARK)) return null;

    const cid = dlValue(html, "FANZA品番").toLowerCase();
    if (!/^[0-9a-z_]{1,40}$/.test(cid)) return null;

    // 作品タイトル欄が無い記事は、冒頭の引用（【品番】タイトル）を使う
    let title = dlValue(html, "作品タイトル");
    if (!title) {
        const first = /<p>([\s\S]*?)<\/p>/.exec(html);
        title = first ? stripTags(first[1]).replace(/^【[^】]*】\s*/, "") : "";
    }
    return { cid, title: title.slice(0, 200) };
}

// 女優タグslugから、その女優の素人作品 [{ cid, title }] を返す（新しい順）。
// タグslug -> タグID -> そのタグの記事一覧、の順に引く
async function fetchActressWorks(tag) {
    const cached = worksCacheGet(tag);
    if (cached) return cached;
    if (typeof tag !== "string" || !TAG_RE.test(tag)) return [];

    // tag は URL エンコード済みの slug なので、そのまま埋め込む
    const tags = await fetchWikiJson(`${WIKI_TAGS_API}?slug=${tag}&_fields=id`);
    const id = Array.isArray(tags) && tags[0] && tags[0].id;

    const works = [];
    if (Number.isInteger(id)) {
        const posts = await fetchWikiJson(`${WIKI_POSTS_API}?tags=${id}&per_page=100&_fields=slug,content`);
        const seen = new Set();
        (Array.isArray(posts) ? posts : []).forEach(p => {
            const w = workFromPost(p);
            if (w && !seen.has(w.cid)) {
                seen.add(w.cid);
                works.push(w);
            }
        });
    }

    worksCacheSet(tag, works);
    return works;
}

// 素人作品のサムネイル（300×300 の正方形）と作品ページURL（アフィリエイト経由）
function amateurThumbUrl(cid) {
    return `${DMM_PICS_ORIGIN}/digital/amateur/${cid}/${cid}jp.jpg`;
}

function amateurContentUrl(cid) {
    return affiliateUrl(`${DMM_ORIGIN}/amateur/content/?id=${encodeURIComponent(cid)}`);
}

async function renderActressWorks(grid, tag, currentCid) {
    try {
        const works = (await fetchActressWorks(tag))
            .filter(w => w.cid && w.cid !== currentCid)
            .slice(0, WORKS_SHOW_MAX);
        if (!grid.isConnected) return;

        grid.replaceChildren(...works.map(w => {
            const title = w.title || w.cid;
            const img = el("img", {
                src: amateurThumbUrl(w.cid), alt: title, loading: "lazy",
                width: WORK_THUMB_SIZE, height: WORK_THUMB_SIZE,
            });
            const link = el("a", { href: amateurContentUrl(w.cid), title }, img);
            // 画像が無い作品は枠ごと消す
            img.addEventListener("error", () => link.remove(), { once: true });
            return link;
        }));
    } catch (e) {
        console.error("❌ " + e.message);
        grid.replaceChildren();
    }
}

// ---------------------------------------------------------
// 一覧ページ：作品リンクのアフィリエイト化
// ---------------------------------------------------------

function convertToAffiliateLinks() {
    if (!location.href.includes("/list/")) return;
    const links = document.querySelectorAll('a[data-e2eid="title"], a[href*="/av/content/"]');
    links.forEach(link => {
        let targetUrl = link.href;
        if (isAffiliateUrl(targetUrl) || !targetUrl.includes("/av/content/")) return;
        targetUrl = targetUrl.split('&_gl=')[0].split('&_ga=')[0].split('&_fplc=')[0];
        if (targetUrl.includes("id=")) {
            link.href = affiliateUrl(targetUrl);
        }
    });
    const convertedCount = Array.from(links).filter(l => isAffiliateUrl(l.href)).length;
    console.log(`✅ ${convertedCount} 個のリンクを整形・変換しました。`);
}

// ---------------------------------------------------------
// 一覧ページ：ベスト盤を除外する絞り込み
// ---------------------------------------------------------

// /list/ だけでなく /av/list/ や /amateur/list/ のようなフロア別の一覧も対象にする
function isListPage() {
    return /(^|\/)list(\/|$)/.test(location.pathname);
}

function loadHideBest() {
    try {
        return localStorage.getItem(BEST_FILTER_KEY) === "1";
    } catch (e) {
        return false;
    }
}

function saveHideBest(on) {
    try {
        localStorage.setItem(BEST_FILTER_KEY, on ? "1" : "0");
    } catch (e) {
        console.warn("⚠️ 絞り込み設定の保存に失敗しました");
    }
}

function cidFromHref(href) {
    if (!href) return null;
    let url = href;
    // アフィリエイト化済みのリンクは元URLが lurl に入っている
    const lurl = /[?&]lurl=([^&]+)/.exec(href);
    if (lurl) {
        try {
            url = decodeURIComponent(lurl[1]);
        } catch (e) {
            // 壊れたエスケープはそのまま扱う
        }
    }
    const m = /[?&]id=([a-zA-Z0-9_]+)/.exec(url);
    return m ? m[1].toLowerCase() : null;
}

// 1カードの範囲を求める。
// content-card / li で囲われていない場合は、「別の作品のリンクを含まない範囲」まで親を辿る
function cardRootOf(link, cid) {
    const known = link.closest(CARD_SELECTOR);
    if (known) return known;

    let node = link;
    for (let i = 0; i < CARD_WALK_LIMIT; i++) {
        const parent = node.parentElement;
        if (!parent || parent === document.body) break;

        const siblings = parent.querySelectorAll(CARD_LINK_SELECTOR);
        let hasOther = false;
        for (let j = 0; j < siblings.length; j++) {
            if (cidFromHref(siblings[j].getAttribute("href")) !== cid) {
                hasOther = true;
                break;
            }
        }
        if (hasOther) break;
        node = parent;
    }
    return node;
}

// カードの商品名を集める（リンクのテキストとサムネイルの alt）
function cardTitleText(card) {
    const parts = [];
    card.querySelectorAll(CARD_LINK_SELECTOR).forEach(a => {
        parts.push(a.textContent);
        a.querySelectorAll("img[alt]").forEach(img => parts.push(img.alt));
    });
    return parts.join(" ");
}

// 一覧ページ以外では全カードを表示に戻す
function applyBestFilter() {
    const enabled = isListPage() && loadHideBest();
    const seen = new Set();
    let hiddenCount = 0;

    document.querySelectorAll(CARD_LINK_SELECTOR).forEach(link => {
        const cid = cidFromHref(link.getAttribute("href"));
        if (!cid) return;
        const card = cardRootOf(link, cid);
        if (!card || seen.has(card)) return;
        seen.add(card);

        // 一覧は <ul class="grid"><li><div data-e2eid="content-card"> の構造なので、
        // カード本体だけ隠すと li の枠が空いたまま残る。グリッドの1マスである li ごと隠して前に詰める
        const parent = card.parentElement;
        const cell = parent && parent.tagName === "LI" ? parent : card;
        seen.add(cell);

        const hide = enabled && BEST_TITLE_RE.test(cardTitleText(card));
        cell.classList.toggle(BEST_HIDDEN_CLASS, hide);
        if (hide) hiddenCount++;
    });

    // 対象外になったカード（ページ遷移後に残った要素など）も戻す
    document.querySelectorAll("." + BEST_HIDDEN_CLASS).forEach(el => {
        if (!seen.has(el)) el.classList.remove(BEST_HIDDEN_CLASS);
    });

    renderBestFilterState(enabled, hiddenCount);
}

// スイッチの見た目（ON/OFF と非表示にした件数）を更新する
function renderBestFilterState(enabled, hiddenCount) {
    const panel = document.getElementById(BEST_FILTER_PANEL_ID);
    if (!panel) return;
    const toggle = panel.querySelector(".my-best-toggle");
    const state = panel.querySelector(".my-best-state");
    const count = panel.querySelector(".my-best-count");
    toggle.setAttribute("aria-pressed", enabled ? "true" : "false");
    toggle.title = enabled
        ? "クリックするとBEST・ベストの商品も表示します"
        : "クリックすると商品名にBEST・ベストを含む商品を隠します";
    state.textContent = enabled ? "ON" : "OFF";
    count.textContent = enabled ? `${hiddenCount}件を非表示中` : "";
}

// 一覧ページにだけ、「並び替え」のセレクトボックスの右隣にスイッチを出す
function ensureBestFilterPanel() {
    const existing = document.getElementById(BEST_FILTER_PANEL_ID);
    const sortSelect = isListPage() ? document.querySelector('select#sort') : null;
    const sortBox = sortSelect ? sortSelect.parentElement : null;

    if (!sortBox) {
        if (existing) existing.remove();
        return;
    }
    // Reactの再描画で並び替え欄が作り直された場合は付け直す
    if (existing && existing.previousElementSibling === sortBox) return;
    if (existing) existing.remove();

    ensureStyle();
    const toggle = el("button", { type: "button", class: "my-best-toggle", "aria-pressed": "false" },
        el("span", { class: "my-best-switch" }),
        el("span", {}, "BEST・ベスト除外"),
        el("span", { class: "my-best-state" }, "OFF"));
    const panel = el("div", { id: BEST_FILTER_PANEL_ID, class: "text-xs flex items-center shrink-0" },
        toggle,
        el("span", { class: "my-best-count" }));
    toggle.addEventListener("click", () => {
        saveHideBest(!loadHideBest());
        applyBestFilter();
    });
    sortBox.insertAdjacentElement("afterend", panel);
    // プルダウンが並ぶと横幅が足りなくなるため、並び替え欄の行を折り返せるようにする
    if (panel.parentElement) {
        panel.parentElement.style.flexWrap = "wrap";
        panel.parentElement.style.rowGap = "4px";
    }
    renderBestFilterState(loadHideBest(), 0);
}

function updateBestFilter() {
    ensureBestFilterPanel();
    applyBestFilter();
}

let bestFilterTimer = null;
function scheduleBestFilter() {
    clearTimeout(bestFilterTimer);
    bestFilterTimer = setTimeout(updateBestFilter, 100);
}

// ---------------------------------------------------------
// 実行トリガー
// ---------------------------------------------------------

function runLogic() {
    // content_scripts の matches で video.dmm.co.jp に限定しているので、ドメインの確認は不要
    main();
    convertToAffiliateLinks();
    scheduleBestFilter();
}

function observeFullPage() {
    let lastUrl = location.href;
    const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            console.log("🔄 URL変更を検知");
            runLogic();
            return;
        }
        convertToAffiliateLinks();
        scheduleBestFilter();
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

function init() {
    runLogic();
    observeFullPage();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
