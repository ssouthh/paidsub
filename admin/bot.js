const TelegramBot = require('node-telegram-bot-api');

// ============================================================
// НАСТРОЙКИ
// ============================================================
const BOT_TOKEN = '8429997103:AAFOJHBMIksWcmdPCfzXZ7uiumGKD1def88';           // Токен бота
const ADMIN_IDS = ['7384085609'];         // ID администраторов
const API_URL = 'https://paidsub.vercel.app/api/manage';  // URL API управления
const BOT_SECRET = 'FJEUJFDujfdsu384&*&@&$#urejfdsnjfdsai8387y42jnijndsaSDDF';                 // Секрет для API

// ============================================================
// HTTP-запрос к API
// ============================================================
async function apiRequest(action, params = {}) {
    const url = new URL(API_URL);
    url.searchParams.set('secret', BOT_SECRET);
    url.searchParams.set('action', action);
    for (const [k, v] of Object.entries(params)) {
        url.searchParams.set(k, v);
    }
    
    try {
        const response = await fetch(url.toString(), {
            headers: { 'User-Agent': 'ECM-TelegramBot' }
        });
        const data = await response.json();
        return data;
    } catch (err) {
        console.error('API error:', err);
        return { success: false, message: 'API request failed: ' + err.message };
    }
}

// ============================================================
// Генерация ключа (локально, для красоты)
// ============================================================
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

// ============================================================
// Бот
// ============================================================
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function isAdmin(msg) {
    const id = msg.from ? msg.from.id.toString() : (msg.message ? msg.message.from.id.toString() : '');
    return ADMIN_IDS.includes(id);
}

// /start
bot.onText(/\/start/, (msg) => {
    if (!isAdmin(msg)) {
        bot.sendMessage(msg.chat.id, '⛔ Доступ запрещён');
        return;
    }
    
    bot.sendMessage(msg.chat.id,
        '🔑 *ECM Admin Panel (Vercel)*\n\nВыберите действие:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [
                    ['➕ Создать ключ', '📋 Список'],
                    ['🔍 Найти', '📊 Статистика']
                ],
                resize_keyboard: true
            }
        }
    );
});

// ➕ Создать ключ
bot.onText(/➕ Создать ключ/, (msg) => {
    if (!isAdmin(msg)) return;
    
    bot.sendMessage(msg.chat.id,
        'Выберите тип ключа:',
        {
            reply_markup: {
                inline_keyboard: [
                    [{ text: '♾️ Безлимитный', callback_data: 'create_lifetime' }],
                    [{ text: '📅 7 дней', callback_data: 'create_7' }],
                    [{ text: '📅 30 дней', callback_data: 'create_30' }],
                    [{ text: '📅 90 дней', callback_data: 'create_90' }],
                    [{ text: '❌ Отмена', callback_data: 'cancel' }]
                ]
            }
        }
    );
});

