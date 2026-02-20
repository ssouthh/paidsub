const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// ============================================================
// НАСТРОЙКИ - ЗАПОЛНИ СВОИ ДАННЫЕ
// ============================================================
const BOT_TOKEN = '';
const ADMIN_IDS = ['']; // Можно несколько: ['123', '456']

const KEYS_FILE = path.join(__dirname, '../data/keys.json');

function loadKeys() {
    try {
        if (fs.existsSync(KEYS_FILE)) {
            return JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Load error:', e);
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
        console.log('Keys saved:', Object.keys(keys).length);
    } catch (e) {
        console.error('Save error:', e);
    }
}

function generateKey() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        if (i > 0) result += '-';
        for (let j = 0; j < 4; j++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
    }
    return result;
}

const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function isAdmin(msg) {
    return ADMIN_IDS.includes(msg.from.id.toString());
}

// ============================================================
// КОМАНДЫ
// ============================================================

bot.onText(/\/start/, (msg) => {
    if (!isAdmin(msg)) {
        bot.sendMessage(msg.chat.id, '? Доступ запрещён');
        return;
    }
    
    const keyboard = {
        reply_markup: {
            keyboard: [
                ['? Создать ключ', '?? Список'],
                ['?? Найти', '?? Статистика']
            ],
            resize_keyboard: true
        }
    };
    
    bot.sendMessage(msg.chat.id, 
        '?? *ECM Admin Panel*\n\nВыберите действие:', 
        { ...keyboard, parse_mode: 'Markdown' }
    );
});

bot.onText(/? Создать ключ/, (msg) => {
    if (!isAdmin(msg)) return;
    
    bot.sendMessage(msg.chat.id, 
        'Выберите тип ключа:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '?? Безлимитный', callback_data: 'create_lifetime' }],
                    [{ text: '?? 7 дней', callback_data: 'create_7' }],
                    [{ text: '?? 30 дней', callback_data: 'create_30' }],
                    [{ text: '?? 90 дней', callback_data: 'create_90' }],
                    [{ text: '? Отмена', callback_data: 'cancel' }]
                ]
            }
        }
    );
});

bot.on('callback_query', (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;
    
    if (!isAdmin(query)) {
        bot.answerCallbackQuery(query.id, { text: '? Нет доступа' });
        return;
    }
    
    if (data === 'create_lifetime') {
        const key = generateKey();
        const keys = loadKeys();
        keys[key] = {
            active: true,
            hwid: "",
            expires: 0,
            note: "Lifetime",
            created: new Date().toISOString(),
            first_used: null
        };
        saveKeys(keys);
        
        bot.editMessageText(
            `? *Ключ создан*\n\n\`${key}\`\n\nТип: Безлимитный\nСтатус: Активен`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown'
            }
        );
        bot.answerCallbackQuery(query.id, { text: 'Ключ создан!' });
    }
    
    if (data.startsWith('create_')) {
        const days = parseInt(data.replace('create_', ''));
        if (!isNaN(days)) {
            const key = generateKey();
            const keys = loadKeys();
            const expires = Math.floor(Date.now() / 1000) + (days * 86400);
            
            keys[key] = {
                active: true,
                hwid: "",
                expires: expires,
                note: `${days} days`,
                created: new Date().toISOString(),
                first_used: null
            };
            saveKeys(keys);
            
            const expDate = new Date(expires * 1000).toLocaleDateString('ru-RU');
            
            bot.editMessageText(
                `? *Ключ создан*\n\n\`${key}\`\n\nТип: ${days} дней\nИстекает: ${expDate}\nСтатус: Активен`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown'
                }
            );
            bot.answerCallbackQuery(query.id, { text: 'Ключ создан!' });
        }
    }
    
    if (data === 'cancel') {
        bot.editMessageText('? Отменено', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    }
    
    if (data.startsWith('view_')) {
        const key = data.replace('view_', '');
        const keys = loadKeys();
        const k = keys[key];
        
        if (!k) {
            bot.answerCallbackQuery(query.id, { text: 'Ключ не найден' });
            return;
        }
        
        const status = k.active ? '? Активен' : '?? Забанен';
        const hwid = k.hwid ? `\`${k.hwid.substring(0, 16)}...\`` : 'Не привязан';
        const expires = k.expires > 0 
            ? new Date(k.expires * 1000).toLocaleDateString('ru-RU')
            : 'Никогда';
        const used = k.first_used 
            ? new Date(k.first_used).toLocaleDateString('ru-RU')
            : 'Не использован';
        
        bot.editMessageText(
            `?? *Ключ:* \`${key}\`\n\n` +
            `Статус: ${status}\n` +
            `HWID: ${hwid}\n` +
            `Истекает: ${expires}\n` +
            `Использован: ${used}\n` +
            `Создан: ${new Date(k.created).toLocaleDateString('ru-RU')}`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: k.active ? '?? Забанить' : '? Разбанить', 
                           callback_data: `${k.active ? 'ban' : 'unban'}_${key}` }],
                        [{ text: '??? Удалить', callback_data: `delete_${key}` }],
                        [{ text: '?? Назад', callback_data: 'list_keys' }]
                    ]
                }
            }
        );
        bot.answerCallbackQuery(query.id);
    }
    
    if (data.startsWith('ban_')) {
        const key = data.replace('ban_', '');
        const keys = loadKeys();
        if (keys[key]) {
            keys[key].active = false;
            saveKeys(keys);
            bot.answerCallbackQuery(query.id, { text: 'Ключ забанен!' });
            
            bot.editMessageText(
                `?? *Ключ:* \`${key}\`\n\nСтатус: ?? Забанен`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '? Разбанить', callback_data: `unban_${key}` }],
                            [{ text: '??? Удалить', callback_data: `delete_${key}` }]
                        ]
                    }
                }
            );
        }
    }
    
    if (data.startsWith('unban_')) {
        const key = data.replace('unban_', '');
        const keys = loadKeys();
        if (keys[key]) {
            keys[key].active = true;
            saveKeys(keys);
            bot.answerCallbackQuery(query.id, { text: 'Ключ разбанен!' });
            
            bot.editMessageText(
                `?? *Ключ:* \`${key}\`\n\nСтатус: ? Активен`,
                {
                    chat_id: chatId,
                    message_id: query.message.message_id,
                    parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '?? Забанить', callback_data: `ban_${key}` }],
                            [{ text: '??? Удалить', callback_data: `delete_${key}` }]
                        ]
                    }
                }
            );
        }
    }
    
    if (data.startsWith('delete_')) {
        const key = data.replace('delete_', '');
        const keys = loadKeys();
        delete keys[key];
        saveKeys(keys);
        bot.answerCallbackQuery(query.id, { text: 'Ключ удалён!' });
        bot.editMessageText('??? Ключ удалён', {
            chat_id: chatId,
            message_id: query.message.message_id
        });
    }
    
    if (data === 'list_keys') {
        const keys = loadKeys();
        const keyList = Object.keys(keys);
        
        if (keyList.length === 0) {
            bot.editMessageText('?? Ключей нет', {
                chat_id: chatId,
                message_id: query.message.message_id
            });
            return;
        }
        
        const buttons = keyList.slice(0, 20).map(k => [{
            text: `${keys[k].active ? '?' : '??'} ${k}`,
            callback_data: `view_${k}`
        }]);
        
        bot.editMessageText(
            `?? *Всего: ${keyList.length}*\n\n` +
            `Активных: ${keyList.filter(k => keys[k].active).length}\n` +
            `Забаненных: ${keyList.filter(k => !keys[k].active).length}`,
            {
                chat_id: chatId,
                message_id: query.message.message_id,
                parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
    }
});

