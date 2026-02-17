
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { OrdoService } from '../services/firebase';
import { Character, Attributes } from '../types';
import { ResistanceEditModal, ResistanceDragHandle, ResistanceDeleteBtn, ResistanceToggle, ResistanceNumberInput } from '../components/Components';
import { debounce } from 'lodash';

// --- CONSTANTS & HELPERS ---
const getMod = (val: number) => Math.floor((val - 10) / 2);
const formatMod = (val: number) => (val >= 0 ? `+${val}` : `${val}`);

const SKILL_LIST = [
  { k: 'athletics', n: 'Атлетика', a: 'str' }, { k: 'acrobatics', n: 'Акробатика', a: 'dex' },
  { k: 'sleight', n: 'Ловкость рук', a: 'dex' }, { k: 'stealth', n: 'Скрытность', a: 'dex' },
  { k: 'history', n: 'История', a: 'int' }, { k: 'investigation', n: 'Расследование', a: 'int' },
  { k: 'tech', n: 'Техника', a: 'int' }, { k: 'programming', n: 'Программирование', a: 'int' },
  { k: 'fund_science', n: 'Фун. Науки', a: 'int' }, { k: 'weapons', n: 'Оружие', a: 'int' },
  { k: 'nature', n: 'Природа', a: 'int' }, { k: 'religion', n: 'Религия', a: 'int' },
  { k: 'perception', n: 'Восприятие', a: 'wis' }, { k: 'survival', n: 'Выживание', a: 'wis' },
  { k: 'medicine', n: 'Медицина', a: 'wis' }, { k: 'insight', n: 'Проницательность', a: 'wis' },
  { k: 'performance', n: 'Выступление', a: 'cha' }, { k: 'intimidation', n: 'Запугивание', a: 'cha' },
  { k: 'deception', n: 'Обман', a: 'cha' }, { k: 'persuasion', n: 'Убеждение', a: 'cha' }
] as const;

const ATTRIBUTES = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;

// Types for Drag State
interface DragState {
  active: boolean;
  listPathStr: string;
  itemIndex: number;
  itemName: string;
  pos: { x: number; y: number };
}

// --- STYLED COMPONENTS (Internal) ---
const TerminalInput: React.FC<React.InputHTMLAttributes<HTMLInputElement>> = (props) => (
    <input {...props} className={`bg-[#051a05] border border-[#38ff12] text-[#38ff12] px-2 py-1 font-mono outline-none focus:bg-[#0a2e0a] focus:shadow-[0_0_5px_#38ff12] ${props.className || ''}`} />
);

const TerminalTextArea: React.FC<React.TextareaHTMLAttributes<HTMLTextAreaElement>> = (props) => (
    <textarea {...props} className={`bg-[#051a05] border border-[#38ff12] text-[#38ff12] px-2 py-1 font-mono outline-none focus:bg-[#0a2e0a] focus:shadow-[0_0_5px_#38ff12] resize-y ${props.className || ''}`} />
);

const TabBtn: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode; color?: string; isLocked?: boolean; onToggleLock?: () => void }> = ({ active, onClick, children, color, isLocked, onToggleLock }) => {
    const borderColor = color === 'red' ? 'border-red-700' : 'border-[#1a5c0b]';
    const activeBg = color === 'red' ? 'bg-red-900/40 text-red-400' : 'bg-[#1a5c0b]/40 text-[#38ff12]';
    const inactiveBg = 'bg-[#0a2e0a]/20 text-[#1a5c0b]';
    
    return (
        <div className="flex items-center mr-2 mb-2">
            <button 
                onClick={onClick}
                className={`px-4 py-2 border ${borderColor} uppercase tracking-wider text-sm font-bold transition-all clip-path-polygon ${active ? activeBg : inactiveBg} hover:text-white`}
                style={{ clipPath: 'polygon(10% 0, 100% 0, 100% 60%, 90% 100%, 0 100%, 0 40%)' }}
            >
                {children}
            </button>
            {onToggleLock && (
                <ResistanceToggle checked={!!isLocked} onChange={onToggleLock} className="ml-2" />
            )}
        </div>
    )
};

const StatBox: React.FC<{ label: string; value: string|number; sub?: string; children?: React.ReactNode }> = ({ label, value, sub, children }) => (
    <div className="bg-[#1a5c0b]/20 p-4 border border-[#1a5c0b] rounded text-center hover:bg-[#1a5c0b]/30 transition-colors">
        {children ? children : (
            <>
                <div className="text-2xl font-bold text-white font-tech">{value}</div>
                <div className="text-xs text-[#1a5c0b] mt-1">{sub}</div>
            </>
        )}
        <div className="mt-2 text-xs border-t border-[#1a5c0b] pt-1 uppercase text-[#38ff12]">{label}</div>
    </div>
);

const SectionHeader: React.FC<{ title: string; onAdd?: () => void }> = ({ title, onAdd }) => (
    <div className="flex justify-between items-end border-b border-[#1a5c0b] pb-1 mb-4">
        <h3 className="font-tech text-lg text-white tracking-widest">{title}</h3>
        {onAdd && <button onClick={onAdd} className="text-xs text-[#38ff12] hover:text-white border border-[#38ff12] px-2">[ADD NEW]</button>}
    </div>
);

