//commands/aio2.js
const axios = require('axios');
const { spawn } = require('child_process');

// ═══════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════

const API_BASE = 'https://apis.davidcyriltech.my.id/download/aiov2?url=';
const MAX_SIZE_MB = 60;
const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

const NEWSLETTER = {
    newsletterJid: '120363425394543602@newsletter',
    newsletterName: '모🅒🅨🅑🅔🅡🅝🅞🅥🅐 🌟',
    serverMessageId: 202,
};

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════

function cleanTitle(title, fallback = 'media') {
    if (!title || typeof title !== 'string') return fallback;
    const cleaned = title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80);
    return cleaned || fallback;
}

function isValidUrl(str) {
    try {
        const u = new URL(str);
        return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
        return false;
    }
}

function pickFirst(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (const k of keys) {
        if (typeof obj[k] === 'string' && obj[k].startsWith('http')) return obj[k];
    }
    return null;
}

function extractMedia(result) {
    if (!result || typeof result !== 'object') return null;

    const videoUrl = pickFirst(result, ['video_download', 'video', 'videoUrl', 'play', 'hd', 'url', 'download']);
    const audioUrl = pickFirst(result, ['audio_download', 'audio', 'audioUrl', 'mp3']);
    const imageUrl = pickFirst(result, ['image_download', 'image', 'photo', 'imageUrl']);
    const thumbnail = pickFirst(result, ['thumbnail', 'thumb', 'cover', 'preview']);

    if (!videoUrl && !audioUrl && !imageUrl) return null;

    return {
        title: result.title || result.desc || result.caption || 'Media',
        thumbnail,
        videoUrl,
        audioUrl,
        imageUrl,
    };
}

function buildNewsletterContext() {
    return {
        forwardingScore: 350,
        isForwarded: true,
        forwardedNewsletterMessageInfo: NEWSLETTER,
    };
}

async function downloadBuffer(url) {
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 120000,
        maxContentLength: MAX_SIZE_BYTES,
        maxBodyLength: MAX_SIZE_BYTES,
        headers: {
            'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
    });

    const buf = Buffer.from(res.data);
    if (buf.length < 1024) throw new Error('Downloaded file too small or invalid');
    if (buf.length > MAX_SIZE_BYTES) throw new Error(`File too large (> ${MAX_SIZE_MB} MB)`);
    return buf;
}

/**
 * Extract an MP3 buffer from a video buffer using FFmpeg pipes.
 * No temp files -> no disk leak.
 */
function extractAudioBuffer(videoBuffer) {
    return new Promise((resolve, reject) => {
        let ffmpeg;
        try {
            ffmpeg = spawn('ffmpeg', [
                '-loglevel', 'error',
                '-i', 'pipe:0',
                '-vn',
                '-acodec', 'libmp3lame',
                '-ab', '128k',
                '-f', 'mp3',
                'pipe:1',
            ]);
        } catch (err) {
            return reject(err);
        }

        const chunks = [];
        ffmpeg.stdout.on('data', (c) => chunks.push(c));
        ffmpeg.stderr.on('data', () => {}); // swallow logs
        ffmpeg.on('error', reject);
        ffmpeg.on('close', (code) => {
            if (code === 0 && chunks.length) resolve(Buffer.concat(chunks));
            else reject(new Error(`ffmpeg exited with code ${code}`));
        });

        ffmpeg.stdin.on('error', () => {}); // ignore EPIPE
        ffmpeg.stdin.write(videoBuffer);
        ffmpeg.stdin.end();
    });
}

// ═══════════════════════════════════════
// COMMAND
// ═══════════════════════════════════════