bot.onText(/?? Список/, (msg) => {
    if (!isAdmin(msg)) return;
    
    const keys = loadKeys();
    const keyList = Object.keys(keys);
    
    if (keyList.length === 0) {
        bot.sendMessage(msg.chat.id, '?? Ключей нет');
        return;
    }
    
    const buttons = keyList.slice(0, 20).map(k => [{
        text: `${keys[k].active ? '?' : '??'} ${k}`,
        callback_data: `view_${k}`
    }]);
    
    bot.sendMessage(msg.chat.id,
        `?? *Всего: ${keyList.length}*`,
        {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: buttons }
        }
    );
});

bot.onText(/?? Найти/, (msg) => {
    if (!isAdmin(msg)) return;
    
    bot.sendMessage(msg.chat.id, 'Введите ключ:');
    
    const listener = (m) => {
        if (m.chat.id !== msg.chat.id) return;
        
        const keys = loadKeys();
        const search = m.text.trim().toUpperCase();
        const found = Object.keys(keys).filter(k => k.includes(search));
        
        if (found.length === 0) {
            bot.sendMessage(msg.chat.id, '? Не найден');
        } else {
            const buttons = found.map(k => [{
                text: `${keys[k].active ? '?' : '??'} ${k}`,
                callback_data: `view_${k}`
            }]);
            bot.sendMessage(msg.chat.id,
                `?? Найдено: ${found.length}`,
                { reply_markup: { inline_keyboard: buttons } }
            );
        }
        
        bot.removeListener('message', listener);
    };
    
    bot.on('message', listener);
});

bot.onText(/?? Статистика/, (msg) => {
    if (!isAdmin(msg)) return;
    
    const keys = loadKeys();
    const all = Object.keys(keys);
    const active = all.filter(k => keys[k].active);
    const banned = all.filter(k => !keys[k].active);
    const used = all.filter(k => keys[k].hwid && keys[k].hwid !== '');
    const expired = all.filter(k => 
        keys[k].expires > 0 && keys[k].expires < Date.now() / 1000
    );
    
    bot.sendMessage(msg.chat.id,
        `?? *Статистика*\n\n` +
        `Всего: ${all.length}\n` +
        `Активных: ${active.length}\n` +
        `Забаненных: ${banned.length}\n` +
        `Использованных: ${used.length}\n` +
        `Истёкших: ${expired.length}\n` +
        `Свободных: ${all.length - used.length}`,
        { parse_mode: 'Markdown' }
    );
});

console.log('?? Bot started!');
console.log('Admin IDs:', ADMIN_IDS);