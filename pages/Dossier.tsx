import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { OrdoService } from '../services/firebase';
import { Character, Attributes } from '../types';
import { ImperialInput, ImperialTextarea, EmpireNumberInput, StatBox, DataBlock, SectionHeader, DeleteBtn, EditModal, EmpireImageModal, DragHandle } from '../components/Components';
import { debounce } from 'lodash';

// --- HELPERS ---
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

type PanelType = 'identity' | 'biometrics' | 'skills' | 'equipment' | 'psych' | 'psionics' | 'universalis';

// Types for Drag State
interface DragState {
  active: boolean;
  listPathStr: string; // serialized listPath for comparison
  itemIndex: number;
  itemName: string;
  pos: { x: number; y: number };
}

// Custom Styled Checkbox for Empire
const EmpireToggle: React.FC<{ checked: boolean; onChange: (checked: boolean) => void }> = ({ checked, onChange }) => (
  <div 
    onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
    className={`w-5 h-5 border border-ordo-gold cursor-pointer flex items-center justify-center transition-all bg-[rgba(0,0,0,0.5)] hover:border-white group`}
  >
    <div className={`w-3 h-3 bg-ordo-gold transition-all duration-300 ${checked ? 'opacity-100 scale-100 shadow-[0_0_8px_#d4af37]' : 'opacity-0 scale-50'}`}></div>
  </div>
);

