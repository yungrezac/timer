import React, { useState, useEffect, useRef } from 'react';
import { Timer, Gift, Play, Settings, User } from 'lucide-react';
import { io } from 'socket.io-client';

export default function App() {
  const [username, setUsername] = useState('');
  const [isWidgetMode, setIsWidgetMode] = useState(false);
  const [status, setStatus] = useState('Ожидание...');
  const [timeLeft, setTimeLeft] = useState(3600); // 1 час по умолчанию (в секундах)
  const [giftsList, setGiftsList] = useState([]);
  const [isDemo, setIsDemo] = useState(false);
  
  const combosRef = useRef({});
  const socketRef = useRef(null);
  const demoIntervalRef = useRef(null);

  // Инициализация при загрузке: проверка URL на наличие /username
  useEffect(() => {
    // Получаем путь из URL (например, "/strimer_name" -> "strimer_name")
    const pathName = window.location.pathname.replace('/', '');
    const urlParams = new URLSearchParams(window.location.search);
    const userFromUrl = pathName || urlParams.get('u');

    if (userFromUrl) {
      setUsername(userFromUrl);
      setIsWidgetMode(true);
      connectToServer(userFromUrl);
    }
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
    setStatus('Подключение к серверу...');
    // В реальном проекте здесь будет URL вашего Node.js сервера
    // Например: const socket = io('http://localhost:3001');
    const socket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnection: true
    });
    
    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus(`Подключение к TikTok @${user}...`);
      socket.emit('set_username', user);
    });

    socket.on('connected', () => {
      setStatus('Подключено! Ожидание подарков...');
    });

    socket.on('gift', handleIncomingGift);

    socket.on('error', (msg) => setStatus(`Ошибка: ${msg}`));
    socket.on('disconnected', (msg) => setStatus(msg));

    return () => socket.disconnect();
  };

  const handleIncomingGift = (data) => {
    let addedTime = 0;
    
    // Логика комбо: вычисляем разницу между новым счетчиком и старым
    if (data.isCombo && data.comboId) {
      const prevRepeat = combosRef.current[data.comboId] || 0;
      const newGiftsAmount = data.repeatCount - prevRepeat;
      
      if (newGiftsAmount > 0) {
        addedTime = newGiftsAmount * data.coins; // 1 монета = 1 секунда
        combosRef.current[data.comboId] = data.repeatCount;
      }

      // Если комбо закончилось, очищаем память через 5 секунд
      if (data.isFinished) {
        setTimeout(() => {
          delete combosRef.current[data.comboId];
        }, 5000);
      }
    } else {
      // Одиночный подарок (или первый в комбо, если backend не сгруппировал)
      addedTime = data.coins * data.repeatCount;
    }

    if (addedTime > 0) {
      setTimeLeft((prev) => prev + addedTime);
      showGiftAlert(data, addedTime);
    }
  };

  const showGiftAlert = (giftData, timeAdded) => {
    const alertId = giftData.comboId || Date.now().toString();
    
    setGiftsList((prev) => {
      // Убираем старый алерт с таким же ID (если это обновляющееся комбо)
      const filtered = prev.filter(g => g.id !== alertId);
      return [{ ...giftData, id: alertId, timeAdded, displayTime: Date.now() }, ...filtered].slice(0, 4); // Показываем макс 4
    });

    // Удаляем из UI через 4 секунды
    if (giftData.isFinished || !giftData.isCombo) {
      setTimeout(() => {
        setGiftsList((prev) => prev.filter(g => g.id !== alertId));
      }, 4000);
    }
  };

  const startDemoMode = () => {
    setIsWidgetMode(true);
    setIsDemo(true);
    setStatus('ДЕМО РЕЖИМ (Случайные подарки)');
    
    const fakeGifts = [
      { giftName: 'Роза', coins: 1, isCombo: true },
      { giftName: 'TikTok', coins: 1, isCombo: true },
      { giftName: 'Пончик', coins: 30, isCombo: false },
      { giftName: 'Корги', coins: 299, isCombo: false },
      { giftName: 'Галактика', coins: 1000, isCombo: false },
    ];

    const fakeUsers = ['Ivan_Pro', 'Ksenia_Live', 'TikTokFan_99', 'MegaDonater'];

    demoIntervalRef.current = setInterval(() => {
      const isComboEvent = Math.random() > 0.5;
      const randomGift = fakeGifts[Math.floor(Math.random() * fakeGifts.length)];
      
      // Имитация серии комбо
      if (randomGift.isCombo && isComboEvent) {
        const comboId = `demo_combo_${Math.floor(Math.random() * 5)}`;
        const currentRepeat = (combosRef.current[comboId] || 0) + 1;
        
        handleIncomingGift({
          giftId: 1,
          giftName: randomGift.giftName,
          senderName: fakeUsers[Math.floor(Math.random() * fakeUsers.length)],
          coins: randomGift.coins,
          repeatCount: currentRepeat,
          isCombo: true,
          isFinished: Math.random() > 0.8, // 20% шанс завершить комбо
          comboId: comboId
        });
      } else {
        handleIncomingGift({
          giftId: 2,
          giftName: randomGift.giftName,
          senderName: fakeUsers[Math.floor(Math.random() * fakeUsers.length)],
          coins: randomGift.coins,
          repeatCount: 1,
          isCombo: false,
          isFinished: true,
          comboId: `single_${Date.now()}`
        });
      }
    }, 2000); // Подарок каждые 2 секунды
  };

  // Форматирование времени в ЧЧ:ММ:СС
  const formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    
    if (h > 0) {
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ЭКРАН НАСТРОЙКИ (Если открыли не как виджет)
  if (!isWidgetMode) {
    return (
      <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 font-sans">
        <div className="max-w-md w-full bg-slate-800 rounded-3xl p-8 shadow-2xl border border-slate-700">
          <div className="flex items-center justify-center mb-6 text-pink-500">
            <Timer size={48} className="animate-pulse" />
          </div>
          <h1 className="text-3xl font-bold text-center mb-2">Subathon Виджет</h1>
          <p className="text-slate-400 text-center mb-8">Введите имя пользователя TikTok для старта</p>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">TikTok @Username</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-slate-600 rounded-xl leading-5 bg-slate-900 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                  placeholder="Например: oficial_streamer"
                />
              </div>
            </div>

            <button
              onClick={() => {
                setIsWidgetMode(true);
                connectToServer(username);
              }}
              disabled={!username}
              className="w-full flex items-center justify-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              <Play className="mr-2" size={18} /> Запустить виджет
            </button>

            <div className="relative py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-slate-800 text-slate-400">Или проверьте анимации</span>
              </div>
            </div>

            <button
              onClick={startDemoMode}
              className="w-full flex items-center justify-center py-3 px-4 border border-slate-600 rounded-xl shadow-sm text-sm font-bold text-slate-300 bg-slate-700 hover:bg-slate-600 focus:outline-none transition-all"
            >
              Включить Демо-Режим
            </button>
          </div>
        </div>
      </div>
    );
  }

  // САМ ВИДЖЕТ ДЛЯ OBS (Прозрачный фон, красивые тени)
  return (
    <div className="min-h-screen bg-transparent p-6 overflow-hidden flex flex-col items-start font-sans">
      
      {/* Стили для кастомных анимаций */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideIn {
          0% { transform: translateX(-100%) scale(0.8); opacity: 0; }
          100% { transform: translateX(0) scale(1); opacity: 1; }
        }
        @keyframes floatUp {
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-50px) scale(1.5); opacity: 0; }
        }
        @keyframes pulseGlow {
          0%, 100% { text-shadow: 0 0 15px rgba(236, 72, 153, 0.5); }
          50% { text-shadow: 0 0 30px rgba(236, 72, 153, 1), 0 0 10px rgba(255, 255, 255, 0.8); }
        }
        .animate-slide-in { animation: slideIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-float-up { animation: floatUp 1s ease-out forwards; }
        .text-glow { animation: pulseGlow 2s infinite; }
      `}} />

      {/* Таймер */}
      <div className="relative mb-8">
        <div className="bg-slate-900/80 backdrop-blur-md border border-white/10 rounded-3xl py-4 px-8 shadow-[0_0_30px_rgba(236,72,153,0.3)]">
          <div className="text-xs font-bold text-pink-400 tracking-wider uppercase mb-1 flex items-center gap-2">
            <Timer size={14} /> 
            Subathon Timer
          </div>
          <div className="text-7xl font-black text-white tabular-nums tracking-tight text-glow">
            {formatTime(timeLeft)}
          </div>
          <div className="absolute -bottom-6 left-4 text-xs font-medium text-white/50 bg-black/50 px-3 py-1 rounded-full backdrop-blur-sm border border-white/5">
            {status}
          </div>
        </div>
      </div>

      {/* Лента Подарков */}
      <div className="flex flex-col gap-3 w-80">
        {giftsList.map((gift) => (
          <div 
            key={gift.id} 
            className="animate-slide-in relative flex items-center bg-gradient-to-r from-slate-900/90 to-slate-800/90 backdrop-blur-md border border-white/10 p-3 rounded-2xl shadow-xl overflow-hidden"
          >
            {/* Анимация добавленного времени поверх карточки */}
            {gift.timeAdded > 0 && (
              <div 
                key={`${gift.id}-${gift.repeatCount}`} 
                className="absolute right-4 top-2 text-xl font-black text-green-400 animate-float-up z-10 drop-shadow-md"
              >
                +{gift.timeAdded}с
              </div>
            )}

            {/* Иконка подарка */}
            <div className="relative w-12 h-12 flex-shrink-0 bg-pink-500/20 rounded-xl flex items-center justify-center border border-pink-500/30 mr-3">
              {gift.senderProfile ? (
                 <img src={gift.senderProfile} alt="" className="w-full h-full object-cover rounded-xl" />
              ) : (
                <Gift className="text-pink-400" size={24} />
              )}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="text-white font-bold truncate text-sm">
                {gift.senderName}
              </div>
              <div className="text-pink-300 text-xs font-medium truncate flex items-center gap-1">
                Отправил {gift.giftName} 
                <span className="text-yellow-400 ml-1">({gift.coins} 💎)</span>
              </div>
            </div>

            {/* Счетчик комбо */}
            {gift.isCombo && gift.repeatCount > 1 && (
              <div className="ml-2 flex-shrink-0 bg-gradient-to-br from-pink-500 to-purple-600 text-white font-black text-lg px-2 py-1 rounded-lg transform -rotate-6 border border-white/20 shadow-lg">
                x{gift.repeatCount}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