// Обработка callback кнопок
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const msgId = query.message.message_id;
    const data = query.data;
    
    if (!isAdmin(query)) {
        bot.answerCallbackQuery(query.id, { text: '⛔ Нет доступа' });
        return;
    }
    
    // ======== СОЗДАНИЕ КЛЮЧЕЙ ========
    
    if (data === 'create_lifetime') {
        const key = generateKey();
        const result = await apiRequest('create', { key: key, days: '0', note: 'Lifetime' });
        
        if (result.success) {
            bot.editMessageText(
                `✅ *Ключ создан*\n\n\`${key}\`\n\nТип: Безлимитный\nСтатус: Активен`,
                { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
            );
        } else {
            bot.editMessageText(
                `❌ Ошибка: ${result.message}`,
                { chat_id: chatId, message_id: msgId }
            );
        }
        bot.answerCallbackQuery(query.id, { text: result.success ? 'Создан!' : 'Ошибка' });
        return;
    }
    
    if (data.startsWith('create_')) {
        const days = parseInt(data.replace('create_', ''));
        if (!isNaN(days) && days > 0) {
            const key = generateKey();
            const result = await apiRequest('create', { key: key, days: days.toString(), note: `${days} days` });
            
            if (result.success) {
                const expDate = new Date(Date.now() + days * 86400000).toLocaleDateString('ru-RU');
                bot.editMessageText(
                    `✅ *Ключ создан*\n\n\`${key}\`\n\nТип: ${days} дней\nИстекает: ${expDate}\nСтатус: Активен`,
                    { chat_id: chatId, message_id: msgId, parse_mode: 'Markdown' }
                );
            } else {
                bot.editMessageText(
                    `❌ Ошибка: ${result.message}`,
                    { chat_id: chatId, message_id: msgId }
                );
            }
            bot.answerCallbackQuery(query.id, { text: result.success ? 'Создан!' : 'Ошибка' });
            return;
        }
    }
    
    // ======== ОТМЕНА ========
    
    if (data === 'cancel') {
        bot.editMessageText('❌ Отменено', { chat_id: chatId, message_id: msgId });
        bot.answerCallbackQuery(query.id);
        return;
    }
    
    // ======== ПРОСМОТР КЛЮЧА ========
    
    if (data.startsWith('view_')) {
        const key = data.replace('view_', '');
        const result = await apiRequest('get', { key: key });
        
        if (!result.success) {
            bot.answerCallbackQuery(query.id, { text: 'Ключ не найден' });
            return;
        }
        
        const k = result.data;
        const status = k.active ? '✅ Активен' : '🚫 Забанен';
        const hwid = k.hwid ? `\`${k.hwid.substring(0, 16)}...\`` : 'Не привязан';
        const expires = k.expires > 0
            ? new Date(k.expires * 1000).toLocaleDateString('ru-RU')
            : 'Никогда';
        const used = k.first_used
            ? new Date(k.first_used).toLocaleDateString('ru-RU')
            : 'Не использован';
        const created = k.created
            ? new Date(k.created).toLocaleDateString('ru-RU')
            : '—';
        
        bot.editMessageText(
            `🔍 *Ключ:* \`${key}\`\n\n` +
            `Статус: ${status}\n` +
            `HWID: ${hwid}\n` +
            `Истекает: ${expires}\n` +
            `Использован: ${used}\n` +
            `Создан: ${created}\n` +
            `Заметка: ${k.note || '—'}`,
            {
                chat_id: chatId,
                message_id: msgId,
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [
                        [{ text: k.active ? '🚫 Забанить' : '✅ Разбанить',
                           callback_data: `${k.active ? 'ban' : 'unban'}_${key}` }],
                        [{ text: '🔄 Сброс HWID', callback_data: `resethwid_${key}` }],
                        [{ text: '🗑️ Удалить', callback_data: `delete_${key}` }],
                        [{ text: '◀️ Назад к списку', callback_data: 'list_keys' }]
                    ]
                }
            }
        );
        bot.answerCallbackQuery(query.id);
        return;
    }
    
    // ======== БАН ========
    
    if (data.startsWith('ban_')) {
        const key = data.replace('ban_', '');
        const result = await apiRequest('ban', { key: key });
        bot.answerCallbackQuery(query.id, { text: result.success ? 'Забанен!' : 'Ошибка' });
        
        if (result.success) {
            bot.editMessageText(
                `🔍 *Ключ:* \`${key}\`\n\nСтатус: 🚫 Забанен`,
                {
                    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '✅ Разбанить', callback_data: `unban_${key}` }],
                            [{ text: '🗑️ Удалить', callback_data: `delete_${key}` }],
                            [{ text: '◀️ Назад', callback_data: 'list_keys' }]
                        ]
                    }
                }
            );
        }
        return;
    }
    
    // ======== РАЗБАН ========
    
    if (data.startsWith('unban_')) {
        const key = data.replace('unban_', '');
        const result = await apiRequest('unban', { key: key });
        bot.answerCallbackQuery(query.id, { text: result.success ? 'Разбанен!' : 'Ошибка' });
        
        if (result.success) {
            bot.editMessageText(
                `🔍 *Ключ:* \`${key}\`\n\nСтатус: ✅ Активен`,
                {
                    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '🚫 Забанить', callback_data: `ban_${key}` }],
                            [{ text: '🗑️ Удалить', callback_data: `delete_${key}` }],
                            [{ text: '◀️ Назад', callback_data: 'list_keys' }]
                        ]
                    }
                }
            );
        }
        return;
    }
    
    // ======== СБРОС HWID ========
    
    if (data.startsWith('resethwid_')) {
        const key = data.replace('resethwid_', '');
        const result = await apiRequest('reset_hwid', { key: key });
        bot.answerCallbackQuery(query.id, { text: result.success ? 'HWID сброшен!' : 'Ошибка' });
        
        if (result.success) {
            bot.editMessageText(
                `🔍 *Ключ:* \`${key}\`\n\n✅ HWID сброшен. Ключ можно привязать к другому ПК.`,
                {
                    chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '◀️ К ключу', callback_data: `view_${key}` }],
                            [{ text: '◀️ К списку', callback_data: 'list_keys' }]
                        ]
                    }
                }
            );
        }
        return;
    }
    
    // ======== УДАЛЕНИЕ ========
    
    if (data.startsWith('delete_')) {
        const key = data.replace('delete_', '');
        const result = await apiRequest('delete', { key: key });
        bot.answerCallbackQuery(query.id, { text: result.success ? 'Удалён!' : 'Ошибка' });
        bot.editMessageText('🗑️ Ключ удалён', { chat_id: chatId, message_id: msgId });
        return;
    }
    
    // ======== СПИСОК ========
    
    if (data === 'list_keys') {
        const result = await apiRequest('list');
        
        if (!result.success || !result.keys || result.keys.length === 0) {
            bot.editMessageText('📋 Ключей нет', { chat_id: chatId, message_id: msgId });
            return;
        }
        
        const keyList = result.keys;
        const buttons = keyList.slice(0, 20).map(k => [{
            text: `${k.active ? '✅' : '🚫'} ${k.key}`,
            callback_data: `view_${k.key}`
        }]);
        
        const activeCount = keyList.filter(k => k.active).length;
        const bannedCount = keyList.filter(k => !k.active).length;
        
        bot.editMessageText(
            `📋 *Всего: ${keyList.length}*\n\n` +
            `Активных: ${activeCount}\n` +
            `Забаненных: ${bannedCount}`,
            {
                chat_id: chatId, message_id: msgId, parse_mode: 'Markdown',
                reply_markup: { inline_keyboard: buttons }
            }
        );
        return;
    }
});

