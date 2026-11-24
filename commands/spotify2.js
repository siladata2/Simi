//commands/spotify2.js
const axios = require('axios');

// ═══════════════════════════════════════
// STORE ACTIVE SEARCHES (per user)
// ═══════════════════════════════════════
const activeSearches = new Map();

// ═══════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════
function cleanTitle(title) {
    if (!title || typeof title !== 'string') return 'audio';
    return title
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '') // caractères interdits
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 80) || 'audio';
}

function extractDownloadUrl(data) {
    if (!data) return null;
    // Parcours récursif léger pour trouver une URL de téléchargement plausible
    const possibleKeys = ['download_url', 'url', 'link', 'downloadUrl', 'audio'];
    for (const key of possibleKeys) {
        if (data[key] && typeof data[key] === 'string' && data[key].startsWith('http')) {
            return data[key];
        }
    }
    if (data.result && typeof data.result === 'object') {
        return extractDownloadUrl(data.result);
    }
    return null;
}

async function safeSearchSpotify(query) {
    const encoded = encodeURIComponent(query.trim());
    const endpoints = [
        `https://api.nexray.eu.cc/search/spotify?q=${encoded}`,
        `https://api.nexray.eu.cc/search/spotify?q=${encoded}+`
    ];

    for (const url of endpoints) {
        try {
            const { data } = await axios.get(url, { timeout: 25000 });
            // Gestion des différentes structures de réponse
            let results = [];
            if (data?.result && Array.isArray(data.result)) results = data.result;
            else if (data?.results && Array.isArray(data.results)) results = data.results;
            else if (data?.data && Array.isArray(data.data)) results = data.data;
            else if (Array.isArray(data)) results = data;

            if (results.length > 0) {
                return results.slice(0, 5).map(item => ({
                    title: item.title || item.name || 'Inconnu',
                    artist: item.artist || item.artists || item.author || 'Inconnu',
                    url: item.url || item.link || item.track_url || '',
                    album: item.album || '',
                    duration: item.duration || '',
                    thumbnail: item.thumbnail || item.image || item.cover || ''
                }));
            }
        } catch (err) {
            console.warn(`⚠️ Échec de l'endpoint de recherche ${url}:`, err.message);
        }
    }
    throw new Error('Aucun résultat trouvé après les tentatives de fallback');
}

// ═══════════════════════════════════════
// COMMAND
// ═══════════════════════════════════════
module.exports = {
    name: 'spotify2',
    aliases: ['spotifydl', 'spdl', 'spotifysearch'],
    category: 'downloader',

    async execute({ sock, msg, args, jid }) {
        const senderJid = msg.key.participant || msg.key.remoteJid;
        const input = args.join(' ').trim();

        // ─── Aide ───
        if (!input) {
            return sock.sendMessage(jid, {
                text:
                    '🎵 *Spotify Search & Download*\n\n' +
                    '⚡ *Usage:*\n' +
                    '.spotify2 <nom de la chanson>\n' +
                    '.spotify2 <numéro> (pour télécharger un résultat)\n\n' +
                    '✨ *Exemples:*\n' +
                    '.spotify2 Blinding Lights\n' +
                    '.spotify2 1 (après une recherche)\n\n' +
                    '💡 Cherche d’abord, puis réponds avec le numéro.',
                contextInfo: {
                    forwardingScore: 350,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                        newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                        serverMessageId: 202,
                    },
                },
            }, { quoted: msg });
        }

        // ─── Entrée numérique → téléchargement ───
        const numberMatch = input.match(/^(\d+)$/);
        if (numberMatch) {
            const selectedIndex = parseInt(numberMatch[1]) - 1;
            const stored = activeSearches.get(senderJid);

            if (!stored || !stored.results || stored.results.length === 0) {
                return sock.sendMessage(jid, {
                    text: '⚠️ *Aucune recherche active*\n\nUtilise .spotify2 <nom> d’abord.',
                    contextInfo: {
                        forwardingScore: 350,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                            newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                            serverMessageId: 202,
                        },
                    },
                }, { quoted: msg });
            }

            if (selectedIndex < 0 || selectedIndex >= stored.results.length) {
                return sock.sendMessage(jid, {
                    text: `⚠️ *Numéro invalide*\n\nChoisis entre 1 et ${stored.results.length}.`,
                    contextInfo: {
                        forwardingScore: 350,
                        isForwarded: true,
                        forwardedNewsletterMessageInfo: {
                            newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                            newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                            serverMessageId: 202,
                        },
                    },
                }, { quoted: msg });
            }

            const selected = stored.results[selectedIndex];
            if (!selected.url) {
                return sock.sendMessage(jid, {
                    text: '❌ *URL du morceau manquante*\n\nRéessaie la recherche.',
                }, { quoted: msg });
            }

            try { await sock.sendMessage(jid, { react: { text: '⬇️', key: msg.key } }); } catch (_) {}
            return downloadSpotify(sock, msg, jid, selected);
        }

        // ─── Entrée textuelle → recherche ───
        const query = input;
        try { await sock.sendMessage(jid, { react: { text: '🔍', key: msg.key } }); } catch (_) {}

        try {
            const results = await safeSearchSpotify(query);

            if (results.length === 0) throw new Error('Aucun résultat');

            activeSearches.set(senderJid, {
                results,
                timestamp: Date.now(),
            });

            let replyText = `🎵 *Résultats pour : ${query}*\n\n`;
            results.forEach((item, i) => {
                replyText += `*${i + 1}.* ${item.title}\n`;
                replyText += `   🎤 ${item.artist}\n`;
                if (item.album) replyText += `   💿 ${item.album}\n`;
                if (item.duration) replyText += `   ⏱ ${item.duration}\n`;
                replyText += '\n';
            });
            replyText +=
                `📌 *Réponds avec :* .spotify2 <numéro>\n` +
                `⚡ _Exemple : .spotify2 1_\n\n` +
                `⏳ Les résultats expirent dans 5 minutes.`;

            await sock.sendMessage(jid, {
                text: replyText,
                contextInfo: {
                    forwardingScore: 350,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                        newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                        serverMessageId: 202,
                    },
                },
            }, { quoted: msg });

            try { await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch (_) {}

            // Nettoyage après 5 min
            setTimeout(() => {
                const stored = activeSearches.get(senderJid);
                if (stored && Date.now() - stored.timestamp > 300000) {
                    activeSearches.delete(senderJid);
                }
            }, 300000);

        } catch (err) {
            console.error('❌ Erreur de recherche Spotify:', err.message);
            try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (_) {}

            await sock.sendMessage(jid, {
                text:
                    '❌ *Échec de la recherche*\n\n' +
                    'Aucun résultat trouvé. Essaie un autre terme.\n\n' +
                    '⚡ _Exemple : .spotify2 Blinding Lights_',
                contextInfo: {
                    forwardingScore: 350,
                    isForwarded: true,
                    forwardedNewsletterMessageInfo: {
                        newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                        newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                        serverMessageId: 202,
                    },
                },
            }, { quoted: msg });
        }
    },
};

