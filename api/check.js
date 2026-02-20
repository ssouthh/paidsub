const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEYS_FILE = path.join(process.cwd(), 'data', 'keys.json');
const SERVER_SECRET = "MyS3cr3tK3y_Ch@ng3_Th1s!2024";

function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Error loading keys:', err);
    }
    return {};
}

function saveKeys(keys) {
    try {
        const dir = path.dirname(KEYS_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(KEYS_FILE, JSON.stringify(keys, null, 2));
    } catch (err) {
        console.error('Error saving keys:', err);
    }
}

const PROTECTED_CODE = `
return function(ped, wid, mul, WSO, WSS, CO, AZS, ffi)
    local function gs(w)
        if AZS[w] then return AZS[w] end
        local ok,s=pcall(getWeapontypeSlot,w)
        return ok and s or nil
    end
    local ok1,cp=pcall(getCharPointer,ped)
    if not ok1 or not cp or cp==0 then return false end
    local s=gs(wid)
    if not s or s<0 or s>12 then return false end
    local ok2,ptr=pcall(function()
        return ffi.cast("uint32_t*",cp+WSO+s*WSS+CO)
    end)
    if not ok2 or not ptr then return false end
    local ok3,cc=pcall(function() return tonumber(ptr[0])or 0 end)
    if not ok3 then return false end
    local ca=getAmmoInCharWeapon(ped,wid)
    if not ca then return false end
    local d=cc*mul
    if d>ca then d=ca end
    if d>cc then pcall(function() ptr[0]=d end) end
    return true
end
`;

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

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    const key = req.query.key || "";
    const hwid = req.query.hwid || "";
    
    if (!key) {
        return res.status(200).json({ success: false, message: "No key" });
    }
    
    const keys = loadKeys();
    const kd = keys[key];
    
    if (!kd) {
        return res.status(200).json({ success: false, message: "Not found" });
    }
    
    if (!kd.active) {
        return res.status(200).json({ success: false, message: "Banned" });
    }
    
    if (kd.expires > 0 && Date.now() / 1000 >= kd.expires) {
        return res.status(200).json({ success: false, message: "Expired" });
    }
    
    if (kd.hwid && kd.hwid !== "" && kd.hwid !== hwid) {
        return res.status(200).json({ success: false, message: "Wrong device" });
    }
    
    if ((!kd.hwid || kd.hwid === "") && hwid) {
        kd.hwid = hwid;
        kd.first_used = new Date().toISOString();
        saveKeys(keys);
    }
    
    let dl = -1;
    if (kd.expires > 0) {
        dl = Math.max(0, Math.floor((kd.expires - Date.now() / 1000) / 86400));
    }
    
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
};