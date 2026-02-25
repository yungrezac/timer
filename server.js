const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); // Добавлено для проверки существования файлов

const app = express();
app.use(cors());

// --- РАЗДАЧА FRONTEND (REACT ВИДЖЕТА) ---
// Указываем серверу брать готовые файлы виджета из папки dist
app.use(express.static(path.join(__dirname, 'dist')));

// Перенаправляем ЛЮБЫЕ пути (например /brothernature) на виджет
app.get('*', (req, res) => {
    const indexPath = path.join(__dirname, 'dist', 'index.html');
    
    // Защита для Railway: проверяем, успел ли собраться React-виджет.
    // Если файла еще нет, сервер не упадет с ошибкой, а отдаст временное сообщение (код 200).
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send(`
            <div style="font-family: sans-serif; text-align: center; margin-top: 50px; color: white; background: #0f172a; height: 100vh; padding: 20px;">
                <h2>⏳ Виджет собирается...</h2>
                <p>Сервер Node.js успешно запущен, но файлы React-виджета еще создаются.</p>
                <p>Пожалуйста, подождите пару минут и <b>обновите эту страницу</b>.</p>
            </div>
        `);
    }
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

        if (tiktokLiveConnection) {
            tiktokLiveConnection.disconnect();
        }

        tiktokLiveConnection = new WebcastPushConnection(username);

        try {
            const state = await tiktokLiveConnection.connect();
            console.log(`Успешное подключение к стриму @${username} (RoomID: ${state.roomId})`);
            socket.emit('connected', { username, roomId: state.roomId });

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

// Railway назначает порт через процесс, используем его
const PORT = process.env.PORT || 3001;

// ВАЖНО: Добавлен '0.0.0.0'. 
// Это говорит серверу принимать подключения извне, что обязательно для проверок Railway!
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});