module.exports = {
    name: 'aio2',
    aliases: ['aiodl', 'aiov2', 'aiodownload'],
    category: 'downloader',

    async execute({ sock, msg, args, jid }) {
        const input = args.join(' ').trim();

        // ─── No args → help ───
        if (!input) {
            return sock.sendMessage(jid, {
                text:
                    '🎬 *All-in-One Downloader (AIO)*\n\n' +
                    '⚡ *Usage:*\n' +
                    '.aio2 <url>\n\n' +
                    '✨ *Supports:*\n' +
                    'TikTok, Instagram, Facebook, Twitter/X, YouTube, etc.\n\n' +
                    '📌 *Example:*\n' +
                    '.aio2 https://vm.tiktok.com/ZMkMuEmmd',
                contextInfo: buildNewsletterContext(),
            }, { quoted: msg });
        }

        // ─── URL validation ───
        if (!isValidUrl(input)) {
            return sock.sendMessage(jid, {
                text:
                    '⚠️ *Invalid URL*\n\n' +
                    'Please provide a valid http/https link.\n\n' +
                    '📌 *Example:*\n' +
                    '.aio2 https://vm.tiktok.com/ZMkMuEmmd',
                contextInfo: buildNewsletterContext(),
            }, { quoted: msg });
        }

        try { await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }); } catch (_) {}

        // ─── Fetch API ───
        let media;
        try {
            const { data } = await axios.get(
                `${API_BASE}${encodeURIComponent(input)}`,
                { timeout: 30000 }
            );

            let resultItem = null;
            if (Array.isArray(data?.result) && data.result.length) resultItem = data.result[0];
            else if (data?.result && typeof data.result === 'object') resultItem = data.result;
            else if (Array.isArray(data?.data) && data.data.length) resultItem = data.data[0];
            else if (data?.data && typeof data.data === 'object') resultItem = data.data;

            if (!resultItem) throw new Error('No result returned by API');

            media = extractMedia(resultItem);
            if (!media) throw new Error('No downloadable media found in result');
        } catch (err) {
            console.error('❌ aio2 fetch error:', err.message);
            try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (_) {}
            return sock.sendMessage(jid, {
                text:
                    '❌ *Download Failed*\n\n' +
                    `${err.message}\n\n` +
                    '⚡ Try again or use another link.',
                contextInfo: buildNewsletterContext(),
            }, { quoted: msg });
        }

        const safeTitle = cleanTitle(media.title, 'media');

        try {
            // ═══════════════════════════════
            // VIDEO PATH
            // ═══════════════════════════════
            if (media.videoUrl) {
                const videoBuffer = await downloadBuffer(media.videoUrl);
                const sizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(2);

                const caption =
                    `🎬 *${safeTitle}*\n\n` +
                    `📦 *Size:* ${sizeMB} MB\n` +
                    `🔗 ${input}\n\n` +
                    `⚡ _Downloaded by Zenitsu_`;

                // 1) Info card (thumbnail if available)
                if (media.thumbnail) {
                    try {
                        await sock.sendMessage(jid, {
                            image: { url: media.thumbnail },
                            caption,
                            contextInfo: buildNewsletterContext(),
                        }, { quoted: msg });
                    } catch {
                        await sock.sendMessage(jid, {
                            text: caption,
                            contextInfo: buildNewsletterContext(),
                        }, { quoted: msg });
                    }
                } else {
                    await sock.sendMessage(jid, {
                        text: caption,
                        contextInfo: buildNewsletterContext(),
                    }, { quoted: msg });
                }

                // 2) Video (fallback: document)
                try {
                    await sock.sendMessage(jid, {
                        video: videoBuffer,
                        mimetype: 'video/mp4',
                        caption: safeTitle,
                    }, { quoted: msg });
                } catch (vidErr) {
                    console.warn('⚠️ Video send failed, falling back to document:', vidErr.message);
                    await sock.sendMessage(jid, {
                        document: videoBuffer,
                        mimetype: 'video/mp4',
                        fileName: `${safeTitle}.mp4`,
                    }, { quoted: msg });
                }

                // 3) Audio variant (best-effort)
                try {
                    const audioBuffer = await extractAudioBuffer(videoBuffer);
                    if (audioBuffer && audioBuffer.length > 1024) {
                        await sock.sendMessage(jid, {
                            audio: audioBuffer,
                            mimetype: 'audio/mpeg',
                            ptt: false,
                            fileName: `${safeTitle}.mp3`,
                        }, { quoted: msg });
                    }
                } catch (audErr) {
                    console.warn('⚠️ Audio extraction/send failed:', audErr.message);
                }
            }

            // ═══════════════════════════════
            // IMAGE PATH
            // ═══════════════════════════════
            else if (media.imageUrl) {
                const imgBuffer = await downloadBuffer(media.imageUrl);
                await sock.sendMessage(jid, {
                    image: imgBuffer,
                    caption:
                        `🖼️ *${safeTitle}*\n\n` +
                        `🔗 ${input}\n\n` +
                        `⚡ _Downloaded by Zenitsu_`,
                    contextInfo: buildNewsletterContext(),
                }, { quoted: msg });
            }

            // ═══════════════════════════════
            // AUDIO-ONLY PATH
            // ═══════════════════════════════
            else if (media.audioUrl) {
                const audBuffer = await downloadBuffer(media.audioUrl);
                const sizeMB = (audBuffer.length / (1024 * 1024)).toFixed(2);

                await sock.sendMessage(jid, {
                    text:
                        `🎵 *${safeTitle}*\n\n` +
                        `📦 *Size:* ${sizeMB} MB\n` +
                        `🔗 ${input}\n\n` +
                        `⚡ _Downloaded by Zenitsu_`,
                    contextInfo: buildNewsletterContext(),
                }, { quoted: msg });

                await sock.sendMessage(jid, {
                    audio: audBuffer,
                    mimetype: 'audio/mpeg',
                    ptt: false,
                    fileName: `${safeTitle}.mp3`,
                }, { quoted: msg });
            }

            else {
                throw new Error('Unsupported media type');
            }

            try { await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch (_) {}

        } catch (err) {
            console.error('❌ aio2 execution error:', err.message);
            try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (_) {}

            await sock.sendMessage(jid, {
                text:
                    '❌ *Download Failed*\n\n' +
                    `${err.message}\n\n` +
                    '⚡ Try again or use another link.',
                contextInfo: buildNewsletterContext(),
            }, { quoted: msg });
        }
    },
};