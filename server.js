const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// --- РАЗДАЧА FRONTEND (REACT ВИДЖЕТА) ---
// Указываем серверу брать готовые файлы виджета из папки dist (которую создаст Vite при команде build)
app.use(express.static(path.join(__dirname, 'dist')));

// Перенаправляем ЛЮБЫЕ пути (например /brothernature) на виджет,
// чтобы React смог сам прочитать никнейм из ссылки.
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});
// ----------------------------------------

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

io.on('connection', (socket) => {
    console.log('Новое подключение виджета:', socket.id);
    let tiktokLiveConnection = null;

    socket.on('set_username', async (username) => {
        if (!username) return;
        console.log(`Попытка подключения к TikTok: @${username}`);

        // Если уже было подключение, закрываем его
        if (tiktokLiveConnection) {
            tiktokLiveConnection.disconnect();
        }

        // Создаем новое подключение к стримеру
        tiktokLiveConnection = new WebcastPushConnection(username);

        try {
            const state = await tiktokLiveConnection.connect();
            console.log(`Успешное подключение к стриму @${username} (RoomID: ${state.roomId})`);
            socket.emit('connected', { username, roomId: state.roomId });

            // Обработка получения подарков
            tiktokLiveConnection.on('gift', data => {
                const isCombo = data.giftType === 1;
                socket.emit('gift', {
                    giftId: data.giftId,
                    giftName: data.giftName,
                    senderName: data.nickname,
                    senderProfile: data.profilePictureUrl,
                    coins: data.diamondCount,
                    repeatCount: data.repeatCount,
                    isCombo: isCombo,
                    isFinished: data.repeatEnd,
                    comboId: data.groupId
                });
            });

            // Трансляция завершена
            tiktokLiveConnection.on('streamEnd', () => {
                socket.emit('disconnected', 'Трансляция завершена');
                console.log(`Стрим @${username} завершен.`);
            });

        } catch (err) {
            console.error('Ошибка подключения к TikTok:', err);
            socket.emit('error', 'Не удалось подключиться. Возможно, стример оффлайн.');
        }
    });

    socket.on('disconnect', () => {
        console.log('Виджет отключился:', socket.id);
        if (tiktokLiveConnection) {
            tiktokLiveConnection.disconnect();
        }
    });
});

// Railway сам назначает порт через process.env.PORT
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