// 📋 Список
bot.onText(/📋 Список/, async (msg) => {
    if (!isAdmin(msg)) return;
    
    const result = await apiRequest('list');
    
    if (!result.success || !result.keys || result.keys.length === 0) {
        bot.sendMessage(msg.chat.id, '📋 Ключей нет');
        return;
    }
    
    const keyList = result.keys;
    const buttons = keyList.slice(0, 20).map(k => [{
        text: `${k.active ? '✅' : '🚫'} ${k.key}`,
        callback_data: `view_${k.key}`
    }]);
    
    bot.sendMessage(msg.chat.id,
        `📋 *Всего: ${keyList.length}*`,
        { parse_mode: 'Markdown', reply_markup: { inline_keyboard: buttons } }
    );
});

// 🔍 Найти
bot.onText(/🔍 Найти/, (msg) => {
    if (!isAdmin(msg)) return;
    
    bot.sendMessage(msg.chat.id, 'Введите ключ или его часть:');
    
    const listener = async (m) => {
        if (m.chat.id !== msg.chat.id) return;
        
        const search = m.text.trim();
        // Игнорируем команды клавиатуры
        if (search.startsWith('➕') || search.startsWith('📋') || 
            search.startsWith('🔍') || search.startsWith('📊') || 
            search.startsWith('/')) {
            bot.removeListener('message', listener);
            return;
        }
        
        const result = await apiRequest('search', { q: search });
        
        if (!result.success || !result.results || result.results.length === 0) {
            bot.sendMessage(msg.chat.id, '❌ Не найдено');
        } else {
            const buttons = result.results.map(k => [{
                text: `${k.active ? '✅' : '🚫'} ${k.key}`,
                callback_data: `view_${k.key}`
            }]);
            bot.sendMessage(msg.chat.id,
                `🔍 Найдено: ${result.count}`,
                { reply_markup: { inline_keyboard: buttons } }
            );
        }
        
        bot.removeListener('message', listener);
    };
    
    bot.on('message', listener);
});

// 📊 Статистика
bot.onText(/📊 Статистика/, async (msg) => {
    if (!isAdmin(msg)) return;
    
    const result = await apiRequest('stats');
    
    if (!result.success) {
        bot.sendMessage(msg.chat.id, '❌ Ошибка получения статистики');
        return;
    }
    
    bot.sendMessage(msg.chat.id,
        `📊 *Статистика*\n\n` +
        `Всего: ${result.total}\n` +
        `Активных: ${result.active}\n` +
        `Забаненных: ${result.banned}\n` +
        `Использованных: ${result.used}\n` +
        `Истёкших: ${result.expired}\n` +
        `Свободных: ${result.free}`,
        { parse_mode: 'Markdown' }
    );
});

console.log('🤖 Bot started! (Vercel API mode)');
console.log('API URL:', API_URL);
console.log('Admin IDs:', ADMIN_IDS);