// ═══════════════════════════════════════
// TÉLÉCHARGEMENT
// ═══════════════════════════════════════
async function downloadSpotify(sock, msg, jid, track) {
    const { url: trackUrl, title, artist, album, thumbnail } = track;

    try {
        const encodedUrl = encodeURIComponent(trackUrl);
        const downloadEndpoints = [
            `https://api.nexray.eu.cc/downloader/spotify?url=${encodedUrl}`,
            // Ajoute ici d’autres endpoints de secours si tu en as
        ];

        let downloadUrl = null;
        for (const endpoint of downloadEndpoints) {
            try {
                const { data } = await axios.get(endpoint, { timeout: 90000 });
                downloadUrl = extractDownloadUrl(data);
                if (downloadUrl) break;
            } catch (err) {
                console.warn(`⚠️ Échec du endpoint de téléchargement ${endpoint}:`, err.message);
            }
        }

        if (!downloadUrl) throw new Error('Aucune URL de téléchargement trouvée');

        // Téléchargement du buffer audio
        const audioRes = await axios.get(downloadUrl, {
            responseType: 'arraybuffer',
            timeout: 120000,
            maxContentLength: 50 * 1024 * 1024, // 50 Mo
        });

        const buffer = Buffer.from(audioRes.data);
        if (buffer.length < 1024) throw new Error('Fichier audio trop petit ou invalide');

        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
        const safeTitle = cleanTitle(title);
        const fileName = `${safeTitle}_rich_md.mp3`;

        // 1) Envoi de l’image + métadonnées
        if (thumbnail && thumbnail.startsWith('http')) {
            const caption =
                `🎵 *${title}*\n` +
                `🎤 *Artiste :* ${artist}\n` +
                (album ? `💿 *Album :* ${album}\n` : '') +
                `📦 *Taille :* ${sizeMB} MB\n` +
                `📁 *Fichier :* ${fileName}\n` +
                `🔗 ${trackUrl}`;

            try {
                await sock.sendMessage(jid, {
                    image: { url: thumbnail },
                    caption,
                }, { quoted: msg });
            } catch (imgErr) {
                console.warn('⚠️ Impossible d’envoyer l’image:', imgErr.message);
                // Fallback : message texte seul
                await sock.sendMessage(jid, { text: caption }, { quoted: msg });
            }
        } else {
            await sock.sendMessage(jid, {
                text:
                    `🎵 *${title}*\n` +
                    `🎤 *Artiste :* ${artist}\n` +
                    (album ? `💿 *Album :* ${album}\n` : '') +
                    `📦 *Taille :* ${sizeMB} MB\n` +
                    `📁 *Fichier :* ${fileName}\n` +
                    `🔗 ${trackUrl}`,
            }, { quoted: msg });
        }

        // 2) Envoi de l’audio
        await sock.sendMessage(jid, {
            audio: buffer,
            mimetype: 'audio/mpeg',
            ptt: false,
            fileName,
        }, { quoted: msg });

        try { await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } }); } catch (_) {}

    } catch (err) {
        console.error('❌ Erreur de téléchargement Spotify:', err.message);
        try { await sock.sendMessage(jid, { react: { text: '❌', key: msg.key } }); } catch (_) {}

        await sock.sendMessage(jid, {
            text:
                '❌ *Échec du téléchargement*\n\n' +
                `${err.message}\n\n` +
                '⚡ Réessaie ou choisis un autre résultat.',
            contextInfo: {
                forwardingScore: 350,
                isForwarded: true,
                forwardedNewsletterMessageInfo: {
                    newsletterJid: (process.env.CHANNEL_JID || '120363402325089913@newsletter'),
                    newsletterName: (process.env.BOT_NAME || 'RICH MD'),
                    serverMessageId: 202,
                },
            },
        }, { quoted: msg });
    }
}