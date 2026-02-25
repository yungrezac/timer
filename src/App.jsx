import React, { useState, useEffect, useRef } from 'react';
import { Timer, Play, User } from 'lucide-react';
import { io } from 'socket.io-client';

export default function App() {
  const [username, setUsername] = useState('');
  const [isWidgetMode, setIsWidgetMode] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3600); // 1 час по умолчанию (в секундах)
  
  // Состояние для хранения всплывающих "+ секунд" прямо на таймере
  const [timeAdditions, setTimeAdditions] = useState([]);
  
  const combosRef = useRef({});
  const socketRef = useRef(null);
  const demoIntervalRef = useRef(null);

  // Инициализация при загрузке: проверка URL
  useEffect(() => {
    const pathName = window.location.pathname.replace('/', '');
    const urlParams = new URLSearchParams(window.location.search);
    const userFromUrl = pathName || urlParams.get('u');

    if (userFromUrl && userFromUrl !== 'index.html') {
      setUsername(userFromUrl);
      setIsWidgetMode(true);
      connectToServer(userFromUrl);
    }

    return () => {
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Таймер обратного отсчета
  useEffect(() => {
    if (!isWidgetMode) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [isWidgetMode]);

  const connectToServer = (user) => {
    const socket = io('/', {
      transports: ['websocket'],
      reconnection: true
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('set_username', user);
    });

    socket.on('gift', handleIncomingGift);

    return () => socket.disconnect();
  };

  const handleIncomingGift = (data) => {
    let addedTime = 0;
    
    if (data.isCombo && data.comboId) {
      const prevRepeat = combosRef.current[data.comboId] || 0;
      const newGiftsAmount = data.repeatCount - prevRepeat;
      
      if (newGiftsAmount > 0) {
        addedTime = newGiftsAmount * data.coins;
        combosRef.current[data.comboId] = data.repeatCount;
      }

      if (data.isFinished) {
        setTimeout(() => {
          delete combosRef.current[data.comboId];
        }, 5000);
      }
    } else {
      addedTime = data.coins * data.repeatCount;
    }

    if (addedTime > 0) {
      setTimeLeft((prev) => prev + addedTime);
      showTimeAddition(addedTime, data.senderName);
    }
  };

  // Функция для создания всплывающей анимации добавленного времени с именем
  const showTimeAddition = (time, senderName = 'Аноним') => {
    const id = Date.now().toString() + Math.random().toString();
    
    // Генерируем случайное смещение по оси X, чтобы сообщения не слипались
    const randomOffset = Math.random() * 80 - 40;

    setTimeAdditions((prev) => [...prev, { id, time, offset: randomOffset, senderName }]);

    // Удаляем элемент после завершения CSS анимации (теперь 3.5 сек)
    setTimeout(() => {
      setTimeAdditions((prev) => prev.filter((item) => item.id !== id));
    }, 3500);
  };

  const startDemoMode = () => {
    setIsWidgetMode(true);
    
    const fakeGifts = [
      { coins: 1, isCombo: true },
      { coins: 5, isCombo: false },
      { coins: 30, isCombo: false },
    ];
    const fakeUsers = ['Ivan_Pro', 'Ksenia_Live', 'TikTokFan_99', 'MegaDonater'];

    demoIntervalRef.current = setInterval(() => {
      const randomGift = fakeGifts[Math.floor(Math.random() * fakeGifts.length)];
      const randomUser = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
      
      handleIncomingGift({
        giftId: Math.random(),
        coins: randomGift.coins,
        repeatCount: 1,
        isCombo: false,
        isFinished: true,
        comboId: `demo_${Date.now()}`,
        senderName: randomUser
      });
    }, 2000);
  };

  // Форматирование времени
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isWidgetMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <div className="flex items-center justify-center mb-6 text-pink-500">
            <Timer size={48} className="animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">Subathon Виджет</h1>
          <p className="text-slate-400 text-center mb-8">Введите имя пользователя TikTok</p>
          
          <div className="space-y-4">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-slate-500" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-xl bg-slate-900 text-white placeholder-slate-500 focus:ring-2 focus:ring-pink-500"
                placeholder="Например: oficial_streamer"
              />
            </div>

            <button
              onClick={() => {
                window.history.pushState({}, '', `/${username}`);
                setIsWidgetMode(true);
                connectToServer(username);
              }}
              disabled={!username}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl font-bold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:opacity-90 disabled:opacity-50"
            >
              <Play className="mr-2" size={18} /> Запустить виджет
            </button>

            <button
              onClick={startDemoMode}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl font-bold text-slate-300 bg-slate-700 hover:bg-slate-600"
            >
              Включить Демо-Режим (Тест анимаций)
            </button>
          </div>
        </div>
      </div>
    );
  }

  // САМ ВИДЖЕТ (Минималистичный дизайн)
  return (
    <div className="min-h-screen bg-transparent p-6 overflow-hidden flex flex-col items-start font-sans">
      
      {/* Стили для всплывающей анимации поверх таймера */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes floatUpFade {
          0% { transform: translateY(20px) scale(0.5); opacity: 0; }
          10% { transform: translateY(0) scale(1.1); opacity: 1; text-shadow: 0 0 20px rgba(74,222,128,1); }
          80% { transform: translateY(-50px) scale(1); opacity: 1; text-shadow: 0 0 10px rgba(74,222,128,0.8); }
          100% { transform: translateY(-70px) scale(1); opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { text-shadow: 0 0 15px rgba(236, 72, 153, 0.5); }
          50% { text-shadow: 0 0 30px rgba(236, 72, 153, 1), 0 0 10px rgba(255, 255, 255, 0.8); }
        }
        .animate-float-up-fade { animation: floatUpFade 3.5s ease-out forwards; }
        .text-glow { animation: pulseGlow 2s infinite; }
      `}} />

      <div className="relative">
        <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl py-4 px-8 shadow-[0_0_30px_rgba(236,72,153,0.3)]">
          <div className="text-xs font-bold text-pink-400 tracking-wider uppercase mb-1 flex items-center justify-center gap-2">
            <Timer size={14} /> 
            ДО КОНЦА СТРИМА
          </div>
          
          <div className="relative">
            {/* Текст таймера */}
            <div className="text-7xl font-black text-white tabular-nums tracking-tight text-glow relative z-0">
              {formatTime(timeLeft)}
            </div>

            {/* Контейнер для всплывающих цифр с никнеймами */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              {timeAdditions.map((item) => (
                <div 
                  key={item.id} 
                  className="absolute flex flex-col items-center animate-float-up-fade"
                  style={{
                    marginLeft: `${item.offset}px`, // Легкий сдвиг, чтобы цифры не слипались
                  }}
                >
                  <span className="text-sm font-bold text-white/90 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm mb-1 truncate max-w-[150px] border border-white/10 shadow-lg">
                    {item.senderName}
                  </span>
                  <span className="text-5xl font-black text-green-400 drop-shadow-lg">
                    +{item.time}с
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
