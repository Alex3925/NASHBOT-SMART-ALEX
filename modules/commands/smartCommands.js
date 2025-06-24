const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const FormData = require("form-data");
const { format } = require("cassidy-styler");
const WebSocket = require("ws");
function design(title, content) {
    return format({
        title,
        titleFont: "bold",
        contentFont: "none",
        titlePattern: "【 ALEX 】{word} {emojis}",
        content,
    });
}

const smartCooldowns = new Map();

const activeSessions = new Map();
const lastSentCache = new Map();
const PH_TIMEZONE = "Asia/Manila";

function pad(n) {
    return n < 10 ? "0" + n : n;
}

function getPHTime() {
    return new Date(new Date().toLocaleString("en-US", { timeZone: PH_TIMEZONE }));
}

function getCountdown(target) {
    const now = getPHTime();
    const msLeft = target - now;
    if (msLeft <= 0) return "00h 00m 00s";
    const h = Math.floor(msLeft / 3.6e6);
    const m = Math.floor((msLeft % 3.6e6) / 6e4);
    const s = Math.floor((msLeft % 6e4) / 1000);
    return `${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}

function getNextRestocks() {
    const now = getPHTime();
    const timers = {};

    const nextEgg = new Date(now);
    nextEgg.setMinutes(now.getMinutes() < 30 ? 30 : 0);
    if (now.getMinutes() >= 30) nextEgg.setHours(now.getHours() + 1);
    nextEgg.setSeconds(0, 0);
    timers.egg = getCountdown(nextEgg);

    const next5 = new Date(now);
    const nextM = Math.ceil((now.getMinutes() + (now.getSeconds() > 0 ? 1 : 0)) / 5) * 5;
    next5.setMinutes(nextM === 60 ? 0 : nextM, 0, 0);
    if (nextM === 60) next5.setHours(now.getHours() + 1);
    timers.gear = timers.seed = getCountdown(next5);

    const nextSummerEvent = new Date(now);
    nextSummerEvent.setMinutes(0, 0, 0); 
    if (now.getMinutes() > 0 || now.getSeconds() > 0 || now.getMilliseconds() > 0) {
        nextSummerEvent.setHours(nextSummerEvent.getHours() + 1); 
    }
    timers.summerEvent = getCountdown(nextSummerEvent);

    const next7 = new Date(now);
    const totalHours = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    const next7h = Math.ceil(totalHours / 7) * 7;
    next7.setHours(next7h, 0, 0, 0);
    timers.cosmetics = getCountdown(next7);

    return timers;
}

function formatValue(val) {
    if (val >= 1_000_000) return `x${(val / 1_000_000).toFixed(1)}M`;
    if (val >= 1_000) return `x${(val / 1_000).toFixed(1)}K`;
    return `x${val}`;
}

function addEmoji(name) {
    const emojis = {
        "Common Egg": "🥚", "Uncommon Egg": "🐣", "Rare Egg": "🍳", "𝐋𝐞𝐠𝐞𝐧𝐝𝐚𝐫𝐲 𝐄𝐠𝐠": "🪺", "𝐌𝐲𝐭𝐡𝐢𝐜𝐚𝐥 𝐄𝐠𝐠": "🔮",
        "𝐁𝐮𝐠 𝐄𝐠𝐠": "🪲", "Common Summer Egg": "🥚", "Rare Summer Egg": "🍳", "𝐏𝐚𝐫𝐚𝐝𝐢𝐬𝐞 𝐄𝐠𝐠": "🪩",
        "Cleaning Spray": "🧴", "𝐅𝐫𝐢𝐞𝐧𝐝𝐬𝐡𝐢𝐩 𝐏𝐨𝐭": "🪴", "Watering Can": "🚿", "Trowel": "🛠️",
        "Recall Wrench": "🔧", "Basic Sprinkler": "💧", "Advanced Sprinkler": "💦", "𝐆𝐨𝐝𝐥𝐲 𝐒𝐩𝐫𝐢𝐧𝐤𝐥𝐞𝐫": "⛲",
        "𝐋𝐢𝐠𝐡𝐭𝐧𝐢𝐧𝐠 𝐑𝐨𝐝": "⚡", "𝐌𝐚𝐬𝐭𝐞𝐫 𝐒𝐩𝐫𝐢𝐧𝐤𝐥𝐞𝐫": "🌊", "Favorite Tool": "❤️", "Harvest Tool": "🌾",
        "𝐓𝐚𝐧𝐧𝐢𝐧𝐠 𝐌𝐢𝐫𝐫𝐨𝐫": "🪞", "Carrot": "🥕", "Strawberry": "🍓", "Blueberry": "🫐", "Cauliflower": "🌷",
        "Tomato": "🍅", "Green Apple": "🍏", "Avocado": "🥑", "Watermelon": "🍉", "Banana": "🍌",
        "Pineapple": "🍍", "𝐁𝐞𝐥𝐥 𝐏𝐞𝐩𝐩𝐞𝐫": "🌶️", "𝐏𝐫𝐢𝐜𝐤𝐥𝐲 𝐏𝐞𝐚𝐫": "🍐", "𝐋𝐨𝐪𝐮𝐚𝐭": "🍒",
        "𝐊𝐢𝐰𝐢": "🥝", "𝐅𝐞𝐢𝐣𝐨𝐚": "🍈", "𝐒𝐮𝐠𝐚𝐫 𝐀𝐩𝐩𝐥𝐞": "🍏"
    };

    const isBold = /[\u{1D400}-\u{1D7FF}]/u.test(name);

    const emoji = emojis[name] || "❓";

    if (isBold) {
        
        return `⭐ **${emoji} ${name}**`;
    } else {
       
        return `${emoji} ${name}`;
    }
}

module.exports = {
    name: "smart",
    description: "Smart command detection without prefixes",
    nashPrefix: false,
    version: "1.0.0",
    cooldowns: 5,
    execute: async (api, event, args, prefix) => {
        const { threadID, messageID, senderID, body } = event;
        const message = body.toLowerCase().trim();

        const configPath = path.join(__dirname, '../../config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const isAdmin = senderID === config.adminUID;

        const userId = senderID;
        const cooldownTime = 5000; 
        const now = Date.now();

        if (smartCooldowns.has(userId)) {
            const expirationTime = smartCooldowns.get(userId);
            if (now < expirationTime) {
                const timeLeft = 5; 
                return api.sendMessage(`⏰ Please wait ${timeLeft} seconds before using smart commands again.`, threadID, messageID);
            }
        }

        smartCooldowns.set(userId, now + cooldownTime);
        setTimeout(() => smartCooldowns.delete(userId), cooldownTime);

        if (isGagStockRequest(message)) {
            return handleGagStock(api, event, body, threadID, messageID);
        }

        if (isDownloadRequest(message, body)) {
            return handleDownload(api, event, body, threadID, messageID);
        }

        if (isTikTokSearch(message)) {
            return handleTikTokSearch(api, event, body, threadID, messageID);
        }

        if (isContactRequest(message)) {
            return handleContact(api, threadID, messageID);
        }



        if (isAriaRequest(message)) {
            return handleAria(api, event, body, threadID, messageID);
        }

        if (isRulesQuery(message)) {
            return handleRules(api, threadID, messageID);
        }

        if (isVideoRequest(message)) {
            return handleShoti(api, threadID, messageID);
        }

        if (isUIDRequest(message)) {
            return handleUID(api, event, args);
        }

        if (isUptimeRequest(message)) {
            return handleUptime(api, threadID, messageID);
        }

        if (isNotificationRequest(message)) {
            return handleSendNotification(api, event, args, threadID, messageID);
        }

        if (isHelpRequest(message)) {
            return handleHelp(api, threadID, messageID, prefix);
        }

        if (isCommandListRequest(message)) {
            return handleCommandList(api, threadID, messageID, prefix);
        }

        if (isPrefixRequest(message)) {
            return handlePrefix(api, threadID, prefix);
        }

        if (isOutRequest(message)) {
            return handleOut(api, event, threadID, messageID, isAdmin);
        }

        if (isAdmin) {
            if (isAddUserRequest(message)) {
                return handleAddUser(api, event, args, threadID, messageID);
            }

            if (isChangeAdminRequest(message)) {
                return handleChangeAdmin(api, event, args, threadID, messageID);
            }

            if (isShellCommand(message)) {
                return handleShell(api, event, args, threadID, messageID);
            }

            if (isEvalCommand(message)) {
                return handleEval(api, event, args, threadID, messageID);
            }
        }

        if (isListBoxRequest(message)) {
            return handleListBox(api, threadID, messageID);
        }

        if (message.includes('women') || message.includes('babae')) {
            return handleWomen(api, threadID, messageID);
        }

        if (isAIQuery(message)) {
            return handleAIQuery(api, event, body, threadID, messageID);
        }
    }
};

function translateAIKeywords() {
    const englishKeywords = {
        specificAi: [
            'explain', 'tell me about', 'what is', 'how does', 'why does', 'how to',
            'define', 'meaning of', 'calculate', 'solve', 'create', 'write', 'make',
            'generate', 'gpt', 'ai', 'chatgpt', 'openai', 'assistant', 'think',
            'analyze', 'compare', 'describe', 'summarize', 'translate', 'convert',
            'recommend', 'suggest', 'help me', 'can you', 'could you', 'would you',
            'please', 'teach me', 'show me', 'find', 'search', 'look up',
            'algorithm', 'code', 'programming', 'debug', 'error', 'fix',
            'review', 'optimize', 'improve', 'best practice', 'tutorial',
            'example', 'sample', 'demo', 'illustration', 'guide'
        ],
        questionWords: ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'whose'],
        questionPhrases: ['can you', 'could you', 'would you', 'do you', 'are you', 'is it', 'will you'],
        techKeywords: ['function', 'variable', 'array', 'object', 'string', 'number', 'boolean', 'loop', 'condition']
    };

    const translations = {

        tl: {
            specificAi: [
                'ipaliwanag', 'sabihin mo sa akin tungkol sa', 'ano ang', 'paano ginagawa', 'bakit ginagawa', 'paano',
                'tukuyin', 'kahulugan ng', 'kalkulahin', 'lutasin', 'lumikha', 'sumulat', 'gumawa',
                'lumikha', 'gpt', 'ai', 'chatgpt', 'openai', 'katulong', 'mag-isip',
                'suriin', 'ihambing', 'ilarawan', 'buuin', 'isalin', 'baguhin',
                'irekomenda', 'imungkahi', 'tulungan mo ako', 'maaari ka ba', 'pwede ka ba', 'gusto mo ba',
                'pakisuyo', 'turuan mo ako', 'ipakita mo sa akin', 'hanapin', 'maghanap', 'tingnan',
                'algorithm', 'code', 'programming', 'debug', 'error', 'ayusin',
                'suriin', 'i-optimize', 'pahusayin', 'best practice', 'tutorial',
                'halimbawa', 'sample', 'demo', 'ilustrasyon', 'gabay'
            ],
            questionWords: ['ano', 'paano', 'bakit', 'kailan', 'saan', 'sino', 'alin', 'kanino'],
            questionPhrases: ['maaari ka ba', 'pwede ka ba', 'gusto mo ba', 'ginagawa mo ba', 'ikaw ba ay', 'ito ba ay', 'gagawin mo ba'],
            techKeywords: ['function', 'variable', 'array', 'object', 'string', 'numero', 'boolean', 'loop', 'kondisyon']
        },

        ceb: {
            specificAi: [
                'ipasabot', 'sultihi ko mahitungod sa', 'unsa ang', 'giunsa pagbuhat', 'ngano gibuhat', 'giunsa',
                'ilhan', 'kahulugan sa', 'kuwentaha', 'sulbara', 'himoa', 'isulat', 'buhata',
                'himoa', 'gpt', 'ai', 'chatgpt', 'openai', 'katabang', 'maghunahuna',
                'susiha', 'itandi', 'ihulagway', 'ihiusa', 'hubara', 'usba',
                'irekomenda', 'isugyot', 'tabanga ko', 'mahimo ka ba', 'pwede ka ba', 'gusto ka ba',
                'palihog', 'tudloi ko', 'ipakita nako', 'pangita', 'mangita', 'tan-awa',
                'algorithm', 'code', 'programming', 'debug', 'error', 'ayoha',
                'susiha', 'i-optimize', 'pauswaga', 'maayong pamaagi', 'tutorial',
                'pananglitan', 'sample', 'demo', 'ilustrasyon', 'giya'
            ],
            questionWords: ['unsa', 'giunsa', 'ngano', 'kanus-a', 'asa', 'kinsa', 'hain', 'kang kinsa'],
            questionPhrases: ['mahimo ka ba', 'pwede ka ba', 'gusto ka ba', 'gibuhat nimo ba', 'ikaw ba', 'kini ba', 'buhaton nimo ba'],
            techKeywords: ['function', 'variable', 'array', 'object', 'string', 'numero', 'boolean', 'loop', 'kondisyon']
        },

        bn: {
            specificAi: [
                'ব্যাখ্যা করুন', 'আমাকে বলুন সম্পর্কে', 'কি', 'কিভাবে করে', 'কেন করে', 'কিভাবে',
                'সংজ্ঞায়িত করুন', 'অর্থ', 'গণনা করুন', 'সমাধান করুন', 'তৈরি করুন', 'লিখুন', 'করুন',
                'তৈরি করুন', 'gpt', 'ai', 'chatgpt', 'openai', 'সহায়ক', 'চিন্তা করুন',
                'বিশ্লেষণ করুন', 'তুলনা করুন', 'বর্ণনা করুন', 'সংক্ষেপ করুন', 'অনুবাদ করুন', 'রূপান্তর করুন',
                'সুপারিশ করুন', 'পরামর্শ দিন', 'আমাকে সাহায্য করুন', 'আপনি কি পারবেন', 'আপনি কি পারেন', 'আপনি কি চান',
                'দয়া করে', 'আমাকে শেখান', 'আমাকে দেখান', 'খুঁজুন', 'অনুসন্ধান করুন', 'দেখুন',
                'অ্যালগরিদম', 'কোড', 'প্রোগ্রামিং', 'ডিবাগ', 'ত্রুটি', 'ঠিক করুন',
                'পর্যালোচনা করুন', 'অপ্টিমাইজ করুন', 'উন্নত করুন', 'ভাল অনুশীলন', 'টিউটোরিয়াল',
                'উদাহরণ', 'নমুনা', 'ডেমো', 'চিত্র', 'গাইড'
            ],
            questionWords: ['কি', 'কিভাবে', 'কেন', 'কখন', 'কোথায়', 'কে', 'কোনটি', 'কার'],
            questionPhrases: ['আপনি কি পারবেন', 'আপনি কি পারেন', 'আপনি কি চান', 'আপনি কি করেন', 'আপনি কি', 'এটি কি', 'আপনি কি করবেন'],
            techKeywords: ['ফাংশন', 'ভেরিয়েবল', 'অ্যারে', 'অবজেক্ট', 'স্ট্রিং', 'সংখ্যা', 'বুলিয়ান', 'লুপ', 'শর্ত']
        },

        id: {
            specificAi: [
                'jelaskan', 'ceritakan tentang', 'apa itu', 'bagaimana cara', 'mengapa', 'cara',
                'definisikan', 'arti dari', 'hitung', 'selesaikan', 'buat', 'tulis', 'buat',
                'hasilkan', 'gpt', 'ai', 'chatgpt', 'openai', 'asisten', 'pikir',
                'analisis', 'bandingkan', 'deskripsikan', 'ringkas', 'terjemahkan', 'konversi',
                'rekomendasikan', 'sarankan', 'bantu saya', 'bisakah kamu', 'dapatkah kamu', 'maukah kamu',
                'tolong', 'ajari saya', 'tunjukkan', 'cari', 'telusuri', 'lihat',
                'algoritma', 'kode', 'pemrograman', 'debug', 'error', 'perbaiki',
                'tinjau', 'optimalisasi', 'tingkatkan', 'praktik terbaik', 'tutorial',
                'contoh', 'sampel', 'demo', 'ilustrasi', 'panduan'
            ],
            questionWords: ['apa', 'bagaimana', 'mengapa', 'kapan', 'dimana', 'siapa', 'yang mana', 'milik siapa'],
            questionPhrases: ['bisakah kamu', 'dapatkah kamu', 'maukah kamu', 'apakah kamu', 'apakah kamu', 'apakah ini', 'akankah kamu'],
            techKeywords: ['fungsi', 'variabel', 'array', 'objek', 'string', 'angka', 'boolean', 'loop', 'kondisi']
        },

        fr: {
            specificAi: [
                'expliquer', 'parlez-moi de', 'qu\'est-ce que', 'comment fait', 'pourquoi fait', 'comment',
                'définir', 'signification de', 'calculer', 'résoudre', 'créer', 'écrire', 'faire',
                'générer', 'gpt', 'ai', 'chatgpt', 'openai', 'assistant', 'penser',
                'analyser', 'comparer', 'décrire', 'résumer', 'traduire', 'convertir',
                'recommander', 'suggérer', 'aidez-moi', 'pouvez-vous', 'pourriez-vous', 'voudriez-vous',
                's\'il vous plaît', 'enseignez-moi', 'montrez-moi', 'trouver', 'chercher', 'regarder',
                'algorithme', 'code', 'programmation', 'déboguer', 'erreur', 'corriger',
                'examiner', 'optimiser', 'améliorer', 'bonne pratique', 'tutoriel',
                'exemple', 'échantillon', 'démo', 'illustration', 'guide'
            ],
            questionWords: ['quoi', 'comment', 'pourquoi', 'quand', 'où', 'qui', 'lequel', 'à qui'],
            questionPhrases: ['pouvez-vous', 'pourriez-vous', 'voudriez-vous', 'faites-vous', 'êtes-vous', 'est-ce', 'allez-vous'],
            techKeywords: ['fonction', 'variable', 'tableau', 'objet', 'chaîne', 'nombre', 'booléen', 'boucle', 'condition']
        },

        ru: {
            specificAi: [
                'объяснить', 'расскажи мне о', 'что такое', 'как делает', 'почему делает', 'как',
                'определить', 'значение', 'вычислить', 'решить', 'создать', 'написать', 'сделать',
                'генерировать', 'gpt', 'ai', 'chatgpt', 'openai', 'помощник', 'думать',
                'анализировать', 'сравнить', 'описать', 'резюмировать', 'перевести', 'конвертировать',
                'рекомендовать', 'предложить', 'помоги мне', 'можешь ли ты', 'мог бы ты', 'хотел бы ты',
                'пожалуйста', 'научи меня', 'покажи мне', 'найти', 'искать', 'посмотреть',
                'алгоритм', 'код', 'программирование', 'отладка', 'ошибка', 'исправить',
                'обзор', 'оптимизировать', 'улучшить', 'лучшая практика', 'учебник',
                'пример', 'образец', 'демо', 'иллюстрация', 'руководство'
            ],
            questionWords: ['что', 'как', 'почему', 'когда', 'где', 'кто', 'который', 'чей'],
            questionPhrases: ['можешь ли ты', 'мог бы ты', 'хотел бы ты', 'делаешь ли ты', 'ты', 'это', 'будешь ли ты'],
            techKeywords: ['функция', 'переменная', 'массив', 'объект', 'строка', 'число', 'логический', 'цикл', 'условие']
        },
     
        zh: {
            specificAi: [
                '解释', '告诉我关于', '什么是', '如何做', '为什么做', '如何',
                '定义', '意思', '计算', '解决', '创建', '写', '做',
                '生成', 'gpt', 'ai', 'chatgpt', 'openai', '助手', '思考',
                '分析', '比较', '描述', '总结', '翻译', '转换',
                '推荐', '建议', '帮助我', '你能', '你可以', '你愿意',
                '请', '教我', '给我看', '找到', '搜索', '查看',
                '算法', '代码', '编程', '调试', '错误', '修复',
                '审查', '优化', '改进', '最佳实践', '教程',
                '例子', '样本', '演示', '插图', '指南'
            ],
            questionWords: ['什么', '如何', '为什么', '何时', '哪里', '谁', '哪个', '谁的'],
            questionPhrases: ['你能', '你可以', '你愿意', '你做', '你是', '这是', '你会'],
            techKeywords: ['函数', '变量', '数组', '对象', '字符串', '数字', '布尔', '循环', '条件']
        }
    };

    const allKeywords = {
        specificAi: [...englishKeywords.specificAi],
        questionWords: [...englishKeywords.questionWords],
        questionPhrases: [...englishKeywords.questionPhrases],
        techKeywords: [...englishKeywords.techKeywords]
    };

    Object.values(translations).forEach(lang => {
        allKeywords.specificAi.push(...lang.specificAi);
        allKeywords.questionWords.push(...lang.questionWords);
        allKeywords.questionPhrases.push(...lang.questionPhrases);
        allKeywords.techKeywords.push(...lang.techKeywords);
    });

    return allKeywords;
}

function isAIQuery(message) {
    const keywords = translateAIKeywords();

    if (keywords.specificAi.some(keyword => message.includes(keyword))) {
        return true;
    }

    if (message.endsWith('?') || keywords.questionWords.some(word => message.startsWith(word + ' '))) {
        const excludePatterns = [
            'what commands', 'what cmd', 'what are the rules', 'what is your prefix',
            'what\'s my uid', 'what\'s my id', 'how long', 'when did', 'what commands',
            'what video', 'what movie', 'what song', 'when restock', 'what time',
            'how to download', 'gag stock', 'stock', 'restock', 'ano ang commands',
            'unsa ang commands', 'কি কমান্ড', 'apa perintah', 'quelles commandes',
            'какие команды', '什么命令'
        ];

        if (!excludePatterns.some(pattern => message.includes(pattern))) {
            return true;
        }
    }

    if (keywords.questionPhrases.some(phrase => message.includes(phrase))) {
        return true;
    }

    if (/[\d\+\-\*\/\(\)\=\^\%]/.test(message) && message.length > 3) {
        return true;
    }

    if (keywords.techKeywords.some(keyword => message.includes(keyword))) {
        return true;
    }

    return false;
}

function isGagStockRequest(message) {
    const gagKeywords = [
        'gag stock', 'stock gag', 'gagstock', 'grow a garden stock',
        'restock timer', 'stock timer', 'garden stock', 'stock', 'gag', 'grow a garden'
    ];

    return gagKeywords.some(keyword => message.includes(keyword));
}

function isContactRequest(message) {
    return message.includes('contact') || message.includes('owner info') || 
           message.includes('contacts') || message.includes('info') || 
           message.includes('developer') || message.includes('creator info');
}



function isAriaRequest(message) {
    return message.includes('aria') || message.includes('alternative ai');
}

function isRulesQuery(message) {
    return message.includes('rules') || message.includes('regulation') ||
           message.includes('rule') || message.includes('give the rules') ||
           message.includes('guideline') || message.includes('what are the rules');
}

function isVideoRequest(message) {
    const videoKeywords = ['video', 'shoti', 'girl', 'tiktok video', 'send video', 'show video', 'random shoti', 'shoti random'];
    return videoKeywords.some(keyword => message.includes(keyword));
}

function isUIDRequest(message) {
    return message.includes('uid') || message.includes('user id') || 
           message.includes('my id') || message.includes('get id');
}

function isUptimeRequest(message) {
    return message.includes('uptime') || message.includes('how long') ||
           message.includes('upt') || message.includes('run time') ||
           message.includes('running time') || message.includes('bot uptime');
}

function isDownloadRequest(message, fullBody) {
    return (message.includes('download') || message.includes('dl')) && 
           (fullBody.includes('facebook.com') || fullBody.includes('fb.watch'));
}

function isTikTokSearch(message) {
    return message.includes('tiktok') && !message.includes('download') && 
           !message.includes('facebook.com');
}

function isNotificationRequest(message) {
    return message.includes('notification') || message.includes('notify') ||
           message.includes('send noti') || message.includes('broadcast');
}

function isHelpRequest(message) {
    return message.includes('help') || message.includes('what can you do') ||
           message.includes('what are your features') || message.includes('smart');
}

function isCommandListRequest(message) {
    return message.includes('command') || message.includes('cmd') || 
           message.includes('list command') || message.includes('show command') ||
           message.includes('list cmd') || message.includes('show cmd') ||
           message.includes('available command') || message.includes('what commands');
}

function isPrefixRequest(message) {
    return message.includes('prefix') || message.includes('what is your prefix');
}

function isOutRequest(message) {
    return message.includes('leave') || message.includes('out') || 
           message.includes('exit') || message.includes('goodbye');
}

function isAddUserRequest(message) {
    return message.includes('add user') || message.includes('adduser');
}

function isChangeAdminRequest(message) {
    return message.includes('change admin') || message.includes('new admin') ||
           message.includes('transfer admin') || message.includes('changeadmin');
}

function isShellCommand(message) {
    return message.startsWith('shell ') || message.startsWith('run ');
}

function isEvalCommand(message) {
    return message.startsWith('eval ') || message.startsWith('execute ');
}

function isListBoxRequest(message) {
    return message.includes('list') && (message.includes('group') || message.includes('box'));
}

async function handleAIQuery(api, event, body, threadID, messageID) {
    const prompt = body.trim();

    api.sendMessage("Processing...", threadID, async (err, info) => {
        if (err) return;

        try {
            const url = `${global.NashBot.JOSHUA}api/gpt4o-latest?ask=${encodeURIComponent(prompt)}&uid=1&imageUrl=&apikey=609efa09-3ed5-4132-8d03-d6f8ca11b527`;
            const response = await axios.get(url);
            const reply = response.data.response;
            api.editMessage(reply, info.messageID);
        } catch (error) {
            api.editMessage("❌ Failed to get AI response.", info.messageID);
        }
    }, messageID);
}

function handleContact(api, threadID, messageID) {
    const contactContent = `👨‍💻 Developers: Joshua Apostol | Cyril Encenso
📧 Email: joshuaapostol909@gmail.com || Amigohaycyril10@gmail.com
📱 Facebook: https://www.facebook.com/joshuaapostol2006 || https://www.facebook.com/cyypookie
🌐 Website: joshua-portfolio.com
💻 GitHub: https://github.com/joshuaApos || https://github.com/atsushinakajima14

💬 For support or inquiries, feel free to reach out!`;

    const contactInfo = design("📞 Contact Information", contactContent);
    api.sendMessage(contactInfo, threadID, messageID);
}



async function handleAria(api, event, body, threadID, messageID) {
    const prompt = body.replace(/aria/gi, '').trim();

    if (!prompt) {
        return api.sendMessage("What would you like to ask Aria?", threadID, messageID);
    }

    api.sendMessage("Processing..", threadID, async (err, info) => {
        try {
            const url = `https://api.openai.com/v1/chat/completions`;

            const response = await axios.get(`${global.NashBot.JOSHUA}api/gpt4o-latest?ask=${encodeURIComponent(prompt)}&uid=2&imageUrl=&apikey=609efa09-3ed5-4132-8d03-d6f8ca11b527`);
            const reply = response.data.response;
            api.editMessage(`🎭 Aria: ${reply}`, info.messageID);
        } catch (error) {
            api.editMessage("❌ Aria is currently unavailable.", info.messageID);
        }
    });
}