const ResistanceDossier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Character | null>(null);
  const [activeTab, setActiveTab] = useState('main');
  const [subTab, setSubTab] = useState<string>('default');
  
  // Modal State
  const [editingItem, setEditingItem] = useState<{ path: string[], index: number, item: any } | null>(null);

  // Drag State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Logic hooks
  useEffect(() => {
    if (!id) return;
    const unsub = OrdoService.subscribeOne(id, (char) => {
      if (char) setData(char);
    }, 'resistance');
    return () => unsub();
  }, [id]);

  const saveToDb = useMemo(() => debounce((newData: Character) => {
    if (!newData.id) return;
    OrdoService.update(newData.id, newData, 'resistance');
  }, 500), []);

  const update = useCallback((fn: (d: Character) => void) => {
    setData((prev) => {
      if (!prev) return null;
      const next = JSON.parse(JSON.stringify(prev));
      fn(next);
      saveToDb(next);
      return next;
    });
  }, [saveToDb]);

  // Helpers
  const addItem = (listPath: string[], item: any) => {
    update(d => {
      let target: any = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i]];
      const last = listPath[listPath.length - 1];
      if (Array.isArray(target[last])) target[last].push(item);
    });
  };

  const removeItem = (listPath: string[], index: number) => {
    update(d => {
      let target: any = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i]];
      const last = listPath[listPath.length - 1];
      if (Array.isArray(target[last])) target[last].splice(index, 1);
    });
  };

  const moveItemTo = (listPath: string[], fromIndex: number, toIndex: number) => {
    update(d => {
        let target: any = d;
        for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i]];
        const arr = target[listPath[listPath.length - 1]];
        if(Array.isArray(arr) && fromIndex >= 0 && fromIndex < arr.length && toIndex >= 0 && toIndex < arr.length) {
            const [item] = arr.splice(fromIndex, 1);
            arr.splice(toIndex, 0, item);
        }
    });
  };

  const openEdit = (listPath: string[], index: number) => {
    let target: any = data;
    for (let i = 0; i < listPath.length; i++) target = target[listPath[i]];
    const item = target[index];
    setEditingItem({ path: listPath, index, item });
  };

  const updateClamped = (fieldPath: string[], value: number, max: number) => {
    update(d => {
        let target: any = d;
        for(let i=0; i<fieldPath.length-1; i++) target = target[fieldPath[i]];
        const last = fieldPath[fieldPath.length-1];
        target[last] = (max > 0 && value > max) ? max : value;
    });
  };

  const toggleLock = (tab: string) => {
    update(d => {
        if (!d.locks) d.locks = {};
        d.locks[tab] = !d.locks[tab];
    });
  };

  // Drag Handlers
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, listPath: string[], index: number, itemName: string) => {
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    dragTimerRef.current = setTimeout(() => {
        setDragState({
            active: true,
            listPathStr: JSON.stringify(listPath),
            itemIndex: index,
            itemName,
            pos: { x: clientX, y: clientY }
        });
    }, 200);
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (dragTimerRef.current && !dragState) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
    }
    if (dragState && dragState.active) {
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        setDragState(prev => prev ? ({ ...prev, pos: { x: clientX, y: clientY } }) : null);

        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            const listPathStr = el.getAttribute('data-list-path');
            const indexStr = el.getAttribute('data-index');
            if (listPathStr === dragState.listPathStr && indexStr) {
                const targetIndex = parseInt(indexStr);
                if (targetIndex !== dragState.itemIndex) {
                    const listPath = JSON.parse(listPathStr);
                    moveItemTo(listPath, dragState.itemIndex, targetIndex);
                    setDragState(prev => prev ? ({ ...prev, itemIndex: targetIndex }) : null);
                }
                break;
            }
        }
    }
  }, [dragState, update]);

  const handleDragEnd = useCallback(() => {
    if (dragTimerRef.current) { clearTimeout(dragTimerRef.current); dragTimerRef.current = null; }
    setDragState(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleDragMove, { passive: false });
    window.addEventListener('touchmove', handleDragMove, { passive: false });
    window.addEventListener('mouseup', handleDragEnd);
    window.addEventListener('touchend', handleDragEnd);
    return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('touchmove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
        window.removeEventListener('touchend', handleDragEnd);
    }
  }, [handleDragMove, handleDragEnd]);

  if (!data) return <div className="min-h-screen bg-black text-[#38ff12] flex items-center justify-center font-mono">SEARCHING NODE...</div>;

  const level = data.meta.level || 1;
  const pb = 2 + Math.floor((level - 1) / 4);
  const getAttrMod = (attr: keyof Attributes) => getMod(data.stats[attr] || 10);
  
  // Passive Perception
  const wisMod = getMod(data.stats.wis);
  const perSkill = data.skills.data['perception'] || [false, false, 0];
  const perBonus = (perSkill[1] ? pb * 2 : (perSkill[0] ? pb : 0)) + perSkill[2];
  const passivePerception = 10 + wisMod + perBonus + (data.stats.passive_perception_mod || 0);

  // Psi Calc
  const psiBaseAttr = data.psionics.base_attr;
  const psiMod = getMod(data.stats[psiBaseAttr]);
  const psiTypeLabel = psiBaseAttr === 'int' ? 'Учёная' : 'Интуитивная';
  const psiType = psiBaseAttr === 'int' ? 'learned' : 'intuitive';
  
  // Class Level
  let rawClassLvl = 2 + Math.floor(data.meta.level / 3);
  let maxClassLvl = 8;
  if(data.psionics.caster_type === '0.5') maxClassLvl = 7;
  if(data.psionics.caster_type === '0.33') maxClassLvl = 6;
  const psiClassLvl = Math.max(2, Math.min(maxClassLvl, rawClassLvl));

  // Spells/Cantrips Known
  const cantripsKnown = pb;
  let spellsKnown = 0;
  if (psiType === 'learned') spellsKnown = level + psiMod;
  else spellsKnown = Math.floor(level / 2) + psiMod;
  if (spellsKnown < 1) spellsKnown = 1;

  let ptsPerLvl = 6;
  if(data.psionics.caster_type === '0.5') ptsPerLvl = 3;
  if(data.psionics.caster_type === '0.33') ptsPerLvl = 2;
  const psiMaxPts = (ptsPerLvl + (data.psionics.mod_points||0)) * level;

  const isLocked = data.locks?.[activeTab];

  return (
    <div className="min-h-screen bg-[#050505] text-[#38ff12] font-mono flex flex-col relative overflow-x-hidden">
        {/* CSS Override */}
        <style>{`
            .sc-font { font-family: 'Orbitron', sans-serif; }
            .res-scanlines {
                background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0) 50%, rgba(0,0,0,0.2) 50%, rgba(0,0,0,0.2));
                background-size: 100% 4px;
                pointer-events: none;
            }
            .res-hex-bg {
                background-image: 
                    linear-gradient(30deg, rgba(56, 255, 18, 0.1) 12%, transparent 12.5%, transparent 87%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1)),
                    linear-gradient(150deg, rgba(56, 255, 18, 0.1) 12%, transparent 12.5%, transparent 87%, rgba(56, 255, 18, 0.1) 87.5%, rgba(56, 255, 18, 0.1));
                background-size: 20px 35px;
                opacity: 0.2;
            }
            ::-webkit-scrollbar-thumb { background: #1a5c0b; border: 1px solid #38ff12; }
        `}</style>
        
        <div className="fixed inset-0 res-scanlines z-50"></div>
        <div className="absolute inset-0 res-hex-bg z-0 pointer-events-none"></div>

        {/* DRAG GHOST */}
        {dragState && dragState.active && (
            <div 
                className="fixed pointer-events-none z-[100] bg-[#1a5c0b] border border-[#38ff12] p-2 text-[#38ff12] font-mono opacity-90 rounded"
                style={{ left: dragState.pos.x, top: dragState.pos.y, transform: 'translate(-50%, -50%)' }}
            >
                {dragState.itemName}
            </div>
        )}

        <ResistanceEditModal 
            isOpen={!!editingItem}
            onClose={() => setEditingItem(null)}
            title="EDIT DATA"
            nameValue={editingItem?.item.name || ''}
            descValue={editingItem?.item.desc || editingItem?.item.props || ''}
            onNameChange={(v) => {
                if(editingItem) update(d => {
                    let target: any = d;
                    for(const p of editingItem.path) target = target[p];
                    target[editingItem.index].name = v;
                    setEditingItem({...editingItem, item: {...editingItem.item, name: v}});
                });
            }}
            onDescChange={(v) => {
                if(editingItem) update(d => {
                    let target: any = d;
                    for(const p of editingItem.path) target = target[p];
                    if(editingItem.path.includes('weapons')) {
                        target[editingItem.index].props = v;
                        setEditingItem({...editingItem, item: {...editingItem.item, props: v}});
                    } else if(editingItem.path.includes('custom_table')) {
                         target[editingItem.index].desc = v; 
                         setEditingItem({...editingItem, item: {...editingItem.item, desc: v}});
                    } else {
                        target[editingItem.index].desc = v;
                        setEditingItem({...editingItem, item: {...editingItem.item, desc: v}});
                    }
                });
            }}
        />

        {/* HEADER */}
        <header className="border-b border-[#1a5c0b] p-4 flex flex-col md:flex-row justify-between items-center bg-[#1a5c0b]/10 z-10 relative">
            <div className="flex items-center gap-4 w-full md:w-auto">
                <Link to="/resistance/registry" className="border border-[#1a5c0b] p-2 hover:bg-[#38ff12] hover:text-black transition-colors">
                    <i className="fa-solid fa-arrow-left"></i>
                </Link>
                <div className="w-12 h-12 border border-[#38ff12] rounded-full flex items-center justify-center bg-black animate-pulse">
                    <i className="fa-solid fa-user-secret text-2xl"></i>
                </div>
                <div>
                    <h1 className="text-xl md:text-2xl font-bold sc-font text-[#38ff12] tracking-widest uppercase">{data.meta.name || 'UNKNOWN SUBJECT'}</h1>
                    <div className="text-xs text-[#1a5c0b] tracking-[0.2em]">FILE #{data.id.substring(0,6).toUpperCase()} // {data.meta.archetype || 'CLASSIFIED'}</div>
                </div>
            </div>
            <div className="mt-4 md:mt-0 text-right text-xs text-[#1a5c0b] w-full md:w-auto flex justify-between md:block">
                <div>STATUS: <span className="text-[#38ff12] font-bold animate-pulse">ACTIVE</span></div>
                <div>LEVEL: <span className="text-white">{level}</span></div>
            </div>
        </header>

        {/* NAV */}
        <nav className="flex flex-wrap gap-x-2 p-4 border-b border-[#1a5c0b] z-10 relative bg-[#050505]">
            {[
                ['main', 'Главная'],
                ['stats', 'Характеристики'],
                ['features', 'Возможности'],
                ['gear', 'Снаряжение'],
                ['data', 'Данные'],
                ['psi', 'Псионика'],
                ['uni', 'Универсальное']
            ].map(([key, label]) => (
                <TabBtn 
                    key={key} 
                    active={activeTab === key} 
                    onClick={() => { setActiveTab(key); setSubTab('default'); }}
                    isLocked={data.locks?.[key]}
                    onToggleLock={() => toggleLock(key)}
                >
                    {label}
                </TabBtn>
            ))}
        </nav>

        {/* CONTENT */}
        <main className="flex-1 p-4 md:p-6 overflow-y-auto relative z-10 pb-20">
            {isLocked ? (
                <div className="flex items-center justify-center h-full text-red-500 font-tech text-4xl animate-pulse tracking-widest border border-red-900 bg-red-900/10 p-20">
                    ACCESS DENIED
                </div>
            ) : (
            <div className="max-w-7xl mx-auto">
                
                {/* --- MAIN TAB (Identity) --- */}
                {activeTab === 'main' && (
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                        <div className="md:col-span-4 flex flex-col gap-4">
                            <div className="border border-[#38ff12] h-[400px] bg-black relative group overflow-hidden">
                                {data.meta.image ? (
                                    <img src={data.meta.image} alt="VisID" className="w-full h-full object-cover filter grayscale sepia hue-rotate-90 contrast-125 hover:filter-none transition-all duration-500" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-[#1a5c0b]">NO VISUAL DATA</div>
                                )}
                                <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(0,0,0,0.8),transparent)] pointer-events-none"></div>
                                <div className="absolute bottom-0 w-full p-2 text-xs text-center border-t border-[#1a5c0b] bg-black/80">
                                    <span className="animate-pulse text-red-500">● REC</span> VISUAL ID
                                </div>
                                <button onClick={() => { const u = prompt("Image URL"); if(u) update(d=>d.meta.image=u) }} className="absolute top-2 right-2 border border-[#38ff12] bg-black px-2 hover:bg-[#38ff12] hover:text-black">EDIT</button>
                            </div>
                        </div>
                        <div className="md:col-span-8 flex flex-col gap-6">
                            <div className="bg-[#1a5c0b]/10 border border-[#1a5c0b] p-4 relative">
                                <div className="absolute top-0 right-0 bg-[#1a5c0b] text-black text-xs font-bold px-2">BIO-DATA</div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                                    {[
                                        {l:'Имя',k:'name'},{l:'Раса',k:'race'},{l:'Класс',k:'class'},
                                        {l:'Доктрина',k:'archetype'},{l:'Возраст',k:'age'},{l:'Происхождение',k:'origin'},
                                        {l:'Ранг',k:'rank'},{l:'Работа',k:'job'}
                                    ].map(f => (
                                        <div key={f.k} className="flex justify-between border-b border-[#1a5c0b]/30 py-1">
                                            <span className="text-[#1a5c0b]">{f.l}:</span>
                                            <input className="bg-transparent text-right text-[#38ff12] outline-none w-1/2" value={(data.meta as any)[f.k]} onChange={e => update(d=>(d.meta as any)[f.k]=e.target.value)} />
                                        </div>
                                    ))}
                                    <div className="flex justify-between border-b border-[#1a5c0b]/30 py-1">
                                        <span className="text-[#1a5c0b]">Уровень:</span>
                                        <input type="number" className="bg-transparent text-right text-white font-bold outline-none w-16" value={data.meta.level} onChange={e => update(d=>d.meta.level=parseInt(e.target.value))} />
                                    </div>
                                    <div className="flex justify-between border-b border-[#1a5c0b]/30 py-1">
                                        <span className="text-[#1a5c0b]">Бонус Маст.:</span>
                                        <span className="text-white font-bold">+{pb}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- STATS TAB --- */}
                {activeTab === 'stats' && (
                    <div className="space-y-6">
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
                            {ATTRIBUTES.map(attr => (
                                <StatBox key={attr} label={attr.toUpperCase()} value={data.stats[attr]} sub={`[${formatMod(getAttrMod(attr))}]`}>
                                    <ResistanceNumberInput className="w-full text-3xl font-bold" value={data.stats[attr]} onChange={e => update(d => d.stats[attr] = parseInt(e.target.value))} />
                                    <div className="text-[#38ff12] text-sm mt-1">{formatMod(getAttrMod(attr))}</div>
                                </StatBox>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <SectionHeader title="Жизнедеятельность" />
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center">
                                        <label className="text-red-500">HP (Текущ / Макс):</label>
                                        <div className="flex gap-2">
                                            <ResistanceNumberInput className="w-20 text-red-500 font-bold text-xl" value={data.stats.hp_curr} onChange={e => updateClamped(['stats','hp_curr'], parseInt(e.target.value)||0, data.stats.hp_max)} />
                                            <span className="text-gray-500">/</span>
                                            <ResistanceNumberInput className="w-20 text-white" value={data.stats.hp_max} onChange={e => update(d => d.stats.hp_max = parseInt(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center text-sm">
                                        <span className="text-orange-400">Временные:</span>
                                        <ResistanceNumberInput className="w-16 text-orange-400" value={data.stats.hp_temp || 0} onChange={e => update(d => d.stats.hp_temp = parseInt(e.target.value))} />
                                    </div>
                                    <div className="w-full bg-red-900/20 h-4 border border-red-900 relative">
                                        <div className="h-full bg-red-600 transition-all" style={{width: `${Math.min(100, (data.stats.hp_curr / (data.stats.hp_max || 1)) * 100)}%`}}></div>
                                        <div className="absolute top-0 left-0 h-full bg-orange-400/50 transition-all" style={{width: `${Math.min(100, ((data.stats.hp_temp||0) / (data.stats.hp_max || 1)) * 100)}%`}}></div>
                                    </div>

                                    <div className="flex justify-between items-center pt-2">
                                        <label className="text-blue-500">Щиты (Текущ / Макс):</label>
                                        <div className="flex gap-2">
                                            <ResistanceNumberInput className="w-20 text-blue-500 font-bold text-xl" value={data.stats.shield_curr} onChange={e => updateClamped(['stats','shield_curr'], parseInt(e.target.value)||0, data.stats.shield_max)} />
                                            <span className="text-gray-500">/</span>
                                            <ResistanceNumberInput className="w-20 text-white" value={data.stats.shield_max} onChange={e => update(d => d.stats.shield_max = parseInt(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="w-full bg-blue-900/20 h-4 border border-blue-900">
                                        <div className="h-full bg-blue-600 transition-all" style={{width: `${Math.min(100, (data.stats.shield_curr / (data.stats.shield_max || 1)) * 100)}%`}}></div>
                                    </div>
                                    
                                    <div className="flex justify-between items-center pt-4 border-t border-[#1a5c0b]">
                                        <span>Класс Брони (AC):</span>
                                        <ResistanceNumberInput className="w-20 font-bold text-2xl" value={data.stats.ac} onChange={e => update(d => d.stats.ac = parseInt(e.target.value))} />
                                    </div>
                                    <div className="flex flex-col gap-2 pt-2">
                                        <div className="flex justify-between items-center">
                                            <span>Базовая Скорость:</span>
                                            <ResistanceNumberInput readOnly step={1.5} min={0} className="w-20 text-center cursor-default" value={data.stats.speed} onChange={e => update(d => d.stats.speed = parseFloat(e.target.value))} />
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-2 pt-4 border-t border-[#1a5c0b]">
                                        <div className="flex justify-between items-center">
                                            <span className="text-white font-bold">Пассивная Внимательность:</span>
                                            <span className="text-2xl font-tech font-bold text-[#38ff12]">{passivePerception}</span>
                                        </div>
                                        <div className="flex justify-between items-center text-sm">
                                            <span className="text-[#1a5c0b]">Вольный Модификатор:</span>
                                            <ResistanceNumberInput className="w-16 border-b border-[#38ff12] text-center text-white" value={data.stats.passive_perception_mod || 0} onChange={e => update(d => d.stats.passive_perception_mod = parseInt(e.target.value))} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <SectionHeader title="Спасброски" />
                                <table className="w-full text-left">
                                    <thead><tr className="text-[#1a5c0b] text-xs uppercase"><th className="pb-2">ATTR</th><th className="pb-2 text-center">PROF</th><th className="pb-2 text-right">MOD</th></tr></thead>
                                    <tbody>
                                        {ATTRIBUTES.map(attr => {
                                            const isProf = (data.saves as any)[`prof_${attr}`];
                                            const mod = getAttrMod(attr) + (isProf ? pb : 0);
                                            return ( 
                                                <tr key={attr} className="border-b border-[#1a5c0b]/30"> 
                                                    <td className="py-2 font-bold">{attr.toUpperCase()}</td> 
                                                    <td className="py-2 text-center">
                                                        <div className="flex justify-center">
                                                            <ResistanceToggle checked={!!isProf} onChange={() => update(d => (d.saves as any)[`prof_${attr}`] = !isProf)} />
                                                        </div>
                                                    </td> 
                                                    <td className="py-2 text-right font-bold text-white">{formatMod(mod)}</td> 
                                                </tr> 
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}

                {/* ... FEATURES, EQUIPMENT, DATA, PSI, UNI ... */}
                {activeTab === 'features' && (
                    <div>
                        <div className="flex gap-2 mb-4 flex-wrap">
                            {['Навыки', 'Умения', 'Особенности', 'Черты', 'Владения'].map(t => (
                                <button key={t} onClick={() => setSubTab(t === 'Навыки' ? 'default' : t)} className={`px-3 py-1 border ${subTab === t || (subTab === 'default' && t === 'Навыки') ? 'border-[#38ff12] bg-[#38ff12]/20' : 'border-[#1a5c0b] text-[#1a5c0b]'}`}>{t}</button>
                            ))}
                        </div>

                        {subTab === 'default' && (
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a] overflow-x-auto">
                                <SectionHeader title="Матрица Навыков" />
                                <table className="w-full text-left border-collapse min-w-[600px]">
                                    <thead className="bg-[#1a5c0b]/20 text-[#38ff12] font-mono text-sm">
                                        <tr><th className="p-2 border-b border-[#1a5c0b]">Навык</th><th className="p-2 border-b border-[#1a5c0b]">Атр</th><th className="p-2 border-b border-[#1a5c0b] text-center">Влад.</th><th className="p-2 border-b border-[#1a5c0b] text-center">Эксп.</th><th className="p-2 border-b border-[#1a5c0b] text-center">Бонус</th><th className="p-2 border-b border-[#1a5c0b] text-right">Итог</th></tr>
                                    </thead>
                                    <tbody>
                                        {SKILL_LIST.map(skill => {
                                            const [isProf, isExp, bonus] = data.skills.data[skill.k] || [false, false, 0];
                                            const total = getAttrMod(skill.a as any) + bonus + (isExp ? pb * 2 : isProf ? pb : 0);
                                            return (
                                                <tr key={skill.k} className="border-b border-[#1a5c0b]/20 hover:bg-[#1a5c0b]/10">
                                                    <td className="p-2">{skill.n}</td>
                                                    <td className="p-2 text-[#1a5c0b] uppercase text-xs">{skill.a}</td>
                                                    <td className="p-2 text-center">
                                                        <div className="flex justify-center">
                                                            <ResistanceToggle checked={!!isProf} onChange={() => update(d => { const c = d.skills.data[skill.k]||[false,false,0]; d.skills.data[skill.k]=[!c[0],c[1],c[2]]})} />
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-center">
                                                        <div className="flex justify-center">
                                                            <ResistanceToggle checked={!!isExp} onChange={() => update(d => { const c = d.skills.data[skill.k]||[false,false,0]; d.skills.data[skill.k]=[c[0],!c[1],c[2]]})} />
                                                        </div>
                                                    </td>
                                                    <td className="p-2 text-center"><ResistanceNumberInput className="w-16 text-center border-b border-[#1a5c0b]" value={bonus} onChange={e => update(d => { const c = d.skills.data[skill.k]||[false,false,0]; d.skills.data[skill.k]=[c[0],c[1],parseInt(e.target.value)||0]})} /></td>
                                                    <td className="p-2 text-right font-bold text-white text-lg">{formatMod(total)}</td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        {(subTab === 'Умения' || subTab === 'Особенности' || subTab === 'Черты') && (
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <SectionHeader title={subTab} onAdd={() => addItem([subTab === 'Умения' ? 'abilities' : subTab === 'Особенности' ? 'features' : 'traits'], {name: 'Новая запись', desc: ''})} />
                                {(() => {
                                    const path = subTab === 'Умения' ? 'abilities' : subTab === 'Особенности' ? 'features' : 'traits';
                                    const list = (data as any)[path];
                                    return list.map((item: any, i: number) => (
                                        <div 
                                            key={i} 
                                            className={`flex justify-between items-center p-2 border border-[#1a5c0b]/30 mb-2 cursor-pointer transition-opacity hover:border-[#38ff12] ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify([path]) ? 'opacity-30' : 'opacity-100'}`}
                                            data-list-path={JSON.stringify([path])}
                                            data-index={i}
                                            onClick={() => openEdit([path], i)}
                                        >
                                            <span className="text-[#38ff12]">{item.name}</span>
                                            <div className="flex" onClick={e => e.stopPropagation()}>
                                                <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, [path], i, item.name)} onTouchStart={(e) => handleDragStart(e, [path], i, item.name)} />
                                                <ResistanceDeleteBtn onClick={() => removeItem([path], i)} />
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>
                        )}
                         {subTab === 'Владения' && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {[['armory', 'Оружие/Броня'], ['tools', 'Инструменты'], ['langs', 'Языки']].map(([key, label]) => (
                                    <div key={key} className="border border-[#1a5c0b] p-4">
                                        <SectionHeader title={label} onAdd={() => addItem(['profs', key], "Новое")} />
                                        {(data.profs as any)[key].map((it: string, i: number) => (
                                            <div key={i} className="flex justify-between p-1 border-b border-[#1a5c0b]/20" data-list-path={JSON.stringify(['profs', key])} data-index={i}>
                                                <input className="bg-transparent w-full text-gray-300" value={it} onChange={e => update(d => (d.profs as any)[key][i] = e.target.value)} />
                                                <div className="flex">
                                                    <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['profs', key], i, it)} onTouchStart={(e) => handleDragStart(e, ['profs', key], i, it)} />
                                                    <ResistanceDeleteBtn onClick={() => removeItem(['profs', key], i)} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                {activeTab === 'gear' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                            <SectionHeader title="Оружие" onAdd={() => addItem(['combat', 'weapons'], {name: 'Новое оружие', type: 'Винтовка'})} />
                            {data.combat.weapons.map((w, i) => (
                                <div key={i} className="mb-2 p-2 border border-[#1a5c0b]/30 cursor-pointer" onClick={() => openEdit(['combat', 'weapons'], i)} data-list-path={JSON.stringify(['combat', 'weapons'])} data-index={i}>
                                    <div className="flex justify-between">
                                        <span className="font-bold text-white">{w.name}</span>
                                        <div className="flex" onClick={e => e.stopPropagation()}>
                                            <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} />
                                            <ResistanceDeleteBtn onClick={() => removeItem(['combat', 'weapons'], i)} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-4 gap-1 text-[10px] text-[#1a5c0b] mt-1">
                                        <input className="bg-transparent" value={w.type} onChange={e => update(d => d.combat.weapons[i].type = e.target.value)} />
                                        <input className="bg-transparent" value={w.dmg} onChange={e => update(d => d.combat.weapons[i].dmg = e.target.value)} />
                                        <input className="bg-transparent" value={w.range} onChange={e => update(d => d.combat.weapons[i].range = e.target.value)} />
                                        <input className="bg-transparent" value={w.props} onChange={e => update(d => d.combat.weapons[i].props = e.target.value)} />
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="space-y-6">
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <SectionHeader title="Инвентарь" onAdd={() => addItem(['combat', 'inventory'], {name: 'Предмет', desc: ''})} />
                                {data.combat.inventory.map((item, i) => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-[#1a5c0b]/30 cursor-pointer" onClick={() => openEdit(['combat', 'inventory'], i)} data-list-path={JSON.stringify(['combat', 'inventory'])} data-index={i}>
                                        <span className="text-[#38ff12]">{item.name}</span>
                                        <div className="flex" onClick={e => e.stopPropagation()}>
                                            <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'inventory'], i, item.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'inventory'], i, item.name)} />
                                            <ResistanceDeleteBtn onClick={() => removeItem(['combat', 'inventory'], i)} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                <SectionHeader title="Финансы" />
                                <table className="w-full">
                                    <tbody>
                                        {['u','k','m','g'].map(curr => (
                                            <tr key={curr}>
                                                <td className="p-2 uppercase text-[#1a5c0b]">{curr}-Credits</td>
                                                <td><ResistanceNumberInput className="w-full text-right" value={(data.money as any)[curr]} onChange={e => update(d => (d.money as any)[curr] = e.target.value)} /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="mt-4 pt-4 border-t border-[#1a5c0b] text-center"> 
                                    <h3 className="text-[#1a5c0b]">TOTAL (K-UNITS)</h3> 
                                    <span className="text-2xl text-[#38ff12]"> 
                                        {( (parseFloat(data.money.g as any)||0)*1000000 + (parseFloat(data.money.m as any)||0)*1000 + (parseFloat(data.money.k as any)||0) + (parseFloat(data.money.u as any)||0)/1000 ).toLocaleString('ru-RU', {minimumFractionDigits: 2})} K 
                                    </span> 
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                 {activeTab === 'data' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                            <SectionHeader title="Антропометрия" />
                            {['size', 'age', 'height', 'weight'].map(k => ( 
                                <div key={k} className="flex justify-between py-2 border-b border-[#1a5c0b]/20"> 
                                    <span className="text-[#1a5c0b] capitalize">{k}:</span> 
                                    <TerminalInput value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} className="text-right" /> 
                                </div> 
                            ))}
                         </div>
                         <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                            <SectionHeader title="Личность" />
                            {['trait', 'ideal', 'bond', 'flaw'].map(k => ( 
                                <div key={k} className="mb-4"> 
                                    <span className="text-[#1a5c0b] capitalize block mb-1">{k}:</span> 
                                    <TerminalTextArea value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} /> 
                                </div> 
                            ))}
                         </div>
                         <div className="md:col-span-2 border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <SectionHeader title="Анализ" />
                             <TerminalTextArea className="w-full h-32" value={data.psych.analysis} onChange={e => update(d => d.psych.analysis = e.target.value)} />
                         </div>
                    </div>
                )}
                 {activeTab === 'psi' && (
                     <div>
                        <div className="flex gap-2 mb-4">
                            <button onClick={() => setSubTab('default')} className={`px-4 py-1 border ${subTab==='default'?'border-[#38ff12] bg-[#38ff12]/20':'border-[#1a5c0b] text-[#1a5c0b]'}`}>Параметры</button>
                            <button onClick={() => setSubTab('spells')} className={`px-4 py-1 border ${subTab==='spells'?'border-[#38ff12] bg-[#38ff12]/20':'border-[#1a5c0b] text-[#1a5c0b]'}`}>Заклинания</button>
                        </div>
                        {subTab === 'default' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                    <SectionHeader title="Параметры" />
                                    <div className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <span>База:</span> 
                                            <select className="bg-[#051a05] text-[#38ff12] border border-[#1a5c0b]" value={data.psionics.base_attr} onChange={e => update(d => d.psionics.base_attr = e.target.value as any)}>
                                                <option value="int">INT (Интеллект)</option><option value="wis">WIS (Мудрость)</option><option value="cha">CHA (Харизма)</option>
                                            </select>
                                        </div>
                                        <div className="flex justify-between items-center"><span>Тип Псионики:</span> <span className="font-bold text-[#38ff12]">{psiTypeLabel}</span></div>
                                        <div className="flex justify-between items-center"><span>Класс Псионики:</span> <span className="font-bold text-white text-lg">{psiClassLvl}</span></div>
                                        <div className="flex justify-between items-center">
                                            <span>Кастер Тип:</span> 
                                            <select className="bg-[#051a05] text-[#38ff12] border border-[#1a5c0b]" value={data.psionics.caster_type} onChange={e => update(d => d.psionics.caster_type = e.target.value as any)}><option value="1">Full (x1)</option><option value="0.5">Half (1/2)</option><option value="0.33">Third (1/3)</option></select>
                                        </div>
                                        <div className="flex justify-between"><span>Мод. Поинтов:</span> <ResistanceNumberInput className="w-16 text-center" value={data.psionics.mod_points} onChange={e => update(d => d.psionics.mod_points = parseInt(e.target.value))} /></div>
                                    </div>
                                </div>
                                <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                                    <SectionHeader title="Вывод" />
                                    {(() => {
                                        const dc = 8 + pb + psiMod + (psiClassLvl - 2);
                                        const totalMod = psiMod + pb;
                                        return ( <div className="space-y-3"> 
                                            <div className="flex justify-between"><span className="text-[#1a5c0b]">Сложность (DC):</span> <span className="text-[#38ff12] font-bold text-xl">{dc}</span></div> 
                                            <div className="flex justify-between"><span className="text-[#1a5c0b]">Модификатор:</span> <span className="text-[#38ff12] font-bold text-lg">{formatMod(totalMod)}</span></div>
                                            <div className="flex justify-between"><span className="text-[#1a5c0b]">Заговоров:</span> <span>{cantripsKnown}</span></div> 
                                            <div className="flex justify-between"><span className="text-[#1a5c0b]">Заклинаний:</span> <span>{spellsKnown}</span></div> 
                                            <div className="flex justify-between"><span className="text-[#1a5c0b]">Пси-Очки:</span> <div className="flex gap-2"> <ResistanceNumberInput className="w-20 text-center text-purple-400 font-bold" value={data.psionics.points_curr} onChange={e => updateClamped(['psionics','points_curr'], parseInt(e.target.value)||0, psiMaxPts)} /> <span>/</span> <span className="text-purple-400 font-bold">{psiMaxPts}</span> </div> </div> 
                                            <div className="w-full bg-purple-900/20 h-4 border border-purple-900"> <div className="h-full bg-purple-600" style={{width: `${Math.min(100, (data.psionics.points_curr/psiMaxPts)*100)}%`}}></div> </div> 
                                        </div> );
                                    })()}
                                </div>
                            </div>
                        )}
                        {subTab === 'spells' && (
                             <div className="border border-[#1a5c0b] p-4 bg-[#0a100a] overflow-x-auto">
                                <SectionHeader title="Матрица Заклинаний" onAdd={() => addItem(['psionics', 'spells'], {name: 'Новое', time: '1д', range: '18м', cost: 0, dur: 'Мгновенно'})} />
                                {['ЗАГОВОРЫ', 'ЗАКЛИНАНИЯ'].map((section, idx) => {
                                    const filtered = data.psionics.spells.map((s, i) => ({s, i})).filter(o => idx === 0 ? o.s.cost === 0 : o.s.cost > 0).sort((a,b) => a.s.cost - b.s.cost);
                                    return (
                                        <div key={section} className="mb-6 min-w-[500px]">
                                            <h4 className="text-[#1a5c0b] mb-2">{section}</h4>
                                            <table className="w-full text-left">
                                                <thead className="text-[10px] text-[#1a5c0b]"><tr><th>NAME</th><th>TIME</th><th>RNG</th><th>CONC</th><th>DUR</th><th>COST</th><th></th></tr></thead>
                                                <tbody>
                                                    {filtered.map(({s, i}) => (
                                                        <tr key={i} className="border-b border-[#1a5c0b]/20" data-list-path={JSON.stringify(['psionics', 'spells'])} data-index={i}>
                                                            <td className="p-1 cursor-pointer" onClick={() => openEdit(['psionics', 'spells'], i)}><span className="text-[#38ff12]">{s.name}</span></td>
                                                            <td className="p-1"><TerminalInput className="bg-transparent border-none w-10 text-center" value={s.time} onChange={e => update(d => d.psionics.spells[i].time = e.target.value)} /></td>
                                                            <td className="p-1"><TerminalInput className="bg-transparent border-none w-10 text-center" value={s.range} onChange={e => update(d => d.psionics.spells[i].range = e.target.value)} /></td>
                                                            <td className="p-1 text-center"><input type="checkbox" checked={s.conc} onChange={e => update(d => d.psionics.spells[i].conc = e.target.checked)} /></td>
                                                            <td className="p-1"><TerminalInput className="bg-transparent border-none w-16 text-center" value={s.dur} onChange={e => update(d => d.psionics.spells[i].dur = e.target.value)} /></td>
                                                            <td className="p-1"><ResistanceNumberInput className="bg-transparent w-16 text-center text-purple-400" value={s.cost} onChange={e => update(d => d.psionics.spells[i].cost = parseInt(e.target.value))} /></td>
                                                            <td className="p-1 flex items-center justify-end">
                                                                <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} onTouchStart={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} />
                                                                <ResistanceDeleteBtn onClick={() => removeItem(['psionics', 'spells'], i)} />
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    )
                                })}
                             </div>
                        )}
                     </div>
                 )}
                 {activeTab === 'uni' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                            <SectionHeader title="Спасбросок" />
                            <div className="space-y-4">
                                <div className="flex justify-between items-center">
                                    <span className="text-[#1a5c0b]">База:</span> 
                                    <ResistanceNumberInput className="bg-transparent border-b border-[#38ff12] text-center w-16" value={data.universalis.save_base} onChange={e => update(d => d.universalis.save_base = parseInt(e.target.value))} />
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-[#1a5c0b]">Атрибут:</span> 
                                    <select className="bg-[#051a05] text-[#38ff12] border border-[#1a5c0b]" value={data.universalis.save_attr} onChange={e => update(d => d.universalis.save_attr = e.target.value as any)}>
                                        {ATTRIBUTES.map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}
                                    </select>
                                </div>
                                <div className="text-center pt-4 border-t border-[#1a5c0b]"> 
                                    <h3 className="text-[#1a5c0b]">TOTAL</h3> 
                                    <span className="text-4xl text-[#38ff12] font-bold"> {data.universalis.save_base + getMod(data.stats[data.universalis.save_attr]) + pb} </span> 
                                </div>
                            </div>
                        </div>
                        <div className="border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <div className="flex justify-between items-end border-b border-[#1a5c0b] pb-1 mb-4">
                                <h3 className="font-tech text-lg text-white tracking-widest">Реестр</h3>
                                <div className="flex gap-2">
                                    <button onClick={() => addItem(['universalis', 'custom_table'], {name: '---', isHeader: true})} className="text-xs text-[#1a5c0b] hover:text-[#38ff12] border border-[#1a5c0b] px-2">[+ GROUP]</button>
                                    <button onClick={() => addItem(['universalis', 'custom_table'], {name: 'Запись'})} className="text-xs text-[#38ff12] hover:text-white border border-[#38ff12] px-2">[ADD NEW]</button>
                                </div>
                             </div>
                             {data.universalis.custom_table.map((it, i) => (
                                 <div 
                                    key={i} 
                                    className={`flex justify-between p-2 border-b transition-opacity items-center ${it.isHeader ? 'bg-[#1a5c0b]/20 border-[#38ff12] mt-4' : 'border-[#1a5c0b]/20 hover:bg-[#1a5c0b]/10'} ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'custom_table']) ? 'opacity-30' : 'opacity-100'}`}
                                    data-list-path={JSON.stringify(['universalis', 'custom_table'])}
                                    data-index={i}
                                 >
                                     <input className={`bg-transparent w-full ${it.isHeader ? 'font-bold text-[#38ff12] text-center uppercase tracking-widest' : 'text-[#38ff12]'}`} value={it.name} onChange={e => update(d => d.universalis.custom_table[i].name = e.target.value)} />
                                     <div className="flex items-center">
                                        {!it.isHeader && <button onClick={() => openEdit(['universalis', 'custom_table'], i)} className="mr-2 text-xs text-[#1a5c0b] hover:text-[#38ff12]">[Desc]</button>}
                                        <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} />
                                        <ResistanceDeleteBtn onClick={() => removeItem(['universalis', 'custom_table'], i)} />
                                     </div>
                                 </div>
                             ))}
                        </div>
                        <div className="md:col-span-2 border border-[#1a5c0b] p-4 bg-[#0a100a]">
                             <SectionHeader title="Счетчики" onAdd={() => addItem(['universalis', 'counters'], {name: 'Counter', val: 0, max: 0})} />
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                 {data.universalis.counters.map((c, i) => (
                                     <div 
                                        key={i} 
                                        className={`bg-black/40 p-3 border border-[#1a5c0b] transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'counters']) ? 'opacity-30' : 'opacity-100'}`}
                                        data-list-path={JSON.stringify(['universalis', 'counters'])}
                                        data-index={i}
                                     >
                                         <div className="flex justify-between mb-2">
                                             <input className="bg-transparent w-full font-bold text-[#38ff12]" value={c.name} onChange={e => update(d => d.universalis.counters[i].name = e.target.value)} />
                                             <div className="flex">
                                                <ResistanceDragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} />
                                                <ResistanceDeleteBtn onClick={() => removeItem(['universalis', 'counters'], i)} />
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2"> 
                                             <ResistanceNumberInput className="w-16 text-center text-white font-bold" value={c.val} onChange={e => updateClamped(['universalis','counters', i.toString(), 'val'], parseInt(e.target.value)||0, c.max)} /> 
                                             <span className="text-[#1a5c0b]">/</span> 
                                             <ResistanceNumberInput className="w-16 text-center text-[#1a5c0b]" value={c.max} onChange={e => update(d => d.universalis.counters[i].max = parseInt(e.target.value))} /> 
                                         </div>
                                     </div>
                                 ))}
                             </div>
                        </div>
                    </div>
                )}
            </div>
          )}
        </main>
    </div>
  );
};

export default ResistanceDossier;
