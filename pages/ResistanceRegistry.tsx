
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { OrdoService } from '../services/firebase';
import { Character } from '../types';
import { ResistanceInputModal, ResistanceConfirmModal } from '../components/Components';

const ResistanceRegistry: React.FC = () => {
  const [characters, setCharacters] = useState<Record<string, Character>>({});
  const [isOffline, setIsOffline] = useState(OrdoService.isOffline());
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [deleteData, setDeleteData] = useState<{ isOpen: boolean; id: string; name: string }>({ isOpen: false, id: '', name: '' });
  const navigate = useNavigate();

  useEffect(() => {
    // USE 'resistance' CONTEXT
    const unsub = OrdoService.subscribeAll((data) => {
      setCharacters(data);
      setIsOffline(OrdoService.isOffline());
    }, 'resistance');
    return () => unsub();
  }, []);

  const handleCreate = async (name: string) => {
    if (name && name.trim()) {
      try {
        // USE 'resistance' CONTEXT
        const id = await OrdoService.create(name, 'resistance');
        setIsCreateModalOpen(false);
        navigate(`/resistance/dossier/${id}`);
      } catch (e) {
        alert("Init failed: " + e);
      }
    }
  };

  const confirmDelete = async () => {
      if (deleteData.id) {
          await OrdoService.delete(deleteData.id, 'resistance');
          setDeleteData({ isOpen: false, id: '', name: '' });
      }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#38ff12] font-mono relative overflow-x-hidden flex flex-col">
        {/* CSS for this page specifically */}
        <style>{`
            .res-scanlines {
                background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
                background-size: 100% 4px;
            }
            .res-hex-grid {
                background-image: 
                    linear-gradient(30deg, rgba(56, 255, 18, 0.1) 12%, transparent 12.5%, transparent 87%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1)),
                    linear-gradient(150deg, rgba(56, 255, 18, 0.1) 12%, transparent 12.5%, transparent 87%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1));
                background-size: 20px 35px;
                background-position: 0 0, 0 0;
                opacity: 0.3;
            }
            .res-glow { text-shadow: 0 0 5px #38ff12; }
            .res-border-glow { box-shadow: 0 0 10px #1a5c0b, inset 0 0 5px #1a5c0b; }
        `}</style>

        <div className="fixed inset-0 res-scanlines pointer-events-none z-50"></div>
        <div className="absolute inset-0 res-hex-grid pointer-events-none z-0"></div>

        <ResistanceInputModal
            isOpen={isCreateModalOpen}
            onClose={() => setIsCreateModalOpen(false)}
            onConfirm={handleCreate}
            title="INITIALIZE NEW MEMBER"
            placeholder="CODENAME..."
        />

        <ResistanceConfirmModal 
            isOpen={deleteData.isOpen}
            onClose={() => setDeleteData({ ...deleteData, isOpen: false })}
            onConfirm={confirmDelete}
            title="CONFIRM TERMINATION"
            message={`PERMANENTLY DELETE PROTOCOL: ${deleteData.name}?`}
        />

        <header className="border-b border-[#1a5c0b] p-4 flex justify-between items-center bg-[#1a5c0b]/20 z-10 relative">
            <div className="flex items-center gap-4">
                <button onClick={() => navigate('/')} className="border border-[#1a5c0b] px-3 py-1 text-xs hover:bg-[#38ff12] hover:text-black transition-colors">
                    &lt;&lt; BACK TO NODE
                </button>
                <div className="w-10 h-10 border border-[#38ff12] rounded-full flex items-center justify-center bg-black animate-pulse text-[#38ff12]">
                    <i className="fa-solid fa-terminal"></i>
                </div>
                <h1 className="text-2xl font-bold font-tech res-glow tracking-widest uppercase text-[#38ff12]">REBEL TERMINAL</h1>
            </div>
            <div className="text-right text-xs text-[#1a5c0b]">
                <div>NET: <span className={isOffline ? "text-red-500 animate-pulse" : "text-[#38ff12]"}>{isOffline ? "OFFLINE (CACHE)" : "SECURE"}</span></div>
                <div>VER: 4.2.1-BETA</div>
            </div>
        </header>

        <main className="flex-1 p-6 relative z-10 overflow-y-auto">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6 max-w-7xl mx-auto">
                {Object.values(characters).map((char) => (
                    <div 
                        key={char.id}
                        onClick={() => navigate(`/resistance/dossier/${char.id}`)}
                        className="border border-[#1a5c0b] bg-[#0a0a0a]/90 flex flex-col h-[400px] relative group hover:border-[#38ff12] hover:res-border-glow transition-all cursor-pointer"
                    >
                        {/* Brackets */}
                        <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-[#38ff12]"></div>
                        <div className="absolute top-0 right-0 w-2 h-2 border-t border-r border-[#38ff12]"></div>
                        <div className="absolute bottom-0 left-0 w-2 h-2 border-b border-l border-[#38ff12]"></div>
                        <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-[#38ff12]"></div>

                        <button 
                            onClick={(e) => { e.stopPropagation(); setDeleteData({ isOpen: true, id: char.id, name: char.meta.name }); }}
                            className="absolute top-2 right-2 text-[#1a5c0b] hover:text-red-500 z-20 px-2 font-bold"
                        >
                            [DEL]
                        </button>

                        <div className="h-[250px] overflow-hidden border-b border-[#1a5c0b] relative">
                             {char.meta.image ? (
                                <img src={char.meta.image} alt="ID" className="w-full h-full object-cover filter grayscale sepia hue-rotate-90 contrast-125 group-hover:grayscale-0 transition-all duration-500" />
                             ) : (
                                <div className="w-full h-full flex items-center justify-center text-[#1a5c0b] bg-[#051005]">
                                    NO SIGNAL
                                </div>
                             )}
                             <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.5)_0%,transparent_100%)]"></div>
                        </div>

                        <div className="flex-1 p-4 flex flex-col justify-center">
                            <h2 className="text-xl font-bold font-tech text-[#38ff12] truncate group-hover:res-glow">{char.meta.name}</h2>
                            <div className="text-sm text-[#1a5c0b] font-mono mt-1">{char.meta.rank || 'Operative'}</div>
                            <div className="text-xs text-[#1a5c0b] mt-2">ID: {char.id.substring(0,8).toUpperCase()}</div>
                        </div>
                    </div>
                ))}

                {/* Add New */}
                <div 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="border-2 border-dashed border-[#1a5c0b] h-[400px] flex flex-col items-center justify-center cursor-pointer hover:bg-[#38ff12]/5 hover:border-[#38ff12] transition-all group"
                >
                    <div className="text-6xl text-[#1a5c0b] group-hover:text-[#38ff12] mb-4">+</div>
                    <div className="font-tech text-[#1a5c0b] group-hover:text-[#38ff12] tracking-widest">INIT NEW PROTOCOL</div>
                </div>
            </div>
        </main>
    </div>
  );
};

export default ResistanceRegistry;