function handleRules(api, threadID, messageID) {
    const rulesContent = `1. Be respectful: Treat everyone in the group with kindness and respect.
2. No spamming: Avoid sending repetitive or irrelevant messages.
3. Stay on topic: Keep discussions relevant to the group's purpose.
4. No personal information: Do not share personal details of yourself or others without permission.
5. Follow the group's purpose: Ensure your messages contribute to the educational or informational goals of the group.
6. Report issues: If you encounter any issues or have concerns, contact a group admin.`;

    const rules = design("📋 Rules", rulesContent);
    api.sendMessage(rules, threadID, messageID);
}

async function handleShoti(api, threadID, messageID) {
    api.sendMessage("📹 Getting video for you...", threadID, async (err, info) => {
        if (err) return;

        try {
            const { data } = await axios.post("https://shoti-rho.vercel.app/api/request/f");
            const videoUrl = data.url;
            const username = data.username;
            const nickname = data.nickname;

            const videoPath = path.resolve(__dirname, 'temp', 'shoti.mp4');
            const writer = fs.createWriteStream(videoPath);

            const responseStream = await axios({
                url: videoUrl,
                method: 'GET',
                responseType: 'stream',
            });

            responseStream.data.pipe(writer);

            writer.on('finish', () => {
                api.sendMessage({
                    body: `Username: ${username}\nNickname: ${nickname}`,
                    attachment: fs.createReadStream(videoPath),
                }, threadID, () => {
                    fs.unlinkSync(videoPath);
                    api.editMessage("✅ Video sent!", info.messageID);
                }, messageID);
            });

            writer.on('error', () => {
                api.editMessage("❌ Error processing video.", info.messageID);
            });
        } catch (error) {
            api.editMessage("❌ Error fetching video.", info.messageID);
        }
    });
}

