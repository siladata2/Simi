module.exports = {
    name: 'owner',
    aliases: ['dev', 'creator', 'contact'],
    description: 'Shows the configured bot owner contact',
    async execute({ sock, msg, jid }) {
        const target = jid || msg?.key?.remoteJid;
        if (!target) return;
        if (msg?.key) {
            try { await sock.sendMessage(target, { react: { text: '⚡', key: msg.key } }); } catch (_) {}
        }
        const number = (process.env.BOT_OWNER || process.env.OWNER_NUMBER || '').replace(/\D/g, '');
        const name = process.env.OWNER_NAME || 'RICH MD Owner';
        const contact = number ? `\n┃  wa.me/${number}` : '\n┃  Set BOT_OWNER to add contact details';
        const text = `╭━━━❲ *RICH MD OWNER* ❳━━━╮\n┃\n┃  👑 *${name}*${contact}\n╰━━━━━━━━━━━━━━━━━━━━━━━━━━╯`;
        await sock.sendMessage(target, { text }, { quoted: msg });
    }
};
