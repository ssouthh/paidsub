import crypto from 'crypto';

const SERVER_SECRET = process.env.SERVER_SECRET || "FJEUJFDujfdsu384&*&@&$#urejfdsnjfdsai8387y42jnijndsaSDDF";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const KEYS_PATH = "data/keys.json";

// ============================================================
// Чтение keys.json с GitHub
// ============================================================
async function loadKeysFromGithub() {
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${KEYS_PATH}?ref=${GITHUB_BRANCH}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'ECM-Vercel'
            }
        });

        if (!response.ok) {
            console.error('GitHub read error:', response.status);
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

// ============================================================
// Запись keys.json на GitHub
// ============================================================
async function saveKeysToGithub(keys, sha) {
    try {
        const content = Buffer.from(JSON.stringify(keys, null, 2)).toString('base64');
        const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${KEYS_PATH}`;

        const body = {
            message: `Update keys ${new Date().toISOString()}`,
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

// ============================================================
// Защищённый код (payload)
// ============================================================
const PROTECTED_CODE = ''; // пустой payload
function sign(data) {
    return crypto.createHmac('sha256', SERVER_SECRET).update(data).digest('hex');
}

function xorEncrypt(code, key) {
    let r = [];
    for (let i = 0; i < code.length; i++) {
        r.push(code.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(r).toString('hex');
}

// ============================================================
// Обработчик /api/check
// ============================================================
export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');

    const key = (req.query.key || "").trim();
    const hwid = (req.query.hwid || "").trim();

    if (!key) {
        return res.status(200).json({ success: false, message: "No key provided" });
    }

    // Загружаем ключи с GitHub
    const { keys, sha } = await loadKeysFromGithub();
    const kd = keys[key];

    if (!kd) {
        return res.status(200).json({ success: false, message: "Key not found" });
    }

    if (!kd.active) {
        return res.status(200).json({ success: false, message: "Key is banned" });
    }

    if (kd.expires > 0 && Date.now() / 1000 >= kd.expires) {
        return res.status(200).json({ success: false, message: "Key expired" });
    }

    if (kd.hwid && kd.hwid !== "" && kd.hwid !== hwid) {
        return res.status(200).json({ success: false, message: "Wrong device (HWID mismatch)" });
    }

    // Привязка HWID при первом использовании
    let needsSave = false;
    if ((!kd.hwid || kd.hwid === "") && hwid) {
        kd.hwid = hwid;
        kd.first_used = new Date().toISOString();
        needsSave = true;
    }

    // Обновляем last_check
    kd.last_check = new Date().toISOString();
    needsSave = true;

    if (needsSave && sha) {
        await saveKeysToGithub(keys, sha);
    }

    // Считаем дни
    let dl = -1;
    if (kd.expires > 0) {
        dl = Math.max(0, Math.floor((kd.expires - Date.now() / 1000) / 86400));
    }

    // Подпись и payload
    const ts = Math.floor(Date.now() / 1000);
    const sig = sign(key + "|" + ts + "|valid");
    const encKey = hwid + key + SERVER_SECRET;
    const payload = xorEncrypt(PROTECTED_CODE, encKey);

    return res.status(200).json({
        success: true,
        message: "Valid",
        days_left: dl,
        note: kd.note || "",
        timestamp: ts,
        signature: sig,
        payload: payload
    });
}