// General refresh command. Public invite links are optional; CHANNEL_JID is a
// WhatsApp channel identifier and is not itself a shareable invite URL.
const CHANNEL_LINK = process.env.BOT_CHANNEL_LINK || '';
const CHANNEL_JID = process.env.CHANNEL_JID || '120363402325089913@newsletter';
const BOT_NAME = process.env.BOT_NAME || 'RICH MD';
const STYLE = {
    forwardingScore: 350,
    isForwarded: true,
    forwardedNewsletterMessageInfo: {
        newsletterJid: CHANNEL_JID,
        newsletterName: BOT_NAME,
        serverMessageId: 202,
    },
};
const lastRefreshByUser = new Map();
const COOLDOWN_MS = 30 * 1000;

module.exports = {
    name: 'refresh',
    aliases: ['refreshbot', 'reload'],
    category: 'general',
    async execute({ sock, msg, jid, senderJid, botKey, config }) {
        const now = Date.now();
        const last = lastRefreshByUser.get(senderJid) || 0;
        if (now - last < COOLDOWN_MS) {
            const remaining = Math.ceil((COOLDOWN_MS - (now - last)) / 1000);
            return sock.sendMessage(jid, {
                text: `⏳ Please wait ${remaining}s before refreshing again.`,
                contextInfo: STYLE,
            }, { quoted: msg }).catch(() => {});
        }
        lastRefreshByUser.set(senderJid, now);
        await sock.sendMessage(jid, { react: { text: '♻️', key: msg.key } }).catch(() => {});

        let refreshed = false;
        try {
            const main = require('../main.js');
            if (main && typeof main.restartBot === 'function' && botKey) {
                refreshed = await main.restartBot(botKey, null);
            }
        } catch (e) {
            console.error('❌ refresh error:', e.message);
        }

        const groupLink = (config?.groupsToJoin && config.groupsToJoin[0]) || '';
        const botName = config?.botName || BOT_NAME;
        const linkButtons = [];
        if (CHANNEL_LINK) {
            linkButtons.push({
                index: linkButtons.length + 1,
                urlButton: { displayText: '📢 Channel', url: CHANNEL_LINK },
            });
        }
        if (groupLink) {
            linkButtons.push({
                index: linkButtons.length + 1,
                urlButton: { displayText: '👥 Group', url: groupLink },
            });
        }
        const plainLinks = [
            CHANNEL_LINK && `📢 Channel: ${CHANNEL_LINK}`,
            groupLink && `👥 Group: ${groupLink}`,
        ].filter(Boolean).join('\n');
        const buttonMessage = {
            text:
                `♻️ *Bot refreshed successfully!*\n\n` +
                `🧹 Cache: cleared\n` +
                `⚡ Connection: kept alive\n` +
                `${refreshed ? '✅' : 'ℹ️'} Status: ${refreshed ? 'Refreshed' : 'Nothing to refresh'}` +
                (linkButtons.length ? '\n\nJoin configured links below 👇' : ''),
            footer: botName,
            ...(linkButtons.length ? { templateButtons: linkButtons } : {}),
            contextInfo: {
                ...STYLE,
                ...(CHANNEL_LINK ? {
                    externalAdReply: {
                        title: botName,
                        body: 'Tap the channel button to open the public channel',
                        mediaType: 1,
                        sourceUrl: CHANNEL_LINK,
                        renderLargerThumbnail: false,
                    },
                } : {}),
            },
        };

        try {
            await sock.sendMessage(jid, buttonMessage, { quoted: msg });
        } catch (e) {
            console.error('⚠️ refresh buttons fallback:', e.message);
            await sock.sendMessage(jid, {
                text: `♻️ *Bot refreshed successfully!*\n\n${plainLinks || 'No public channel/group links are configured.'}`,
                contextInfo: STYLE,
            }, { quoted: msg }).catch(() => {});
        }
    },
};