function handleUID(api, event, args) {
    const { threadID, senderID } = event;
    let id = senderID;

    if (event.type === 'message_reply') {
        id = event.messageReply.senderID;
    }

    if (event.mentions && Object.keys(event.mentions).length > 0) {
        id = Object.keys(event.mentions)[0];
    }

    api.shareContact(id, id, threadID);
}

function handleUptime(api, threadID, messageID) {
    const uptime = process.uptime();
    const hours = Math.floor(uptime / 3600);
    const minutes = Math.floor((uptime % 3600) / 60);
    const seconds = Math.floor(uptime % 60);

    const message = `⏰ Bot Uptime: ${hours}h ${minutes}m ${seconds}s`;
    api.sendMessage(message, threadID, messageID);
}

async function handleDownload(api, event, body, threadID, messageID) {
    const urlMatch = body.match(/(https?:\/\/[^\s]+)/);
    if (!urlMatch) {
        return api.sendMessage("Please provide a valid Facebook video URL.", threadID, messageID);
    }

    const fbUrl = urlMatch[0];

    api.sendMessage("⏳ Downloading video...", threadID, async (err, info) => {
        if (err) return;

        try {
            const form = new FormData();
            form.append("k_exp", "1749611486");
            form.append("k_token", "aa26d4a3b2bf844c8af6757179b85c10ab6975dacd30b55ef79d0d695f7ea764");
            form.append("q", fbUrl);
            form.append("lang", "en");
            form.append("web", "fdownloader.net");
            form.append("v", "v2");

            const headers = {
                ...form.getHeaders(),
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept": "*/*"
            };

            const response = await axios.post("https://v3.fdownloader.net/api/ajaxSearch", form, { headers });

            if (response.data.status !== "ok") {
                throw new Error("Failed to fetch video data");
            }

            const html = response.data.data;
            const downloadLinks = [];

            const mp4Regex = /<a href="(https:\/\/dl\.snapcdn\.app\/download\?token=[^"]+)"[^>]*>Download<\/a>/g;
            let match;
            while ((match = mp4Regex.exec(html)) !== null) {
                const qualityMatch = html.substring(0, match.index).match(/video-quality[^>]*>([^<]+)</);
                if (qualityMatch) {
                    downloadLinks.push({
                        url: match[1],
                        quality: qualityMatch[1].trim()
                    });
                }
            }

            if (downloadLinks.length === 0) {
                throw new Error("No download links found");
            }

            downloadLinks.sort((a, b) => {
                const getQualityNum = (q) => parseInt(q.replace(/\D/g, "")) || 0;
                return getQualityNum(b.quality) - getQualityNum(a.quality);
            });

            const bestQuality = downloadLinks[0];

            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir);
            }

            const videoPath = path.join(tempDir, `fb_video_${Date.now()}.mp4`);
            const writer = fs.createWriteStream(videoPath);

            const videoResponse = await axios({
                method: 'get',
                url: bestQuality.url,
                responseType: 'stream'
            });

            videoResponse.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            const videoStream = fs.createReadStream(videoPath);
            api.sendMessage({
                attachment: videoStream
            }, threadID, () => {
                fs.unlinkSync(videoPath);
                api.unsendMessage(info.messageID);
            });

        } catch (error) {
            api.editMessage("❌ Error downloading video.", info.messageID);
        }
    }, messageID);
}

async function handleTikTokSearch(api, event, body, threadID, messageID) {
    const query = body.replace(/tiktok/gi, '').trim();
    if (!query) {
        return api.sendMessage("What TikTok video would you like me to find?", threadID, messageID);
    }

    api.sendMessage("🔍 Searching TikTok...", threadID, async (err, info) => {
        try {
            const res = await axios.get(`https://zen-api.gleeze.com/api/tiktok?query=${encodeURIComponent(query)}`);
            const data = res.data;

            if (!data || !data.no_watermark) {
                throw new Error("No video found.");
            }

            const tempDir = path.join(__dirname, "temp");
            if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);

            const fileName = `tiktok_${Date.now()}.mp4`;
            const videoPath = path.join(tempDir, fileName);
            const writer = fs.createWriteStream(videoPath);

            const videoStream = await axios({
                method: "GET",
                url: data.no_watermark,
                responseType: "stream",
            });

            videoStream.data.pipe(writer);
            await new Promise((resolve, reject) => {
                writer.on("finish", resolve);
                writer.on("error", reject);
            });

            const attachment = fs.createReadStream(videoPath);
            api.sendMessage({
                body: `🎬 ${data.title || 'TikTok Video'}`,
                attachment,
            }, threadID, () => {
                fs.unlinkSync(videoPath);
                api.unsendMessage(info.messageID);
            });

        } catch (error) {
            api.editMessage("❌ Error finding TikTok video.", info.messageID);
        }
    }, messageID);
}

async function handleSendNotification(api, event, args, threadID, messageID) {
    const message = event.body.replace(/notification|notify|send noti|broadcast/gi, '').trim();

    if (!message) {
        return api.sendMessage("What notification would you like to send?", threadID, messageID);
    }

    try {
        const inbox = await api.getThreadList(100, null, ['INBOX']);
        const groups = inbox.filter(group => group.isSubscribed && group.isGroup);

        let sent = 0;
        for (const group of groups) {
            try {
                await api.sendMessage(`📢 Notification: ${message}`, group.threadID);
                sent++;
            } catch (err) {
                console.error(`Failed to send to ${group.threadID}`);
            }
        }

        api.sendMessage(`✅ Notification sent to ${sent} groups.`, threadID, messageID);
    } catch (error) {
        api.sendMessage("❌ Failed to send notifications.", threadID, messageID);
    }
}

function handleHelp(api, threadID, messageID, prefix) {
    const helpContent = `----------------------------------

🤖 AI & Intelligence
   • Ask any question naturally
   • Get detailed explanations
   • Programming help & debugging
   • Math calculations
   • Educational content
   • General conversation

🎮 Grow A Garden Tracker
   • "gag stock" - Live stock tracking
   • "gag stock start" - Begin monitoring
   • "gag stock stop" - Stop tracking
   • "restock timer" - View timers
   • Real-time WebSocket updates

📹 Media & Entertainment
   • "Send me a video" or "shoti"
   • "TikTok video about [topic]"
   • "Download [Facebook URL]"
   • "women/babae" - Special content

🔧 Utilities & Tools
   • "Get my UID" - User identification
   • "List groups" - Group management
   • "Send notification [message]"
   • "Bot uptime" - System status

📋 Information
   • "What are the rules?"
   • "Contact info" - Developer details
   • "What's your prefix?"
   • "Commands" - Full command list

🎭 AI Alternatives
   • "aria [question]" - Alternative AI

🚪 Admin Features
   • "leave/out" - Bot exit group
   • "add user [UID]" - Add members
   • "change admin [UID]" - Transfer admin
   • "shell [command]" - Execute commands
   • "eval [code]" - Run JavaScript

----------------------------------

💡 Tips:
   • No prefixes needed for most features
   • Smart detection understands context
   • Questions ending with "?" auto-detected
   • Use natural language for best results

💬 Examples:
   • "What's the weather like?"
   • "How do I code in Python?"
   • "Show me a funny video"
   • "Download this Facebook video [URL]"`;

    const helpMessage = design("🤖 NASHBOT - COMPREHENSIVE GUIDE", helpContent);

    const imagePath = './nashbot.png';

    if (fs.existsSync(imagePath)) {
        const attachment = fs.createReadStream(imagePath);
        api.sendMessage({ body: helpMessage, attachment }, threadID);
    } else {
        api.sendMessage(helpMessage, threadID);
    }
}

function handleCommandList(api, threadID, messageID, prefix) {
    const { commands } = global.NashBoT;
    const commandArray = Array.from(commands.values());

    const uniqueCommands = commandArray.filter((cmd, index, self) => 
        index === self.findIndex(c => c.name === cmd.name)
    );

    const traditionalCommands = uniqueCommands.filter(cmd => 
        cmd.nashPrefix !== false && cmd.name !== 'smart'
    );

    let smartContent = `✨ 𝗦𝗠𝗔𝗥𝗧 𝗙𝗘𝗔𝗧𝗨𝗥𝗘𝗦 (𝗡𝗼 𝗣𝗿𝗲𝗳𝗶𝘅 𝗡𝗲𝗲𝗱𝗲𝗱!)

----------------------------------

🤖 AI & Intelligence
   • Ask any question naturally
   • Programming help & code review
   • Math calculations & solving
   • Educational explanations
   • Text analysis & generation
   • Conversation & chat

🎮 Grow A Garden Tracker
   • "gag stock" - Current stock status
   • "gag stock start" - Live tracking
   • "gag stock stop" - Stop monitoring
   • "restock timer" - View all timers
   • Real-time WebSocket updates
   • Filter specific items

📹 Media & Entertainment
   • "video", "shoti" - Random videos
   • "TikTok [search]" - TikTok search
   • "Download [Facebook URL]" - FB videos
   • "women", "babae" - Special content

🔧 Utilities & Tools
   • "uid", "my id" - Get user ID
   • "list groups" - Group management
   • "notification [msg]" - Broadcast
   • "uptime" - Bot runtime status

📋 Information & Help
   • "rules" - Server guidelines
   • "contact" - Developer info
   • "prefix" - Current prefix
   • "help" - Feature guide
   • "commands" - This list

🎭 AI Alternatives
   • "aria [question]" - Alternative AI

🚪 Admin Features (Admin Only)
   • "leave", "out" - Exit group
   • "add user [UID]" - Add members
   • "change admin [UID]" - Transfer admin
   • "shell [command]" - Execute system commands
   • "eval [code]" - Run JavaScript code

----------------------------------

`;

    if (traditionalCommands.length > 0) {
        smartContent += `⚙️ 𝗧𝗥𝗔𝗗𝗜𝗧𝗜𝗢𝗡𝗔𝗟 𝗖𝗢𝗠𝗠𝗔𝗡𝗗𝗦 (${prefix})\n\n`;

        traditionalCommands.forEach((cmd, index) => {
            const number = (index + 1).toString().padStart(2, '0');
            smartContent += `${number}. ${prefix}${cmd.name}`;
            if (cmd.aliases && cmd.aliases.length > 0) {
                smartContent += ` [${cmd.aliases.map(alias => prefix + alias).join(', ')}]`;
            }
            smartContent += `\n    ╰─ ${cmd.description || 'No description available'}\n`;
            if (cmd.cooldowns && cmd.cooldowns > 0) {
                smartContent += `    ╰─ ⏱️ Cooldown: ${cmd.cooldowns}s\n`;
            }
            smartContent += `\n`;
        });

        smartContent += `----------------------------------\n\n`;
    }

    smartContent += `💡 𝗨𝘀𝗮𝗴𝗲 𝗧𝗶𝗽𝘀:
   • Most features work without prefixes
   • Use natural language for best results
   • Questions ending with "?" auto-detected
   • Math expressions automatically calculated
   • URLs automatically recognized

🔧 𝗘𝘅𝗮𝗺𝗽𝗹𝗲𝘀:
   • "What's 15 + 25?"
   • "How do I center a div in CSS?"
   • "Send me a random video"
   • "Download this: [Facebook URL]"
   • "${prefix}help" (traditional command)

📊 𝗧𝗼𝘁𝗮𝗹: ${uniqueCommands.length} available features`;

    const commandListMessage = design("🤖 NASHBOT - COMPLETE COMMAND LIST", smartContent);

    const imagePath = './josh.jpeg';

    if (fs.existsSync(imagePath)) {
        const attachment = fs.createReadStream(imagePath);
        api.sendMessage({ body: commandListMessage, attachment }, threadID, messageID);
    } else {
        api.sendMessage(commandListMessage, threadID, messageID);
    }
}

function handlePrefix(api, threadID, prefix) {
    const message = `My prefix is [ 𓆩 '${prefix}' 𓆪 ]\n\nBut guess what? You don't need it anymore! 🎉\nJust talk to me naturally and I'll understand! 💬`;

    const imagePath = './josh.jpeg';

    if (fs.existsSync(imagePath)) {
        const attachment = fs.createReadStream(imagePath);
        api.sendMessage({ body: message, attachment }, threadID);
    } else {
        api.sendMessage(message, threadID);
    }
}

function handleOut(api, event, threadID, messageID, isAdmin) {
    if (isAdmin) {
        api.sendMessage("👋 Goodbye! The bot is leaving this group.", threadID, () => {
            api.removeUserFromGroup(api.getCurrentUserID(), threadID);
        }, messageID);
    } else {
        api.sendMessage("❌ Only admins can make me leave the group.", threadID, messageID);
    }
}

function handleAddUser(api, event, args, threadID, messageID) {
    const uidMatch = event.body.match(/\d{10,}/);
    const uid = uidMatch ? uidMatch[0] : null;

    if (!uid) {
        return api.sendMessage("Please provide a valid UID to add.", threadID, messageID);
    }

    api.sendMessage("Adding user...", threadID, async (err, info) => {
        if (err) return;

        try {
            await api.addUserToGroup(uid, threadID);
            api.editMessage("✅ User added successfully!", info.messageID);
        } catch (error) {
            api.editMessage("❌ Failed to add user.", info.messageID);
        }
    }, messageID);
}

function handleChangeAdmin(api, event, args, threadID, messageID) {
    const uidMatch = event.body.match(/\d{10,}/);
    const newAdminUID = uidMatch ? uidMatch[0] : null;

    if (!newAdminUID) {
        return api.sendMessage("Please provide a valid UID for the new admin.", threadID, messageID);
    }

    try {
        const configPath = path.join(__dirname, '../../config.json');
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        config.adminUID = newAdminUID;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        api.sendMessage(`✅ Admin changed to UID: ${newAdminUID}`, threadID, messageID);
    } catch (error) {
        api.sendMessage("❌ Failed to change admin.", threadID, messageID);
    }
}

function handleShell(api, event, args, threadID, messageID) {
    const command = event.body.replace(/^(shell|run)\s+/i, '');

    if (!command) {
        return api.sendMessage('What command should I run?', threadID, messageID);
    }

    exec(command, (error, stdout, stderr) => {
        if (error) {
            api.sendMessage(`Error: ${error.message}`, threadID, messageID);
            return;
        }
        if (stderr) {
            api.sendMessage(`Error: ${stderr}`, threadID, messageID);
            return;
        }
        api.sendMessage(`Output:\n${stdout}`, threadID, messageID);
    });
}

async function handleEval(api, event, args, threadID, messageID) {
    const command = event.body.replace(/^eval\s+/i, '');

    if (!command) {
        return api.sendMessage('What JavaScript should I evaluate?', threadID, messageID);
    }

    try {
        const chat = {
            reply: (msg) => {
                if (typeof msg === 'object' && msg.body) {
                    api.sendMessage(msg.body, threadID, messageID);
                } else {
                    api.sendMessage(msg, threadID, messageID);
                }
            }
        };

        await eval(command);
    } catch (error) {
        api.sendMessage(`Error: ${error.message}`, threadID, messageID);
    }
}

async function handleListBox(api, threadID, messageID) {
    try {
        const inbox = await api.getThreadList(100, null, ['INBOX']);
        const list = inbox.filter(group => group.isSubscribed && group.isGroup);

        const listthread = [];
        for (const groupInfo of list) {
            const data = await api.getThreadInfo(groupInfo.threadID);
            listthread.push({
                id: groupInfo.threadID,
                name: groupInfo.name,
                sotv: data.userInfo.length,
            });
        }

        const listbox = listthread.sort((a, b) => b.sotv - a.sotv);

        let msg = '📊 Group List:\n\n';
        listbox.forEach((group, i) => {
            msg += `${i + 1}. ${group.name}\n🧩TID: ${group.id}\n🐸Members: ${group.sotv}\n\n`;
        });

        api.sendMessage(msg, threadID, messageID);
    } catch (error) {
        api.sendMessage('Error fetching group list.', threadID, messageID);
    }
}

function handleGagStock(api, event, body, threadID, messageID) {
    const message = body.toLowerCase().trim();
    const action = extractAction(message);
    const filters = extractFilters(body);

    if (action === "off" || action === "stop") {
        return handleStopTracking(api, threadID, messageID);
    }

    if (action === "on" || action === "start") {
        return handleStartTracking(api, threadID, messageID, filters);
    }

    if (action === "status" || action === "current") {
        return handleCurrentStatus(api, threadID, messageID);
    }

    if (action === "timer" || action === "restock") {
        return handleRestockTimers(api, threadID, messageID);
    }

    const helpContent = `----------------------------------

🔥 𝗤𝗨𝗜𝗖𝗞 𝗔𝗖𝗧𝗜𝗢𝗡𝗦
   ▶️ gag stock start
   ⏹️ gag stock stop
   📊 gag stock status
   ⏰ restock timer

🎯 𝗔𝗗𝗩𝗔𝗡𝗖𝗘𝗗 𝗙𝗘𝗔𝗧𝗨𝗥𝗘𝗦
   🔍 gag stock start Sunflower | Watering Can
   📡 Real-time WebSocket monitoring
   🌐 Live updates across all groups
   ⚡ Instant restock notifications

----------------------------------

💡 𝗧𝗜𝗣𝗦 & 𝗧𝗥𝗜𝗖𝗞𝗦
   • Use filters to track specific items
   • Separate multiple filters with "|"
   • Timers auto-update in Philippines timezone
   • Weather bonuses included in status

🚀 𝗣𝗢𝗪𝗘𝗥𝗘𝗗 𝗕𝗬 𝗪𝗘𝗕𝗦𝗢𝗖𝗞𝗘𝗧
   Real-time data from Grow a Garden Stock`;

    const gagHelp = design("🌾 GROW A GARDEN STOCK TRACKER", helpContent);
    return api.sendMessage(gagHelp, threadID, messageID);
}

function extractAction(message) {
    if (message.includes('start') || message.includes('on') || message.includes('track')) {
        return 'start';
    }
    if (message.includes('stop') || message.includes('off') || message.includes('end')) {
        return 'stop';
    }
    if (message.includes('status') || message.includes('current')) {
        return 'status';
    }
    if (message.includes('timer') || message.includes('restock')) {
        return 'timer';
    }
    return 'unknown';
}

function extractFilters(body) {
    const parts = body.split('|');
    if (parts.length > 1) {
        return parts.slice(1).map(f => f.trim().toLowerCase()).filter(Boolean);
    }
    return [];
}

function handleStopTracking(api, threadID, messageID) {
    const session = activeSessions.get(threadID);
    if (session) {
        clearInterval(session.keepAlive);
        session.closed = true;
        session.ws?.terminate();
        activeSessions.delete(threadID);
        lastSentCache.delete(threadID);

    const stopContent = `----------------------------------

🛑 𝗧𝗥𝗔𝗖𝗞𝗜𝗡𝗚 𝗧𝗘𝗥𝗠𝗜𝗡𝗔𝗧𝗘𝗗

📡 WebSocket connection closed
🔄 Real-time monitoring disabled
💾 Session data cleared
✅ Successfully stopped

----------------------------------

🎮 Use 'gag stock start' to resume tracking`;

        const stopMessage = design("🌾 GAG STOCK TRACKER", stopContent);
        return api.sendMessage(stopMessage, threadID, messageID);
    } else {
        const notActiveContent = `----------------------------------

⚠️ 𝗡𝗢 𝗔𝗖𝗧𝗜𝗩𝗘 𝗦𝗘𝗦𝗦𝗜𝗢𝗡

📡 No tracking session found
🔄 Monitoring is not running
🎮 Use 'gag stock start' to begin`;

        const notActiveMessage = design("🌾 GAG STOCK TRACKER", notActiveContent);
        return api.sendMessage(notActiveMessage, threadID, messageID);
    }
}

function handleStartTracking(api, threadID, messageID, filters) {
    if (activeSessions.has(threadID)) {
        const alreadyActiveContent = `----------------------------------

⚠️ 𝗧𝗥𝗔𝗖𝗞𝗜𝗡𝗚 𝗔𝗟𝗥𝗘𝗔𝗗𝗬 𝗔𝗖𝗧𝗜𝗩𝗘

📡 Live monitoring is currently running
🔄 Real-time updates are being delivered
⏹️ Use 'gag stock stop' to terminate`;

        const alreadyActive = design("🌾 GAG STOCK TRACKER", alreadyActiveContent);
        return api.sendMessage(alreadyActive, threadID, messageID);
    }

    const startContent = `----------------------------------

✅ 𝗧𝗥𝗔𝗖𝗞𝗜𝗡𝗚 𝗜𝗡𝗜𝗧𝗜𝗔𝗟𝗜𝗭𝗘𝗗

📡 WebSocket connection established
🔄 Real-time monitoring activated
⚡ Instant notifications enabled
${filters.length > 0 ? `🎯 Filtered items: ${filters.join(', ')}` : '🌍 Monitoring all items'}

----------------------------------

🎮 Get ready for live GAG stock updates!`;

    const startMessage = design("🌾 GAG STOCK TRACKER", startContent);
    api.sendMessage(startMessage, threadID, messageID);

    let ws;
    let keepAliveInterval;

    function connectWebSocket() {
        ws = new WebSocket("wss://gagstock.gleeze.com");

        ws.on("open", () => {
            keepAliveInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send("ping");
                }
            }, 10000);
        });

        ws.on("message", async (data) => {
            try {
                const payload = JSON.parse(data);
                if (payload.status !== "success") return;

                const backup = payload.data;
                const stockData = {
                    gearStock: backup.gear.items.map(i => ({ name: i.name, value: Number(i.quantity) })),
                    seedsStock: backup.seed.items.map(i => ({ name: i.name, value: Number(i.quantity) })),
                    eggStock: backup.egg.items.map(i => ({ name: i.name, value: Number(i.quantity) })),
                    cosmeticsStock: backup.cosmetics.items.map(i => ({ name: i.name, value: Number(i.quantity) })),
                    summerEventData: {
                        name: "Summer Event 2025",
                        status: "Active",
                        description: "Special summer activities and rewards"
                    }
                };

                const currentKey = JSON.stringify({
                    gearStock: stockData.gearStock,
                    seedsStock: stockData.seedsStock
                });

                const lastSent = lastSentCache.get(threadID);
                if (lastSent === currentKey) return;
                lastSentCache.set(threadID, currentKey);

                const restocks = getNextRestocks();
                const formatList = (arr) => arr.map(i => `- ${addEmoji(i.name)}: ${formatValue(i.value)}`).join("\n");

                let filteredContent = "";
                let matched = 0;

                const addSection = (label, items, restock) => {
                    const filtered = filters.length ? items.filter(i => filters.some(f => i.name.toLowerCase().includes(f))) : items;
                    if (label === "🛠️ 𝐆𝐄𝐀𝐑𝐒" || label === "🌱 𝐒𝐄𝐄𝐃𝐒") {
                        if (filtered.length > 0) {
                            matched += filtered.length;
                            filteredContent += `${label}:\n${formatList(filtered)}\n⏳ Restock In: ${restock}\n\n`;
                        }
                    } else {
                        filteredContent += `${label}:\n${formatList(items)}\n⏳ Restock In: ${restock}\n\n`;
                    }
                };

                addSection("🛠️ 𝐆𝐄𝐀𝐑𝐒", stockData.gearStock, restocks.gear);
                addSection("🌱 𝐒𝐄𝐄𝐃𝐒", stockData.seedsStock, restocks.seed);
                addSection("🥚 𝐄𝐆𝐆𝐒", stockData.eggStock, restocks.egg);
                addSection("🎨 𝐂𝐎𝐒𝐌𝐄𝐓𝐈𝐂𝐒", stockData.cosmeticsStock, restocks.cosmetics);
                
                filteredContent += `☀️ 𝐒𝐔𝐌𝐌𝐄𝐑 𝐄𝐕𝐄𝐍𝐓:\n🎯 Event: ${stockData.summerEventData.name}\n📊 Status: ${stockData.summerEventData.status}\n📝 ${stockData.summerEventData.description}\n⏳ Next Update: ${restocks.summerEvent}\n\n`;

                if (matched === 0 && filters.length > 0) return;

                const updatedAtPH = getPHTime().toLocaleString("en-PH", {
                    hour: "numeric", minute: "numeric", second: "numeric",
                    hour12: true, day: "2-digit", month: "short", year: "numeric"
                });

                const weather = await axios.get("https://growagardenstock.com/api/stock/weather").then(res => res.data).catch(() => null);
                const weatherInfo = weather ? `🌤️ 𝐖𝐄𝐀𝐓𝐇𝐄𝐑: ${weather.icon} ${weather.weatherType}\n📋 ${weather.description}\n🎯 ${weather.cropBonuses}\n\n` : "";

                const liveContent = `----------------------------------

${filteredContent}${weatherInfo}----------------------------------

📡 LIVE UPDATE • ${updatedAtPH}
🔄 Next refresh in ~10 seconds
⚡ Real-time WebSocket monitoring`;

                const liveMessage = design("🌾 GROW A GARDEN — LIVE TRACKER", liveContent);

                if (!activeSessions.has(threadID)) return;
                api.sendMessage(liveMessage, threadID);
            } catch (e) {
                console.error('GAG Stock WebSocket Error:', e);
            }
        });

        ws.on("close", () => {
            clearInterval(keepAliveInterval);
            const session = activeSessions.get(threadID);
            if (session && !session.closed) setTimeout(connectWebSocket, 3000);
        });

        ws.on("error", (error) => {
            console.error('GAG Stock WebSocket Error:', error);
            ws.close();
        });

        activeSessions.set(threadID, { ws, keepAlive: keepAliveInterval, closed: false });
    }

    connectWebSocket();
}

async function handleCurrentStatus(api, threadID, messageID) {
    try {
        const response = await axios.get('https://growagardenstock.com/api/stock');
        const stockData = response.data;

        const restocks = getNextRestocks();
        const formatList = (arr) => arr.map(i => `- ${addEmoji(i.name)}: ${formatValue(i.quantity)}`).join("\n");

        let content = "";
        content += `🛠️ 𝗚𝗘𝗔𝗥𝗦:\n${formatList(stockData.gear.items)}\n⏳ Restock In: ${restocks.gear}\n\n`;
        content += `🌱 𝗦𝗘𝗘𝗗𝗦:\n${formatList(stockData.seed.items)}\n⏳ Restock In: ${restocks.seed}\n\n`;
        content += `🥚 𝗘𝗚𝗚𝗦:\n${formatList(stockData.egg.items)}\n⏳ Restock In: ${restocks.egg}\n\n`;
        content += `🎨 𝗖𝗢𝗦𝗠𝗘𝗧𝗜𝗖𝗦:\n${formatList(stockData.cosmetics.items)}\n⏳ Restock In: ${restocks.cosmetics}\n\n`;
        content += `☀️ 𝗦𝗨𝗠𝗠𝗘𝗥 𝗘𝗩𝗘𝗡𝗧:\n🎯 Event: Summer Event 2025\n📊 Status: Active\n📝 Special summer activities and rewards\n⏳ Next Update: ${restocks.summerEvent}\n\n`;

        const updatedAtPH = getPHTime().toLocaleString("en-PH", {
            hour: "numeric", minute: "numeric", second: "numeric",
            hour12: true, day: "2-digit", month: "short", year: "numeric"
        });

        const weather = await axios.get("https://growagardenstock.com/api/stock/weather").then(res => res.data).catch(() => null);
        const weatherInfo = weather ? `🌤️ 𝗪𝗘𝗔𝗧𝗛𝗘𝗥: ${weather.icon} ${weather.weatherType}\n📋 ${weather.description}\n🎯 ${weather.cropBonuses}\n\n` : "";

        const statusContent = `----------------------------------

${content}${weatherInfo}----------------------------------

📊 STATUS UPDATE • ${updatedAtPH}
🎮 Use 'gag stock start' for live tracking
📡 Real-time monitoring available`;

        const statusMessage = design("🌾 GROW A GARDEN — CURRENT STOCK", statusContent);
        api.sendMessage(statusMessage, threadID, messageID);
    } catch (error) {
        console.error('Error fetching current stock:', error);
        api.sendMessage("❌ Failed to fetch current stock data.", threadID, messageID);
    }
}

function handleRestockTimers(api, threadID, messageID) {
    const timers = getNextRestocks();
    const currentTime = getPHTime().toLocaleTimeString('en-US', { 
        timeZone: PH_TIMEZONE,
        hour12: true 
    });

    const currentDate = getPHTime().toLocaleDateString('en-PH', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const timerContent = `----------------------------------

⏰ 𝗥𝗘𝗦𝗧𝗢𝗖𝗞 𝗧𝗜𝗠𝗘𝗥𝗦

🥚 Eggs: ${timers.egg}
☀️ Summer Event: ${timers.summerEvent}
⚙️ Gear: ${timers.gear}
🌱 Seeds: ${timers.seed}
💄 Cosmetics: ${timers.cosmetics}

----------------------------------

🕒 Current Time (PH): ${currentTime}
📅 ${currentDate}

💡 All timers shown in Philippines timezone
🔄 Use 'gag stock start' for live tracking`;

    const timerMessage = design("🌾 GROW A GARDEN — RESTOCK TIMERS", timerContent);
    api.sendMessage(timerMessage, threadID, messageID);
}

function handleWomen(api, threadID, messageID) {
    const msg = {
        body: "Women talaga",
        attachment: fs.createReadStream(__dirname + `/noprefix/Women.mp4`)
    };

    api.sendMessage(msg, threadID, messageID);
    api.setMessageReaction('☕', messageID, (err) => {
        if (err) console.error('Error setting reaction:', err);
    });
}
