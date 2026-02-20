// ============================================================
// API для управления ключами (вызывается Telegram ботом)
// ============================================================

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const BOT_SECRET = process.env.BOT_SECRET || "FJEkmfdsajj4234hdfasuyhdy6723yjHJFYDFYY";
const KEYS_PATH = "data/keys.json";

async function loadKeysFromGithub() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${KEYS_PATH}?ref=${GITHUB_BRANCH}&t=${Date.now()}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ECM-Vercel'
            }
        });

        if (!response.ok) {
            // Файл не существует — создадим пустой
            if (response.status === 404) {
                return { keys: {}, sha: null };
            }
            return { keys: {}, sha: null };
        }

        const data = await response.json();
        const content = Buffer.from(data.content, 'base64').toString('utf8');
        const keys = JSON.parse(content);
        return { keys, sha: data.sha };
    } catch (err) {
        console.error('GitHub load error:', err);
        return { keys: {}, sha: null };
    }
}

async function saveKeysToGithub(keys, sha) {
    try {
        const content = Buffer.from(JSON.stringify(keys, null, 2)).toString('base64');
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${KEYS_PATH}`;

        const body = {
            message: `Keys update ${new Date().toISOString()}`,
            content: content,
            branch: GITHUB_BRANCH
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ECM-Vercel',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('GitHub save error:', response.status, errText);
            return false;
        }

        return true;
    } catch (err) {
        console.error('GitHub save error:', err);
        return false;
    }
}

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    // Проверка секретного ключа бота
    const secret = req.query.secret || req.headers['x-bot-secret'] || "";
    if (secret !== BOT_SECRET) {
        return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const action = req.query.action || "";
    const { keys, sha } = await loadKeysFromGithub();

    // ============================================================
    // ACTION: list — список всех ключей
    // ============================================================
    if (action === "list") {
        const keyList = Object.keys(keys).map(k => ({
            key: k,
            active: keys[k].active,
            hwid: keys[k].hwid || "",
            expires: keys[k].expires || 0,
            note: keys[k].note || "",
            created: keys[k].created || "",
            first_used: keys[k].first_used || null
        }));
        return res.status(200).json({ success: true, keys: keyList, total: keyList.length });
    }

    // ============================================================
    // ACTION: get — информация о конкретном ключе
    // ============================================================
    if (action === "get") {
        const key = (req.query.key || "").trim();
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        return res.status(200).json({ success: true, key: key, data: keys[key] });
    }

    // ============================================================
    // ACTION: create — создать ключ
    // ============================================================
    if (action === "create") {
        const keyName = (req.query.key || "").trim();
        const days = parseInt(req.query.days || "0");  // 0 = lifetime
        const note = req.query.note || "";

        if (!keyName) {
            return res.status(200).json({ success: false, message: "No key name" });
        }

        if (keys[keyName]) {
            return res.status(200).json({ success: false, message: "Key already exists" });
        }

        keys[keyName] = {
            active: true,
            hwid: "",
            expires: days > 0 ? Math.floor(Date.now() / 1000) + (days * 86400) : 0,
            note: note || (days > 0 ? `${days} days` : "Lifetime"),
            created: new Date().toISOString(),
            first_used: null
        };

        const saved = await saveKeysToGithub(keys, sha);
        if (saved) {
            return res.status(200).json({ success: true, message: "Key created", key: keyName });
        } else {
            return res.status(200).json({ success: false, message: "Failed to save" });
        }
    }

    // ============================================================
    // ACTION: ban — забанить ключ
    // ============================================================
    if (action === "ban") {
        const key = (req.query.key || "").trim();
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        keys[key].active = false;
        const saved = await saveKeysToGithub(keys, sha);
        return res.status(200).json({ success: saved, message: saved ? "Banned" : "Save failed" });
    }

    // ============================================================
    // ACTION: unban — разбанить ключ
    // ============================================================
    if (action === "unban") {
        const key = (req.query.key || "").trim();
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        keys[key].active = true;
        const saved = await saveKeysToGithub(keys, sha);
        return res.status(200).json({ success: saved, message: saved ? "Unbanned" : "Save failed" });
    }

    // ============================================================
    // ACTION: delete — удалить ключ
    // ============================================================
    if (action === "delete") {
        const key = (req.query.key || "").trim();
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        delete keys[key];
        const saved = await saveKeysToGithub(keys, sha);
        return res.status(200).json({ success: saved, message: saved ? "Deleted" : "Save failed" });
    }

    // ============================================================
    // ACTION: reset_hwid — сброс HWID
    // ============================================================
    if (action === "reset_hwid") {
        const key = (req.query.key || "").trim();
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        keys[key].hwid = "";
        keys[key].first_used = null;
        const saved = await saveKeysToGithub(keys, sha);
        return res.status(200).json({ success: saved, message: saved ? "HWID reset" : "Save failed" });
    }

    // ============================================================
    // ACTION: stats — статистика
    // ============================================================
    if (action === "stats") {
        const all = Object.keys(keys);
        const active = all.filter(k => keys[k].active);
        const banned = all.filter(k => !keys[k].active);
        const used = all.filter(k => keys[k].hwid && keys[k].hwid !== '');
        const expired = all.filter(k =>
            keys[k].expires > 0 && keys[k].expires < Date.now() / 1000
        );
        return res.status(200).json({
            success: true,
            total: all.length,
            active: active.length,
            banned: banned.length,
            used: used.length,
            expired: expired.length,
            free: all.length - used.length
        });
    }

    // ============================================================
    // ACTION: search — поиск ключа
    // ============================================================
    if (action === "search") {
        const query = (req.query.q || "").trim().toUpperCase();
        if (!query) {
            return res.status(200).json({ success: false, message: "No search query" });
        }
        const found = Object.keys(keys).filter(k => k.includes(query));
        const results = found.map(k => ({
            key: k,
            active: keys[k].active,
            hwid: keys[k].hwid || "",
            expires: keys[k].expires || 0,
            note: keys[k].note || ""
        }));
        return res.status(200).json({ success: true, results: results, count: results.length });
    }
    // заметка
    if (action === "set_note") {
        const key = (req.query.key || "").trim();
        const note = req.query.note || "";
        if (!key || !keys[key]) {
            return res.status(200).json({ success: false, message: "Key not found" });
        }
        keys[key].note = note;
        const saved = await saveKeysToGithub(keys, sha);
        return res.status(200).json({ success: saved, message: saved ? "Note updated" : "Save failed" });
    }

    return res.status(200).json({ success: false, message: "Unknown action" });
}