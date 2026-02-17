
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrdoService } from '../services/firebase';
import { Character } from '../types';
import { InputModal, EmpireConfirmModal } from '../components/Components';

const Registry: React.FC = () => {
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [now, setNow] = useState(new Date());
  const [isOffline, setIsOffline] = useState(OrdoService.isOffline());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteData, setDeleteData] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: '', name: '' });
  const navigate = useNavigate();

  useEffect(() => {
    const unsub = OrdoService.subscribeAll((data) => {
      setCharacters(data);
      setIsOffline(OrdoService.isOffline());
    });
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, []);

  const handleCreate = async (name: string) => {
    if (name && name.trim()) {
      try {
        const id = await OrdoService.create(name);
        setIsCreateModalOpen(false);
        navigate(`/dossier/${id}`);
      } catch (e) {
        alert("Creation failed: " + e);
      }
    }
  };

  const confirmDelete = async () => {
      if (deleteData.id) {
          await OrdoService.delete(deleteData.id);
          setDeleteData({ isOpen: false, id: '', name: '' });
      }
  };

  return (
    <div className="flex flex-col h-full font-header text-ordo-gold bg-[#080606] relative">
       {/* Background Effects */}
       <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_2px,3px_100%] pointer-events-none opacity-60"></div>

       <InputModal 
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onConfirm={handleCreate}
          title="ИНИЦИАЛИЗАЦИЯ ПРОТОКОЛА"
          placeholder="Идентификатор..."
       />

       <EmpireConfirmModal 
            isOpen={deleteData.isOpen}
            onClose={() => setDeleteData({ ...deleteData, isOpen: false })}
            onConfirm={confirmDelete}
            title="ПОДТВЕРЖДЕНИЕ ЛИКВИДАЦИИ"
            message={`ВЫ УВЕРЕНЫ, ЧТО ХОТИТЕ УДАЛИТЬ ПРОТОКОЛ: ${deleteData.name}?`}
        />

      <header className="min-h-[120px] md:h-[140px] flex flex-col justify-center items-center border-b-2 border-ordo-gold bg-[radial-gradient(circle_at_center,#1a0f0f_0%,#000_100%)] relative z-10 shadow-[0_5px_30px_rgba(0,0,0,0.8)] shrink-0 py-6 md:py-0">
        <div className="absolute top-4 left-4 z-50">
            <button 
                onClick={() => navigate('/')}
                className="text-xs md:text-sm border border-ordo-gold-dim text-ordo-gold-dim hover:text-ordo-gold hover:border-ordo-gold px-3 py-1 transition-all"
            >
                ← ВЫБОР СТОРОНЫ
            </button>
        </div>
        <div className="absolute inset-0 flex justify-between items-center px-5 pointer-events-none hidden md:flex">
          <span className="text-5xl text-ordo-crimson opacity-50">▼</span>
          <span className="text-5xl text-ordo-crimson opacity-50">▼</span>
        </div>
        <h1 className="text-4xl md:text-6xl tracking-[4px] md:tracking-[8px] font-bold text-transparent bg-clip-text bg-gradient-to-b from-[#ffd700] to-[#8a6e00] drop-shadow-[0_0_15px_rgba(212,175,55,0.4)] text-center">
          ORDO CONTINUUM
        </h1>
        <div className="text-xs md:text-sm text-ordo-crimson tracking-[4px] md:tracking-[6px] mt-2 border-t border-ordo-crimson pt-1 text-center">
          PERSONNEL REGISTRY
        </div>
      </header>

      <main className="flex-1 p-4 md:p-10 overflow-y-auto relative z-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgwVjB6bTEgMWgzOHYzOEgxVjF6IiBmaWxsPSIjMzMzIiBmaWxsLW9wYWNpdHk9IjAuMSIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9zdmc+')]">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))] gap-6 md:gap-12 w-full max-w-[1600px] mx-auto pb-20">
          {Object.values(characters).map((char) => (
            <div
              key={char.id}
              onClick={() => navigate(`/dossier/${char.id}`)}
              className="bg-[rgba(14,12,12,0.9)] border border-ordo-gold-dim h-[450px] md:h-[500px] flex flex-col relative transition-all duration-400 cursor-pointer shadow-[0_10px_30px_rgba(0,0,0,0.8)] hover:-translate-y-2 hover:border-ordo-gold hover:shadow-[0_0_30px_rgba(212,175,55,0.2)] group"
            >
              {/* Corner Accents */}
              <div className="absolute top-[-1px] left-[-1px] w-[15px] h-[15px] border-l-2 border-t-2 border-ordo-gold transition-all duration-300 group-hover:w-[30px] group-hover:h-[30px]"></div>
              <div className="absolute top-[-1px] right-[-1px] w-[15px] h-[15px] border-r-2 border-t-2 border-ordo-gold transition-all duration-300 group-hover:w-[30px] group-hover:h-[30px]"></div>
              <div className="absolute bottom-[-1px] left-[-1px] w-[15px] h-[15px] border-l-2 border-b-2 border-ordo-gold transition-all duration-300 group-hover:w-[30px] group-hover:h-[30px]"></div>
              <div className="absolute bottom-[-1px] right-[-1px] w-[15px] h-[15px] border-r-2 border-b-2 border-ordo-gold transition-all duration-300 group-hover:w-[30px] group-hover:h-[30px]"></div>

              <div 
                onClick={(e) => { e.stopPropagation(); setDeleteData({ isOpen: true, id: char.id, name: char.meta.name }); }}
                className="absolute top-4 right-4 w-9 h-9 bg-[rgba(0,0,0,0.8)] border border-ordo-crimson text-ordo-crimson text-2xl flex items-center justify-center opacity-100 md:opacity-0 group-hover:opacity-100 transition-all z-20 hover:bg-ordo-crimson hover:text-black hover:shadow-[0_0_15px_#8a0000]"
              >
                ×
              </div>

              <div className="flex-1 overflow-hidden border-b-2 border-ordo-crimson bg-black">
                {char.meta.image ? (
                  <img src={char.meta.image} alt={char.meta.name} className="w-full h-full object-cover sepia-[0.4] brightness-75 transition-all duration-500 group-hover:sepia-0 group-hover:brightness-100 group-hover:scale-105" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#333]">NO IMAGE</div>
                )}
              </div>

              <div className="h-[90px] bg-[#080808] flex flex-col justify-center items-center border-t border-ordo-gold-dim">
                <div className="font-header text-xl md:text-2xl text-ordo-gold uppercase tracking-[3px] drop-shadow-md px-2 text-center truncate w-full">{char.meta.name}</div>
                <div className="font-body text-base text-ordo-crimson tracking-widest italic mt-1">{char.meta.rank || 'Рекрут'}</div>
              </div>
            </div>
          ))}

          {/* New Protocol Card */}
          <div 
            onClick={() => setIsCreateModalOpen(true)}
            className="bg-[rgba(255,255,255,0.01)] border-2 border-dashed border-ordo-gold-dim h-[450px] md:h-[500px] flex flex-col justify-center items-center cursor-pointer transition-all hover:bg-[rgba(212,175,55,0.05)] hover:border-solid hover:border-ordo-gold group"
          >
            <div className="text-[5rem] text-ordo-gold-dim mb-5 transition-transform duration-300 group-hover:text-ordo-gold group-hover:scale-110 group-hover:drop-shadow-[0_0_20px_#d4af37]">+</div>
            <div className="text-ordo-gold tracking-[4px] font-bold font-header text-center">НОВЫЙ ПРОТОКОЛ</div>
          </div>
        </div>
      </main>

      <footer className="h-auto py-2 md:py-0 md:h-[50px] border-t border-ordo-gold-dim flex flex-col md:flex-row justify-between items-center px-4 md:px-10 bg-[#050505] z-10 text-xs tracking-[2px] text-ordo-gold-dim font-header shrink-0">
        <div>{now.toISOString().split('T')[1].split('.')[0]} ULT</div>
        <div className={`${isOffline ? 'text-gray-500' : 'text-ordo-crimson'} font-bold my-1 md:my-0`}>
           {isOffline ? "⚠ LOCAL (OFFLINE)" : "CONNECTION SECURE"}
        </div>
        <div>SYS.VER. 15.1</div>
      </footer>
    </div>
  );
};

export default Registry;
