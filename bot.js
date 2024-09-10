const express = require('express');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const http = require('http');
const winston = require('winston');
const fs = require('fs');
const WebSocket = require('ws');
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Charger la configuration
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

// Configure winston logger
const logger = winston.createLogger({
    level: 'info',  // Définit le niveau de log à 'info' pour voir toutes les infos
    format: winston.format.combine(
        winston.format.timestamp(),  // Ajoute des timestamps aux logs
        winston.format.printf(({ timestamp, level, message }) => {
            return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        })
    ),
    transports: [
        new winston.transports.Console({  // Console transport pour afficher dans la console du terminal
            format: winston.format.simple(),
        }),
        new winston.transports.File({ filename: 'combined.log' })  // Enregistre aussi dans un fichier
    ]
});

// Configure Discord Client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

client.once('ready', () => {
    logger.info(`${client.user.tag} est connecté.`);
    // Inform WebSocket clients when the bot is ready
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(`${client.user.tag} est connecté.`);
        }
    });
});

// Endpoint for sending messages
app.post('/send-message', express.json(), async (req, res) => {
    const { channelId, message, username } = req.body;
    logger.info(`Requête reçue pour envoyer un message à ${channelId} de ${username}`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('Canal introuvable');
        }
        await channel.send(`${username} a envoyé ce message : ${message}`);
        res.status(200).send('Message envoyé.');
        logger.info(`Message envoyé avec succès à ${channelId} par ${username}`);
    } catch (error) {
        logger.error(`Erreur lors de l'envoi du message à ${channelId} par ${username} : ${error.message}`);
        res.status(500).send(`Erreur lors de l'envoi du message : ${error.message}`);
    }
});

// Endpoint for sending embeds
app.post('/send-embed', express.json(), async (req, res) => {
    const { channelId, title, description, color } = req.body;
    logger.info(`Requête reçue pour envoyer un embed à ${channelId}: ${title}`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('Canal introuvable');
        }
        const embed = {
            title: title,
            description: description,
            color: parseInt(color.replace('#', ''), 16)
        };
        await channel.send({ embeds: [embed] });
        res.status(200).send('Embed envoyé.');
        logger.info(`Embed envoyé avec succès à ${channelId}: ${title}`);
    } catch (error) {
        logger.error(`Erreur lors de l'envoi de l'embed à ${channelId}: ${title}, erreur : ${error.message}`);
        res.status(500).send(`Erreur lors de l'envoi de l'embed : ${error.message}`);
    }
});

// Endpoint for clearing messages
app.post('/clear-messages', express.json(), async (req, res) => {
    const { channelId, count } = req.body;
    logger.info(`Requête reçue pour effacer ${count} messages dans le canal ${channelId}`);
    try {
        const channel = await client.channels.fetch(channelId);
        if (!channel) {
            throw new Error('Canal introuvable');
        }
        const messages = await channel.messages.fetch({ limit: count });
        await channel.bulkDelete(messages);
        res.status(200).send('Messages supprimés.');
        logger.info(`Suppression réussie de ${count} messages dans le canal ${channelId}`);
    } catch (error) {
        logger.error(`Erreur lors de la suppression des messages dans le canal ${channelId} : ${error.message}`);
        res.status(500).send(`Erreur lors de la suppression des messages : ${error.message}`);
    }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// WebSocket connection
wss.on('connection', ws => {
    logger.info('Un client s\'est connecté au WebSocket.');
    ws.on('message', message => {
        logger.info('Message reçu du client WebSocket :', message);
    });
    ws.on('close', () => {
        logger.info('Un client s\'est déconnecté du WebSocket.');
    });
    ws.on('error', error => {
        logger.error('Erreur dans la connexion WebSocket :', error);
    });
});

// Démarrage du serveur Express après la connexion du bot Discord
client.login(config.token).then(() => {
    server.listen(config.port, () => {
        logger.info(`Le serveur Express est démarré et écoute sur http://localhost:${config.port}`);
    });
}).catch(err => {
    logger.error(`Erreur lors de la connexion du bot Discord : ${err.message}`);
});