const Dossier: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Character | null>(null);
  const [activePanel, setActivePanel] = useState<PanelType>('identity');
  const [subTab, setSubTab] = useState<string>('default');
  const [now, setNow] = useState(new Date());
  const [isOffline, setIsOffline] = useState(OrdoService.isOffline());
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Modal State
  const [editingItem, setEditingItem] = useState<{ path: string[], index: number, item: any } | null>(null);
  const [isImgModalOpen, setImgModalOpen] = useState(false);

  // Drag State
  const [dragState, setDragState] = useState<DragState | null>(null);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    const unsub = OrdoService.subscribeOne(id, (char) => {
      if (char) setData(char);
      else alert("Protocol not found");
      setIsOffline(OrdoService.isOffline());
    });
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => { unsub(); clearInterval(timer); };
  }, [id]);

  const saveToDb = useMemo(() => debounce((newData: Character) => {
    if (!newData.id) return;
    OrdoService.update(newData.id, newData);
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

  const switchPanel = (panel: PanelType) => {
      setActivePanel(panel);
      setSubTab('default');
      setIsMobileMenuOpen(false);
  };

  const toggleLock = (panel: PanelType) => {
    update(d => {
      if (!d.locks) d.locks = {};
      d.locks[panel] = !d.locks[panel];
    });
  };

  const addItem = (listPath: string[], item: any) => {
    update(d => {
      let target = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
      const last = listPath[listPath.length - 1];
      if (Array.isArray((target as any)[last])) {
        (target as any)[last].push(item);
      }
    });
  };

  const removeItem = (listPath: string[], index: number) => {
    update(d => {
      let target = d;
      for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
      const last = listPath[listPath.length - 1];
      if (Array.isArray((target as any)[last])) {
        (target as any)[last].splice(index, 1);
      }
    });
  };

  const moveItemTo = (listPath: string[], fromIndex: number, toIndex: number) => {
      update(d => {
          let target = d;
          for (let i = 0; i < listPath.length - 1; i++) target = target[listPath[i] as keyof Character] as any;
          const arr = (target as any)[listPath[listPath.length - 1]];
          if(Array.isArray(arr) && fromIndex >= 0 && fromIndex < arr.length && toIndex >= 0 && toIndex < arr.length) {
              const [item] = arr.splice(fromIndex, 1);
              arr.splice(toIndex, 0, item);
          }
      });
  };

  // Helper to open modal for an item in a list
  const openEdit = (listPath: string[], index: number) => {
    let target = data;
    for (let i = 0; i < listPath.length; i++) target = (target as any)[listPath[i]];
    const item = (target as any)[index];
    setEditingItem({ path: listPath, index, item });
  };

  // Helper to update value respecting max (Clamping)
  const updateClamped = (fieldPath: string[], value: number, max: number) => {
      update(d => {
          let target = d;
          for(let i=0; i<fieldPath.length-1; i++) target = (target as any)[fieldPath[i]];
          const last = fieldPath[fieldPath.length-1];
          (target as any)[last] = (max > 0 && value > max) ? max : value;
      });
  };

  // --- DRAG AND DROP LOGIC ---
  const handleDragStart = (e: React.MouseEvent | React.TouchEvent, listPath: string[], index: number, itemName: string) => {
      if (e.type === 'touchstart') {
          // e.preventDefault(); // Sometimes needed, but might block scroll. Rely on timer.
      }
      
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
      }, 500); // 500ms long press threshold
  };

  const handleDragMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (dragTimerRef.current && !dragState) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
    }

    if (dragState && dragState.active) {
        e.preventDefault(); // Stop scrolling while dragging
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
        
        setDragState(prev => prev ? ({ ...prev, pos: { x: clientX, y: clientY } }) : null);

        // Check for overlap with other items
        const elements = document.elementsFromPoint(clientX, clientY);
        for (const el of elements) {
            const listPathStr = el.getAttribute('data-list-path');
            const indexStr = el.getAttribute('data-index');
            
            if (listPathStr === dragState.listPathStr && indexStr) {
                const targetIndex = parseInt(indexStr);
                if (targetIndex !== dragState.itemIndex) {
                    // Perform Swap
                    const listPath = JSON.parse(listPathStr);
                    moveItemTo(listPath, dragState.itemIndex, targetIndex);
                    // Update drag state index to match new position to prevent rapid flickering
                    setDragState(prev => prev ? ({ ...prev, itemIndex: targetIndex }) : null);
                }
                break;
            }
        }
    }
  }, [dragState, update]);

  const handleDragEnd = useCallback(() => {
      if (dragTimerRef.current) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
      }
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


  if (!data) return <div className="text-ordo-gold text-center mt-20 font-header text-2xl animate-pulse">LOADING PROTOCOL...</div>;

  const level = data.meta.level || 1;
  const pb = 2 + Math.floor((level - 1) / 4);
  const getAttrMod = (attr: keyof Attributes) => getMod(data.stats[attr] || 10);
  const isLocked = data.locks?.[activePanel];

  // Passive Perception Calc
  const wisMod = getMod(data.stats.wis);
  const perSkill = data.skills.data['perception'] || [false, false, 0];
  const perBonus = (perSkill[1] ? pb * 2 : (perSkill[0] ? pb : 0)) + perSkill[2];
  const passivePerception = 10 + wisMod + perBonus + (data.stats.passive_perception_mod || 0);

  // Psionics Calculations
  const psiBaseAttr = data.psionics.base_attr;
  const psiMod = getMod(data.stats[psiBaseAttr]);
  const psiType = psiBaseAttr === 'int' ? 'learned' : 'intuitive';
  
  // Class Level Calculation
  let rawClassLvl = 2 + Math.floor(data.meta.level / 3);
  let maxClassLvl = 8;
  if(data.psionics.caster_type === '0.5') maxClassLvl = 7;
  if(data.psionics.caster_type === '0.33') maxClassLvl = 6;
  const psiClassLvl = Math.max(2, Math.min(maxClassLvl, rawClassLvl));

  // Spells/Cantrips Known
  const cantripsKnown = pb;
  let spellsKnown = 0;
  if (psiType === 'learned') {
      spellsKnown = level + psiMod;
  } else {
      spellsKnown = Math.floor(level / 2) + psiMod;
  }
  if (spellsKnown < 1) spellsKnown = 1;

  // Psi Points Max
  let ptsPerLvl = 6;
  if(data.psionics.caster_type === '0.5') ptsPerLvl = 3;
  if(data.psionics.caster_type === '0.33') ptsPerLvl = 2;
  const psiMaxPts = (ptsPerLvl + (data.psionics.mod_points||0)) * level;

  const navLabels: Record<string, string> = { identity: "I. Identitas", biometrics: "II. Corpus", skills: "III. Artes", equipment: "IV. Armamentum", psych: "V. Anima", psionics: "VI. Psionica", universalis: "VII. Universalis" };
  const panels = (['identity', 'biometrics', 'skills', 'equipment', 'psych', 'psionics', 'universalis'] as PanelType[]);

  return (
    <div className="flex flex-col h-screen overflow-hidden relative">
      <EmpireImageModal 
          isOpen={isImgModalOpen}
          onClose={() => setImgModalOpen(false)}
          onConfirm={(url) => update(d => d.meta.image = url)}
      />

      <EditModal 
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="РЕДАКТИРОВАНИЕ"
        nameValue={editingItem?.item.name || ''}
        descValue={editingItem?.item.desc || ''}
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
                target[editingItem.index].desc = v;
                setEditingItem({...editingItem, item: {...editingItem.item, desc: v}});
            });
         }}
      />

      {/* DRAG GHOST OVERLAY */}
      {dragState && dragState.active && (
          <div 
            className="fixed pointer-events-none z-[100] bg-[#141010] border-2 border-ordo-gold p-3 shadow-[0_0_20px_#d4af37] text-white font-header opacity-90 rounded transform -translate-x-1/2 -translate-y-1/2 whitespace-nowrap"
            style={{ left: dragState.pos.x, top: dragState.pos.y }}
          >
              {dragState.itemName}
          </div>
      )}

      <header className="h-[60px] md:h-[80px] border-b-2 border-ordo-gold bg-gradient-to-b from-[#1a0f0f] to-[#0f0b0b] flex justify-between items-center px-4 md:px-10 relative z-50 shadow-lg shrink-0">
        <div className="absolute bottom-[-5px] left-0 right-0 h-[3px] bg-ordo-crimson border-b border-black"></div>
        <div className="flex items-center w-full md:w-auto">
          <Link to="/registry" className="border border-ordo-gold text-ordo-gold px-2 py-1 md:px-4 md:py-2 font-header hover:bg-ordo-gold hover:text-black transition-all mr-4 text-sm md:text-base whitespace-nowrap">← <span className="hidden md:inline">В РЕЕСТР</span></Link>
          <div className="font-header text-ordo-gold font-bold flex items-center gap-2 md:gap-4 flex-1 md:flex-none justify-center md:justify-start">
            <span className="text-2xl md:text-4xl text-transparent bg-clip-text bg-gradient-to-b from-ordo-gold to-ordo-crimson transform scale-y-75">▼</span>
            <div className="text-center md:text-left">
              <span className="text-lg md:text-2xl block">ORDO CONTINUUM</span>
              <div className="text-[10px] md:text-xs text-ordo-crimson tracking-[2px] md:tracking-[4px] -mt-1">Ex Tenebris Lux</div>
            </div>
          </div>
          <button 
            className="md:hidden ml-4 text-ordo-gold border border-ordo-gold px-3 py-1"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            ☰
          </button>
        </div>
        <div className="hidden md:block font-header text-ordo-gold-dim border border-ordo-gold-dim px-4 py-1 bg-[rgba(0,0,0,0.3)]">
          {now.toISOString().split('T')[1].split('.')[0]} ULT
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden relative z-40">
        <aside className={`
            ${isMobileMenuOpen ? 'flex fixed inset-0 z-[60] bg-black/95' : 'hidden md:flex'}
            md:w-[300px] md:bg-[rgba(15,11,11,0.95)] md:border-r border-ordo-gold-dim 
            flex-col py-10 overflow-y-auto shrink-0 transition-all
        `}>
          {isMobileMenuOpen && (
              <button onClick={() => setIsMobileMenuOpen(false)} className="absolute top-4 right-4 text-4xl text-ordo-crimson md:hidden">×</button>
          )}
          {panels.map(panel => (
              <div key={panel} className="flex items-center pr-4 hover:bg-[rgba(212,175,55,0.05)] transition-colors">
                <button 
                  onClick={() => switchPanel(panel)}
                  className={`flex-1 text-left py-4 md:py-5 px-6 font-header text-lg md:text-base tracking-widest uppercase transition-all ${activePanel === panel ? 'text-ordo-gold border-l-2 border-ordo-gold bg-gradient-to-r from-transparent via-[rgba(212,175,55,0.1)] to-transparent' : 'text-ordo-gold-dim'}`}
                >
                  {navLabels[panel]}
                </button>
                <input 
                  type="checkbox" 
                  checked={data.locks?.[panel] || false} 
                  onChange={() => toggleLock(panel)}
                  className="appearance-none w-5 h-5 border-2 border-ordo-gold-dim bg-[rgba(0,0,0,0.5)] checked:bg-ordo-crimson checked:border-ordo-crimson checked:shadow-[0_0_10px_#8a0000] cursor-pointer transition-all ml-2"
                />
              </div>
          ))}
        </aside>

        <main className="flex-1 p-4 md:p-10 overflow-y-auto relative bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTAgMGg0MHY0MEgwVjB6bTEgMWgzOHYzOEgxVjF6IiBmaWxsPSIjMzMzIiBmaWxsLW9wYWNpdHk9IjAuMSIgZmlsbC1ydWxlPSJldmVub2RkIi8+PC9zdmc+')]">
          {isLocked ? (
             <div className="flex flex-col h-full justify-center items-center text-ordo-crimson animate-[pulse_2s_infinite]">
               <h1 className="text-4xl md:text-6xl font-header font-bold drop-shadow-[0_0_20px_#8a0000] text-center">ACCESS DENIED</h1>
               <p className="font-header text-xl md:text-2xl tracking-[5px] mt-4 text-center">CLEARANCE LEVEL INSUFFICIENT</p>
             </div>
          ) : (
            <div className="max-w-[1200px] mx-auto animate-fadeIn pb-20">
              
              {/* ... IDENTITY (Unchanged) ... */}
              {activePanel === 'identity' && (
                <>
                  <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['identity']}</h1>
                  <div className="grid grid-cols-1 md:grid-cols-[repeat(auto-fill,minmax(350px,1fr))] gap-8">
                    <DataBlock className="row-span-2">
                      <SectionHeader title="Imago / Облик" />
                      <div className="border-2 border-ordo-gold-dim p-1 bg-[rgba(0,0,0,0.3)] min-h-[300px] md:min-h-[400px] flex items-center justify-center relative shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]">
                        {data.meta.image ? <img src={data.meta.image} alt="char" className="max-w-full max-h-[300px] md:max-h-[400px] block" /> : <span className="text-ordo-gold-dim">NO IMAGE</span>}
                        <button onClick={() => setImgModalOpen(true)} className="absolute bottom-2 right-2 bg-[rgba(0,0,0,0.8)] border border-ordo-gold text-ordo-gold px-2 hover:bg-ordo-gold hover:text-black">↻</button>
                      </div>
                    </DataBlock>

                    <DataBlock>
                      <SectionHeader title="Registrum Primus" />
                      {[ { l: "Имя нареченное", k: "name" }, { l: "Вид", k: "race" }, { l: "Подвид", k: "subrace" }, { l: "Летоисчисление", k: "age" }, { l: "Ранг", k: "rank" }, { l: "Призвание", k: "class" }, { l: "Доктрина", k: "archetype" } ].map(f => (
                        <div key={f.k} className="flex justify-between items-baseline py-2 border-b border-[rgba(212,175,55,0.2)]">
                          <span className="text-ordo-gold-dim italic text-base md:text-lg mr-4">{f.l}:</span>
                          <ImperialInput value={(data.meta as any)[f.k]} onChange={(e) => { const v = e.target.value; update(d => (d.meta as any)[f.k] = v); }} />
                        </div>
                      ))}
                      <div className="mt-5 border-t border-ordo-gold-dim pt-2">
                        <div className="flex justify-between items-center mb-2"> <span className="text-ordo-gold italic">Уровень Доступа:</span> <EmpireNumberInput className="w-16 h-8 text-white border border-ordo-gold" value={data.meta.level} onChange={(e) => update(d => d.meta.level = parseInt(e.target.value))} /> </div>
                        <div className="flex justify-between items-center"> <span className="text-ordo-gold-dim italic">Бонус Мастерства:</span> <span className="font-header font-bold text-ordo-crimson text-xl">+{pb}</span> </div>
                      </div>
                    </DataBlock>

                    <DataBlock className="border-ordo-crimson bg-gradient-to-b from-[rgba(102,0,0,0.1)] to-transparent">
                      <h2 className="text-ordo-crimson font-header text-lg mb-4 uppercase tracking-wider border-b-2 border-ordo-crimson inline-block pr-5">Nota Bene</h2>
                      <ul className="pl-2"> {[{l:"Должность", k:"job"}, {l:"Допуск", k:"clearance"}, {l:"Связь", k:"comm"}].map(f => ( <li key={f.k} className="relative pl-6 mb-2 flex justify-between items-center border-l-2 border-ordo-crimson hover:bg-gradient-to-r hover:from-[rgba(138,0,0,0.1)] hover:to-transparent transition-all pr-2"> <div className="absolute left-[-5px] top-1/2 -translate-y-1/2 w-2 h-2 bg-ordo-crimson rounded-full"></div> <span className="text-ordo-gold-dim">{f.l}:</span> <ImperialInput className="!w-1/2 !text-left" value={(data.meta as any)[f.k]} onChange={(e) => { const v = e.target.value; update(d => (d.meta as any)[f.k] = v); }} /> </li> ))} </ul>
                    </DataBlock>
                  </div>
                </>
              )}

              {activePanel === 'biometrics' && (
                <>
                  <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['biometrics']}</h1>
                  <DataBlock className="mb-8">
                     <SectionHeader title="Vitalis Status" />
                     <div className="flex flex-col md:flex-row flex-wrap justify-around gap-8">
                        <div className="text-center">
                           <div className="text-ordo-gold-dim italic mb-2">Хиты (Тек / Макс)</div>
                           <div className="flex items-center justify-center gap-2"> <EmpireNumberInput className="w-20 bg-[rgba(0,0,0,0.4)] border border-ordo-gold-dim text-center text-ordo-crimson font-header text-xl p-1" value={data.stats.hp_curr} onChange={(e) => updateClamped(['stats','hp_curr'], parseInt(e.target.value)||0, data.stats.hp_max)} /> <span className="text-gray-400">/</span> <EmpireNumberInput className="w-20 bg-[rgba(0,0,0,0.4)] border border-ordo-gold-dim text-center text-white font-header text-xl p-1" value={data.stats.hp_max} onChange={(e) => update(d => d.stats.hp_max = parseInt(e.target.value))} /> </div>
                           <div className="mt-2 text-sm flex justify-center items-center"> <span className="text-ordo-gold-dim mr-2">Временные: </span> <EmpireNumberInput className="w-16 bg-transparent border-b border-ordo-crimson text-center text-ordo-crimson" value={data.stats.hp_temp} onChange={e => update(d => d.stats.hp_temp = parseInt(e.target.value))} /> </div>
                           <div className="w-full bg-[rgba(20,20,20,0.8)] h-2 mt-2 relative border border-gray-700 overflow-hidden"> <div className="h-full bg-ordo-crimson transition-all" style={{width: `${Math.min(100, (data.stats.hp_curr / (data.stats.hp_max || 1)) * 100)}%`}}></div> <div className="h-full bg-ordo-gold opacity-80 transition-all absolute top-0 left-0" style={{width: `${Math.min(100, (data.stats.hp_temp / (data.stats.hp_max || 1)) * 100)}%`}}></div> </div>
                        </div>
                        <div className="text-center">
                           <div className="text-ordo-gold-dim italic mb-2">Класс Брони</div>
                           <EmpireNumberInput className="w-24 h-16 bg-transparent border-2 border-ordo-gold text-center text-3xl font-header text-white" value={data.stats.ac} onChange={e => update(d => d.stats.ac = parseInt(e.target.value))} />
                           <div className="mt-2 text-sm flex justify-center items-center"> <span className="text-ordo-gold-dim mr-2">Щиты: </span> <EmpireNumberInput className="w-14 text-center bg-transparent border-b border-blue-500 text-blue-300" value={data.stats.shield_curr} onChange={e => updateClamped(['stats','shield_curr'], parseInt(e.target.value)||0, data.stats.shield_max)} /> <span className="mx-1">/</span> <EmpireNumberInput className="w-14 text-center bg-transparent border-b border-blue-500 text-blue-300" value={data.stats.shield_max} onChange={e => update(d => d.stats.shield_max = parseInt(e.target.value))} /> </div>
                           <div className="w-full bg-[rgba(20,20,20,0.8)] h-2 mt-2 relative border border-gray-700 overflow-hidden"> <div className="h-full bg-blue-500 transition-all" style={{width: `${Math.min(100, (data.stats.shield_curr / (data.stats.shield_max || 1)) * 100)}%`}}></div> </div>
                        </div>
                        <div className="text-center">
                           <div className="flex flex-col gap-2 items-center">
                                <div className="text-ordo-gold-dim italic mb-2">Мобильность</div>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-ordo-gold-dim">База:</span>
                                    <EmpireNumberInput readOnly step={1.5} min={0} className="w-16 bg-transparent border-b border-white text-white text-center font-bold cursor-default focus:border-white" value={data.stats.speed} onChange={e => update(d => d.stats.speed = parseFloat(e.target.value))} />
                                </div>
                           </div>
                        </div>
                     </div>
                  </DataBlock>

                  <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-8">
                     <div>
                       <SectionHeader title="Характеристики" />
                       <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 border border-ordo-gold-dim p-3 md:p-5 bg-[rgba(0,0,0,0.2)]">
                          {ATTRIBUTES.map(attr => (
                            <StatBox key={attr} label={attr.toUpperCase()} value={data.stats[attr]} modifier={formatMod(getAttrMod(attr))}>
                               <EmpireNumberInput className="w-full bg-transparent text-center font-header text-xl md:text-2xl text-gray-200 border-b border-transparent hover:border-ordo-gold focus:border-ordo-gold outline-none" value={data.stats[attr]} onChange={(e) => update(d => d.stats[attr] = parseInt(e.target.value) || 10)} />
                               <div className="text-ordo-crimson font-bold mt-1">{formatMod(getAttrMod(attr))}</div>
                            </StatBox>
                          ))}
                       </div>
                     </div>
                     <DataBlock>
                       <SectionHeader title="Пассивная Вним." />
                        <div className="flex flex-col items-center justify-center h-full pb-4">
                           <div className="text-5xl font-header font-bold text-white mb-2">{passivePerception}</div>
                           <div className="flex items-center gap-2 text-sm text-ordo-gold-dim">
                                <span>Вольный Мод:</span>
                                <EmpireNumberInput className="w-12 border-b border-ordo-gold-dim text-center text-white" value={data.stats.passive_perception_mod || 0} onChange={e => update(d => d.stats.passive_perception_mod = parseInt(e.target.value))} />
                           </div>
                        </div>
                     </DataBlock>
                     <DataBlock className="lg:col-span-2">
                       <SectionHeader title="Спасброски" />
                       <table className="w-full border-collapse">
                         <tbody>
                           {ATTRIBUTES.map(attr => {
                             const isProf = (data.saves as any)[`prof_${attr}`];
                             const mod = getAttrMod(attr) + (isProf ? pb : 0);
                             return ( <tr key={attr} className="border-b border-[rgba(212,175,55,0.2)] hover:bg-[rgba(212,175,55,0.1)]"> <td className="p-2 font-header text-ordo-gold font-bold">{attr.toUpperCase()}</td> <td className="p-2 text-center"> <input type="checkbox" className="appearance-none w-4 h-4 border border-ordo-gold bg-transparent checked:bg-ordo-gold" checked={isProf} onChange={() => update(d => (d.saves as any)[`prof_${attr}`] = !isProf)} /> </td> <td className="p-2 text-right font-header font-bold text-white">{formatMod(mod)}</td> </tr> )
                           })}
                         </tbody>
                       </table>
                     </DataBlock>
                  </div>
                </>
              )}

              {/* ... SKILLS, EQUIPMENT, PSYCH, PSIONICS (Unchanged in logic, just rendered) ... */}
              {activePanel === 'skills' && (
                <>
                  <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['skills']}</h1>
                  <div className="flex justify-center gap-2 md:gap-4 mb-8 flex-wrap border-b border-ordo-gold-dim pb-2">
                    {['Навыки', 'Умения', 'Черты', 'Особенности', 'Владение'].map((tab, i) => (
                         <button key={tab} onClick={() => setSubTab(i === 0 ? 'default' : tab)} className={`bg-transparent border border-transparent text-ordo-gold-dim font-header text-sm md:text-base px-2 md:px-4 py-2 uppercase transition-all hover:text-ordo-gold ${((i===0 && subTab === 'default') || subTab === tab) ? 'text-ordo-gold border-ordo-gold bg-[rgba(212,175,55,0.1)]' : ''}`}> {["I", "II", "III", "IV", "V"][i]}. {tab} </button>
                    ))}
                  </div>

                  {subTab === 'default' && (
                    <DataBlock className="overflow-x-auto">
                        <SectionHeader title="Общий Реестр Навыков" />
                        <table className="w-full border border-ordo-gold-dim text-left border-collapse min-w-[500px]">
                        <thead>
                            <tr className="bg-[rgba(212,175,55,0.1)] text-ordo-gold font-header text-sm"> <th className="p-3 border-b border-ordo-gold-dim">Название</th> <th className="p-3 border-b border-ordo-gold-dim">Атр.</th> <th className="p-3 border-b border-ordo-gold-dim text-center">Вл.</th> <th className="p-3 border-b border-ordo-gold-dim text-center">Экс.</th> <th className="p-3 border-b border-ordo-gold-dim text-center">Бон.</th> <th className="p-3 border-b border-ordo-gold-dim text-right">Итог</th> </tr>
                        </thead>
                        <tbody>
                            {SKILL_LIST.map(skill => {
                            const [isProf, isExp, bonus] = data.skills.data[skill.k] || [false, false, 0];
                            const attrMod = getAttrMod(skill.a as any);
                            let total = attrMod + bonus;
                            if (isExp) total += pb * 2;
                            else if (isProf) total += pb;
                            return ( <tr key={skill.k} className="border-b border-[rgba(212,175,55,0.1)] hover:bg-[rgba(212,175,55,0.05)] transition-colors"> <td className="p-2 text-gray-300 font-body text-base md:text-lg">{skill.n}</td> <td className="p-2 text-ordo-gold-dim uppercase text-xs">{skill.a}</td> <td className="p-2 text-center"> <input type="checkbox" className="appearance-none w-4 h-4 border border-ordo-gold-dim bg-transparent checked:bg-ordo-gold transition-all" checked={isProf} onChange={() => update(d => { const current = d.skills.data[skill.k] || [false, false, 0]; d.skills.data[skill.k] = [!current[0], current[1], current[2]]; })} /> </td> <td className="p-2 text-center"> <input type="checkbox" className="appearance-none w-4 h-4 border border-ordo-crimson bg-transparent checked:bg-ordo-crimson transition-all" checked={isExp} onChange={() => update(d => { const current = d.skills.data[skill.k] || [false, false, 0]; d.skills.data[skill.k] = [current[0], !current[1], current[2]]; })} /> </td> <td className="p-2 text-center"> <EmpireNumberInput className="w-16 bg-transparent border-b border-ordo-gold-dim text-center text-gray-400 focus:border-ordo-gold outline-none" value={bonus} onChange={(e) => update(d => { const current = d.skills.data[skill.k] || [false, false, 0]; d.skills.data[skill.k] = [current[0], current[1], parseInt(e.target.value)||0]; })} /> </td> <td className="p-2 text-right font-header font-bold text-ordo-crimson text-lg">{formatMod(total)}</td> </tr> );
                            })}
                        </tbody>
                        </table>
                    </DataBlock>
                  )}
                  {/* ... other skill subtabs logic unchanged for brevity, reusing existing implementation ... */}
                  {['Умения','Черты','Особенности'].includes(subTab) && (
                      <DataBlock>
                        <SectionHeader title={subTab} onAdd={() => addItem([subTab==='Умения'?'abilities':subTab==='Черты'?'traits':'features'], {name: 'Новая запись'})} />
                        {(data as any)[subTab==='Умения'?'abilities':subTab==='Черты'?'traits':'features'].map((ab: any, i: number) => {
                            const path = [subTab==='Умения'?'abilities':subTab==='Черты'?'traits':'features'];
                            return (
                             <div 
                                key={i} 
                                className={`flex justify-between items-center p-2 border border-[rgba(212,175,55,0.2)] bg-[rgba(0,0,0,0.3)] hover:border-ordo-gold mb-2 cursor-pointer transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(path) ? 'opacity-30' : 'opacity-100'}`} 
                                onClick={() => openEdit(path, i)}
                                data-list-path={JSON.stringify(path)}
                                data-index={i}
                             >
                               <span className="text-ordo-gold font-header w-full">{ab.name}</span>
                               <div className="flex" onClick={e => e.stopPropagation()}>
                                 <DragHandle onMouseDown={(e) => handleDragStart(e, path, i, ab.name)} onTouchStart={(e) => handleDragStart(e, path, i, ab.name)} />
                                 <DeleteBtn onClick={() => removeItem(path, i)} />
                               </div>
                             </div>
                        )})}
                      </DataBlock>
                  )}
                   {subTab === 'Владение' && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['armory', 'tools', 'langs'].map(k => (
                            <DataBlock key={k}>
                                <SectionHeader title={k==='armory'?'Оружие/Броня':k==='tools'?'Инструменты':'Языки'} onAdd={() => addItem(['profs', k], "Новое")} />
                                {(data.profs as any)[k].map((it:string, i:number) => (
                                    <div key={i} className="flex justify-between p-1 border-b border-white/10" data-list-path={JSON.stringify(['profs', k])} data-index={i}>
                                        <input className="bg-transparent w-full text-gray-300" value={it} onChange={(e) => update(d => (d.profs as any)[k][i] = e.target.value)} />
                                        <div className="flex">
                                            <DragHandle onMouseDown={(e) => handleDragStart(e, ['profs', k], i, it)} onTouchStart={(e) => handleDragStart(e, ['profs', k], i, it)} />
                                            <DeleteBtn onClick={() => removeItem(['profs', k], i)} />
                                        </div>
                                    </div>
                                ))}
                            </DataBlock>
                        ))}
                      </div>
                  )}
                </>
              )}

              {activePanel === 'equipment' && (
                 <>
                   <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['equipment']}</h1>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <DataBlock>
                         <SectionHeader title="Оружие Возмездия" onAdd={() => addItem(['combat', 'weapons'], {name: 'Новое Оружие', type: 'Меч'})} />
                         {data.combat.weapons.map((w, i) => (
                           <div 
                             key={i} 
                             className={`flex justify-between items-center p-3 border-b border-[rgba(212,175,55,0.2)] hover:bg-[rgba(212,175,55,0.1)] cursor-pointer transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['combat', 'weapons']) ? 'opacity-30' : 'opacity-100'}`} 
                             onClick={() => openEdit(['combat', 'weapons'], i)}
                             data-list-path={JSON.stringify(['combat', 'weapons'])}
                             data-index={i}
                           >
                              <div className="flex-1">
                                <div className="text-xs text-ordo-gold-dim" onClick={e => e.stopPropagation()}><input className="bg-transparent w-full" value={w.type} onChange={(e) => update(d => d.combat.weapons[i].type = e.target.value)} /></div>
                                <span className="text-white font-bold">{w.name}</span>
                              </div>
                              <div className="flex" onClick={e => e.stopPropagation()}>
                                 <DragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'weapons'], i, w.name)} />
                                 <DeleteBtn onClick={() => removeItem(['combat', 'weapons'], i)} />
                              </div>
                           </div>
                         ))}
                      </DataBlock>
                      <DataBlock>
                        <SectionHeader title="Инвентарь" onAdd={() => addItem(['combat', 'inventory'], {name: 'Предмет', type: 'Общее'})} />
                        {data.combat.inventory.map((w, i) => (
                           <div 
                             key={i} 
                             className={`flex justify-between items-center p-2 border-b border-[rgba(212,175,55,0.2)] cursor-pointer transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['combat', 'inventory']) ? 'opacity-30' : 'opacity-100'}`} 
                             onClick={() => openEdit(['combat', 'inventory'], i)}
                             data-list-path={JSON.stringify(['combat', 'inventory'])}
                             data-index={i}
                           >
                              <div className="flex-1 text-gray-300">{w.name}</div>
                              <div className="flex" onClick={e => e.stopPropagation()}>
                                <DragHandle onMouseDown={(e) => handleDragStart(e, ['combat', 'inventory'], i, w.name)} onTouchStart={(e) => handleDragStart(e, ['combat', 'inventory'], i, w.name)} />
                                <DeleteBtn onClick={() => removeItem(['combat', 'inventory'], i)} />
                              </div>
                           </div>
                         ))}
                      </DataBlock>
                      <DataBlock>
                         <SectionHeader title="Финансы" />
                         <table className="w-full text-ordo-gold-dim">
                           <tbody>
                             {['u', 'k', 'm', 'g'].map(curr => ( <tr key={curr}> <td className="p-2 uppercase">{curr}-Credits</td> <td><EmpireNumberInput className="w-full" value={(data.money as any)[curr]} onChange={e => update(d => (d.money as any)[curr] = e.target.value)} /></td> </tr> ))}
                           </tbody>
                         </table>
                         <div className="mt-4 pt-4 border-t border-ordo-gold-dim text-center"> <h3 className="text-ordo-gold-dim">КОНВЕРТАЦИЯ (kG)</h3> <span className="text-2xl text-ordo-gold"> {( (parseFloat(data.money.g as any)||0)*1000000 + (parseFloat(data.money.m as any)||0)*1000 + (parseFloat(data.money.k as any)||0) + (parseFloat(data.money.u as any)||0)/1000 ).toLocaleString('ru-RU', {minimumFractionDigits: 2})} kG </span> </div>
                      </DataBlock>
                   </div>
                 </>
              )}

              {activePanel === 'psych' && (
                <>
                  <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['psych']}</h1>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                     <DataBlock> <SectionHeader title="Антропометрия" /> {['size', 'age', 'height', 'weight'].map(k => ( <div key={k} className="flex justify-between py-2 border-b border-white/10"> <span className="text-ordo-gold-dim capitalize">{k}:</span> <ImperialInput value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} /> </div> ))} </DataBlock>
                     <DataBlock> <SectionHeader title="Личность" /> {['trait', 'ideal', 'bond', 'flaw'].map(k => ( <div key={k} className="mb-4"> <span className="text-ordo-gold-dim capitalize block mb-1">{k}:</span> <ImperialTextarea value={(data.psych as any)[k]} onChange={e => update(d => (d.psych as any)[k] = e.target.value)} /> </div> ))} </DataBlock>
                     <DataBlock className="md:col-span-2 border-ordo-crimson"> <h2 className="text-ordo-crimson mb-2 font-header">АНАЛИЗ</h2> <ImperialTextarea className="min-h-[150px] border-ordo-crimson" value={data.psych.analysis} onChange={e => update(d => d.psych.analysis = e.target.value)} /> </DataBlock>
                  </div>
                </>
              )}

              {activePanel === 'psionics' && (
                  <>
                    <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['psionics']}</h1>
                    <div className="flex justify-center gap-4 mb-8">
                         <button onClick={() => setSubTab('default')} className={`px-4 py-2 border ${subTab==='default'?'border-ordo-gold bg-ordo-gold/10 text-ordo-gold':'border-transparent text-ordo-gold-dim'}`}>I. Характеристики</button>
                         <button onClick={() => setSubTab('spells')} className={`px-4 py-2 border ${subTab==='spells'?'border-ordo-gold bg-ordo-gold/10 text-ordo-gold':'border-transparent text-ordo-gold-dim'}`}>II. Заклинания</button>
                    </div>

                    {subTab === 'default' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <DataBlock>
                                <SectionHeader title="Параметры" />
                                <div className="space-y-3">
                                    <div className="flex flex-col md:flex-row md:justify-between"><span>Базовая характеристика:</span> <select className="bg-black border border-ordo-gold text-ordo-gold mt-1 md:mt-0" value={data.psionics.base_attr} onChange={e => update(d => d.psionics.base_attr = e.target.value as any)}><option value="int">INT (Учёный)</option><option value="wis">WIS (Интуитивный)</option><option value="cha">CHA (Интуитивный)</option></select></div>
                                    <div className="flex flex-col md:flex-row md:justify-between"><span>Тип спеллкастинга:</span> <select className="bg-black border border-ordo-gold text-ordo-gold mt-1 md:mt-0" value={data.psionics.caster_type} onChange={e => update(d => d.psionics.caster_type = e.target.value as any)}><option value="1">Полный (x1)</option><option value="0.5">Половинный (1/2)</option><option value="0.33">Третичный (1/3)</option></select></div>
                                    <div className="flex justify-between"><span>Класс (2-{maxClassLvl}):</span> <span className="font-bold text-white text-lg">{psiClassLvl}</span></div>
                                    <div className="flex justify-between"><span>Мод. Очков:</span> <EmpireNumberInput className="w-20 bg-black border border-ordo-gold text-white text-center" value={data.psionics.mod_points} onChange={e => update(d => d.psionics.mod_points = parseInt(e.target.value))} /></div>
                                </div>
                            </DataBlock>
                            <DataBlock>
                                <SectionHeader title="Вывод" />
                                {(() => {
                                    const dc = 8 + pb + psiMod + (psiClassLvl - 2);
                                    
                                    return ( <div className="space-y-3"> <div className="flex justify-between"><span className="text-ordo-gold-dim">Сложность (DC):</span> <span className="text-ordo-crimson font-bold text-xl">{dc}</span></div> <div className="flex justify-between"><span className="text-ordo-gold-dim">Мод. Класса:</span> <span>+{psiClassLvl - 2}</span></div> <div className="flex justify-between"><span className="text-ordo-gold-dim">Заговоров:</span> <span>{cantripsKnown}</span></div> <div className="flex justify-between"><span className="text-ordo-gold-dim">Заклинаний:</span> <span>{spellsKnown}</span></div> <div className="flex justify-between"><span className="text-ordo-gold-dim">Пси-Очки:</span> <div className="flex gap-2"> <EmpireNumberInput className="w-16 bg-transparent border-b border-purple-500 text-center text-purple-300" value={data.psionics.points_curr} onChange={e => updateClamped(['psionics','points_curr'], parseInt(e.target.value)||0, psiMaxPts)} /> <span>/</span> <span className="text-purple-300 font-bold">{psiMaxPts}</span> </div> </div> <div className="w-full bg-gray-900 h-2 mt-2 border border-gray-600"> <div className="h-full bg-purple-600" style={{width: `${Math.min(100, (data.psionics.points_curr/psiMaxPts)*100)}%`}}></div> </div> </div> );
                                })()}
                            </DataBlock>
                        </div>
                    )}
                     
                     {subTab === 'spells' && (
                        <DataBlock className="overflow-x-auto">
                            <SectionHeader title="Матрица Заклинаний" onAdd={() => addItem(['psionics', 'spells'], {name: 'Новое', time: '1д', range: '18м', cost: 0, dur: 'Мгновенно'})} />
                            
                            {[{t:'ЗАГОВОРЫ',f:(c:number)=>c===0},{t:'ЗАКЛИНАНИЯ',f:(c:number)=>c>0}].map(grp => (
                                <div key={grp.t} className="mb-6 min-w-[500px]">
                                <h3 className="text-ordo-gold font-header text-sm tracking-[3px] border-b border-white/10 mb-2 py-1 text-center bg-white/5">{grp.t}</h3>
                                <table className="w-full text-left border-collapse">
                                    <thead className="text-ordo-gold text-xs uppercase opacity-50"><tr><th>Название</th><th>Вр</th><th>Дист</th><th className="text-center">K</th><th>Длит</th><th>Ст</th><th></th></tr></thead>
                                    <tbody>
                                        {[...data.psionics.spells].map((s, i) => ({s, i})).filter(o => grp.f(o.s.cost)).sort((a,b) => a.s.cost - b.s.cost).map(({s, i}) => (
                                            <tr key={i} className={`border-b border-white/5 hover:bg-white/5 transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['psionics', 'spells']) ? 'opacity-30' : 'opacity-100'}`} data-list-path={JSON.stringify(['psionics', 'spells'])} data-index={i}>
                                                <td className="p-2 cursor-pointer" onClick={() => openEdit(['psionics', 'spells'], i)}><span className="font-bold text-white hover:text-ordo-gold">{s.name}</span></td>
                                                <td className="p-2"><input className="bg-transparent w-10 text-center" value={s.time} onChange={e => update(d => d.psionics.spells[i].time = e.target.value)} /></td>
                                                <td className="p-2"><input className="bg-transparent w-10 text-center" value={s.range} onChange={e => update(d => d.psionics.spells[i].range = e.target.value)} /></td>
                                                <td className="p-2 text-center">
                                                    <div className="flex justify-center">
                                                        <EmpireToggle checked={s.conc} onChange={c => update(d => d.psionics.spells[i].conc = c)} />
                                                    </div>
                                                </td>
                                                <td className="p-2"><input className="bg-transparent w-16 text-center" value={s.dur} onChange={e => update(d => d.psionics.spells[i].dur = e.target.value)} /></td>
                                                <td className="p-2"><EmpireNumberInput className={`bg-transparent w-12 text-center ${s.cost>0?'text-purple-300 font-bold':'text-gray-500'}`} value={s.cost} onChange={e => update(d => d.psionics.spells[i].cost = parseInt(e.target.value))} /></td>
                                                <td className="p-2 text-right flex items-center justify-end">
                                                    <DragHandle onMouseDown={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} onTouchStart={(e) => handleDragStart(e, ['psionics', 'spells'], i, s.name)} />
                                                    <DeleteBtn onClick={() => removeItem(['psionics', 'spells'], i)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                </div>
                            ))}
                        </DataBlock>
                    )}
                  </>
              )}

              {activePanel === 'universalis' && (
                  <>
                     <h1 className="font-header text-3xl md:text-4xl text-ordo-gold text-center mb-6 md:mb-10 border-b border-ordo-gold-dim pb-4">{navLabels['universalis']}</h1>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <DataBlock>
                            <SectionHeader title="Спасбросок" />
                            <div className="space-y-4">
                                <div className="flex justify-between"><span>База:</span> <EmpireNumberInput className="bg-transparent border-b border-ordo-gold text-center w-16" value={data.universalis.save_base} onChange={e => update(d => d.universalis.save_base = parseInt(e.target.value))} /></div>
                                <div className="flex justify-between"><span>Атрибут:</span> <select className="bg-black border border-ordo-gold text-ordo-gold" value={data.universalis.save_attr} onChange={e => update(d => d.universalis.save_attr = e.target.value as any)}>{ATTRIBUTES.map(a=><option key={a} value={a}>{a.toUpperCase()}</option>)}</select></div>
                                <div className="text-center pt-4 border-t border-white/10"> <h3 className="text-ordo-gold-dim">ИТОГ</h3> <span className="text-4xl text-ordo-crimson font-bold"> {data.universalis.save_base + getMod(data.stats[data.universalis.save_attr]) + pb} </span> </div>
                            </div>
                        </DataBlock>
                        <DataBlock>
                             <div className="flex justify-between items-end border-b-2 border-ordo-crimson mb-4 pb-1">
                                <h2 className="font-header text-gray-200 text-base md:text-lg uppercase tracking-wider">Реестр</h2>
                                <div className="flex gap-2">
                                    <button onClick={() => addItem(['universalis', 'custom_table'], {name: 'Запись'})} className="text-xs border border-ordo-gold-dim text-ordo-gold px-2 hover:bg-ordo-gold hover:text-black">[+ Entry]</button>
                                    <button onClick={() => addItem(['universalis', 'custom_table'], {name: '---', isHeader: true})} className="text-xs border border-ordo-gold-dim text-white px-2 hover:bg-white hover:text-black">[+ Group]</button>
                                </div>
                             </div>
                             {data.universalis.custom_table.map((it, i) => (
                                 <div 
                                    key={i} 
                                    className={`flex justify-between p-2 border-b transition-opacity items-center ${it.isHeader ? 'bg-[rgba(212,175,55,0.2)] border-ordo-gold mt-4' : 'border-white/10 hover:bg-white/5'} ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'custom_table']) ? 'opacity-30' : 'opacity-100'}`}
                                    data-list-path={JSON.stringify(['universalis', 'custom_table'])}
                                    data-index={i}
                                 >
                                     <input className={`bg-transparent w-full ${it.isHeader ? 'font-bold text-ordo-gold text-center uppercase tracking-widest' : ''}`} value={it.name} onChange={e => update(d => d.universalis.custom_table[i].name = e.target.value)} />
                                     <div className="flex items-center">
                                        {!it.isHeader && <button onClick={() => openEdit(['universalis', 'custom_table'], i)} className="mr-2 text-xs text-ordo-gold-dim hover:text-ordo-gold">[Desc]</button>}
                                        <DragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'custom_table'], i, it.name)} />
                                        <DeleteBtn onClick={() => removeItem(['universalis', 'custom_table'], i)} />
                                     </div>
                                 </div>
                             ))}
                        </DataBlock>
                        <DataBlock className="md:col-span-2">
                             <SectionHeader title="Счетчики" onAdd={() => addItem(['universalis', 'counters'], {name: 'Counter', val: 0, max: 0})} />
                             <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                 {data.universalis.counters.map((c, i) => (
                                     <div 
                                        key={i} 
                                        className={`bg-black/40 p-3 border border-ordo-gold-dim transition-opacity ${dragState?.active && dragState.itemIndex === i && dragState.listPathStr === JSON.stringify(['universalis', 'counters']) ? 'opacity-30' : 'opacity-100'}`}
                                        data-list-path={JSON.stringify(['universalis', 'counters'])}
                                        data-index={i}
                                     >
                                         <div className="flex justify-between mb-2">
                                             <input className="bg-transparent w-full font-header text-ordo-gold" value={c.name} onChange={e => update(d => d.universalis.counters[i].name = e.target.value)} />
                                             <div className="flex">
                                                <DragHandle onMouseDown={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} onTouchStart={(e) => handleDragStart(e, ['universalis', 'counters'], i, c.name)} />
                                                <DeleteBtn onClick={() => removeItem(['universalis', 'counters'], i)} />
                                             </div>
                                         </div>
                                         <div className="flex items-center gap-2"> <EmpireNumberInput className="w-16 text-center bg-white/5 border-none text-white font-bold" value={c.val} onChange={e => updateClamped(['universalis','counters', i.toString(), 'val'], parseInt(e.target.value)||0, c.max)} /> <span>/</span> <EmpireNumberInput className="w-16 text-center bg-white/5 border-none text-gray-500" value={c.max} onChange={e => update(d => d.universalis.counters[i].max = parseInt(e.target.value))} /> </div>
                                     </div>
                                 ))}
                             </div>
                        </DataBlock>
                     </div>
                  </>
              )}

            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default Dossier;
